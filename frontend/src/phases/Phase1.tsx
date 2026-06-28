// PHASE 1 · WORKFLOW SETUP — entry choice + GENERATE wizard (Role Library) + UPLOAD.
import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { DATA } from '../data';
import type { Role } from '../data';
import { Avatar, Slider } from '../components/shared';
import { generateTTS, enhanceScript, generateImage, splitImage, animateBg, animateFg, animateFgHedra, composite, uploadVideo, uploadImage, optimizePrompt } from '../api';

// 對嘴模型：id 以 'hedra:' 開頭走 Hedra 端點（冒號後為 model_slug），其餘為 fal model id
const FG_MODELS = [
  { id: 'hedra:together/hedra-avatar', label: 'Hedra Avatar（推薦）' },
  { id: 'hedra:together/hedra-character-3', label: 'Hedra Character-3' },
  { id: 'fal-ai/kling-video/ai-avatar/v2/standard', label: 'Kling Avatar v2（fal）' },
  { id: 'fal-ai/bytedance/omnihuman', label: 'OmniHuman（fal）' },
];

// 背景動態：模型 × 動態風格 → fal prompt
const BG_MODELS = [
  { id: 'fal-ai/luma-dream-machine/ray-2/image-to-video', label: 'Luma Ray2（預設）' },
  { id: 'fal-ai/kling-video/v1.6/standard/image-to-video', label: 'Kling 1.6 std' },
  { id: 'fal-ai/wan-i2v', label: 'Wan i2v（便宜）' },
];
// 全部鎖死鏡頭（static locked-off camera），只保留畫面內的環境動態
const BG_CAM = 'Static locked-off camera, absolutely no camera movement, no zoom, no pan, no push-in, fixed tripod shot. ';
const BG_END = ' No people, no characters.';
const BG_MOTIONS = [
  { k: '輕微呼吸（近乎靜止）', prompt: BG_CAM + 'Very subtle ambient motion only, faint light shifting, almost completely still.' + BG_END },
  { k: '霓虹閃爍', prompt: BG_CAM + 'Neon signs and lights gently flickering and pulsing in place.' + BG_END },
  { k: '雨絲飄落', prompt: BG_CAM + 'Gentle rain falling, soft water streaks running down the window.' + BG_END },
  { k: '漂浮微粒・塵埃', prompt: BG_CAM + 'Soft dust motes and bokeh light particles slowly drifting in the air.' + BG_END },
  { k: '煙霧繚繞', prompt: BG_CAM + 'Slow drifting smoke and atmospheric haze moving gently.' + BG_END },
  { k: '爐火・燭光搖曳', prompt: BG_CAM + 'Warm firelight and candle flames flickering softly.' + BG_END },
  { k: '落雪', prompt: BG_CAM + 'Soft snow gently falling through the frame.' + BG_END },
  { k: '城市光斑閃動', prompt: BG_CAM + 'Distant city bokeh lights twinkling and shimmering softly.' + BG_END },
];

// 常用破音字 → 各讀音的帶聲調拼音（給「修正發音」一鍵選讀音）
const POLYPHONES: { char: string; readings: { py: string; hint: string }[] }[] = [
  { char: '重', readings: [{ py: 'zhong4', hint: '重要' }, { py: 'chong2', hint: '重新' }] },
  { char: '行', readings: [{ py: 'xing2', hint: '行走' }, { py: 'hang2', hint: '銀行' }] },
  { char: '長', readings: [{ py: 'chang2', hint: '長度' }, { py: 'zhang3', hint: '長大' }] },
  { char: '得', readings: [{ py: 'de2', hint: '得到' }, { py: 'dei3', hint: '得要' }, { py: 'de5', hint: '跑得快' }] },
  { char: '還', readings: [{ py: 'hai2', hint: '還有' }, { py: 'huan2', hint: '歸還' }] },
  { char: '為', readings: [{ py: 'wei4', hint: '因為' }, { py: 'wei2', hint: '成為' }] },
  { char: '了', readings: [{ py: 'le5', hint: '做了' }, { py: 'liao3', hint: '了解' }] },
  { char: '都', readings: [{ py: 'dou1', hint: '都是' }, { py: 'du1', hint: '首都' }] },
  { char: '差', readings: [{ py: 'cha1', hint: '差別' }, { py: 'cha4', hint: '差勁' }, { py: 'chai1', hint: '出差' }] },
  { char: '盛', readings: [{ py: 'sheng4', hint: '盛大' }, { py: 'cheng2', hint: '盛飯' }] },
  { char: '中', readings: [{ py: 'zhong1', hint: '中間' }, { py: 'zhong4', hint: '中獎' }] },
  { char: '空', readings: [{ py: 'kong1', hint: '天空' }, { py: 'kong4', hint: '空白' }] },
];

const ROLES_KEY = 'vlt-roles-v3';   // 改 data.ts 角色沒生效時：換版號或按「重設角色」

// 對嘴表情約束（可在 Step 4 編輯）：少動五官、眼睛別瞪大、嘴與牙齒自然
const AVATAR_PROMPT_DEFAULT =
  'A calm talking avatar with subtle, natural facial expressions. Keep the eyes relaxed and natural — do not ' +
  'widen, bulge or open the eyes wide; keep a steady soft gaze. Animate mainly the mouth for natural speech with ' +
  'minimal, gentle movement. Keep the mouth and teeth natural and subtle — do not show large, sharp or distorted ' +
  'teeth, avoid wide or exaggerated mouth opening. Minimal head and brow movement, composed and relaxed.';

// 生圖範本：只需改開頭 <...> 的場景/姿態，後面風格固定
const IMG_TEMPLATE =
  'The same cat character as a podcast host, <在這裡描述場景與姿態 e.g. lounging in a dim jazz bar with a whiskey glass>, ' +
  'shown in a WIDE environmental shot — the cat occupies only about one-third of the frame, full body and the surrounding scene clearly visible. ' +
  'Dark moody but HIGH-CONTRAST lighting: deep rich blacks, crisp bright highlights, strong directional light, punchy chiaroscuro, clear and sharp. ' +
  'Confident, laid-back, languid mood. Photorealistic, lifelike, realistic detailed fur, subtle film grain, cinematic. ' +
  'Avoid low contrast, grey haze, washed-out foggy look, glossy plastic CGI.';

function RoleCard({ r, selected, onSelect, onDelete }: { r: Role; selected: boolean; onSelect: () => void; onDelete?: () => void }) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 13px',
        borderRadius: 11,
        background: selected ? 'rgba(196,214,0,.09)' : 'var(--card)',
        cursor: 'pointer',
        boxShadow: selected ? 'inset 0 0 0 1.5px var(--g)' : 'inset 0 0 0 1px var(--bd)',
      }}
    >
      <Avatar r={r} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 14.5, lineHeight: 1.1 }}>{r.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, minWidth: 0 }}>
          <span className="vlt-tag g" style={{ fontSize: 8.5, flex: '0 0 auto' }}>
            {r.engine}
          </span>
          <span className="vlt-tc" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {r.voice}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="vlt-gear" style={{ width: 34, height: 34, borderRadius: 9 }} title="試聽">
          ▶
        </button>
        <button
          className="vlt-gear"
          style={{ width: 34, height: 34, borderRadius: 9, color: '#ff8a72' }}
          title="刪除角色"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function AudioPlayer({ src }: { src?: string }) {
  // real player once a voiceover exists; otherwise a placeholder waveform
  if (src) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11, background: 'var(--bg2)', boxShadow: 'inset 0 0 0 1px var(--bd)' }}>
        <audio src={src} controls style={{ flex: 1, height: 34 }} />
        <a href={src} download="voiceover.mp3" className="vlt-gear" style={{ width: 34, height: 34, borderRadius: 9, textDecoration: 'none' }} title="下載 MP3">
          ↓
        </a>
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        borderRadius: 11,
        background: 'var(--bg2)',
        boxShadow: 'inset 0 0 0 1px var(--bd)',
        opacity: 0.6,
      }}
    >
      <span className="vlt-btn pri sm" style={{ borderRadius: 9, padding: '8px 12px' }}>
        ▶
      </span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 30 }}>
        {Array.from({ length: 56 }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 20 + Math.abs(Math.sin(i * 0.9)) * 72 + '%',
              borderRadius: 1,
              background: 'var(--mut2)',
            }}
          />
        ))}
      </div>
      <span className="vlt-tc">尚未生成</span>
    </div>
  );
}

type StepState = 'locked' | 'current' | 'done';

function StepCard({
  n,
  title,
  sub,
  state,
  open,
  onToggle,
  children,
}: {
  n: string;
  title: string;
  sub: string;
  state: StepState;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const locked = state === 'locked';
  const done = state === 'done';
  return (
    <div
      style={{
        borderRadius: 14,
        background: 'var(--pan)',
        boxShadow: `inset 0 0 0 1px ${open ? 'var(--bd2)' : 'var(--bd)'}`,
        opacity: locked ? 0.4 : 1,
        transition: 'opacity .2s',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={locked ? undefined : onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', cursor: locked ? 'not-allowed' : 'pointer' }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            flex: '0 0 34px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--disp)',
            fontWeight: 900,
            fontSize: 16,
            background: done ? 'rgba(196,214,0,.16)' : state === 'current' ? 'var(--g)' : 'var(--pan2)',
            color: done ? 'var(--g)' : state === 'current' ? 'var(--gd)' : 'var(--mut2)',
          }}
        >
          {done ? '✓' : n}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 17, letterSpacing: '-.01em' }}>{title}</span>
            {state === 'current' && <span className="vlt-tag g">進行中</span>}
            {done && (
              <span className="vlt-tag" style={{ color: 'var(--mut)' }}>
                已完成
              </span>
            )}
            {locked && <span className="vlt-tag">鎖定</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 3 }}>{sub}</div>
        </div>
        {done && !open && (
          <button
            className="vlt-btn sec sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            EDIT / REGEN
          </button>
        )}
        {!locked && (
          <span style={{ color: 'var(--mut)', fontSize: 12, transform: open ? 'rotate(180deg)' : '', transition: 'transform .2s' }}>
            ▾
          </span>
        )}
      </div>
      {open && !locked && <div style={{ padding: '4px 18px 18px' }}>{children}</div>}
    </div>
  );
}

const monoLabel = {
  display: 'block',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--mut)',
  marginBottom: 8,
} as const;

function EntryCard({
  tag,
  label,
  desc,
  recommend,
  onClick,
}: {
  tag: string;
  label: string;
  desc: string;
  recommend?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        borderRadius: 18,
        padding: '30px 28px',
        cursor: 'pointer',
        background: recommend ? 'linear-gradient(160deg,rgba(196,214,0,.12),var(--pan))' : 'var(--pan)',
        boxShadow: recommend ? 'inset 0 0 0 1.5px var(--g)' : 'inset 0 0 0 1px var(--bd)',
        transition: 'transform .14s,box-shadow .14s',
        position: 'relative',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-4px)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
    >
      {recommend && (
        <span className="vlt-tag g" style={{ position: 'absolute', top: 18, right: 18 }}>
          主推路徑
        </span>
      )}
      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.14em', color: recommend ? 'var(--g)' : 'var(--mut)' }}>
        [ {tag} ]
      </span>
      <h2 style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 30, letterSpacing: '-.02em', margin: '18px 0 10px' }}>{label}</h2>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--mut)', margin: 0, maxWidth: 280 }}>{desc}</p>
      <div
        style={{
          marginTop: 26,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '.1em',
          color: recommend ? 'var(--g)' : 'var(--tx)',
        }}
      >
        選擇 <span style={{ fontSize: 15 }}>→</span>
      </div>
    </div>
  );
}

export function Phase1({
  onProceed,
  script,
  setScript,
}: {
  onProceed: () => Promise<void> | void;
  script: string;
  setScript: (s: string) => void;
}) {
  const [mode, setMode] = useState<'entry' | 'generate' | 'upload'>('entry');
  const [open, setOpen] = useState<number[]>([1, 2, 3, 4]); // 可同時展開多個步驟
  const [busy, setBusy] = useState(false);
  const toggle = (n: number) => setOpen((o) => (o.includes(n) ? o.filter((x) => x !== n) : [...o, n]));

  // ── 已有影片上傳 ──
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upErr, setUpErr] = useState('');
  const processUpload = async () => {
    if (!upFile) return;
    setUpBusy(true);
    setUpErr('');
    const r = await uploadVideo(upFile);
    if (r.error) {
      setUpErr(r.error);
      setUpBusy(false);
      return;
    }
    await onProceed(); // 進剪輯台（影片已存成底層）
    setUpBusy(false);
  };

  // ── Audio Generation (Fish Audio TTS) ──
  const [roles, setRoles] = useState<Role[]>(() => {
    try {
      const s = localStorage.getItem(ROLES_KEY);
      if (s) {
        const p = JSON.parse(s);
        if (Array.isArray(p) && p.length) return p as Role[];
      }
    } catch {
      /* corrupt cache — fall back to defaults */
    }
    return DATA.roles;
  });
  const [selRole, setSelRole] = useState<Role>(() => roles.find((r) => r.sel) ?? roles[0]);
  // 角色清單變動就存進 localStorage（自訂聲音 model id 才不會重載就消失）
  useEffect(() => {
    try {
      localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
    } catch {
      /* storage full / unavailable — ignore */
    }
  }, [roles]);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleVoice, setNewRoleVoice] = useState('');
  const [newRoleEngine, setNewRoleEngine] = useState('FISH AUDIO');
  const addRole = () => {
    const name = newRoleName.trim();
    const voice = newRoleVoice.trim();
    if (!name || !voice) return;
    const palette = ['#2a2419', '#c4d600', '#6a5bff', '#ff8a72', '#3aa6ff', '#e0567a'];
    const role: Role = { name, engine: newRoleEngine, voice, av: name[0], c: palette[roles.length % palette.length], tc: '#fff' };
    setRoles((rs) => [...rs, role]);
    setSelRole(role);
    setNewRoleName('');
    setNewRoleVoice('');
    setShowAddRole(false);
  };
  const [audioUrl, setAudioUrl] = useState('');
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsErr, setTtsErr] = useState('');
  const [speed, setSpeed] = useState(1.1); // prosody.speed（對齊 Fish 網頁 1.1x）
  const [expr, setExpr] = useState(0.45); // 穩定 ↔ 生動 → temperature
  const [vol, setVol] = useState(2); // prosody.volume（對齊網頁 Volume 2）
  const [topP, setTopP] = useState(0.55); // top_p 多樣性
  const [ttsModel, setTtsModel] = useState('s2-pro'); // Fish 引擎
  const [enhBusy, setEnhBusy] = useState(false);
  const genAudio = async () => {
    setTtsBusy(true);
    setTtsErr('');
    const res = await generateTTS(script, selRole.voice, { speed, temperature: expr, volume: vol, top_p: topP, model: ttsModel });
    if (res.url) setAudioUrl(res.url);
    else setTtsErr(res.error || '生成失敗');
    setTtsBusy(false);
  };
  const enhance = async () => {
    setEnhBusy(true);
    setTtsErr('');
    const res = await enhanceScript(script);
    if (res.script) setScript(res.script);
    else setTtsErr(res.error || '增強失敗');
    setEnhBusy(false);
  };

  // ── 修正發音（破音字 → Fish phoneme 拼音）──
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const [showPy, setShowPy] = useState(false);
  const [pyVal, setPyVal] = useState('');
  const insertPhoneme = (pinyin?: string) => {
    const ta = scriptRef.current;
    const syls = (pinyin ?? pyVal).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!ta || !syls.length) return;
    const tag = syls.map((s) => `<|phoneme_start|>${s}<|phoneme_end|>`).join('');
    const start = ta.selectionStart ?? script.length;
    const end = ta.selectionEnd ?? script.length;
    setScript(script.slice(0, start) + tag + script.slice(end)); // 取代選取的字
    if (!pinyin) {
      setShowPy(false);
      setPyVal('');
    }
  };

  // ── Base Image (OpenAI gpt-image-1) ──
  const [imgPrompt, setImgPrompt] = useState(IMG_TEMPLATE);
  const [imgUrl, setImgUrl] = useState('');
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState('');
  const [refB64, setRefB64] = useState(''); // 角色參考圖 data URL
  const [refName, setRefName] = useState('');
  const [imgModel, setImgModel] = useState('nano-banana');
  const [imgQuality, setImgQuality] = useState('high');
  const [imgOptBusy, setImgOptBusy] = useState(false);
  const [podcast, setPodcast] = useState(true); // Podcast 構圖：角色佔 2/3、看鏡頭
  const genImage = async () => {
    setImgBusy(true);
    setImgErr('');
    const res = await generateImage(imgPrompt, refB64 || undefined, imgModel, imgQuality, podcast);
    if (res.url) {
      setImgUrl(res.url);
      setFgUrl(''); setBgUrl(''); setBgVideo('');   // 換圖→舊去背/背景影片作廢，需重去背
    } else setImgErr(res.error || '生成失敗');
    setImgBusy(false);
  };
  const optimizeImgPrompt = async () => {
    setImgOptBusy(true);
    setImgErr('');
    const r = await optimizePrompt(imgPrompt, 'image');
    if (r.prompt) setImgPrompt(r.prompt);
    else setImgErr(r.error || '優化失敗');
    setImgOptBusy(false);
  };
  // 選用預設角色圖：抓檔 → 轉 base64 → 當參考圖
  const selectPresetRef = async (url: string, name: string) => {
    try {
      const blob = await (await fetch(url)).blob();
      const r = new FileReader();
      r.onload = () => {
        setRefB64(r.result as string);
        setRefName(name);
        setImgErr('');
      };
      r.readAsDataURL(blob);
    } catch {
      setImgErr('預設圖載入失敗');
    }
  };

  // ── FG / BG Split (local rembg) ──
  const [fgUrl, setFgUrl] = useState('');
  const [bgUrl, setBgUrl] = useState('');
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitErr, setSplitErr] = useState('');
  const [cleanBg, setCleanBg] = useState(true); // 用 OpenAI 把主體移出背景
  const [bgRmModel, setBgRmModel] = useState('birefnet-general-lite'); // 去背模型
  const [splitMethod, setSplitMethod] = useState('birefnet'); // birefnet=免費 / ai=nano-banana
  const doSplit = async () => {
    setSplitBusy(true);
    setSplitErr('');
    const res = await splitImage(cleanBg, bgRmModel, splitMethod);
    if (res.fg && res.bg) {
      setFgUrl(res.fg);
      setBgUrl(res.bg);
      setBgVideo('');   // 去背產生新 bg.png → 舊動態背景影片作廢，下次重生
      setSplitErr(res.warning || '');
    } else setSplitErr(res.error || '去背失敗');
    setSplitBusy(false);
  };

  // ── Step 4 · 最終成片（背景模式驅動整條流程）──
  const [bgMode, setBgMode] = useState<'static' | 'motion'>('static');
  const [fgModel, setFgModel] = useState(FG_MODELS[0].id);
  const [fgRes, setFgRes] = useState('540p');
  const [fgPrompt, setFgPrompt] = useState(AVATAR_PROMPT_DEFAULT); // 對嘴表情約束（可編輯）
  const [bgModel, setBgModel] = useState(BG_MODELS[0].id);
  const [bgMotion, setBgMotion] = useState(0); // index into BG_MOTIONS
  const [bgPrompt, setBgPrompt] = useState(BG_MOTIONS[0].prompt); // 可自訂的動態 prompt
  const [bgOptBusy, setBgOptBusy] = useState(false);
  const optimizeBgPrompt = async () => {
    setBgOptBusy(true);
    const r = await optimizePrompt(bgPrompt, 'video');
    if (r.prompt) setBgPrompt(r.prompt);
    setBgOptBusy(false);
  };
  const [bgVideo, setBgVideo] = useState(''); // 動態背景影片快取（避免重生）
  useEffect(() => { setBgVideo(''); }, [bgPrompt, bgModel]); // 改動態 prompt/模型→清快取，強制重生
  const [finalVideo, setFinalVideo] = useState('');
  const [finalBusy, setFinalBusy] = useState(false);
  const [finalStatus, setFinalStatus] = useState('');
  const [finalErr, setFinalErr] = useState('');

  const runAvatar = (source: string) =>
    fgModel.startsWith('hedra:') ? animateFgHedra(source, fgModel.slice(6), fgRes, fgPrompt) : animateFg(source, fgModel, fgPrompt);

  const makeFinal = async () => {
    setFinalBusy(true);
    setFinalErr('');
    setFinalVideo('');
    const fgFile = fgModel.startsWith('hedra:') ? 'talking_fg_hedra.mp4' : 'talking_fg.mp4';
    try {
      if (bgMode === 'static') {
        setFinalStatus('① 生成對嘴（場景內）…');
        const a = await runAvatar('scene');
        if (a.error) return setFinalErr(a.error);
        setFinalStatus('② 輸出 9:16 成片…');
        const c = await composite(fgFile, 'static', 'none');
        if (c.url) setFinalVideo(c.url);
        else setFinalErr(c.error || '合成失敗');
      } else {
        setFinalStatus('① 生成對嘴（綠幕）…');
        const a = await runAvatar('fg_green');
        if (a.error) return setFinalErr(a.error);
        let bg = bgVideo;
        if (!bg) {
          setFinalStatus('② 生成動態背景…');
          const b = await animateBg(bgPrompt, bgModel);
          if (b.error) return setFinalErr(b.error);
          bg = b.url || '';
          setBgVideo(bg);
        }
        setFinalStatus('③ 色鍵合成…');
        const c = await composite(fgFile, 'motion', 'chroma');
        if (c.url) setFinalVideo(c.url);
        else setFinalErr(c.error || '合成失敗');
      }
    } finally {
      setFinalStatus('');
      setFinalBusy(false);
    }
  };
  const proceed = async () => {
    setBusy(true);
    try {
      await onProceed();
    } finally {
      setBusy(false);
    }
  };

  // ── entry ──
  if (mode === 'entry') {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(120% 90% at 50% -10%,#1f1810,var(--bg))',
          padding: 40,
        }}
      >
        <span className="vlt-tag g" style={{ marginBottom: 14 }}>
          PHASE 1 · WORKFLOW SETUP
        </span>
        <h1 style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 42, letterSpacing: '-.025em', margin: '0 0 10px', textAlign: 'center' }}>
          今晚要怎麼開始？
        </h1>
        <p style={{ fontSize: 15, color: 'var(--mut)', margin: '0 0 40px', textAlign: 'center' }}>
          選擇起點 — 已有成片就直接剪輯，或讓 AI 從文字稿一路生成。
        </p>
        <div style={{ display: 'flex', gap: 22, width: 760, maxWidth: '100%' }}>
          <EntryCard tag="UPLOAD" label="已有影片" desc="直接上傳 MP4 進入剪輯器，系統自動轉錄字幕。" onClick={() => setMode('upload')} />
          <EntryCard
            tag="GENERATE"
            label="AI 生成流程"
            desc="生成語音、畫面、去背與對嘴動畫，再進剪輯台。"
            recommend
            onClick={() => setMode('generate')}
          />
        </div>
      </div>
    );
  }

  // ── upload ──
  if (mode === 'upload') {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          gap: 22,
          background: 'radial-gradient(120% 90% at 50% -10%,#1f1810,var(--bg))',
        }}
      >
        <span className="vlt-tag" style={{ marginBottom: 4 }}>
          PHASE 1 · UPLOAD EXISTING VIDEO
        </span>
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) {
              setUpFile(f);
              setUpErr('');
            }
          }}
          style={{
            width: 620,
            maxWidth: '100%',
            height: 320,
            borderRadius: 18,
            border: `2px dashed ${upFile ? 'var(--g)' : 'var(--bd2)'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            background: 'rgba(245,238,226,.02)',
            cursor: 'pointer',
          }}
        >
          <input
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setUpFile(f);
                setUpErr('');
              }
            }}
          />
          <span style={{ fontSize: 38, opacity: 0.5, fontFamily: 'var(--mono)' }}>↑</span>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 19 }}>
            {upFile ? upFile.name : '把影片拖放到這裡'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--mut)' }}>
            {upFile ? '已選好，按下方 PROCESS & EDIT' : (<>或 <span style={{ color: 'var(--g)', textDecoration: 'underline' }}>瀏覽檔案</span> · 支援 9:16 直式 · MP4 / MOV</>)}
          </div>
        </label>
        {upErr && (
          <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ff8a72', margin: 0 }}>⚠ {upErr}</p>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="vlt-btn sec" onClick={() => setMode('entry')} disabled={upBusy}>
            ← 返回
          </button>
          <button className="vlt-btn pri xl" onClick={processUpload} disabled={upBusy || !upFile}>
            {upBusy ? 'UPLOADING…' : 'PROCESS & EDIT →'}
          </button>
        </div>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.05em', color: 'var(--mut2)' }}>
          上傳後存成剪輯台底層影片，並抽出音軌供「✦ 從配音生成字幕」使用
        </p>
      </div>
    );
  }

  // ── generate ──
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'radial-gradient(120% 70% at 50% -10%,#1c160e,var(--bg))' }}>
      <div className="vlt-scroll" style={{ flex: 1, overflow: 'auto', padding: '26px 0' }}>
        <div style={{ width: 1040, maxWidth: '94%', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span className="vlt-tag g">PHASE 1 · GENERATE</span>
            <span style={{ fontSize: 12.5, color: 'var(--mut)' }}>逐步解鎖 · 完成全部 4 步後進入剪輯台</span>
            <span style={{ flex: 1 }} />
            <button
              style={{ background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--mono)' }}
              onClick={() => setMode('entry')}
            >
              ← 改變起點
            </button>
          </div>
          <h1 style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 32, letterSpacing: '-.02em', margin: '6px 0 22px' }}>
            從文字稿生成這支影片
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <StepCard n="1" title="Audio Generation" sub="文字稿 + 角色（聲音）→ AI 配音" state="done" open={open.includes(1)} onToggle={() => toggle(1)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18 }}>
                <div>
                  <label style={monoLabel}>文字稿 Script</label>
                  <textarea
                    ref={scriptRef}
                    className="vlt-inp vlt-scroll"
                    style={{ height: 132, resize: 'none', lineHeight: 1.65 }}
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                  />
                  <div style={{ marginTop: 12 }}>
                    <AudioPlayer src={audioUrl} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button className="vlt-btn pri sm" onClick={genAudio} disabled={ttsBusy || enhBusy}>
                      {ttsBusy ? '生成中…' : audioUrl ? '↻ 重新生成配音' : '✦ 生成配音'}
                    </button>
                    <button className="vlt-btn sec sm" onClick={enhance} disabled={enhBusy || ttsBusy} title="用 OpenAI 自動插入情緒/語氣標記（不改原文字詞）">
                      {enhBusy ? '增強中…' : '✨ 增強語氣'}
                    </button>
                    <button className="vlt-btn sec sm" onClick={() => setShowPy((v) => !v)} title="破音字唸錯時，選取該字再輸入拼音強制發音">
                      🔤 修正發音
                    </button>
                    <label className="vlt-btn sec sm" style={{ cursor: 'pointer' }}>
                      ↑ UPLOAD MP3
                      <input
                        type="file"
                        accept="audio/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setAudioUrl(URL.createObjectURL(f));
                            setTtsErr('');
                          }
                        }}
                      />
                    </label>
                  </div>
                  {showPy && (
                    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', boxShadow: 'inset 0 0 0 1px var(--bd)' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mut)', marginBottom: 7, lineHeight: 1.5 }}>
                        破音字唸錯時：在上面文字稿**選取那個字** → 輸入拼音(含聲調 1–5,多字用空格)→ 插入
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          className="vlt-inp"
                          placeholder="例：chong2 或 zhong4 yao4"
                          value={pyVal}
                          onChange={(e) => setPyVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') insertPhoneme(); }}
                          style={{ flex: 1, padding: '7px 9px', fontSize: 13, fontFamily: 'var(--mono)' }}
                        />
                        <button className="vlt-btn pri sm" onClick={() => insertPhoneme()} disabled={!pyVal.trim()}>
                          插入
                        </button>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--mut2)', margin: '10px 0 6px' }}>常用破音字一鍵插入（先選取該字）</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 150, overflow: 'auto' }}>
                        {POLYPHONES.map((p) => (
                          <div key={p.char} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 14, width: 18, flex: '0 0 18px' }}>{p.char}</span>
                            {p.readings.map((r) => (
                              <button
                                key={r.py}
                                className="vlt-btn ghost sm"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => insertPhoneme(r.py)}
                                title={`插入 ${r.py}`}
                              >
                                {r.py} · {r.hint}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', boxShadow: 'inset 0 0 0 1px var(--bd)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.06em', color: 'var(--mut)' }}>模型</span>
                      <select value={ttsModel} onChange={(e) => setTtsModel(e.target.value)} className="vlt-inp" style={{ flex: 1, padding: '6px 9px', fontSize: 12, fontFamily: 'var(--mono)' }}>
                        <option value="s2-pro">Fish Audio S2 Pro</option>
                        <option value="s1">Fish Audio S1（舊）</option>
                      </select>
                    </div>
                    <Slider k="語速" value={speed} min={0.5} max={2} step={0.05} unit="x" decimals={2} onChange={setSpeed} />
                    <Slider k="音量" value={vol} min={-10} max={10} step={1} decimals={0} onChange={setVol} />
                    <Slider k="穩定→生動 (temp)" value={expr} min={0.3} max={1} step={0.05} decimals={2} onChange={setExpr} />
                    <Slider k="多樣性 (top_p)" value={topP} min={0.3} max={1} step={0.05} decimals={2} onChange={setTopP} />
                  </div>
                  {ttsErr && (
                    <p style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.03em', color: '#ff8a72', lineHeight: 1.6, margin: '10px 0 0' }}>
                      ⚠ {ttsErr}
                    </p>
                  )}
                  <p style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.03em', color: 'var(--mut2)', lineHeight: 1.6, margin: '8px 0 0' }}>
                    配音由 <b style={{ color: 'var(--mut)' }}>{selRole.engine}</b> 生成（voice: {selRole.voice.length > 16 ? selRole.voice.slice(0, 16) + '…' : selRole.voice}）· 需後端與 .env 金鑰
                  </p>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>
                      角色庫 Roles
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className="vlt-btn ghost sm"
                        style={{ padding: '2px 8px', fontSize: 10.5 }}
                        onClick={() => {
                          if (confirm('重設角色庫為程式預設（data.ts）？目前自訂的角色清單會清掉。')) {
                            localStorage.removeItem(ROLES_KEY);
                            location.reload();
                          }
                        }}
                        title="清掉瀏覽器暫存、改用 data.ts 的預設角色"
                      >
                        ↺ 重設
                      </button>
                      <span className="vlt-tc">{roles.length}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="vlt-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                      {roles.map((r, i) => (
                        <RoleCard
                          key={i}
                          r={r}
                          selected={selRole.name === r.name}
                          onSelect={() => setSelRole(r)}
                          onDelete={
                            roles.length > 1
                              ? () => {
                                  const next = roles.filter((_, j) => j !== i);
                                  setRoles(next);
                                  if (selRole.name === r.name) setSelRole(next[0]);
                                }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                    {showAddRole ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 11, borderRadius: 11, background: 'var(--card)', boxShadow: 'inset 0 0 0 1px var(--bd)' }}>
                        <input
                          className="vlt-inp"
                          placeholder="角色名稱"
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          style={{ padding: '8px 10px', fontSize: 13 }}
                        />
                        <input
                          className="vlt-inp"
                          placeholder="Voice ID（Fish Audio reference_id）"
                          value={newRoleVoice}
                          onChange={(e) => setNewRoleVoice(e.target.value)}
                          style={{ padding: '8px 10px', fontSize: 13, fontFamily: 'var(--mono)' }}
                        />
                        <select
                          className="vlt-inp"
                          value={newRoleEngine}
                          onChange={(e) => setNewRoleEngine(e.target.value)}
                          style={{ padding: '8px 10px', fontSize: 12, fontFamily: 'var(--mono)' }}
                        >
                          <option>FISH AUDIO</option>
                          <option>ELEVENLABS</option>
                          <option>AZURE TTS</option>
                        </select>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="vlt-btn pri sm" style={{ flex: 1 }} onClick={addRole} disabled={!newRoleName.trim() || !newRoleVoice.trim()}>
                            新增
                          </button>
                          <button className="vlt-btn sec sm" onClick={() => setShowAddRole(false)}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="vlt-btn ghost sm" style={{ justifyContent: 'center' }} onClick={() => setShowAddRole(true)}>
                        + ADD CUSTOM ROLE
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </StepCard>

            <StepCard n="2" title="Base Image" sub="圖片 prompt（＋可選角色參考圖）→ 單張場景圖" state="done" open={open.includes(2)} onToggle={() => toggle(2)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 18, alignItems: 'start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={monoLabel}>Image Prompt</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="vlt-btn ghost sm"
                        style={{ padding: '3px 9px', fontSize: 11 }}
                        onClick={() => setImgPrompt(IMG_TEMPLATE)}
                        title="還原成風格範本（只改開頭 <...> 的場景與姿態即可）"
                      >
                        ↺ 範本
                      </button>
                      <button
                        className="vlt-btn ghost sm"
                        style={{ padding: '3px 9px', fontSize: 11 }}
                        onClick={optimizeImgPrompt}
                        disabled={imgOptBusy || !imgPrompt.trim()}
                        title="用 AI 把 prompt 改寫得更有畫面感、細節更豐富"
                      >
                        {imgOptBusy ? '優化中…' : '✨ 優化 prompt'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="vlt-inp vlt-scroll"
                    style={{ height: 76, resize: 'none', lineHeight: 1.6 }}
                    value={imgPrompt}
                    onChange={(e) => setImgPrompt(e.target.value)}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                    <label className="vlt-btn sec sm" style={{ cursor: 'pointer' }} title="附上角色參考圖可保持同一隻角色">
                      ↑ 角色參考圖
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const r = new FileReader();
                          r.onload = () => {
                            setRefB64(r.result as string);
                            setRefName(f.name);
                            setImgErr('');
                          };
                          r.readAsDataURL(f);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="vlt-btn sec sm"
                      onClick={() => selectPresetRef('/presets/cat-host.jpg', '黑貓主持人（預設）')}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '2px 9px 2px 2px' }}
                      title="使用預設角色：黑貓主持人"
                    >
                      <img src="/presets/cat-host.jpg" alt="預設貓" style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover' }} />
                      預設貓
                    </button>
                    {refName ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--mut)' }}>
                        {refName.length > 18 ? refName.slice(0, 18) + '…' : refName}
                        <button
                          onClick={() => {
                            setRefB64('');
                            setRefName('');
                          }}
                          style={{ background: 'none', border: 'none', color: '#ff8a72', cursor: 'pointer', fontSize: 12 }}
                          title="移除參考圖"
                        >
                          ✕
                        </button>
                      </span>
                    ) : (
                      <span className="vlt-tc">未選 · 純文生圖</span>
                    )}
                    <span style={{ flex: 1 }} />
                    <select
                      className="vlt-inp"
                      value={imgModel}
                      onChange={(e) => setImgModel(e.target.value)}
                      title="OpenAI 影像模型"
                      style={{ width: 'auto', padding: '6px 10px', fontSize: 12, fontFamily: 'var(--mono)' }}
                    >
                      <option value="nano-banana">nano-banana（角色一致最強·推薦）</option>
                      <option value="gpt-image-1">gpt-image-1</option>
                      <option value="gpt-image-1-mini">gpt-image-1-mini（便宜）</option>
                      <option value="gpt-image-1.5">gpt-image-1.5（新）</option>
                      <option value="gpt-image-2">gpt-image-2（最新）</option>
                    </select>
                    <select
                      className="vlt-inp"
                      value={imgQuality}
                      onChange={(e) => setImgQuality(e.target.value)}
                      title="畫質（high 較清晰、較貴）"
                      style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}
                    >
                      <option value="low">low 草稿</option>
                      <option value="medium">medium</option>
                      <option value="high">high 高品質</option>
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12, color: 'var(--mut)', cursor: 'pointer' }} title="角色佔畫面約 2/3、頭部偏上、直視鏡頭，下方留給字幕">
                    <input type="checkbox" checked={podcast} onChange={(e) => setPodcast(e.target.checked)} />
                    🎙 Podcast 構圖（角色佔 2/3、看鏡頭）
                  </label>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button className="vlt-btn pri sm" onClick={genImage} disabled={imgBusy}>
                      {imgBusy ? '生成中…' : imgUrl ? '↻ 重新生成場景圖' : '✦ 生成場景圖'}
                    </button>
                    <label className="vlt-btn sec sm" style={{ cursor: 'pointer' }}>
                      ↑ 上傳場景圖
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setImgBusy(true);
                          setImgErr('');
                          const r = await uploadImage(f); // 真的存成後端 base_image.png
                          if (r.url) {
                            setImgUrl(r.url);
                            setFgUrl(''); setBgUrl(''); setBgVideo('');   // 換圖→舊去背/背景影片作廢
                          } else setImgErr(r.error || '上傳失敗');
                          setImgBusy(false);
                        }}
                      />
                    </label>
                  </div>
                  {imgErr && (
                    <p style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.03em', color: '#ff8a72', lineHeight: 1.6, margin: '10px 0 0' }}>
                      ⚠ {imgErr}
                    </p>
                  )}
                  <p style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.03em', color: 'var(--mut2)', lineHeight: 1.6, margin: '8px 0 0' }}>
                    由 OpenAI <b style={{ color: 'var(--mut)' }}>{imgModel}</b> 生成 9:16 場景圖 · 放角色參考圖可保持同一角色 · 需後端與 OpenAI 金鑰（每張計費）
                  </p>
                </div>
                <div
                  style={{
                    aspectRatio: '9/16',
                    borderRadius: 10,
                    background: imgUrl ? '#000' : 'repeating-linear-gradient(135deg,#1c1c20 0 9px,#141417 9px 18px)',
                    boxShadow: 'inset 0 0 0 1px var(--bd)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    padding: 9,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {imgUrl && (
                    <img src={imgUrl} alt="scene" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <span className="vlt-tag b" style={{ position: 'relative' }}>
                    SCENE.PNG
                  </span>
                  {imgUrl && (
                    <a
                      href={imgUrl}
                      download="scene.png"
                      className="vlt-gear"
                      style={{ position: 'absolute', top: 9, right: 9, width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: 'rgba(0,0,0,.55)' }}
                      title="下載 PNG"
                    >
                      ↓
                    </a>
                  )}
                </div>
              </div>
            </StepCard>

            <StepCard n="3" title="FG / BG Split" sub="去背 → 前景人物 + 背景各一張" state="done" open={open.includes(3)} onToggle={() => toggle(3)}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                {(
                  [
                    { t: '前景 FG', tag: 'rembg', c: 'rgba(196,214,0,.5)', url: fgUrl, dl: 'fg.png', checker: true },
                    { t: '背景 BG', tag: 'background', c: 'rgba(106,91,255,.5)', url: bgUrl, dl: 'bg.png', checker: false },
                  ] as const
                ).map(({ t, tag, c, url, dl, checker }) => (
                  <div key={t} style={{ width: 150 }}>
                    <div
                      style={{
                        aspectRatio: '9/16',
                        borderRadius: 10,
                        // FG 用棋盤格凸顯透明區；無圖時維持斜紋占位
                        background: url
                          ? checker
                            ? 'repeating-conic-gradient(#26262b 0% 25%,#17171a 0% 50%) 0/16px 16px'
                            : '#000'
                          : `repeating-linear-gradient(135deg,${c.replace('.5', '.14')} 0 8px,transparent 8px 16px),#101013`,
                        boxShadow: 'inset 0 0 0 1px var(--bd)',
                        display: 'flex',
                        alignItems: 'flex-end',
                        padding: 9,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {url && <img src={url} alt={t} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
                      <span className="vlt-tc" style={{ color: c, position: 'relative' }}>
                        {tag}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 13 }}>{t}</span>
                      {url ? (
                        <a className="vlt-gear" href={url} download={dl} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} title="下載 PNG">
                          ↓
                        </a>
                      ) : (
                        <button className="vlt-gear" style={{ width: 30, height: 30, borderRadius: 8, opacity: 0.4 }} disabled title="尚未生成">
                          ↓
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button className="vlt-btn pri sm" onClick={doSplit} disabled={splitBusy}>
                      {splitBusy ? '去背中…' : fgUrl ? '↻ 重新去背' : '✦ 去背拆分'}
                    </button>
                    <select
                      className="vlt-inp"
                      value={splitMethod}
                      onChange={(e) => setSplitMethod(e.target.value)}
                      title="去背方式"
                      style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}
                    >
                      <option value="birefnet">本機去背（免費）</option>
                      <option value="ai">AI 去背 nano-banana（$0.039·更乾淨）</option>
                    </select>
                    {splitMethod === 'birefnet' && (
                      <select
                        className="vlt-inp"
                        value={bgRmModel}
                        onChange={(e) => setBgRmModel(e.target.value)}
                        title="去背模型（BiRefNet 系列較強）"
                        style={{ width: 'auto', padding: '6px 10px', fontSize: 12, fontFamily: 'var(--mono)' }}
                      >
                        <option value="birefnet-general-lite">BiRefNet Lite（推薦）</option>
                        <option value="birefnet-general">BiRefNet 完整（最強·大檔）</option>
                        <option value="bria-rmbg">BRIA RMBG</option>
                        <option value="isnet-general-use">isnet（快）</option>
                        <option value="u2net">u2net（基本）</option>
                      </select>
                    )}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12, color: 'var(--mut)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={cleanBg} onChange={(e) => setCleanBg(e.target.checked)} />
                    背景去除人物（OpenAI inpaint，計費）
                  </label>
                  {splitErr && (
                    <p style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.03em', color: '#ff8a72', lineHeight: 1.6, margin: '10px 0 0' }}>
                      ⚠ {splitErr}
                    </p>
                  )}
                  <p style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.03em', color: 'var(--mut2)', lineHeight: 1.6, margin: '10px 0 0' }}>
                    本地 <b style={{ color: 'var(--mut)' }}>rembg</b> 去背出透明前景；勾選後再用 OpenAI 把主體從背景重繪移除（乾淨背景給動態用）。未勾選則背景沿用原圖。
                  </p>
                </div>
              </div>
            </StepCard>

            <StepCard n="4" title="Animation · Hedra + Kling" sub="對嘴前景影片 + 動態背景影片" state="current" open={open.includes(4)} onToggle={() => toggle(4)}>
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                {/* 最終成片預覽 */}
                <div style={{ width: 170 }}>
                  <div
                    style={{
                      aspectRatio: '9/16',
                      borderRadius: 10,
                      background: '#000',
                      boxShadow: 'inset 0 0 0 1px var(--bd)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {finalVideo ? (
                      <video src={finalVideo} controls loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span className="vlt-tag g" style={{ position: 'absolute', bottom: 9, left: 9 }}>9:16 FINAL</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 12.5 }}>最終成片</span>
                    {finalVideo && (
                      <a className="vlt-gear" href={finalVideo} download="final.mp4" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} title="下載 MP4">
                        ↓
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1, paddingTop: 4 }}>
                  {/* 背景模式：總開關 */}
                  <label style={monoLabel}>背景模式（決定整條流程）</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {([['static', '靜止背景 · 最乾淨'], ['motion', '動態背景 · 會動']] as const).map(([v, lbl]) => (
                      <button key={v} className={`vlt-btn ${bgMode === v ? 'pri' : 'sec'} sm`} onClick={() => setBgMode(v)}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {/* 對嘴模型 + 解析度 */}
                  <label style={monoLabel}>對嘴模型</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <select className="vlt-inp" value={fgModel} onChange={(e) => setFgModel(e.target.value)} title="對嘴模型" style={{ width: 'auto', padding: '6px 10px', fontSize: 12, fontFamily: 'var(--mono)' }}>
                      {FG_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {fgModel.startsWith('hedra:') && (
                      <select className="vlt-inp" value={fgRes} onChange={(e) => setFgRes(e.target.value)} title="解析度" style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
                        <option value="540p">540p（省）</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </select>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={monoLabel}>對嘴表情 prompt（控制五官/眼睛/牙齒）</label>
                    <button className="vlt-btn ghost sm" style={{ padding: '3px 9px', fontSize: 11 }} onClick={() => setFgPrompt(AVATAR_PROMPT_DEFAULT)} title="還原成預設的表情約束">
                      ↺ 範本
                    </button>
                  </div>
                  <textarea
                    className="vlt-inp vlt-scroll"
                    style={{ height: 64, resize: 'none', lineHeight: 1.5, fontSize: 12, marginBottom: 12 }}
                    value={fgPrompt}
                    onChange={(e) => setFgPrompt(e.target.value)}
                    placeholder="描述對嘴時的表情/動作約束（英文較準）"
                  />

                  {/* 動態背景設定（僅動態模式） */}
                  {bgMode === 'motion' && (
                    <>
                      <label style={monoLabel}>動態背景</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        <select className="vlt-inp" value={bgModel} onChange={(e) => setBgModel(e.target.value)} title="背景影片模型" style={{ width: 'auto', padding: '6px 10px', fontSize: 12, fontFamily: 'var(--mono)' }}>
                          {BG_MODELS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className="vlt-inp"
                          value={bgMotion}
                          onChange={(e) => {
                            const i = Number(e.target.value);
                            setBgMotion(i);
                            setBgPrompt(BG_MOTIONS[i].prompt); // 切換預設風格時帶入 prompt
                          }}
                          title="動態風格（會帶入下方 prompt）"
                          style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}
                        >
                          {BG_MOTIONS.map((m, i) => (
                            <option key={m.k} value={i}>
                              {m.k}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={monoLabel}>動態 prompt（可自訂）</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="vlt-btn ghost sm" style={{ padding: '3px 9px', fontSize: 11 }} onClick={() => setBgVideo('')} disabled={!bgVideo} title="清掉已生成的背景影片，下次生成會重做一支新的">
                            ↻ 重生背景
                          </button>
                          <button className="vlt-btn ghost sm" style={{ padding: '3px 9px', fontSize: 11 }} onClick={optimizeBgPrompt} disabled={bgOptBusy || !bgPrompt.trim()}>
                            {bgOptBusy ? '優化中…' : '✨ 優化 prompt'}
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="vlt-inp vlt-scroll"
                        style={{ height: 60, resize: 'none', lineHeight: 1.5, fontSize: 12, marginBottom: 12 }}
                        value={bgPrompt}
                        onChange={(e) => setBgPrompt(e.target.value)}
                      />
                    </>
                  )}

                  {/* 一顆鈕 */}
                  <button className="vlt-btn pri" onClick={makeFinal} disabled={finalBusy}>
                    {finalBusy ? finalStatus || '生成中…' : '✦ 生成最終成片'}
                  </button>
                  {finalErr && (
                    <p style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.03em', color: '#ff8a72', lineHeight: 1.6, margin: '10px 0 0' }}>
                      ⚠ {finalErr}
                    </p>
                  )}
                  <p style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.03em', color: 'var(--mut2)', lineHeight: 1.6, margin: '10px 0 0' }}>
                    {bgMode === 'static'
                      ? '靜止：對嘴直接長在完整場景圖裡（零去背、最乾淨）→ 補成 9:16。'
                      : '動態：對嘴用綠幕版生成 → 生動態背景 → 色鍵合成。需 Step 3 已產生綠幕前景。'}
                  </p>
                </div>
              </div>
            </StepCard>
          </div>
        </div>
      </div>

      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 26px',
          borderTop: '1px solid var(--bd)',
          background: 'var(--bg2)',
        }}
      >
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--mut)' }}>3 / 4 步驟已完成</span>
        <button className="vlt-btn pri xl" onClick={proceed} disabled={busy}>
          {busy ? 'GENERATING…' : 'PROCEED TO TIMELINE EDITING →'}
        </button>
      </div>
    </div>
  );
}
