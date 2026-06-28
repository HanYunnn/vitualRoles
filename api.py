import os
import json
import time
import base64
import shutil
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

# 載入 .env（FISH_AUDIO_API_KEY 等金鑰）
load_dotenv(override=True)

# 引入既有的 Python 模組
from video_composer import compose_video
import transcribe
import broll_generator

app = FastAPI()

# 允許 React 前端 (預設跑在 5173 或其他 port) 進行跨域請求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 確保靜態目錄存在
os.makedirs("broll_assets", exist_ok=True)
os.makedirs("generated_assets", exist_ok=True)

# 為了讓前端能預覽 test_video.mp4，我們將它複製到 generated_assets/
if os.path.exists("test_video.mp4") and not os.path.exists("generated_assets/test_video.mp4"):
    shutil.copy("test_video.mp4", "generated_assets/test_video.mp4")

# 掛載靜態檔案目錄供前端播放影片
app.mount("/assets/generated", StaticFiles(directory="generated_assets"), name="generated")
app.mount("/assets/broll", StaticFiles(directory="broll_assets"), name="broll")

# --- 資料結構定義 ---
class GenerateRequest(BaseModel):
    script: str
    prompt: str

class AnalyzeRequest(BaseModel):
    video_path: str
    need_broll: bool

class RenderRequest(BaseModel):
    subtitles: List[Dict[str, Any]]
    broll_plan: List[Dict[str, Any]]
    font_size_ratio: float
    text_color: str
    outline_color: str
    outline_width: int
    margin_v_ratio: float
    max_chars_per_line: int
    main_video_path: Optional[str] = None
    fg_video_path: Optional[str] = None
    bg_video_path: Optional[str] = None
    bg_image_path: Optional[str] = None
    bg_mode: str = "none"

# --- Mock 假資料定義 ---
MOCK_SUBTITLES = [
    {"start": 0.0, "end": 2.5, "text": "今天我們來聊聊，在團隊合作中"},
    {"start": 2.5, "end": 5.0, "text": "大家最容易遇到的溝通痛點是什麼呢？"},
    {"start": 5.0, "end": 7.5, "text": "其實很多時候，並不是大家不想解決問題，"},
    {"start": 7.5, "end": 10.0, "text": "而是每個人看待事情的角度不同。"},
    {"start": 10.0, "end": 12.5, "text": "這就導致了難以彌補的資訊落差。"},
    {"start": 12.5, "end": 15.0, "text": "今天就讓我來分享三個實用的溝通技巧。"}
]

MOCK_BROLL_PLAN = [
    {"start": 5.0, "end": 12.5, "query": "office teamwork discussion", "video_path": "broll_assets/broll_0_office_teamwork_conflict.mp4"}
]

# --- 路由與端點 ---

@app.post("/api/mock_generate")
def mock_generate(req: GenerateRequest):
    time.sleep(0.5)
    return {
        "success": True,
        "fg_video_path": "generated_assets/test_video.mp4",
        "bg_video_path": "",
        "bg_image_path": "generated_assets/background_clean.png",
        "bg_mode": "ken_burns",
        # 前端能存取的 URL
        "unified_image_url": "/assets/generated/unified_ideal.png",
        "fg_video_url": "/assets/generated/test_video.mp4"
    }

@app.post("/api/mock_analyze")
def mock_analyze(req: AnalyzeRequest):
    time.sleep(0.5)
    return {
        "success": True,
        "subtitles": MOCK_SUBTITLES,
        "broll_plan": MOCK_BROLL_PLAN if req.need_broll else []
    }

@app.post("/api/mock_render")
def mock_render(req: RenderRequest):
    time.sleep(1.0)
    # 在純 Mock 模式下，直接回傳預設的主影片作為「渲染完成」的代表
    return {
        "success": True,
        "video_url": "/assets/generated/test_video.mp4"
    }

# --- 專案存檔 / 讀檔（本地檔案持久化） ---
PROJECT_PATH = "generated_assets/project.json"

class ProjectState(BaseModel):
    subtitles: List[Dict[str, Any]] = []
    brolls: List[Dict[str, Any]] = []
    tracks: List[Dict[str, Any]] = []
    script: Optional[str] = None

@app.post("/api/project/save")
def save_project(state: ProjectState):
    """將前端編輯台狀態寫成本機 JSON 檔。"""
    with open(PROJECT_PATH, "w", encoding="utf-8") as f:
        json.dump(state.model_dump(), f, ensure_ascii=False, indent=2)
    return {"success": True}

# --- Fish Audio 文字轉語音（真實 API） ---
class TTSRequest(BaseModel):
    script: str
    voice_id: Optional[str] = None
    model: str = "s2-pro"          # Fish Audio 引擎版本：s2-pro（建議）或 s1
    speed: float = 1.1             # 語速（對齊網頁 1.1x）
    volume: float = 2              # 音量（對齊網頁 Volume 2）
    temperature: float = 0.45      # 預設
    top_p: float = 0.55            # 預設
    mp3_bitrate: int = 192         # 64 / 128 / 192

@app.post("/api/tts")
def generate_tts(req: TTSRequest):
    """呼叫 Fish Audio TTS，將文字稿 + 聲音模型 ID 生成 mp3 配音（高品質預設）。"""
    key = os.getenv("FISH_AUDIO_API_KEY")
    if not key:
        return {"success": False, "error": "FISH_AUDIO_API_KEY 未設定，請填入 .env"}
    if not req.script.strip():
        return {"success": False, "error": "文字稿是空的"}

    prosody = {"speed": req.speed, "volume": req.volume}
    # normalize_loudness 為 S2-Pro 限定（對齊網頁 Loudness Normalization: On）
    if req.model.startswith("s2"):
        prosody["normalize_loudness"] = True

    payload = {
        "text": req.script,
        "format": "mp3",
        "mp3_bitrate": req.mp3_bitrate,
        "sample_rate": 44100,
        "normalize": True,                       # Text Normalization: On
        "latency": "normal",                     # 以品質為優先
        "temperature": req.temperature,
        "top_p": req.top_p,
        "chunk_length": 300,
        "condition_on_previous_chunks": True,    # 長文跨段聲音連貫
        "prosody": prosody,
    }
    if req.voice_id:
        payload["reference_id"] = req.voice_id

    try:
        resp = requests.post(
            "https://api.fish.audio/v1/tts",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "model": req.model,
            },
            json=payload,
            timeout=120,
        )
    except requests.RequestException as e:
        return {"success": False, "error": f"連線 Fish Audio 失敗：{e}"}

    if resp.status_code != 200:
        return {"success": False, "error": f"Fish Audio 回應 {resp.status_code}：{resp.text[:200]}"}

    out_path = "generated_assets/voiceover.mp3"
    with open(out_path, "wb") as f:
        f.write(resp.content)
    return {"success": True, "audio_url": "/assets/generated/voiceover.mp3"}

# --- OpenAI 語氣增強：自動為文字稿插入 Fish Audio 情緒/語氣標記 ---
class EnhanceRequest(BaseModel):
    script: str
    model: str = "gpt-4o-mini"

ENHANCE_SYSTEM = """你是 Fish Audio TTS 的配音導演。使用者會給你一段中文旁白文字稿，\
你的工作是在「完全不改動任何原文字詞與標點」的前提下，插入 Fish Audio S2 的情緒/語氣標記，讓配音更生動自然。

可用標記（一律方括號，皆為 Fish Audio S2 官方標記）：
- 情緒（句首效果最好）：[happy] [sad] [angry] [excited] [calm] [nervous] [confident] [surprised] [satisfied] [delighted] [scared] [worried] [upset] [frustrated] [empathetic] [embarrassed] [disgusted] [moved] [proud] [relaxed] [grateful] [curious] [sarcastic]；進階如 [anxious] [doubtful] [confused] [disappointed] [hopeful] [optimistic] [nostalgic] [lonely] [bored] [determined] [resigned]
- 語氣（可放句中任意處）：[whispering] [soft tone] [in a hurry tone] [shouting] [screaming]
- 停頓：[break]（短停頓）、[long-break]（長停頓），放在自然換氣、轉折或列舉處
- 音效（語意明顯時偶爾用）：[laughing] [chuckling] [sobbing] [sighing] [gasping] [groaning] [yawning]
- 也可用自由描述微調強度，例如 [very excited]、[slightly sad]

規則：
1. 絕對不可增加、刪除、改寫或翻譯任何原文字詞與標點，只能「插入」方括號標記。
2. 情緒標記放在句子開頭最有效；語氣/音效可放句中。數量自然——約每 1～2 句一個情緒標記、轉折處加停頓，不要每句堆滿。
3. 只輸出加上標記後的文字稿本身，不要任何解釋、引號、前後綴或程式碼框。"""

class OptimizePromptRequest(BaseModel):
    prompt: str
    kind: str = "image"   # image | video
    model: str = "gpt-4o-mini"

_OPT_IMAGE = (
    "You are a prompt engineer for the gpt-image generator. Rewrite the user's rough idea into ONE vivid, "
    "detailed English prompt for a 9:16 vertical image. Weave in: subject & action, setting, composition/framing, "
    "lighting, mood/atmosphere, color palette, lens/camera feel, art style, and high-detail quality cues. "
    "Coherent prose (no bullet lists), ~40-70 words. Output ONLY the final prompt, nothing else.")
_OPT_VIDEO = (
    "You are a prompt engineer for an AI image-to-video model. Rewrite the user's idea into ONE concise English "
    "prompt describing motion for a 9:16 shot: subtle camera movement (slow push-in / parallax), environmental "
    "motion (light flicker, particles, weather), and mood. If it reads like a background, add 'no people, no characters'. "
    "~25-45 words. Output ONLY the final prompt, nothing else.")

@app.post("/api/optimize_prompt")
def optimize_prompt(req: OptimizePromptRequest):
    """用 OpenAI 把粗略 prompt 改寫成更有畫面感、細節豐富的生成 prompt。"""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return {"success": False, "error": "OPENAI_API_KEY 未設定，請填入 .env"}
    if not req.prompt.strip():
        return {"success": False, "error": "prompt 是空的"}
    system = _OPT_VIDEO if req.kind == "video" else _OPT_IMAGE
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": req.model, "temperature": 0.8,
                  "messages": [{"role": "system", "content": system},
                               {"role": "user", "content": req.prompt}]},
            timeout=60,
        )
    except requests.RequestException as e:
        return {"success": False, "error": f"連線 OpenAI 失敗：{e}"}
    if resp.status_code != 200:
        return {"success": False, "error": f"OpenAI 回應 {resp.status_code}：{resp.text[:200]}"}
    try:
        out = resp.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, ValueError) as e:
        return {"success": False, "error": f"回傳格式異常：{e}"}
    return {"success": True, "prompt": out} if out else {"success": False, "error": "OpenAI 回傳空白"}

@app.post("/api/enhance_script")
def enhance_script(req: EnhanceRequest):
    """用 OpenAI 把使用者貼上的文字稿加上情緒/語氣標記（不改原文字詞）。"""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return {"success": False, "error": "OPENAI_API_KEY 未設定，請填入 .env"}
    if not req.script.strip():
        return {"success": False, "error": "文字稿是空的"}

    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": req.model,
                "temperature": 0.7,
                "messages": [
                    {"role": "system", "content": ENHANCE_SYSTEM},
                    {"role": "user", "content": req.script},
                ],
            },
            timeout=60,
        )
    except requests.RequestException as e:
        return {"success": False, "error": f"連線 OpenAI 失敗：{e}"}

    if resp.status_code != 200:
        return {"success": False, "error": f"OpenAI 回應 {resp.status_code}：{resp.text[:200]}"}

    try:
        enhanced = resp.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, ValueError) as e:
        return {"success": False, "error": f"OpenAI 回傳格式異常：{e}"}
    if not enhanced:
        return {"success": False, "error": "OpenAI 回傳空白"}
    return {"success": True, "script": enhanced}

# --- OpenAI 影像生成：文生圖，或帶角色參考圖（gpt-image-1 / images.edits）---
class ImageRequest(BaseModel):
    prompt: str
    reference_image_b64: Optional[str] = None   # data URL 或純 base64；有值就走 edits 保持角色一致
    size: str = "1024x1536"                      # 9:16 直式
    quality: str = "medium"                      # low / medium / high / auto
    model: str = "gpt-image-1"
    podcast: bool = True                          # Podcast 構圖：角色佔約 2/3、直視鏡頭

# Podcast 構圖：角色佔畫面約 2/3、直視鏡頭、上方留白給字幕
PODCAST_FRAMING = (
    " Compose for a vertical 9:16 podcast shot: the character occupies about two-thirds of the frame "
    "(head and upper body large and clearly visible, not tiny), with the head in the upper-middle area "
    "and comfortable headroom. The character faces forward and looks directly into the camera with "
    "natural, engaging eye contact. Keep the lower area relatively clear for captions."
)
# 有參考圖時：嚴格保留角色外型細節（形狀、身形比例、五官、眼神）
REF_FIDELITY = (
    " IMPORTANT: keep the EXACT same character as the reference image — identical facial features and "
    "expression, eye shape, eye color and gaze, head shape, body shape and proportions, fur/skin color "
    "and texture, distinctive accessories and outfit. Do not redesign or restyle the character; only "
    "change the scene, framing and pose as described."
)

@app.post("/api/generate_image")
def generate_image(req: ImageRequest):
    """用 OpenAI gpt-image-1 生成 9:16 場景圖；附參考圖時改走 images.edits 鎖定角色一致性。"""
    if not req.prompt.strip():
        return {"success": False, "error": "圖片 prompt 是空的"}
    key = os.getenv("OPENAI_API_KEY")   # 僅 gpt-image 路徑需要（nano-banana 走 Gemini/fal）

    # 依設定附加構圖／角色保真指令
    prompt = req.prompt
    if req.reference_image_b64:
        prompt += REF_FIDELITY
    if req.podcast:
        prompt += PODCAST_FRAMING

    # nano-banana（Gemini 2.5 Flash Image）：角色一致性最強
    # 有 GEMINI_API_KEY → 直連 Google（可吃免費額度）；失敗或沒金鑰 → 退回 fal
    if req.model == "nano-banana":
        raw = req.reference_image_b64.split(",", 1)[-1] if req.reference_image_b64 else None
        out_bytes = None
        if os.getenv("GEMINI_API_KEY"):
            out_bytes, gerr = _gemini_image(prompt, raw)
            if gerr and not os.getenv("FAL_KEY"):
                return {"success": False, "error": f"Gemini：{gerr}"}
        if out_bytes is None:   # 沒走 Gemini 或 Gemini 失敗 → fal
            if raw:
                out_bytes, ferr = _fal_image("fal-ai/nano-banana/edit",
                                             {"prompt": prompt, "image_urls": ["data:image/png;base64," + raw], "num_images": 1})
            else:
                out_bytes, ferr = _fal_image("fal-ai/nano-banana", {"prompt": prompt, "num_images": 1})
            if ferr:
                return {"success": False, "error": ferr}
        with open("generated_assets/base_image.png", "wb") as f:
            f.write(out_bytes)
        return {"success": True, "image_url": "/assets/generated/base_image.png"}

    if not key:
        return {"success": False, "error": "OPENAI_API_KEY 未設定，請填入 .env"}
    headers = {"Authorization": f"Bearer {key}"}
    try:
        if req.reference_image_b64:
            raw = req.reference_image_b64.split(",", 1)[-1]   # 去掉 data:image/...;base64, 前綴
            img_bytes = base64.b64decode(raw)
            resp = requests.post(
                "https://api.openai.com/v1/images/edits",
                headers=headers,
                data={"model": req.model, "prompt": prompt, "size": req.size, "quality": req.quality},
                files={"image[]": ("reference.png", img_bytes, "image/png")},
                timeout=180,
            )
        else:
            resp = requests.post(
                "https://api.openai.com/v1/images/generations",
                headers={**headers, "Content-Type": "application/json"},
                json={"model": req.model, "prompt": prompt, "size": req.size,
                      "quality": req.quality, "n": 1},
                timeout=180,
            )
    except requests.RequestException as e:
        return {"success": False, "error": f"連線 OpenAI 失敗：{e}"}
    except ValueError as e:  # base64 解碼失敗（binascii.Error 屬 ValueError）
        return {"success": False, "error": f"參考圖解碼失敗：{e}"}

    if resp.status_code != 200:
        return {"success": False, "error": f"OpenAI 回應 {resp.status_code}：{resp.text[:300]}"}

    try:
        out_bytes = base64.b64decode(resp.json()["data"][0]["b64_json"])
    except (KeyError, IndexError, ValueError) as e:
        return {"success": False, "error": f"OpenAI 回傳格式異常：{e}"}

    out_path = "generated_assets/base_image.png"
    with open(out_path, "wb") as f:
        f.write(out_bytes)
    return {"success": True, "image_url": "/assets/generated/base_image.png"}

_REMBG_SESSIONS = {}
def _rembg_session(new_session, name):
    """依模型名快取 rembg session（首次會下載該模型）。"""
    if name not in _REMBG_SESSIONS:
        _REMBG_SESSIONS[name] = new_session(name)
    return _REMBG_SESSIONS[name]

# --- FG / BG 拆分：本地 rembg 去背 + （可選）OpenAI inpaint 把主體移出背景 ---
class SplitRequest(BaseModel):
    clean_bg: bool = True   # True=用 OpenAI inpaint 把主體從背景移除；False=背景沿用原圖
    bg_model: str = "birefnet-general-lite"   # 去背模型（BiRefNet 系列較強）
    method: str = "birefnet"   # birefnet=本機免費 / ai=nano-banana 綠幕去背（$0.039）

AI_CUTOUT_PROMPT = (
    "Cut out the main character/subject TOGETHER WITH the foreground items that belong to it — the microphone "
    "in front of it, and anything it is holding or directly interacting with. Keep ALL of these in the cutout. "
    "Place them on a solid pure chroma-green background (#00FF00). Remove ONLY the background environment behind "
    "the subject: walls, room, scenery and background furniture. Keep the subject's pixels, pose, clothing and "
    "details unchanged; clean crisp edges; do not redraw or restyle."
)

def _key_green(img):
    """把綠幕影像本機去綠 → 透明 RGBA（含去溢色與邊緣羽化）。"""
    import numpy as np
    from PIL import Image, ImageFilter
    a = np.array(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx_rb = np.maximum(r, b)
    alpha = np.where((g - mx_rb) > 40, 0, 255).astype(np.uint8)
    spill = g > mx_rb                                   # 去溢色：把溢出的綠壓回 max(r,b)
    a[..., 1] = np.where(spill, mx_rb, g)
    out = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), "RGBA")
    out.putalpha(out.getchannel("A").filter(ImageFilter.GaussianBlur(1)))  # 邊緣羽化
    return out

INPAINT_PROMPT = (
    "Remove the person or character entirely from the masked area. Seamlessly fill it with a "
    "natural continuation of the existing background scene, matching perspective, lighting, colors "
    "and art style. The result must contain no people and no characters — only the empty environment."
)

def _inpaint_clean_bg(src_path: str, fg_path: str, out_path: str):
    """用前景 alpha 做遮罩，呼叫 OpenAI images.edits 把主體區重繪成乾淨背景。成功回 None，失敗回錯誤字串。"""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return "OPENAI_API_KEY 未設定"
    try:
        import io
        from PIL import Image, ImageOps, ImageFilter
        fg = Image.open(fg_path).convert("RGBA")
        inv = ImageOps.invert(fg.getchannel("A"))      # 主體→0（要重繪）、背景→255（保留）
        inv = inv.filter(ImageFilter.MinFilter(7))     # 略為外擴重繪區，蓋掉主體邊緣殘影
        mask = Image.new("RGBA", fg.size, (0, 0, 0, 0))
        mask.putalpha(inv)                              # 遮罩透明處=OpenAI 會重繪的區域
        mbuf = io.BytesIO()
        mask.save(mbuf, format="PNG")
        # 角色區遮罩（外擴），等等只把這塊填補貼回原圖，其餘維持原始像素→不變形
        subject = fg.getchannel("A").filter(ImageFilter.MaxFilter(7))
        with open(src_path, "rb") as f:
            img_bytes = f.read()
    except Exception as e:
        return f"遮罩製作失敗：{e}"

    # gpt-image 只接受 1024x1024 / 1024x1536 / 1536x1024，依比例挑合法尺寸
    out_size = "1024x1024" if fg.width == fg.height else ("1024x1536" if fg.height > fg.width else "1536x1024")
    try:
        resp = requests.post(
            "https://api.openai.com/v1/images/edits",
            headers={"Authorization": f"Bearer {key}"},
            data={"model": "gpt-image-1", "prompt": INPAINT_PROMPT,
                  "size": out_size, "quality": "medium"},
            files={"image": ("scene.png", img_bytes, "image/png"),
                   "mask": ("mask.png", mbuf.getvalue(), "image/png")},
            timeout=180,
        )
    except requests.RequestException as e:
        return f"連線 OpenAI 失敗：{e}"
    if resp.status_code != 200:
        return f"OpenAI {resp.status_code}：{resp.text[:200]}"
    try:
        out = base64.b64decode(resp.json()["data"][0]["b64_json"])
    except (KeyError, IndexError, ValueError) as e:
        return f"回傳格式異常：{e}"
    # gpt-image 會「重新生成整張」且輸出尺寸不同 → 直接存會變形/位移。
    # 解法：把重繪結果縮回原圖尺寸後，「只」把角色挖空處貼回原圖，其餘維持原始像素。
    try:
        filled = Image.open(io.BytesIO(out)).convert("RGB").resize(fg.size, Image.LANCZOS)
        base = Image.open(src_path).convert("RGB")
        base.paste(filled, (0, 0), subject)            # subject=角色區(255)才貼，背景維持原樣
        base.save(out_path)
    except Exception as e:
        return f"合成乾淨背景失敗：{e}"
    return None

@app.post("/api/split_image")
def split_image(req: SplitRequest):
    """把場景圖去背：前景=透明背景主體 PNG；背景=移除主體的乾淨場景（clean_bg）或原圖。"""
    src = "generated_assets/base_image.png"
    fg_path = "generated_assets/fg.png"
    bg_path = "generated_assets/bg.png"
    if not os.path.exists(src):
        return {"success": False, "error": "找不到場景圖，請先在 Step 2 生成或上傳"}

    with open(src, "rb") as f:
        data = f.read()

    if req.method == "ai":
        # nano-banana 摳到綠幕 → 本機去綠 → 真透明 fg.png
        import io as _io
        from PIL import Image
        raw = base64.b64encode(data).decode()
        green_bytes, err = (None, "no provider")
        if os.getenv("GEMINI_API_KEY"):
            green_bytes, err = _gemini_image(AI_CUTOUT_PROMPT, raw)
        if (err or not green_bytes) and os.getenv("FAL_KEY"):
            green_bytes, err = _fal_image("fal-ai/nano-banana/edit",
                                          {"prompt": AI_CUTOUT_PROMPT, "image_urls": ["data:image/png;base64," + raw], "num_images": 1})
        if err or not green_bytes:
            return {"success": False, "error": f"AI 去背失敗：{err}"}
        try:
            base_size = Image.open(src).size
            green_img = Image.open(_io.BytesIO(green_bytes)).convert("RGB").resize(base_size, Image.LANCZOS)
            gbuf = _io.BytesIO(); green_img.save(gbuf, format="PNG")
            # 在 AI 的均勻綠幕上跑 BiRefNet → 邊緣最乾淨；失敗才退回手刻去綠
            try:
                from rembg import remove, new_session
                fg_bytes = remove(gbuf.getvalue(), session=_rembg_session(new_session, "birefnet-general-lite"))
            except Exception:
                fg_img = _key_green(green_img)
                b2 = _io.BytesIO(); fg_img.save(b2, format="PNG"); fg_bytes = b2.getvalue()
        except Exception as e:
            return {"success": False, "error": f"AI 去綠失敗：{e}"}
    else:
        try:
            from rembg import remove, new_session  # 延遲載入
        except ImportError:
            return {"success": False, "error": "rembg 未安裝（pip install rembg）"}
        try:
            try:
                fg_bytes = remove(data, session=_rembg_session(new_session, req.bg_model))
            except Exception:
                fg_bytes = remove(data)  # 模型下載/執行失敗 → 退回預設 u2net
        except Exception as e:  # rembg/onnx 執行期錯誤
            return {"success": False, "error": f"去背失敗：{e}"}

    with open(fg_path, "wb") as f:
        f.write(fg_bytes)

    # 同時輸出綠幕版：給對嘴模型當來源，之後用色鍵去背不會吃掉深色腳掌/尾巴
    try:
        from PIL import Image
        _fim = Image.open(fg_path).convert("RGBA")
        _green = Image.new("RGBA", _fim.size, (0, 177, 64, 255))
        _green.paste(_fim, (0, 0), _fim)
        _green.convert("RGB").save("generated_assets/fg_green.png")
    except Exception:
        pass

    warning = None
    shutil.copyfile(src, bg_path)   # 預設先放原圖
    if req.clean_bg:
        err = _inpaint_clean_bg(src, fg_path, bg_path)   # 成功會覆蓋成乾淨背景
        if err:
            warning = f"背景去人物失敗，暫用原圖：{err}"

    return {
        "success": True,
        "fg_url": "/assets/generated/fg.png",
        "bg_url": "/assets/generated/bg.png",
        "warning": warning,
    }

# --- 背景動態：fal.ai image-to-video（Luma / Kling / Wan / Veo，可切換）---
class AnimateRequest(BaseModel):
    prompt: str = ("Static locked-off camera, absolutely no camera movement, no zoom, no pan, fixed tripod shot. "
                   "Subtle ambient environmental motion only (drifting light, gentle particles). No people, no characters.")
    model: str = "fal-ai/luma-dream-machine/ray-2/image-to-video"

def _fal_payload(model: str, prompt: str, image_url: str) -> dict:
    """各家 image-to-video 參數欄位不同，依模型組對應 payload。"""
    p = {"prompt": prompt, "image_url": image_url}
    if "luma-dream-machine" in model:
        p.update(aspect_ratio="9:16", resolution="720p", duration="5s")
    elif "kling-video" in model:
        p.update(duration="5")            # Kling：字串秒數，無 aspect_ratio
    elif "wan" in model:
        p.update(resolution="720p", aspect_ratio="9:16")
    return p                              # 未知模型只送 prompt + image_url（最保險）

def _fal_video(model: str, payload: dict, out_path: str, max_wait: int = 420):
    """提交 fal 任務 → 輪詢到 COMPLETED → 下載影片到 out_path。成功回 None，失敗回錯誤字串。"""
    key = os.getenv("FAL_KEY")
    if not key:
        return "FAL_KEY 未設定，請填入 .env"
    headers = {"Authorization": f"Key {key}", "Content-Type": "application/json"}
    try:
        submit = requests.post(f"https://queue.fal.run/{model}", headers=headers, json=payload, timeout=60)
        if submit.status_code not in (200, 201):
            return f"fal 提交失敗 {submit.status_code}：{submit.text[:200]}"
        sub = submit.json()
        status_url, response_url = sub["status_url"], sub["response_url"]

        start = time.time()
        while time.time() - start < max_wait:
            st = requests.get(status_url, headers=headers, timeout=30).json()
            status = st.get("status")
            if status == "COMPLETED":
                break
            if status not in ("IN_QUEUE", "IN_PROGRESS"):
                return f"fal 任務狀態異常：{st}"
            time.sleep(3)
        else:
            return f"fal 任務逾時（>{max_wait // 60} 分鐘）"

        res = requests.get(response_url, headers=headers, timeout=60)
        if res.status_code != 200:
            return f"fal 取結果失敗 {res.status_code}：{res.text[:200]}"
        out = res.json()
        v = out.get("video")
        video_url = v.get("url") if isinstance(v, dict) else (v if isinstance(v, str) else None)
        if not video_url and isinstance(out.get("videos"), list) and out["videos"]:
            video_url = out["videos"][0].get("url")
        if not video_url:
            return f"fal 回傳找不到影片網址：{list(out.keys())}"

        clip = requests.get(video_url, timeout=180)
        if clip.status_code != 200:
            return f"下載影片失敗 {clip.status_code}"
    except requests.RequestException as e:
        return f"連線 fal 失敗：{e}"

    with open(out_path, "wb") as f:
        f.write(clip.content)
    return None

def _fal_image(model: str, payload: dict, max_wait: int = 180):
    """提交 fal 影像任務 → 輪詢到 COMPLETED → 回傳 (image_bytes, None) 或 (None, error)。"""
    key = os.getenv("FAL_KEY")
    if not key:
        return None, "FAL_KEY 未設定，請填入 .env"
    headers = {"Authorization": f"Key {key}", "Content-Type": "application/json"}
    try:
        submit = requests.post(f"https://queue.fal.run/{model}", headers=headers, json=payload, timeout=60)
        if submit.status_code not in (200, 201):
            return None, f"fal 提交失敗 {submit.status_code}：{submit.text[:200]}"
        sub = submit.json()
        status_url, response_url = sub["status_url"], sub["response_url"]
        start = time.time()
        while time.time() - start < max_wait:
            st = requests.get(status_url, headers=headers, timeout=30).json()
            status = st.get("status")
            if status == "COMPLETED":
                break
            if status not in ("IN_QUEUE", "IN_PROGRESS"):
                return None, f"fal 任務狀態異常：{st}"
            time.sleep(2)
        else:
            return None, f"fal 影像任務逾時（>{max_wait // 60} 分鐘）"
        res = requests.get(response_url, headers=headers, timeout=60)
        if res.status_code != 200:
            return None, f"fal 取結果失敗 {res.status_code}：{res.text[:200]}"
        out = res.json()
        imgs = out.get("images")
        url = imgs[0].get("url") if isinstance(imgs, list) and imgs else None
        if not url and isinstance(out.get("image"), dict):
            url = out["image"].get("url")
        if not url:
            return None, f"fal 回傳找不到影像網址：{list(out.keys())}"
        img = requests.get(url, timeout=120)
        if img.status_code != 200:
            return None, f"下載影像失敗 {img.status_code}"
        return img.content, None
    except requests.RequestException as e:
        return None, f"連線 fal 失敗：{e}"

def _gemini_image(prompt: str, ref_raw: Optional[str] = None):
    """直連 Google Gemini 2.5 Flash Image（nano-banana）生圖／編輯。回傳 (image_bytes, None) 或 (None, error)。"""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None, "GEMINI_API_KEY 未設定"
    model = "gemini-2.5-flash-image"
    parts = [{"text": prompt}]
    if ref_raw:
        parts.append({"inline_data": {"mime_type": "image/png", "data": ref_raw}})
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    try:
        r = requests.post(url, headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                          json={"contents": [{"parts": parts}]}, timeout=180)
    except requests.RequestException as e:
        return None, f"連線 Gemini 失敗：{e}"
    if r.status_code != 200:
        return None, f"Gemini {r.status_code}：{r.text[:300]}"
    try:
        for part in r.json()["candidates"][0]["content"]["parts"]:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"]), None
        return None, "Gemini 回傳沒有影像（可能被安全機制擋下）"
    except (KeyError, IndexError, ValueError) as e:
        return None, f"Gemini 回傳格式異常：{e}"

def _data_uri(path: str, mime: str) -> str:
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode()

@app.post("/api/animate_bg")
def animate_bg(req: AnimateRequest):
    """把乾淨背景 bg.png 丟 fal.ai image-to-video，輪詢完成後存成 bg_motion.mp4。"""
    src = "generated_assets/bg.png"
    if not os.path.exists(src):
        return {"success": False, "error": "找不到背景圖，請先在 Step 3 去背產生 bg.png"}
    payload = _fal_payload(req.model, req.prompt, _data_uri(src, "image/png"))
    err = _fal_video(req.model, payload, "generated_assets/bg_motion.mp4", max_wait=300)
    if err:
        return {"success": False, "error": err}
    return {"success": True, "video_url": "/assets/generated/bg_motion.mp4"}

# --- 對嘴前景：fal.ai audio-driven avatar（圖片＋配音 → 會講話的人物）---
# 來源圖：fg=透明去背 / fg_green=綠幕版（建議，色鍵不吃深色腳掌）/ scene=完整場景
_SRC_MAP = {"fg": "fg.png", "fg_green": "fg_green.png", "scene": "base_image.png"}

# 對嘴表情約束：少動五官、眼睛自然別瞪大、貓嘴與牙齒自然
AVATAR_PROMPT = (
    "A calm talking avatar with subtle, natural facial expressions. Keep the eyes relaxed and natural at all "
    "times — do not widen, bulge or open the eyes wide; keep a steady soft gaze. Animate mainly the mouth for "
    "natural speech with minimal, gentle movement. Keep the cat's mouth and teeth natural and subtle — do not "
    "show large, sharp or distorted teeth, avoid wide or exaggerated mouth opening. Minimal head and brow "
    "movement, composed and relaxed throughout."
)

class AvatarRequest(BaseModel):
    source: str = "fg"   # 見 _SRC_MAP
    model: str = "fal-ai/kling-video/ai-avatar/v2/standard"
    prompt: str = AVATAR_PROMPT

@app.post("/api/animate_fg")
def animate_fg(req: AvatarRequest):
    """用前景圖 + Step 1 配音，呼叫 fal avatar 模型生成對嘴影片，存成 talking_fg.mp4。"""
    img = "generated_assets/" + _SRC_MAP.get(req.source, "fg.png")
    audio = "generated_assets/voiceover.mp3"
    if not os.path.exists(img):
        return {"success": False, "error": "找不到角色圖，請先在 Step 3 去背（fg）或 Step 2 生圖（scene）"}
    if not os.path.exists(audio):
        return {"success": False, "error": "找不到配音，請先在 Step 1 生成 voiceover.mp3"}

    payload = {
        "image_url": _data_uri(img, "image/png"),
        "audio_url": _data_uri(audio, "audio/mpeg"),
    }
    if req.prompt.strip():
        payload["prompt"] = req.prompt
    err = _fal_video(req.model, payload, "generated_assets/talking_fg.mp4", max_wait=900)  # 對嘴慢，給 15 分鐘
    if err:
        return {"success": False, "error": err}
    return {"success": True, "video_url": "/assets/generated/talking_fg.mp4"}

# --- 對嘴前景（Hedra Character-3）---
class HedraRequest(BaseModel):
    source: str = "fg"   # "fg"=fg.png / "scene"=base_image.png
    prompt: str = AVATAR_PROMPT
    resolution: str = "720p"
    aspect_ratio: str = "9:16"
    model_slug: str = "together/hedra-character-3"   # 明確指定 Hedra 旗艦，勿盲抓 models[0]

@app.post("/api/animate_fg_hedra")
def animate_fg_hedra(req: HedraRequest):
    """Hedra：角色圖 + Step 1 配音 → 對嘴影片，存成 talking_fg_hedra.mp4。"""
    key = os.getenv("HEDRA_API_KEY")
    if not key or key.startswith("your_"):
        return {"success": False, "error": "HEDRA_API_KEY 未設定，請填入 .env"}
    img = "generated_assets/" + _SRC_MAP.get(req.source, "fg.png")
    audio = "generated_assets/voiceover.mp3"
    if not os.path.exists(img):
        return {"success": False, "error": "找不到角色圖，請先在 Step 3 去背（fg）或 Step 2 生圖（scene）"}
    if not os.path.exists(audio):
        return {"success": False, "error": "找不到配音，請先在 Step 1 生成 voiceover.mp3"}

    base = "https://api.hedra.com/web-app/public"
    headers = {"x-api-key": key}
    try:
        # 1) 取模型 id
        mr = requests.get(f"{base}/models", headers=headers, timeout=30)
        if mr.status_code != 200:
            return {"success": False, "error": f"Hedra 取模型失敗 {mr.status_code}：{mr.text[:200]}"}
        md = mr.json()
        models = md if isinstance(md, list) else (md.get("data") or md.get("models") or [])
        if not models:
            return {"success": False, "error": "Hedra 沒有可用模型"}
        # 明確挑指定 slug（預設 Hedra Character-3）；找不到才退回第一個 hedra 模型
        match = next((m for m in models if m.get("slug") == req.model_slug), None) \
            or next((m for m in models if "hedra" in (m.get("slug") or "")), None)
        if not match:
            return {"success": False, "error": f"找不到 Hedra 模型（slug={req.model_slug}）"}
        model_id = match["id"]

        # 2) 建立並上傳 image / audio 兩個 asset
        def _make_asset(name, atype, path, mime):
            ar = requests.post(f"{base}/assets", headers=headers, json={"name": name, "type": atype}, timeout=30)
            if ar.status_code != 200:
                return None, f"Hedra 建立 {atype} asset 失敗 {ar.status_code}：{ar.text[:200]}"
            aid = ar.json()["id"]
            with open(path, "rb") as f:
                ur = requests.post(f"{base}/assets/{aid}/upload", headers=headers,
                                   files={"file": (name, f, mime)}, timeout=180)
            if ur.status_code != 200:
                return None, f"Hedra 上傳 {atype} 失敗 {ur.status_code}：{ur.text[:200]}"
            return aid, None

        image_id, err = _make_asset("image.png", "image", img, "image/png")
        if err:
            return {"success": False, "error": err}
        audio_id, err = _make_asset("audio.mp3", "audio", audio, "audio/mpeg")
        if err:
            return {"success": False, "error": err}

        # 3) 建立 generation
        gr = requests.post(f"{base}/generations", headers=headers, timeout=60, json={
            "type": "video",
            "ai_model_id": model_id,
            "start_keyframe_id": image_id,
            "audio_id": audio_id,
            "generated_video_inputs": {
                "text_prompt": req.prompt or "Generate a talking avatar",
                "resolution": req.resolution,
                "aspect_ratio": req.aspect_ratio,
            },
        })
        if gr.status_code != 200:
            return {"success": False, "error": f"Hedra 建立生成失敗 {gr.status_code}：{gr.text[:200]}"}
        gen_id = gr.json()["id"]

        # 4) 輪詢（Hedra 塞車時 8 秒短片也可能 >10 分鐘，放寬到 20 分鐘）
        video_url = None
        max_wait = 1200
        start = time.time()
        last_status = None
        while time.time() - start < max_wait:
            st = requests.get(f"{base}/generations/{gen_id}/status", headers=headers, timeout=30).json()
            status = st.get("status")
            last_status = status
            if status == "complete":
                video_url = st.get("url")
                break
            if status == "error":
                return {"success": False, "error": f"Hedra 生成錯誤：{st.get('error_message', st)}"}
            time.sleep(5)
        if not video_url:
            return {"success": False, "error": f"Hedra 任務逾時（>{max_wait // 60} 分鐘，最後狀態：{last_status}）。Hedra 可能塞車，請稍後重試或改用 fal 對嘴模型。"}

        clip = requests.get(video_url, timeout=180)
        if clip.status_code != 200:
            return {"success": False, "error": f"下載影片失敗 {clip.status_code}"}
    except requests.RequestException as e:
        return {"success": False, "error": f"連線 Hedra 失敗：{e}"}

    with open("generated_assets/talking_fg_hedra.mp4", "wb") as f:
        f.write(clip.content)
    return {"success": True, "video_url": "/assets/generated/talking_fg_hedra.mp4"}

# --- 合成：對嘴前景（逐幀 rembg 去背）疊到背景 → 9:16 成片（本地，免費）---
class CompositeRequest(BaseModel):
    fg_video: str = "talking_fg_hedra.mp4"
    bg_mode: str = "static"   # static=bg.png（靜止底圖）/ motion=bg_motion.mp4（動態背景）
    key: str = "chroma"       # chroma=綠幕色鍵 / rembg=逐幀語意去背 / none=場景內對嘴(不去背，只補 9:16)

@app.post("/api/composite")
def composite(req: CompositeRequest):
    """把對嘴前景去背疊到背景，或（key=none）直接把場景內對嘴補成 1080×1920。"""
    fg_path = f"generated_assets/{os.path.basename(req.fg_video)}"
    if not os.path.exists(fg_path):
        return {"success": False, "error": f"找不到前景影片 {req.fg_video}"}
    bg_png, bg_mp4 = "generated_assets/bg.png", "generated_assets/bg_motion.mp4"
    motion = req.bg_mode == "motion"
    none_key = req.key == "none"
    use_chroma = req.key == "chroma"
    if not none_key:
        if motion and not os.path.exists(bg_mp4):
            return {"success": False, "error": "找不到動態背景 bg_motion.mp4，請先生成或改用靜止底圖"}
        if not motion and not os.path.exists(bg_png):
            return {"success": False, "error": "找不到背景 bg.png，請先在 Step 3 去背"}
    try:
        import numpy as np
        from PIL import Image, ImageOps, ImageFilter
        from moviepy import VideoFileClip, VideoClip   # moviepy 2.x（無 .editor）
        session = None
        if req.key == "rembg":
            from rembg import remove, new_session
            session = new_session()
    except Exception as e:
        return {"success": False, "error": f"缺少套件：{e}"}

    W, H = 1080, 1920

    def _cutout(frame):
        """回傳 RGBA：色鍵把綠色變透明（保留深色腳掌），或 rembg 語意去背。"""
        if use_chroma:
            a = frame.astype(np.int16)
            r, g, b = a[..., 0], a[..., 1], a[..., 2]
            is_green = (g > 80) & ((g - r) > 40) & ((g - b) > 40)
            alpha = np.where(is_green, 0, 255).astype(np.uint8)
            alpha = np.array(Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)))  # 縮 1px，切掉綠色細邊
            out = frame.copy()
            mx = np.maximum(r, b)
            out[..., 1] = np.where(g > mx, mx, g).astype(np.uint8)                      # despill：壓掉殘留綠
            return np.dstack([out, alpha])
        return remove(frame, session=session)

    try:
        fg = VideoFileClip(fg_path)
        fps = fg.fps or 25
        bgc = VideoFileClip(bg_mp4) if (motion and not none_key) else None
        bg_static = None if (motion or none_key) else ImageOps.fit(Image.open(bg_png).convert("RGB"), (W, H), method=Image.LANCZOS)

        def make_frame(t):
            frame = fg.get_frame(t)
            if none_key:   # 場景內對嘴：不去背，整幀補成 9:16
                return np.array(ImageOps.fit(Image.fromarray(frame).convert("RGB"), (W, H), method=Image.LANCZOS, centering=(0.5, 0.4)))
            fg_im = ImageOps.fit(Image.fromarray(_cutout(frame)), (W, H), method=Image.LANCZOS, centering=(0.5, 0.4))
            if motion:
                base = ImageOps.fit(Image.fromarray(bgc.get_frame(t % bgc.duration)).convert("RGB"), (W, H), method=Image.LANCZOS)
            else:
                base = bg_static.copy()
            base.paste(fg_im, (0, 0), fg_im)                            # 用 alpha 疊上去
            return np.array(base)

        out_path = "generated_assets/final_composite.mp4"
        VideoClip(make_frame, duration=fg.duration).with_audio(fg.audio).write_videofile(
            out_path, fps=fps, codec="libx264", audio_codec="aac", logger=None, threads=4)
        fg.close()
        if bgc:
            bgc.close()
    except Exception as e:
        return {"success": False, "error": f"合成失敗：{e}"}
    return {"success": True, "video_url": "/assets/generated/final_composite.mp4"}

# --- Pexels B-roll 搜尋（回傳直式素材圖網址）---
@app.get("/api/pexels")
def pexels_search(q: str):
    key = os.getenv("PEXELS_API_KEY")
    if not key or key.startswith("your_"):
        return {"success": False, "error": "PEXELS_API_KEY 未設定，請填入 .env"}
    try:
        r = requests.get(
            "https://api.pexels.com/v1/search",
            headers={"Authorization": key},
            params={"query": q, "per_page": 1, "orientation": "portrait"},
            timeout=30,
        )
    except requests.RequestException as e:
        return {"success": False, "error": f"連線 Pexels 失敗：{e}"}
    if r.status_code != 200:
        return {"success": False, "error": f"Pexels {r.status_code}：{r.text[:150]}"}
    photos = r.json().get("photos", [])
    if not photos:
        return {"success": False, "error": f"找不到「{q}」的素材"}
    src = photos[0].get("src", {})
    url = src.get("portrait") or src.get("large") or src.get("original")
    return {"success": True, "url": url, "type": "image"}

# --- AI 自動配 B-roll：GPT-4o 分析字幕找點位 → Pexels 下載影片 ---
class AutoBrollRequest(BaseModel):
    segments: List[Dict[str, Any]]   # [{start, end, text}]，來自剪輯台字幕

@app.post("/api/auto_broll")
def auto_broll(req: AutoBrollRequest):
    """用 GPT-4o 從字幕挑 3–5 個 B-roll 點位、給英文關鍵字，並自動去 Pexels 下載影片。"""
    if not os.getenv("OPENAI_API_KEY"):
        return {"success": False, "error": "OPENAI_API_KEY 未設定，請填入 .env"}
    if not req.segments:
        return {"success": False, "error": "沒有字幕可分析，請先在剪輯台生成字幕"}
    try:
        tmp = "broll_assets/_transcript.json"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"segments": req.segments}, f, ensure_ascii=False)
        plan = broll_generator.generate_broll_plan(tmp, "broll_assets/_broll_plan.json")
    except Exception as e:
        return {"success": False, "error": f"AI 配 B-roll 失敗：{e}"}

    items = []
    for p in plan:
        vp = p.get("video_path")
        if not vp:
            continue   # Pexels 沒找到/下載失敗的點位跳過
        items.append({
            "start": p["start"], "end": p["end"], "q": p["query"],
            "url": "/assets/broll/" + os.path.basename(vp), "reason": p.get("reason", ""),
        })
    if not items:
        return {"success": False, "error": "Pexels 找不到合適素材（或下載失敗）"}
    return {"success": True, "items": items}

# --- 換一張 / 改關鍵字重抓單段 B-roll ---
class RerollRequest(BaseModel):
    query: str
    pick: int = 1   # 取第幾筆搜尋結果（換一張用）

@app.post("/api/reroll_broll")
def reroll_broll(req: RerollRequest):
    if not req.query.strip():
        return {"success": False, "error": "關鍵字是空的"}
    try:
        path = broll_generator.fetch_and_download_pexels_video(req.query.strip(), "broll_assets", "rr", req.pick)
    except Exception as e:
        return {"success": False, "error": f"抓取失敗：{e}"}
    if not path:
        return {"success": False, "error": f"Pexels 找不到「{req.query}」的直式素材"}
    return {"success": True, "url": "/assets/broll/" + os.path.basename(path)}

# --- 上傳場景圖：存成 base_image.png（供 Step 3 去背、Step 4 對嘴使用）---
@app.post("/api/upload_image")
def upload_image(file: UploadFile = File(...)):
    """把上傳的圖片轉存成 base_image.png，讓下游(去背/對嘴)用的是這張。"""
    try:
        from PIL import Image
        img = Image.open(file.file).convert("RGB")
        img.save("generated_assets/base_image.png", format="PNG")
    except Exception as e:
        return {"success": False, "error": f"圖片處理失敗：{e}"}
    return {"success": True, "image_url": "/assets/generated/base_image.png"}

# --- 上傳已有影片：當作剪輯台底層影片，並抽音軌給 Whisper 上字幕 ---
@app.post("/api/upload_video")
def upload_video(file: UploadFile = File(...)):
    """把上傳的影片存成剪輯台底層（final_composite.mp4），並抽出音軌成 voiceover.mp3。"""
    dst = "generated_assets/final_composite.mp4"
    try:
        with open(dst, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        return {"success": False, "error": f"存檔失敗：{e}"}

    warning = None
    try:  # 抽音軌，讓「從配音生成字幕」可用
        from moviepy import VideoFileClip
        clip = VideoFileClip(dst)
        if clip.audio is not None:
            clip.audio.write_audiofile("generated_assets/voiceover.mp3", logger=None)
        else:
            warning = "影片沒有音軌，無法自動上字幕"
        clip.close()
    except Exception as e:
        warning = f"音軌抽取失敗（仍可剪輯）：{e}"
    return {"success": True, "video_url": "/assets/generated/final_composite.mp4", "warning": warning}

# --- Whisper 自動字幕：把配音轉成逐句時間軸 ---
@app.post("/api/transcribe")
def transcribe():
    """用 OpenAI Whisper 把 voiceover.mp3 轉成逐句時間軸字幕（給剪輯台字幕軌）。"""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return {"success": False, "error": "OPENAI_API_KEY 未設定，請填入 .env"}
    audio = "generated_assets/voiceover.mp3"
    if not os.path.exists(audio):
        return {"success": False, "error": "找不到配音，請先在 Step 1 生成 voiceover.mp3"}
    try:
        with open(audio, "rb") as f:
            resp = requests.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                files={"file": ("voiceover.mp3", f, "audio/mpeg")},
                data={"model": "whisper-1", "response_format": "verbose_json",
                      "timestamp_granularities[]": "segment"},
                timeout=180,
            )
    except requests.RequestException as e:
        return {"success": False, "error": f"連線 OpenAI 失敗：{e}"}
    if resp.status_code != 200:
        return {"success": False, "error": f"Whisper 回應 {resp.status_code}：{resp.text[:200]}"}
    segs = resp.json().get("segments", []) or []
    out = [{"start": round(s.get("start", 0), 2), "end": round(s.get("end", 0), 2),
            "text": (s.get("text") or "").strip()} for s in segs if (s.get("text") or "").strip()]
    if not out:
        return {"success": False, "error": "Whisper 沒有回傳字幕段落"}
    return {"success": True, "segments": out}

# --- 真 render：讀剪輯台存檔，把 b-roll + 字幕燒進底層影片 → 匯出 ---
def _asset_local(url):
    if not url:
        return None
    u = url.split("?")[0]
    if u.startswith("/assets/broll/"):
        return "broll_assets/" + u[len("/assets/broll/"):]
    if u.startswith("/assets/generated/"):
        return "generated_assets/" + u[len("/assets/generated/"):]
    return None

# 字型 key -> 後端字型檔（對應前端 FONTS；找不到時往後備援）
# 每個字型 = (檔案路徑, ttc 內的 face index)。
# heiti=Noto CJK TC Black（含完整繁體、字重 900）；songti 要用 index 2=Songti TC Bold（index 0 是簡體 SC，會漏繁體字）
_FONT_FILES = {
    "heiti": [("~/Library/Fonts/NotoSansCJKtc-Black.otf", 0), ("/System/Library/Fonts/STHeiti Medium.ttc", 0)],
    "songti": [("/System/Library/Fonts/Supplemental/Songti.ttc", 2), ("/System/Library/Fonts/Supplemental/Songti.ttc", 7)],
    "arialu": [("/Library/Fonts/Arial Unicode.ttf", 0), ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 0)],
}
_FONT_FALLBACK = [("~/Library/Fonts/NotoSansCJKtc-Black.otf", 0), ("/System/Library/Fonts/STHeiti Medium.ttc", 0)]

# ── 掃描系統已安裝字型：家族名 → (檔案, index)，挑最粗的 face 對齊預覽的 900 ──
_FONT_DIRS = ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental",
              "/Library/Fonts", os.path.expanduser("~/Library/Fonts")]
_FONT_INDEX = None   # family(lower) -> (path, index)
_FONT_LIST = None    # 排序後的家族名清單（給前端下拉）

def _style_rank(style):
    s = (style or "").lower()
    if "black" in s or "heavy" in s: return 4
    if "bold" in s or "semibold" in s or "demibold" in s: return 3
    if "medium" in s: return 2
    if any(k in s for k in ("light", "thin", "ultralight", "hairline")): return 0
    return 1

def _scan_fonts():
    global _FONT_INDEX, _FONT_LIST
    if _FONT_INDEX is not None:
        return
    from PIL import ImageFont
    best = {}   # family_lower -> (rank, family, path, index)
    for d in _FONT_DIRS:
        try:
            names = os.listdir(d)
        except OSError:
            continue
        for fn in names:
            if not fn.lower().endswith((".ttf", ".otf", ".ttc")):
                continue
            path = os.path.join(d, fn)
            is_ttc = fn.lower().endswith(".ttc")
            for idx in range(0, 40):
                try:
                    f = ImageFont.truetype(path, 20, index=idx)
                    fam, style = f.getname()
                except Exception:
                    break
                if fam and not fam.startswith(".") and "?" not in fam and fam.isprintable():   # 跳過隱藏/亂碼名
                    r = _style_rank(style)
                    k = fam.lower()
                    if k not in best or r > best[k][0]:
                        best[k] = (r, fam, path, idx)
                if not is_ttc:
                    break
    _FONT_INDEX = {k: (v[2], v[3]) for k, v in best.items()}
    _FONT_LIST = sorted({v[1] for v in best.values()}, key=str.lower)

@app.get("/api/fonts")
def list_fonts():
    """回傳系統已安裝字型家族名清單，給前端字型下拉。"""
    _scan_fonts()
    return {"fonts": _FONT_LIST}

def _cjk_font(size, key="heiti"):
    from PIL import ImageFont
    candidates = _FONT_FILES.get(key)
    if candidates is None:        # 不是預設 key → 當成系統字型家族名解析
        _scan_fonts()
        hit = _FONT_INDEX.get((key or "").lower())
        candidates = [hit] if hit else []
    for p, idx in candidates + _FONT_FALLBACK:
        try:
            return ImageFont.truetype(os.path.expanduser(p), size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()

@app.post("/api/render")
def render_video():
    base_path = "generated_assets/final_composite.mp4"
    if not os.path.exists(base_path):
        return {"success": False, "error": "找不到底層影片，請先在 Step 4 生成成片或上傳影片"}
    subs, brolls = [], []
    if os.path.exists(PROJECT_PATH):
        try:
            with open(PROJECT_PATH, encoding="utf-8") as f:
                proj = json.load(f)
            subs = proj.get("subtitles") or []
            brolls = proj.get("brolls") or []
        except Exception:
            pass
    try:
        import numpy as np
        from PIL import Image, ImageDraw, ImageOps
        from moviepy import VideoFileClip, VideoClip
    except Exception as e:
        return {"success": False, "error": f"缺少套件：{e}"}

    W, H = 1080, 1920
    try:
        base = VideoFileClip(base_path)
        fps = base.fps or 25
        duration = max([base.duration] + [s.get("end", 0) for s in subs] + [b.get("end", 0) for b in brolls])

        bmedia = {}   # broll id -> (kind, src)
        for b in brolls:
            local = _asset_local(b.get("url"))
            if not local or not os.path.exists(local):
                continue   # 上傳的 blob:/找不到的素材跳過
            if local.lower().endswith((".mp4", ".mov", ".webm", ".m4v")):
                bmedia[b["id"]] = ("video", VideoFileClip(local))
            else:
                bmedia[b["id"]] = ("image", Image.open(local).convert("RGB"))

        font_cache = {}
        def font(sz, key):
            sz = max(8, int(sz))
            ck = (sz, key)
            if ck not in font_cache:
                font_cache[ck] = _cjk_font(sz, key)
            return font_cache[ck]

        def wrap(draw, text, fnt, maxw):
            out = []
            for raw in (text or "").split("\n"):
                cur = ""
                for ch in raw:
                    if draw.textlength(cur + ch, font=fnt) <= maxw:
                        cur += ch
                    else:
                        if cur:
                            out.append(cur)
                        cur = ch
                out.append(cur)
            return out

        def make_frame(t):
            fr = base.get_frame(min(t, base.duration - 1.0 / fps))
            img = Image.fromarray(fr).convert("RGB")
            if img.size != (W, H):
                img = ImageOps.fit(img, (W, H), method=Image.LANCZOS)
            # b-roll 疊層
            for b in brolls:
                if not (b.get("start", 0) <= t < b.get("end", 0)):
                    continue
                m = bmedia.get(b["id"])
                if not m:
                    continue
                kind, src = m
                bframe = Image.fromarray(src.get_frame((t - b["start"]) % src.duration)).convert("RGB") if kind == "video" else src
                bw = max(1, int(W * (b.get("cw", 100) / 100) * b.get("scale", 1)))
                bh = max(1, int(H * (b.get("ch", 100) / 100) * b.get("scale", 1)))
                fitted = ImageOps.fit(bframe, (bw, bh), method=Image.LANCZOS)
                cx = int(W * b.get("x", 50) / 100)
                cy = int(H * b.get("y", 50) / 100)
                img.paste(fitted, (cx - bw // 2, cy - bh // 2))
            # 字幕燒字
            draw = ImageDraw.Draw(img)
            for s in subs:
                if not (s.get("start", 0) <= t < s.get("end", 0)):
                    continue
                st = s.get("style", {})
                fnt = font(st.get("size", 96), st.get("font", "heiti"))
                lines = wrap(draw, s.get("text", ""), fnt, int(W * 0.98))  # 對齊編輯器 98%，避免提早換行
                asc, desc = fnt.getmetrics()
                lh = int((asc + desc) * 1.25)
                cx = int(W * st.get("x", 50) / 100)
                top = int(H - H * st.get("bottom", 8) / 100 - lh * len(lines))
                fill = st.get("fill", "#ffffff")
                stroke = st.get("stroke", "#000000")
                sw = int(st.get("strokeW", 0))
                for i, ln in enumerate(lines):
                    y = top + i * lh
                    # Noto Black 本身就是字重 900，單次繪製即可（不再仿粗體）
                    draw.text((cx, y), ln, font=fnt, fill=fill, anchor="ma", stroke_width=sw, stroke_fill=stroke)
            return np.array(img)

        out_path = "generated_assets/final_render.mp4"
        VideoClip(make_frame, duration=duration).with_audio(base.audio).write_videofile(
            out_path, fps=fps, codec="libx264", audio_codec="aac", logger=None, threads=4)
        base.close()
        for kind, src in bmedia.values():
            if kind == "video":
                src.close()
    except Exception as e:
        return {"success": False, "error": f"render 失敗：{e}"}
    return {"success": True, "video_url": "/assets/generated/final_render.mp4"}

@app.get("/api/project/load")
def load_project():
    """讀回最近一次儲存的專案；尚無存檔時回 exists=False。"""
    if not os.path.exists(PROJECT_PATH):
        return {"exists": False}
    with open(PROJECT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {"exists": True, "project": data}
