---
title: Vitual Roles Backend
emoji: 🎬
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 8000
pinned: false
---

# Virtual Roles — AI Podcast 影片產生器

> 上方 frontmatter 供 Hugging Face Spaces(Docker)使用;GitHub 會忽略它。

文字稿 → AI 配音 → 生圖/去背 → 對嘴影片 → 動態背景 → 字幕/B-roll 剪輯 → 9:16 成片。
後端 FastAPI，前端 React + Vite。

## 需求
- Python 3.10+
- Node.js 18+
- ffmpeg（moviepy 需要）：macOS `brew install ffmpeg`

## 安裝
```bash
# 1. 後端
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. 前端
cd frontend && npm install && cd ..
```

## 設定 API 金鑰 🔑
1. 複製範本：
   ```bash
   cp .env.example .env
   ```
2. 打開 `.env`，把各服務的金鑰填到等號後面。不需要的功能可留空。

| 變數 | 用途 | 取得 |
|---|---|---|
| `OPENAI_API_KEY` | 字幕轉錄、生圖、inpaint、優化 prompt、自動 B-roll | https://platform.openai.com/api-keys |
| `FISH_AUDIO_API_KEY` | TTS 配音（預設） | https://fish.audio |
| `ELEVENLABS_API_KEY` | TTS 配音（可選替代） | https://elevenlabs.io |
| `HEDRA_API_KEY` | 對嘴影片 | https://www.hedra.com |
| `PEXELS_API_KEY` | B-roll 素材 | https://www.pexels.com/api/ |
| `FAL_KEY` | 動態背景 + 部分對嘴 + nano-banana 後備 | https://fal.ai/dashboard/keys |
| `GEMINI_API_KEY` | 直連 nano-banana 生圖/去背（留空走 fal；生圖需開 billing） | https://aistudio.google.com/apikey |

> ⚠️ `.env` 已被 `.gitignore` 排除，**不會、也不要**上傳到 git。

## 啟動
```bash
./start.sh          # 後端(8000) + 前端(5173)
./start.sh tunnel   # 另外開 Cloudflare 分享通道並印出網址
./stop.sh           # 全部關閉
```
打開 **http://localhost:5173**。

## 結構
- `api.py` — FastAPI 後端（TTS / 生圖 / 去背 / 對嘴 / 合成 / render / 字型）
- `broll_generator.py` — 用 GPT 規劃 B-roll 關鍵字並抓 Pexels
- `frontend/` — React + Vite 介面（Phase 1 製作流程、Phase 2 剪輯台）
- `start.sh` / `stop.sh` — 一鍵啟動 / 關閉
