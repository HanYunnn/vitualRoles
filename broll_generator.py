import os
import json
import requests
from dotenv import load_dotenv
from openai import OpenAI

# 載入環境變數
load_dotenv(override=True)

PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")

def analyze_broll_placements(transcription_json_path, openai_key=None):
    """
    使用 GPT-4o 分析逐字稿，找出適合插入 B-Roll 的段落，並給出 Pexels 英文關鍵字。
    """
    print("正在使用 GPT-4o 分析文稿並決策 B-Roll 點位...")
    
    with open(transcription_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # 提取 Whisper 的 segment 資料（包含時間軸與文字）
    segments = []
    for seg in data.get("segments", []):
        segments.append({
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"]
        })
        
    prompt = f"""
你是一個專業的影音剪輯導演。以下是我們 Podcast 影片的語音轉文字段落（包含時間軸）。
你的任務是閱讀這些文本，找出適合插入 B-Roll (畫面覆蓋/空景) 的點位。

【規則】：
1. 影片總長度可能不長，請找出 3 到 5 個最需要畫面輔助說明的時機點。
2. 每個 B-Roll 的持續時間建在 3 ~ 6 秒之間，絕對不要重疊。
3. 為每個點位提供一個『英文搜尋關鍵字』，用於在 Pexels 影片庫搜尋直式短片素材。關鍵字要求：
   - **具體、有畫面感、可被拍下來的實體場景或動作**（例如 'hands typing on laptop closeup'、'rainy neon city street night'、'person walking alone city'）。
   - **避免抽象或開會罐頭**（不要 'corporate risk meeting'、'trust handshake business'、'success concept' 這種空泛字眼）。
   - 用 2~4 個單字、優先「特寫 closeup / 慢動作 slow motion / 直式 vertical」的具象畫面，並貼合內容的情緒與場景。
4. 輸出的 JSON 格式必須嚴格符合以下結構：
{{
  "placements": [
    {{
      "start": 1.5,
      "end": 5.0,
      "reason": "說明為什麼這裡要放 B-Roll",
      "search_query": "pexels search term"
    }}
  ]
}}

以下是文本段落：
{json.dumps(segments, ensure_ascii=False, indent=2)}
"""

    client = OpenAI(api_key=openai_key or os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "你是一個精準返回 JSON 格式的影音導演助手。"},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )
    
    result = json.loads(response.choices[0].message.content)
    print("GPT-4o 決策完成！")
    return result

def fetch_and_download_pexels_video(query, output_dir, index, pick=0, pexels_key=None):
    """
    呼叫 Pexels API 搜尋『直式』影片並下載。pick 可選不同搜尋結果（用於「換一張」）。
    """
    key = pexels_key or PEXELS_API_KEY
    if not key:
        print("⚠️ 未偵測到 PEXELS_API_KEY，將跳過下載。")
        return None

    # 直式素材：滿版 9:16 裁切才不會怪
    url = f"https://api.pexels.com/videos/search?query={requests.utils.quote(query)}&per_page=15&orientation=portrait"
    headers = {"Authorization": key}

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()

        videos = data.get("videos") or []
        if not videos:
            print(f"🔍 Pexels 找不到關鍵字 '{query}' 的直式影片。")
            return None

        video_data = videos[pick % len(videos)]   # 「換一張」用不同結果
        video_files = video_data.get("video_files", [])

        # 評分挑檔：優先直式(h>=w)、解析度適中(寬 540~1440)、高度接近 1280
        def _score(vf):
            w = vf.get("width") or 0
            h = vf.get("height") or 0
            return (1 if h >= w else 0, 1 if 540 <= w <= 1440 else 0, -abs(h - 1280))

        mp4s = [vf for vf in video_files if vf.get("file_type") == "video/mp4"]
        target_file = max(mp4s or video_files, key=_score) if (mp4s or video_files) else None

        if target_file:
            download_url = target_file["link"]
            local_filename = os.path.join(output_dir, f"broll_{index}_{query.replace(' ', '_')}_{pick}.mp4")
            
            print(f"📥 正在下載 B-Roll {index}: {query} -> {download_url}")
            video_resp = requests.get(download_url, stream=True, timeout=30)
            video_resp.raise_for_status()
            
            with open(local_filename, "wb") as f:
                for chunk in video_resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            print(f"✅ 下載成功: {local_filename}")
            return local_filename
            
    except Exception as e:
        print(f"❌ Pexels 下載失敗 ({query}): {e}")
        
    return None

def generate_broll_plan(transcription_json, output_plan_json, openai_key=None, pexels_key=None, out_dir="broll_assets"):
    """
    主控制函數：分析、搜尋、下載並輸出 B-Roll 計劃表
    """
    # 下載目錄（每個 session 各自一份）
    assets_dir = out_dir
    os.makedirs(assets_dir, exist_ok=True)

    # 1. 呼叫 GPT-4o 分析點位
    analysis = analyze_broll_placements(transcription_json, openai_key=openai_key)

    # 2. 遍歷點位下載影片
    plan = []
    for i, placement in enumerate(analysis.get("placements", [])):
        q = placement["search_query"]
        local_path = fetch_and_download_pexels_video(q, assets_dir, i, pexels_key=pexels_key)
        
        plan.append({
            "start": placement["start"],
            "end": placement["end"],
            "query": q,
            "reason": placement["reason"],
            "video_path": local_path
        })
        
    # 3. 儲存計畫表
    with open(output_plan_json, "w", encoding="utf-8") as f:
        json.dump({"brolls": plan}, f, ensure_ascii=False, indent=2)
        
    print(f"B-Roll 規劃完成！已儲存至：{output_plan_json}")
    return plan

if __name__ == "__main__":
    TRANSCRIPT_JSON = "transcription_result.json"
    OUTPUT_PLAN = "broll_plan.json"
    
    if not os.path.exists(TRANSCRIPT_JSON):
        print(f"❌ 錯誤：找不到 {TRANSCRIPT_JSON}。請先運行 transcribe.py。")
    else:
        generate_broll_plan(TRANSCRIPT_JSON, OUTPUT_PLAN)
