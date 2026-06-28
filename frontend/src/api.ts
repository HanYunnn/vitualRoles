// Thin client for the FastAPI mock backend (see ../../api.py).
// Every call degrades gracefully to a fallback so the UI flow works whether or
// not the Python backend is running.
// A public sample clip used when the backend is unreachable, so Phase 4 still
// has something to preview / download offline.
export const FALLBACK_VIDEO = 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

interface GenerateResponse {
  success: boolean;
  fg_video_url?: string;
}

/** Phase 1 → kick off AI generation. Returns the main video URL (or fallback). */
export async function generate(script: string, prompt: string): Promise<string> {
  try {
    const data = await postJSON<GenerateResponse>('/api/mock_generate', { script, prompt });
    return data.fg_video_url || FALLBACK_VIDEO;
  } catch (err) {
    console.warn('[voltlites] backend offline, using fallback for generate:', err);
    return FALLBACK_VIDEO;
  }
}

interface RenderResponse {
  success: boolean;
  video_url?: string;
  error?: string;
}

/** Phase 2 → 真 render：後端讀剪輯台存檔，把 b-roll＋字幕燒進底層影片。回傳成片 URL（或 fallback）。 */
export async function render(): Promise<string> {
  await new Promise((r) => setTimeout(r, 900)); // 等剪輯台自動存檔(800ms debounce)flush
  try {
    const data = await postJSON<RenderResponse>('/api/render', {});
    return data.success && data.video_url ? `${data.video_url}?t=${Date.now()}` : FALLBACK_VIDEO;
  } catch (err) {
    console.warn('[voltlites] backend offline, using fallback for render:', err);
    return FALLBACK_VIDEO;
  }
}

// ── Fish Audio text-to-speech ─────────────────────────────────────────────────
interface TTSResponse {
  success: boolean;
  audio_url?: string;
  error?: string;
}

export interface TTSOptions {
  speed?: number;
  temperature?: number;
  volume?: number;
  top_p?: number;
  model?: string;
}

/** Generate a voiceover via the backend (Fish Audio). Returns a URL or an error message. */
export async function generateTTS(script: string, voiceId: string, opts: TTSOptions = {}): Promise<{ url?: string; error?: string }> {
  try {
    const data = await postJSON<TTSResponse>('/api/tts', {
      script,
      voice_id: voiceId,
      speed: opts.speed,
      temperature: opts.temperature,
      volume: opts.volume,
      top_p: opts.top_p,
      model: opts.model,
    });
    if (data.success && data.audio_url) return { url: `${data.audio_url}?t=${Date.now()}` };
    return { error: data.error || '生成失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── OpenAI 語氣增強 ───────────────────────────────────────────────────────────
interface EnhanceResponse {
  success: boolean;
  script?: string;
  error?: string;
}

/** 把文字稿丟給 OpenAI，回傳插入 Fish Audio 情緒標記後的版本（不改原文字詞）。 */
export async function enhanceScript(script: string): Promise<{ script?: string; error?: string }> {
  try {
    const data = await postJSON<EnhanceResponse>('/api/enhance_script', { script });
    if (data.success && data.script) return { script: data.script };
    return { error: data.error || '增強失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── OpenAI 影像生成 ───────────────────────────────────────────────────────────
interface ImageResponse {
  success: boolean;
  image_url?: string;
  error?: string;
}

/** 用 OpenAI 把粗略 prompt 改寫成細節豐富的生成 prompt（kind: image | video）。 */
export async function optimizePrompt(prompt: string, kind: 'image' | 'video'): Promise<{ prompt?: string; error?: string }> {
  try {
    const data = await postJSON<{ success: boolean; prompt?: string; error?: string }>('/api/optimize_prompt', { prompt, kind });
    if (data.success && data.prompt) return { prompt: data.prompt };
    return { error: data.error || '優化失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

/** 用 OpenAI 影像模型生成場景圖；可附角色參考圖（base64 data URL）保持角色一致。 */
export async function generateImage(
  prompt: string,
  referenceB64?: string,
  model?: string,
  quality?: string,
  podcast?: boolean,
): Promise<{ url?: string; error?: string }> {
  try {
    const data = await postJSON<ImageResponse>('/api/generate_image', {
      prompt,
      reference_image_b64: referenceB64,
      model,
      quality,
      podcast,
    });
    if (data.success && data.image_url) return { url: `${data.image_url}?t=${Date.now()}` };
    return { error: data.error || '生成失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── FG / BG 去背拆分（本地 rembg）─────────────────────────────────────────────
interface SplitResponse {
  success: boolean;
  fg_url?: string;
  bg_url?: string;
  warning?: string | null;
  error?: string;
}

/** 把 Step 2 的場景圖去背成前景(透明 PNG)＋背景兩層；cleanBg=用 OpenAI 把主體移出背景；bgModel=去背模型。 */
export async function splitImage(cleanBg = true, bgModel = 'birefnet-general-lite', method = 'birefnet'): Promise<{ fg?: string; bg?: string; warning?: string; error?: string }> {
  try {
    const data = await postJSON<SplitResponse>('/api/split_image', { clean_bg: cleanBg, bg_model: bgModel, method });
    if (data.success && data.fg_url && data.bg_url) {
      const t = Date.now();
      return { fg: `${data.fg_url}?t=${t}`, bg: `${data.bg_url}?t=${t}`, warning: data.warning || undefined };
    }
    return { error: data.error || '去背失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── fal.ai 背景動態 image-to-video ────────────────────────────────────────────
interface AnimateResponse {
  success: boolean;
  video_url?: string;
  error?: string;
}

/** 把乾淨背景 bg.png 丟 fal image-to-video，回傳動態背景影片 URL（可能要等 1–3 分鐘）。 */
export async function animateBg(prompt: string, model: string): Promise<{ url?: string; error?: string }> {
  try {
    const data = await postJSON<AnimateResponse>('/api/animate_bg', { prompt, model });
    if (data.success && data.video_url) return { url: `${data.video_url}?t=${Date.now()}` };
    return { error: data.error || '生成失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── fal.ai 對嘴前景：圖片＋配音 → 會講話的人物 ─────────────────────────────────
/** 用前景圖（fg/scene）＋ Step 1 配音生成對嘴影片（可能要等數分鐘）。 */
export async function animateFg(source: string, model: string, prompt = ''): Promise<{ url?: string; error?: string }> {
  try {
    const data = await postJSON<AnimateResponse>('/api/animate_fg', { source, model, prompt });
    if (data.success && data.video_url) return { url: `${data.video_url}?t=${Date.now()}` };
    return { error: data.error || '生成失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

/** Hedra：角色圖＋配音 → 對嘴影片（可選 model_slug / 解析度；可能要等數分鐘）。 */
export async function animateFgHedra(
  source: string,
  modelSlug = 'together/hedra-character-3',
  resolution = '720p',
  prompt = '',
): Promise<{ url?: string; error?: string }> {
  try {
    const data = await postJSON<AnimateResponse>('/api/animate_fg_hedra', { source, model_slug: modelSlug, resolution, prompt });
    if (data.success && data.video_url) return { url: `${data.video_url}?t=${Date.now()}` };
    return { error: data.error || '生成失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── 合成成片（本地）─────────────────────────────────────────────────────────
/** 合成 1080×1920 成片。key: chroma=綠幕色鍵 / rembg=語意去背 / none=場景內對嘴只補比例。 */
export async function composite(fgVideo: string, bgMode: string, key: string): Promise<{ url?: string; error?: string }> {
  try {
    const data = await postJSON<AnimateResponse>('/api/composite', { fg_video: fgVideo, bg_mode: bgMode, key });
    if (data.success && data.video_url) return { url: `${data.video_url}?t=${Date.now()}` };
    return { error: data.error || '合成失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── 系統字型清單 ──────────────────────────────────────────────────────────────
/** 取得電腦已安裝的字型家族名清單（給字幕字型下拉）。 */
export async function listFonts(): Promise<string[]> {
  try {
    const res = await fetch('/api/fonts');
    const data = (await res.json()) as { fonts?: string[] };
    return data.fonts ?? [];
  } catch {
    return [];
  }
}

// ── Pexels B-roll 搜尋 ────────────────────────────────────────────────────────
/** 搜尋 Pexels 直式素材，回傳一張圖片網址。 */
export async function searchPexels(query: string): Promise<{ url?: string; error?: string }> {
  try {
    const res = await fetch(`/api/pexels?q=${encodeURIComponent(query)}`);
    const data = (await res.json()) as { success: boolean; url?: string; error?: string };
    if (data.success && data.url) return { url: data.url };
    return { error: data.error || '找不到素材' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── AI 自動配 B-roll ──────────────────────────────────────────────────────────
export interface BrollPlanItem {
  start: number;
  end: number;
  q: string;
  url: string;
}
interface AutoBrollResponse {
  success: boolean;
  items?: BrollPlanItem[];
  error?: string;
}

/** 用 GPT-4o 從字幕自動規劃 B-roll 點位並下載 Pexels 影片。 */
export async function autoBroll(segments: Segment[]): Promise<{ items?: BrollPlanItem[]; error?: string }> {
  try {
    const data = await postJSON<AutoBrollResponse>('/api/auto_broll', { segments });
    if (data.success && data.items) return { items: data.items };
    return { error: data.error || 'AI 配 B-roll 失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

/** 換一張 / 改關鍵字重抓單段 B-roll。 */
export async function rerollBroll(query: string, pick: number): Promise<{ url?: string; error?: string }> {
  try {
    const data = await postJSON<{ success: boolean; url?: string; error?: string }>('/api/reroll_broll', { query, pick });
    if (data.success && data.url) return { url: `${data.url}?t=${Date.now()}` };
    return { error: data.error || '換素材失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── 上傳已有影片（multipart）──────────────────────────────────────────────────
/** 上傳一張場景圖，後端存成 base_image.png（供去背/對嘴使用）。 */
export async function uploadImage(file: File): Promise<{ url?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload_image', { method: 'POST', body: form });
    if (!res.ok) return { error: `上傳失敗（${res.status}）` };
    const data = (await res.json()) as { success: boolean; image_url?: string; error?: string };
    if (data.success && data.image_url) return { url: `${data.image_url}?t=${Date.now()}` };
    return { error: data.error || '上傳失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

/** 上傳一支影片當剪輯台底層；後端會抽音軌供 Whisper 上字幕。 */
export async function uploadVideo(file: File): Promise<{ url?: string; warning?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload_video', { method: 'POST', body: form });
    if (!res.ok) return { error: `上傳失敗（${res.status}）` };
    const data = (await res.json()) as { success: boolean; video_url?: string; warning?: string; error?: string };
    if (data.success && data.video_url) return { url: `${data.video_url}?t=${Date.now()}`, warning: data.warning };
    return { error: data.error || '上傳失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── Whisper 自動字幕 ──────────────────────────────────────────────────────────
export interface Segment {
  start: number;
  end: number;
  text: string;
}
interface TranscribeResponse {
  success: boolean;
  segments?: Segment[];
  error?: string;
}

/** 用 Whisper 把 voiceover.mp3 轉成逐句時間軸字幕。 */
export async function transcribe(): Promise<{ segments?: Segment[]; error?: string }> {
  try {
    const data = await postJSON<TranscribeResponse>('/api/transcribe', {});
    if (data.success && data.segments) return { segments: data.segments };
    return { error: data.error || '轉錄失敗' };
  } catch {
    return { error: '無法連線後端（請先啟動 uvicorn api:app --port 8000）' };
  }
}

// ── project persistence (local backend file, with localStorage fallback) ──────
const PROJECT_LS_KEY = 'vlt-project';

/** Save editor state to the local backend file; always mirror to localStorage. */
export async function saveProject(state: unknown): Promise<void> {
  try {
    localStorage.setItem(PROJECT_LS_KEY, JSON.stringify(state));
  } catch {
    /* storage full / unavailable — ignore */
  }
  try {
    await postJSON('/api/project/save', state);
  } catch {
    /* backend offline — localStorage already holds the latest copy */
  }
}

/** Load the saved project: prefer the backend file, fall back to localStorage. */
export async function loadProject(): Promise<unknown | null> {
  try {
    const res = await fetch('/api/project/load');
    if (res.ok) {
      const data = (await res.json()) as { exists?: boolean; project?: unknown };
      if (data.exists && data.project) return data.project;
    }
  } catch {
    /* backend offline — try localStorage below */
  }
  try {
    const ls = localStorage.getItem(PROJECT_LS_KEY);
    if (ls) return JSON.parse(ls);
  } catch {
    /* corrupt cache — ignore */
  }
  return null;
}
