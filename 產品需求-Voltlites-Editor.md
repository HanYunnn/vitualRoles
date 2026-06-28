---
title: Voltlites Editor — 產品需求文件 (UI 設計交付版)
date: 2026-06-15
updated: 2026-06-16
type: product-spec
status: 設計定案 · 已實作於 frontend/
audience: UI/UX 設計師 / 前端
related: 產品需求.md（內容/頻道策略，背景脈絡）
---

# Voltlites Editor — 產品需求文件（介面設計用）

> 本文件給 UI/UX 設計師作介面設計依據。內容由現有前端（React 19 + Vite）與後端（FastAPI）程式碼反推整理而成。
>
> 另有一份 [產品需求.md](產品需求.md)，記錄的是**內容與頻道策略**（黑貓 Podcast、虛擬角色「熙」的人設、AI 生成工具選型）——那是「我們要產出什麼影片」；**本文件**則是「產出影片的這套軟體長什麼樣」。兩者互補。

> **2026-06-16 更新 — 設計已定案並落地。** 一份 high-fidelity 設計（暖黑色系 WARM BOLD）已完成，並實作進 [frontend/](frontend/)（React 19 + TS）。相對於本文件初版（純黑工程風），設計做了以下決策與擴充，正文已同步：
> - **色系改為暖黑**（`#141009`）+ 大標題字體 Archivo / 內文 Hanken Grotesk / 標籤 JetBrains Mono / 中文 Noto Sans TC。
> - 新增**常駐頂部 Header + 可點擊 4 步 Stepper**（跨階段導覽）與常駐 ⚙ 設定。
> - Phase 2 新增**獨立播放列 TransportBar** 與**多軌縮圖型 Timeline**（可新增/刪除/改名/拖曳排序/收合軌道），取代初版的固定雙軌。
> - Phase 4 升級為**多平台發布**（YouTube / Instagram / TikTok 分頁）。
> - 角色庫、字幕樣式即時預覽、B-Roll 素材上傳等元件已具體化。
> - 流程已接上後端 mock 端點（generate / render），離線時自動回退假資料。
>
> 原先標「🟡 待設計師決策」的項目多已解決，詳見 [§6](#6-給設計師的開放問題-決策清單已更新)。

---

## 1. 產品定位

**一句話：** 一站式「AI 生成 + 專業剪輯 + 一鍵發布」的直式短影音工作站。

讓單一創作者不開 CapCut、不碰多套工具，就能完成：**文稿 → AI 配音 → AI 生成畫面 → 去背合成 → 自動字幕 → B-Roll 疊加 → 渲染 → 發布到社群** 的完整流程。

- **產品名稱**：Voltlites Editor（程式碼中的 Logo 字樣）
- **平台**：桌面網頁（Web App），非響應式手機版（NLE 剪輯天生需要大畫面）
- **輸出規格**：直式 **9:16** 短影音（IG Reels / TikTok / YouTube Shorts）
- **核心使用者**：經營 AI 虛擬角色頻道的個人創作者（即本專案的黑貓頻道與「熙」頻道營運者）

### 兩種使用情境（決定整個流程分岔）

| 情境 | 起點 | 說明 |
|------|------|------|
| **A. 從零生成** | 只有一段文字稿 | 由系統一路生成語音、畫面、動畫，再進剪輯 |
| **B. 已有影片** | 手上有 .mp4 | 直接上傳進剪輯器，跳過所有生成步驟 |

---

## 2. 整體流程與資訊架構

產品是一條**線性精靈流程（Wizard）**，共 4 個主階段。Phase 2 是核心，其餘是前置與收尾。

```
┌──────────────┐   ┌─────────────────────┐   ┌──────────────┐   ┌──────────────┐
│  PHASE 1     │   │  PHASE 2            │   │  PHASE 3     │   │  PHASE 4     │
│  WORKFLOW    │──▶│  NLE 剪輯工作站      │──▶│  RENDERING   │──▶│  PUBLISH     │
│  SETUP       │   │  (產品核心)          │   │  (渲染等待)   │   │  (發布)       │
└──────────────┘   └─────────────────────┘   └──────────────┘   └──────────────┘
   ↑ 選 A/B 分流        ↑ 可回到 Phase 1         ↑ 純等待動畫        ↑ 可回 Phase 2
```

**全域元素（跨階段）**
- 右上角 **SETTINGS**（API 金鑰設定 Modal）—— 目前只在 Phase 1 出現，🟡 設計師可考慮是否做成常駐入口
- Undo / Redo（⌘Z / ⌘⇧Z）—— 僅 Phase 2 生效
- 鍵盤刪除（Delete / Backspace 刪除選取的字幕或 B-Roll）

---

## 3. 各畫面功能規格

### PHASE 1 — Workflow Setup（流程設定）

置中卡片式精靈，標題 `PHASE 1: WORKFLOW SETUP`。

#### 1-0 入口選擇（兩張大卡並排）
| 卡片 | 標籤 | 說明文案 | 對應情境 |
|------|------|---------|---------|
| **[ UPLOAD ]** | Existing Video (.mp4) | Upload MP4 directly to NLE. | 情境 B |
| **[ GENERATE ]** | AI Generation Workflow | Generate voice, image, and animation. | 情境 A（綠色強調，主推路徑）|

#### 1-A UPLOAD 路徑
- 拖放區（dashed border）：Drag and drop MP4 here
- 按鈕 `PROCESS & EDIT` → 後端自動轉錄（Whisper）產生字幕 → 進 Phase 2

#### 1-B GENERATE 路徑（**漸進式 4 步驟，逐步解鎖**）

這是 Phase 1 最複雜的畫面：四個步驟卡**垂直堆疊**，未解鎖的卡 `opacity: 0.3` 且不可點，當前步驟標題亮綠色，已完成步驟可「EDIT / REGENERATE」收合回編輯。

| 步驟 | 標題 | 輸入 | 動作 | 產出 |
|------|------|------|------|------|
| **Step 1** | Audio Generation | 文字稿 textarea + **角色（聲音）選擇** | GENERATE AUDIO / UPLOAD MP3 | 音檔（含播放器 + 下載）|
| **Step 2** | Base Image | 圖片 prompt | GENERATE IMAGE / UPLOAD PNG | 單張場景圖 |
| **Step 3** | FG/BG Split | （無）| PROCESS REMOVE.BG | 前景去背圖 + 背景圖（各可下載）|
| **Step 4** | Animation (Hedra + Kling) | （無）| GENERATE VIDEO / UPLOAD MP4 | 對嘴前景影片 (Lip-sync FG) + 動態背景影片 (Motion BG) |

完成 Step 4 → `PROCEED TO TIMELINE EDITING` → 進 Phase 2。

**角色庫（Role Library，Step 1 內的子元件）** — 這是個重要可重用元件：
- 角色清單（可選取，選中亮綠底）：每個角色含 `名稱`、`TTS 引擎`（ElevenLabs / Fish Audio / Azure）、`Voice ID`、`頭像`、`試聽音檔`
- `+ ADD CUSTOM ROLE`：表單新增（名稱、TTS 引擎、Voice ID、頭像 URL）
- 🟡 待設計師決策：角色卡是否要有試聽播放按鈕、頭像縮圖呈現方式（程式中已有 sampleAudioUrl/avatarUrl 欄位但 UI 尚未完整呈現）

#### 1-S Settings Modal（全域 API 設定）
深色 Modal，標題 `API SETTINGS`，欄位：
- LLM Model（下拉：GPT-4o / Claude 3.5 Sonnet…）
- API Keys：OpenAI、Pexels、Hedra、ElevenLabs、Fish Audio（password 欄位）
- 說明：金鑰存於本機，留空則用 .env 預設

---

### PHASE 2 — NLE 剪輯工作站（產品核心）⭐

這是專業剪輯軟體版面（仿 Premiere / Final Cut 的 NLE 佈局），**三區可調整大小**：

```
┌─────────────────────────────────────────────────────────┐
│  [VOLTLITES EDITOR]                      [RENDER VIDEO]   │  ← Header (50px)
├──────────────┬──────────────────────────────────────────┤
│  左側面板     │                                          │
│  (分頁)       │           中央監視器                      │
│  ┌─────────┐ │        9:16 直式預覽                       │  ← Top Panel
│  │SCRIPT   │ │   ┌──────────┐                            │
│  │B-ROLL   │ │   │   影片    │  ← 即時字幕疊加            │
│  │STYLE    │ │   │  preview │  ← B-Roll 疊加框           │
│  └─────────┘ │   └──────────┘                            │
│              │  ↔ 左右可拖拉分隔                          │
├──────────────┴──────────────────────────────────────────┤
│  ↕ 上下可拖拉分隔                                          │
│  TIMELINE                                                │
│  0s   1s   2s   3s   4s ...           (ruler + playhead) │  ← Bottom Panel
│  V2 (B-Roll) ▓▓▓▓                                        │
│  V1 (Text)   ░░░  ░░░  ░░░                               │
└─────────────────────────────────────────────────────────┘
```

#### 2-A 左側面板（三分頁）

**① SCRIPT 分頁** — 字幕逐句清單
- 每句一張卡：時間徽章 `0.00s - 2.50s` + 可即時編輯的文字
- 正在播放的句子：左側亮綠色邊條 + 綠色微底
- 選取的句子：白框
- 選取時出現 `🗑 DELETE`

**② B-ROLL 分頁** — 畫面覆蓋素材清單
- `+ ADD B-ROLL HERE`（在當前播放點新增）
- 每個 B-Roll 卡：時間徽章 + 搜尋關鍵字（query）
- 選取時展開細部控制（**重要：B-Roll 的版面變形參數**）：
  - 縮放比例 Scale（0.5–2x）
  - X 位置 / Y 位置（0–100%）
  - 裁切寬度 Crop W / 裁切高度 Crop H（10–100%）
  - `DELETE CLIP`
- 正在播放：左側亮藍色邊條

**③ STYLE 分頁** — 字幕樣式（**逐句獨立樣式**）
- 未選字幕時：提示「請先選取一句字幕」
- 選取後顯示正在編輯哪一句（引用該句文字）
- 樣式參數：字體顏色、外框顏色、字體大小比例（0.05–0.2）、外框寬度（0–10px）、離底邊距（0–0.5）
- `COPY STYLE` / `PASTE STYLE`（樣式剪貼簿，可把一句的樣式複製到另一句）
- `APPLY TO ALL SUBTITLES`（套用到全部字幕）

#### 2-B 中央監視器
- **9:16 直式**置中預覽，`object-fit: cover`
- **即時字幕疊加**：依當前播放時間，顯示該秒字幕，套用該句專屬樣式（顏色／外框／位置即時反映）
- **B-Roll 疊加預覽**：當前時間內的 B-Roll 顯示為半透明藍色虛線框 + query 文字（佔位示意，非真實影片）
- 影片原生播放控制列（play/pause/seek）

#### 2-C 底部時間軸（Timeline）
- **時間尺規（Ruler）**：每秒刻度，可點擊/拖曳移動播放頭
- **多軌道（縮圖膠卷型）**：字幕軌（藍色漸層 clip）／ B-ROLL 軌（紫色膠卷 clip）／ 原始片（鎖定底軌）；軌道可動態增減，詳見 [2-E](#2-e-互動連動模型已實作-2026-06-16)
- **Clip 互動**：拖曳中段 = 移動時間位置（即時寫回字幕/B-Roll 起訖）；選取/播放中 = 白色外框
- **紅色播放頭（Playhead）**：三角頭指針，貫穿所有軌道，與監視器、面板同步
- ＊未實作：clip 左右把手 trim、磁性吸附（snapping）—— 列為後續

#### 2-D 互動行為總表
| 行為 | 操作 |
|------|------|
| 刪除選取項 | 字幕卡 / B-Roll 卡的 DELETE 按鈕 |
| 調整時間軸高度 | 拖上下水平分隔線（最小 160px）|
| 收合時間軸 | 點 TIMELINE 標題 ▾ |
| 渲染 | 右上 `RENDER VIDEO` → Phase 3 |

#### 2-E 互動連動模型（已實作，2026-06-16）

剪輯台是**單一資料源**架構（[editorStore.tsx](frontend/src/phases/editorStore.tsx)）：一份 `subtitles[] / brolls[] / tracks[] / playhead`，所有面板、監視器、時間軸讀寫同一份，彼此**雙向即時連動**：

- **編輯連動**：STYLE 改樣式、SCRIPT 改文字、B-ROLL 改 Scale/X/Y/Crop → 監視器即時反映；時間軸拖 clip → 面板時間碼同步。
- **播放連動 / 播放時鐘**：▶ 讓播放頭隨真實時間前進（rAF），字幕與 B-Roll 依當前秒數自動上下檔，面板「播放中」高亮與監視器字幕跟著切換。
- **多軌**：字幕軌 / B-ROLL 軌可**新增、雙擊改名、上下移、刪除**（⋯ 選單 + 「+ 軌道」下拉）；**軌道由上到下＝監視器疊放層級**（上移一軌的 B-Roll 會蓋在其他之上）；新字幕/B-Roll 歸屬對應種類的軌道。原始片（FG+BG 合成）為鎖定底軌。
- **選取**：點面板項目或時間軸 clip 即選取並把播放頭移到該段起點，達成 WYSIWYG。

> 取捨：clip 目前僅支援水平（時間）拖曳；尚未支援把 clip 垂直拖到另一條軌（跨軌歸屬靠新增時決定）。為後續項目。

---

### PHASE 3 — Rendering（渲染等待）

純等待全螢幕：旋轉 spinner（綠色）+ `RENDERING FINAL VIDEO...` + 副文案「Applying chroma key, burning subtitles, and mixing audio.」

🟡 待設計師決策：是否需要真實進度條 / 各階段步驟提示（去背→燒字幕→混音→編碼），目前是無進度的純動畫。

---

### PHASE 4 — Publish（發布）

兩欄佈局：
- **左欄**：成片預覽播放器（接後端回傳的真實影片）+ `BACK TO EDIT` + `DOWNLOAD MP4`
- **右欄**：社群自動發布表單，**多平台分頁**（YouTube / Instagram / TikTok，選取時套用品牌色外框，主行動鈕色隨平台變）
  - Video Title / Description / Privacy（公開 / 不公開 / 私人）
  - 主按鈕隨平台：`PUBLISH TO YOUTUBE` / `SHARE TO REELS` / `POST TO TIKTOK`（觸發 OAuth 上傳）
  - 非 YouTube 平台顯示「串接規劃中」說明（介面已預留）

---

## 4. 視覺設計系統（定案 Design Tokens · WARM BOLD）

定案風格為**暖黑（WARM BOLD）**：保留 Volt 螢光綠的專業 NLE 調性，但底色從純黑改為帶暖調的深棕黑，搭配粗體 Archivo 大標題，增加創作者親和力。完整 token 實作於 [frontend/src/index.css](frontend/src/index.css)（`.vlt` scope）。

### 色彩
| Token | 值 | 用途 |
|-------|-----|------|
| `--bg` | `#141009` | 主背景（暖黑）|
| `--bg2` | `#0f0c06` | 更深背景 / header / 輸入框底 |
| `--pan` / `--pan2` | `#1b1710` / `#231e15` | 面板底 / 次層面板 / 選取分頁底 |
| `--card` | `#1f1a12` | 卡片底 |
| `--bd` / `--bd2` | `rgba(245,238,226,.1)` / `.18` | 邊框 / 強邊框 |
| `--tx` | `#f4efe6` | 主文字（暖白）|
| `--mut` / `--mut2` | `#9a8f81` / `#6c6357` | 次文字 / 更淡文字 |
| **`--g`** | **`#c4d600`** | **主強調（Volt 螢光綠）— 主行動 / 播放 / 選取**（`--gd #171300` 為綠底深字）|
| `--b` / `--bsolid` | `#6a5bff` / `#3b29ff` | 藍紫（B-Roll 相關 / RENDER 按鈕 / 字幕 clip）|

軌道 clip 另用漸層：B-Roll 紫 `#8b5cf6→#7c3aed`、字幕藍 `#5b4bff→#3b29ff`；播放頭紅線 `#ff3b3b`。

### 字體
| Token | 字型 | 用途 |
|-------|------|------|
| `--disp` | **Archivo**（700/800/900）+ Noto Sans TC | 標題、數字、按鈕、Stepper |
| `--body` | **Hanken Grotesk** + Noto Sans TC | 內文、可編輯文字 |
| `--mono` | **JetBrains Mono** | 標籤、時間碼、技術字（大寫 + letter-spacing .08–.14em）|
| 字幕渲染 | Noto Sans TC 900 | 含 `-webkit-text-stroke` 外框（`paint-order: stroke fill`）|

### 形狀與動效
- 圓角：按鈕 8–10px、卡片 11–14px、Modal 16px、小標籤 5–7px、軌道 clip 5px（比初版圓潤）
- 主按鈕陰影 `0 4px 18px rgba(196,214,0,.25)`；Modal `0 30px 90px rgba(0,0,0,.6)`
- 按鈕 hover 上浮 2px；primary 為螢光綠底深字、`.blue` 為藍底白字（RENDER）
- Modal 進場 `vltpop`（12px 上移淡入）；Phase 3 `vltspin` / `vltpulse`

### 風格關鍵字
> 暖黑、專業、創作者友善、NLE 工作站、螢光綠點綴、粗體大標題、等寬字標籤、適度圓角。

---

## 5. 重點元件清單（給設計系統用）

設計師需產出的可重用元件：

- [ ] **按鈕**：Primary（綠）/ Secondary（描邊）/ Ghost（虛線，如新增）/ Danger / Disabled
- [ ] **步驟卡（Step Card）**：解鎖 / 進行中 / 已完成（可收合）三態
- [ ] **角色卡（Role Card）**：頭像 + 名稱 + TTS 引擎標籤 + 試聽按鈕 + 選取態
- [ ] **清單項卡（List Item）**：時間徽章 + 可編輯內容 + 選取/播放態（字幕版、B-Roll 版）
- [ ] **時間軸 Clip**：含左右修剪把手、選取態、播放態（兩種顏色）
- [ ] **時間尺規 + 播放頭**
- [ ] **分頁列（Tab Bar）**：底線指示器
- [ ] **滑桿 / 顏色選擇器**（樣式面板）
- [ ] **Modal**（Settings）
- [ ] **拖拉分隔線（Resizer）**：垂直 + 水平
- [ ] **空狀態 / 載入態 / 渲染等待態**

---

## 6. 給設計師的開放問題（決策清單，已更新）

### ✅ 已於定案設計解決
1. ~~品牌調性~~ → 採 **暖黑 WARM BOLD**（暖底 + 粗體大標題），兼顧專業與創作者親和力。
2. ~~Settings 入口~~ → 做成**頂部常駐 ⚙**，跨全部階段可進。
3. ~~角色庫~~ → `RoleCard` 含頭像、引擎標籤、voice id、試聽 ▶、刪除。
4. ~~渲染進度~~ → Phase 3 加上**四階段 pulse 標籤**（去背→燒字幕→混音→編碼）。
5. ~~多平台發布~~ → Phase 4 做 **YouTube / Instagram / TikTok 分頁**（品牌色隨選）。

### 🟡 仍開放 / 後續再決
6. **渲染進度精度**：目前是分階段動畫，未接真實百分比進度（需後端回報）。
7. **B-Roll 真實預覽**：監視器與時間軸目前用縮圖膠卷佔位，尚未顯示實際素材畫面。
8. **響應式範圍**：實作為滿版桌面視窗；最小支援解析度尚未定義。
9. **空狀態與錯誤態**：生成失敗、API 金鑰缺失、上傳格式錯誤等視覺尚未設計。
10. **編輯資料持久化**：目前字幕/B-Roll/軌道編輯為前端記憶體狀態，未存後端（僅 phase / timeline 高度 / 收合存 localStorage）。

---

## 附錄：實作現況與後端能力

### 前端（已實作於 [frontend/](frontend/)）
React 19 + TS + Vite，依設計交付重建。檔案結構：`App.tsx`（shell + 流程編排）、`components/shared.tsx`、`phases/Phase1|Phase2|Phase34.tsx`、`data.ts`、`api.ts`、`index.css`（設計 token）。流程透過 vite proxy 接後端：Phase 1 PROCEED → `/api/mock_generate`、Phase 2 RENDER → `/api/mock_render`（Phase 4 播放/下載回傳的影片）；**後端離線時自動回退假資料**，UI 照常可走完。

### 後端能力（[api.py](api.py) 等，多為 Mock）
| 模組 | 能力 | 對應 UI |
|------|------|---------|
| `transcribe.py` | Whisper 逐字 + 逐句時間軸 | Phase 1 → 自動生成字幕軌 |
| `broll_generator.py` | GPT-4o 分析文稿決定 B-Roll 點位 → Pexels 搜尋下載 | B-Roll 自動規劃（3–5 段，每段 3–6 秒）|
| `video_composer.py` | 綠幕去背合成、背景動態（Ken Burns / 鏡像循環 / 上傳）、B-Roll 疊加、Pillow 內嵌字幕、渲染輸出 | Phase 3 渲染 |
| `api.py` (FastAPI) | Mock 端點（`/api/mock_generate`、`/api/mock_analyze`、`/api/mock_render`）+ `/assets` 靜態影片 | 全流程串接 |

> 註：後端多為 Mock，編輯台的內容（黑貓/熙故事）為設計用的 curated 假資料 —— 刻意**不**用 `mock_analyze` 的通用字幕覆蓋，以維持 prototype 的展示品質。另有一個 Streamlit 版 [app.py](app.py) 是更早期原型，一切以 **React 版（frontend/）** 為準。
