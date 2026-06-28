# 部署:Vercel(前端) + Hugging Face Spaces(後端) + 使用者自帶金鑰

架構:前端放 Vercel、Python 後端放 **Hugging Face Spaces**(免費、16GB RAM、有 ffmpeg)。使用者在網頁的「⚙️ API 金鑰設定」輸入自己的金鑰 → 存在他們的瀏覽器,每次請求以 header 帶給後端、**後端用完即丟、不儲存**。

## 1. 部署後端到 Hugging Face Spaces(免費)
1. https://huggingface.co/new-space → 取名(如 `vitualroles`)→ **SDK 選 Docker**(Blank)→ 建立
2. 把這個 repo 推到 Space 的 git(Space 本身就是一個 git repo):
   ```bash
   git remote add hf https://huggingface.co/spaces/<你的HF帳號>/vitualroles
   git push hf main
   ```
   (HF 會要你的帳號 + access token 當密碼:https://huggingface.co/settings/tokens 產一個 write token)
3. HF 會讀 **Dockerfile** + README 的 `app_port: 8000` 自動 build(首次 5–10 分鐘)
4. 完成 → 後端網址是 **`https://<你的HF帳號>-vitualroles.hf.space`**
5. （可選）Space → Settings → Secrets 可填一組金鑰當預設;要使用者各自帶金鑰則留空

## 2. 設定前端轉發
編輯 [frontend/vercel.json](frontend/vercel.json),把兩個網址換成你的 **HF Space 網址**(`https://<帳號>-vitualroles.hf.space`),commit + push。

## 3. 部署前端到 Vercel
1. https://vercel.com → New Project → 連同一個 repo
2. **Root Directory 設成 `frontend`**(重要,Vite 專案在子目錄)
3. Framework 會自動偵測 Vite;直接 Deploy
4. 完成 → 得到前端網址,例如 `https://vitualroles.vercel.app`

## 4. 使用者怎麼用
1. 開前端網址
2. 右上 **⚙️ → API 金鑰設定** → 貼上自己的金鑰(OpenAI / fal / Gemini / Hedra / Fish / Pexels)→ 儲存
3. 開始用;金鑰只在他們瀏覽器,經 header 帶給後端、不被儲存

## 多人同時使用 ✅
- 每個瀏覽器會產生一個 **session id**(存 localStorage),隨每次請求帶上 `X-Session-Id`。
- 後端把檔案分到 **`sessions/<id>/generated|broll/`**,**多人同時用互不覆蓋**。
- 資產 URL 也是 `/assets/work/<id>/...`,各自獨立。
- 注意:`sessions/` 會隨使用累積,建議定期清理舊目錄(或之後加自動過期)。

## ⚠️ 其他注意
- **Render 冷啟動**:免費方案閒置會休眠,第一次請求較慢;rembg 首次會下載模型。
- **大影片經 Vercel 轉發**:一般可串流;若遇大小限制,改用前端環境變數 `VITE_API_BASE` 直連後端(需後端 CORS,已開)。
- 對嘴/動態背景要等數分鐘,Render 請求逾時設長一點。

## 本機開發(不變)
```bash
./start.sh   # 後端 8000 + 前端 5173(走 Vite proxy，相對路徑)
```
