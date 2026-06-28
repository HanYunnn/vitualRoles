# 部署:Vercel(前端) + Render(後端) + 使用者自帶金鑰

架構:前端放 Vercel、Python 後端放 Render(有 ffmpeg)。使用者在網頁的「⚙️ API 金鑰設定」輸入自己的金鑰 → 存在他們的瀏覽器,每次請求以 header 帶給後端、**後端用完即丟、不儲存**。

## 1. 部署後端到 Render
1. https://render.com → New → **Web Service** → 連你的 GitHub repo
2. Render 會偵測到 **Dockerfile**(已內含 ffmpeg);Environment 選 **Docker**
3. Instance：免費方案記憶體可能不夠(rembg/onnxruntime 較吃)→ 建議至少 **512MB–1GB**
4. （可選）你也可以在 Render 的 Environment 填一組 `.env` 金鑰當「預設」;但若要使用者各自帶金鑰,可全部留空
5. 部署完成 → 複製後端網址,例如 `https://vitualroles.onrender.com`

## 2. 設定前端轉發
編輯 [frontend/vercel.json](frontend/vercel.json),把兩個 `YOUR-BACKEND.onrender.com` 換成你的後端網址,commit + push。

## 3. 部署前端到 Vercel
1. https://vercel.com → New Project → 連同一個 repo
2. **Root Directory 設成 `frontend`**(重要,Vite 專案在子目錄)
3. Framework 會自動偵測 Vite;直接 Deploy
4. 完成 → 得到前端網址,例如 `https://vitualroles.vercel.app`

## 4. 使用者怎麼用
1. 開前端網址
2. 右上 **⚙️ → API 金鑰設定** → 貼上自己的金鑰(OpenAI / fal / Gemini / Hedra / Fish / Pexels)→ 儲存
3. 開始用;金鑰只在他們瀏覽器,經 header 帶給後端、不被儲存

## ⚠️ 已知限制(先試試版)
- **單一工作檔**:後端用固定檔名(base_image.png、fg.png…),**多人同時用會互相覆蓋**。自己/少數人測試 OK;要正式多人需加「每人一個工作目錄/session」。
- **Render 冷啟動**:免費方案閒置會休眠,第一次請求較慢;rembg 首次會下載模型。
- **大影片經 Vercel 轉發**:一般可串流;若遇大小限制,改用前端環境變數 `VITE_API_BASE` 直連後端(需後端 CORS,已開)。
- 對嘴/動態背景要等數分鐘,Render 請求逾時設長一點。

## 本機開發(不變)
```bash
./start.sh   # 後端 8000 + 前端 5173(走 Vite proxy，相對路徑)
```
