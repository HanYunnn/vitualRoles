// Shared sample content + types for the Voltlites Editor prototype.
// Content scenario: 黑貓 Podcast / 角色「熙」.

export interface Role {
  name: string;
  engine: string;
  voice: string;
  av: string;
  c: string;
  tc: string;
  sel?: boolean;
}

export interface Line {
  t0: string;
  t1: string;
  text: string;
  active?: boolean;
}

export interface Broll {
  t0: string;
  t1: string;
  q: string;
  active?: boolean;
  scale?: number;
  x?: number;
  y?: number;
  cw?: number;
  ch?: number;
  uploaded?: boolean;
}

export interface SubStyle {
  fill: string;
  stroke: string;
  size: number;
  strokeW: number;
  bottom: number; // % from the bottom edge
  x: number; // horizontal centre, % (50 = centred)
  font: string; // 字型 key（見 FONTS）；對應預覽 CSS 與 render 字型檔
}

// 字型清單：key 同時對應「預覽用的 CSS family」與「render 後端的字型檔」，確保兩邊一致
export const FONTS = [
  { key: 'heiti', label: '黑體 Heiti', css: '"Noto Sans CJK TC","Heiti TC","STHeiti",sans-serif' },
  { key: 'songti', label: '宋體 Songti', css: '"Songti TC","Songti SC","STSong",serif' },
  { key: 'arialu', label: 'Arial Unicode', css: '"Arial Unicode MS",sans-serif' },
];
export const FONT_CSS: Record<string, string> = Object.fromEntries(FONTS.map((f) => [f.key, f.css]));
/** 取 CSS font-family：預設 key 用內建對應，否則當系統字型家族名直接用。 */
export const fontCss = (font: string): string => FONT_CSS[font] ?? `"${font}",sans-serif`;

export interface Clip {
  l: number;
  w: number;
  label: string;
  active?: boolean;
}

export interface AppData {
  script: string;
  lines: Line[];
  broll: Broll[];
  roles: Role[];
  subtitle: string;
  playhead: number;
  timecode: string;
  duration: string;
  style: SubStyle;
}

export const DATA: AppData = {
  script:
    '深夜的城市，總藏著說不完的故事。而今晚，我們要聊的，是一隻黑貓 —— 牠出現在每個轉角，卻從不留名。看見牠的人，據說都交上了好運。',
  lines: [
    { t0: '0.00', t1: '2.40', text: '深夜的城市，總藏著說不完的故事' },
    { t0: '2.40', t1: '5.10', text: '而今晚，我們要聊的，是一隻黑貓', active: true },
    { t0: '5.10', t1: '7.80', text: '牠出現在每個轉角，卻從不留名' },
    { t0: '7.80', t1: '10.2', text: '看見牠的人，據說都交上了好運' },
  ],
  broll: [
    { t0: '1.2', t1: '4.0', q: 'neon city night rain', scale: 1.15, x: 50, y: 42, cw: 100, ch: 78 },
    { t0: '4.0', t1: '7.2', q: 'black cat alley shadow', active: true, scale: 1.0, x: 50, y: 25, cw: 100, ch: 50 },
    { t0: '7.6', t1: '10.0', q: 'lucky charm close-up', scale: 1.3, x: 60, y: 38, cw: 84, ch: 84 },
  ],
  roles: [
    { name: 'Ziv', engine: 'FISH AUDIO', voice: 'aafaa207cdba4bc88171489c2bda7af0', av: 'Z', c: '#2a2419', tc: '#fff', sel: true },
    { name: 'Zawa', engine: 'FISH AUDIO', voice: '48777208718c4f0285f2a34305cfcdfe', av: 'Z', c: '#c4d600', tc: '#171300' },
  ],
  subtitle: '而今晚，我們要聊的，是一隻黑貓',
  playhead: 46,
  timecode: '00:04.6',
  duration: '00:10.0',
  // size / strokeW in px (relative to the 1080×1920 output); bottom & x in %
  style: { fill: '#c4d600', stroke: '#000000', size: 120, strokeW: 12, bottom: 14, x: 50, font: 'heiti' },
};

export const CLIPS: { text: Clip[]; broll: Clip[] } = {
  text: [
    { l: 0, w: 24, label: '深夜的城市…' },
    { l: 24, w: 27, label: '而今晚…', active: true },
    { l: 51, w: 27, label: '牠出現在…' },
    { l: 78, w: 22, label: '看見牠的人…' },
  ],
  broll: [
    { l: 12, w: 28, label: 'neon city' },
    { l: 40, w: 32, label: 'black cat alley', active: true },
    { l: 76, w: 24, label: 'lucky charm' },
  ],
};
