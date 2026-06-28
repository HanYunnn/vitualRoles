import os
import json
from dotenv import load_dotenv
from openai import OpenAI
from moviepy import VideoFileClip

# 載入環境變數
load_dotenv(override=True)

def extract_audio(video_path, audio_output_path):
    """
    從影片中提取音訊，轉存為 mp3 以減少上傳檔案大小
    """
    print(f"正在從 {video_path} 提取音訊...")
    video = VideoFileClip(video_path)
    video.audio.write_audiofile(audio_output_path, logger=None)
    video.close()
    print(f"音訊提取完成：{audio_output_path}")

def transcribe_audio(audio_path, output_json_path, openai_key=None):
    """
    呼叫 OpenAI Whisper API 取得逐字時間軸 (Word-level timestamps)
    """
    print(f"正在傳送 {audio_path} 至 OpenAI Whisper API 進行轉譯...")
    client = OpenAI(api_key=openai_key or os.getenv("OPENAI_API_KEY"))
    with open(audio_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            file=audio_file,
            model="whisper-1",
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"]
        )
    
    # 轉成 dict
    result = response.model_dump()
    
    # 儲存完整的 JSON 資料
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"轉譯完成！詳細時間軸已儲存至：{output_json_path}")
    return result

if __name__ == "__main__":
    # 設定測試路徑
    VIDEO_FILE = "test_video.mp4"
    TEMP_AUDIO = "temp_audio.mp3"
    OUTPUT_JSON = "transcription_result.json"
    
    if not os.path.exists(VIDEO_FILE):
        print(f"❌ 錯誤：找不到 {VIDEO_FILE}。請將你的測試影片放到此目錄下並重新命名為 {VIDEO_FILE}")
    else:
        try:
            # 1. 提取音訊
            extract_audio(VIDEO_FILE, TEMP_AUDIO)
            # 2. Whisper 轉譯
            transcribe_audio(TEMP_AUDIO, OUTPUT_JSON)
        finally:
            # 清理暫存音訊檔
            if os.path.exists(TEMP_AUDIO):
                os.remove(TEMP_AUDIO)
                print("清理暫存音訊檔完成。")
