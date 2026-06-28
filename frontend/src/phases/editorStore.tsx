// Single source of truth for the Phase 2 editor. Every panel, the monitor and
// the timeline read & write this same state, and a play clock advances the
// playhead so "playing" highlights and the monitor subtitle follow time.
//
// This is a context/store module, so it intentionally exports a hook + helper
// alongside the provider component (fast-refresh exception below).
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { DATA } from '../data';
import type { SubStyle } from '../data';
import { loadProject, saveProject } from '../api';

export interface Subtitle {
  id: string;
  trackId: string;
  start: number; // seconds
  end: number;
  text: string;
  style: SubStyle;
}

export interface BrollItem {
  id: string;
  trackId: string;
  start: number;
  end: number;
  q: string;
  source: 'pexels' | 'uploaded';
  url?: string; // 實際素材圖網址（Pexels）或本地 object URL（上傳）
  scale: number;
  x: number;
  y: number;
  cw: number;
  ch: number;
}

export type TrackKind = 'text' | 'broll';
export interface Track {
  id: string;
  kind: TrackKind;
  label: string;
}

const TEXT_TRACK = 't1';
const BROLL_TRACK = 'b1';

// Subtitle metrics are px on the 1080×1920 output (size, strokeW) and % for `bottom`.
export const VIDEO_H = 1920;

// Migrate legacy styles (size/bottom were stored as 0–1 ratios) to the new units.
function normStyle(st: SubStyle): SubStyle {
  return {
    ...st,
    size: st.size <= 1 ? Math.round(st.size * VIDEO_H) : st.size,
    bottom: st.bottom <= 1 ? Math.round(st.bottom * 100) : st.bottom,
    x: st.x ?? 50,
    font: st.font ?? 'heiti',
  };
}

let _id = 0;
// random suffix keeps newly-created ids from colliding with ids restored from a saved project
const uid = (p: string) => `${p}${++_id}_${Math.random().toString(36).slice(2, 6)}`;

function seedSubtitles(script: string): Subtitle[] {
  // Unchanged default → use the curated lines (nicer hand-set timings).
  if (script.trim() === DATA.script.trim()) {
    return DATA.lines.map((l) => ({
      id: uid('s'),
      trackId: TEXT_TRACK,
      start: parseFloat(l.t0),
      end: parseFloat(l.t1),
      text: l.text,
      style: { ...DATA.style },
    }));
  }
  // Edited script → split into sentences and distribute evenly.
  const parts = script
    .split(/(?<=[。！？!?\n])/)
    .map((s) => s.trim().replace(/[\n]+$/, ''))
    .filter(Boolean);
  const lines = parts.length ? parts : [script.trim()];
  const per = 2.6;
  return lines.map((t, i) => ({
    id: uid('s'),
    trackId: TEXT_TRACK,
    start: parseFloat((i * per).toFixed(2)),
    end: parseFloat((i * per + per - 0.2).toFixed(2)),
    text: t,
    style: { ...DATA.style },
  }));
}

function seedBrolls(): BrollItem[] {
  return DATA.broll.map((b) => ({
    id: uid('b'),
    trackId: BROLL_TRACK,
    start: parseFloat(b.t0),
    end: parseFloat(b.t1),
    q: b.q,
    source: 'pexels',
    scale: b.scale ?? 1,
    x: b.x ?? 50,
    y: b.y ?? 50,
    cw: b.cw ?? 100,
    ch: b.ch ?? 100,
  }));
}

export interface EditorValue {
  duration: number;
  playhead: number;
  playing: boolean;
  saveStatus: 'idle' | 'saving' | 'saved';
  tracks: Track[];
  subtitles: Subtitle[];
  brolls: BrollItem[];
  selSubId: string | null;
  selBrollId: string | null;
  styleClipboard: SubStyle | null;
  // derived helpers
  activeSubs: Subtitle[];
  activeSub: Subtitle | null;
  activeBrolls: BrollItem[];
  // actions
  addTrack: (kind: TrackKind) => void;
  removeTrack: (id: string) => void;
  renameTrack: (id: string, label: string) => void;
  moveTrack: (id: string, dir: number) => void;
  setPlayhead: (s: number) => void;
  togglePlay: () => void;
  seekStart: () => void;
  seekEnd: () => void;
  selectSub: (id: string) => void;
  selectBroll: (id: string) => void;
  focusSub: (id: string) => void;
  focusBroll: (id: string) => void;
  updateSubText: (id: string, text: string) => void;
  updateSubTime: (id: string, start: number, end: number) => void;
  updateSubStyle: (id: string, patch: Partial<SubStyle>) => void;
  applyStyleToAll: (style: SubStyle) => void;
  updateAllSubStyle: (patch: Partial<SubStyle>) => void;
  setSubsFromSegments: (segs: { start: number; end: number; text: string }[]) => void;
  copyStyle: () => void;
  pasteStyle: () => void;
  deleteSub: (id: string) => void;
  addSub: () => void;
  updateBroll: (id: string, patch: Partial<BrollItem>) => void;
  updateBrollTime: (id: string, start: number, end: number) => void;
  setClipTrack: (kind: 'sub' | 'broll', id: string, trackId: string) => void;
  addBroll: (q: string, source: 'pexels' | 'uploaded', url?: string) => void;
  setBrollsFromPlan: (items: { start: number; end: number; q: string; url?: string }[]) => void;
  deleteBroll: (id: string) => void;
}

const Ctx = createContext<EditorValue | null>(null);

export function useEditor(): EditorValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEditor must be used within <EditorProvider>');
  return v;
}

export function EditorProvider({ script, children }: { script: string; children: ReactNode }) {
  const [subtitles, setSubtitles] = useState<Subtitle[]>(() => seedSubtitles(script));
  const [brolls, setBrolls] = useState<BrollItem[]>(seedBrolls);
  const [tracks, setTracks] = useState<Track[]>(() => [
    { id: TEXT_TRACK, kind: 'text', label: '字幕 1' },
    { id: BROLL_TRACK, kind: 'broll', label: 'B-ROLL' },
  ]);
  const duration = (() => {
    const ends = [...subtitles.map((s) => s.end), ...brolls.map((b) => b.end), 10];
    return Math.max(...ends);
  })();
  const [playhead, setPlayheadRaw] = useState(() => Math.min(DATA.playhead / 10, 8));
  const [playing, setPlaying] = useState(false);
  const [selSubId, setSelSubId] = useState<string | null>(() => subtitles[1]?.id ?? subtitles[0]?.id ?? null);
  const [selBrollId, setSelBrollId] = useState<string | null>(() => brolls[1]?.id ?? brolls[0]?.id ?? null);

  const durationRef = useRef(duration);
  const playheadRef = useRef(playhead);
  const subtitlesRef = useRef(subtitles);
  const brollsRef = useRef(brolls);
  const tracksRef = useRef(tracks);
  // mirror latest values into refs (read by the play clock + event handlers)
  useEffect(() => {
    durationRef.current = duration;
    playheadRef.current = playhead;
    subtitlesRef.current = subtitles;
    brollsRef.current = brolls;
    tracksRef.current = tracks;
  });

  const setPlayhead = useCallback((s: number) => {
    setPlayheadRaw(Math.max(0, Math.min(durationRef.current, s)));
  }, []);

  // play clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let cur = playheadRef.current;
    if (cur >= durationRef.current) cur = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // 若外部 seek 了 playhead（點時間軸/拖曳），時鐘跟過去，不要被舊的 cur 覆蓋
      if (Math.abs(playheadRef.current - cur) > 0.12) cur = playheadRef.current;
      cur += dt;
      if (cur >= durationRef.current) {
        setPlayheadRaw(durationRef.current);
        setPlaying(false);
        return;
      }
      setPlayheadRaw(cur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // ── persistence (local backend file ↔ localStorage) ──────────────────────
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // hydrate once on mount from the last saved project (if any)
  useEffect(() => {
    let cancelled = false;
    loadProject().then((p) => {
      if (cancelled) {
        return;
      }
      if (p && typeof p === 'object') {
        const proj = p as { subtitles?: Subtitle[]; brolls?: BrollItem[]; tracks?: Track[] };
        if (proj.subtitles?.length) {
          const migrated = proj.subtitles.map((s) => ({ ...s, style: normStyle(s.style) }));
          setSubtitles(migrated);
          setSelSubId(migrated[0]?.id ?? null);
        }
        if (proj.brolls) setBrolls(proj.brolls);
        if (proj.tracks?.length) setTracks(proj.tracks);
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // debounced autosave after hydration, on any content change
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      setSaveStatus('saving');
      saveProject({ subtitles, brolls, tracks, script }).then(() => setSaveStatus('saved'));
    }, 800);
    return () => clearTimeout(t);
  }, [hydrated, subtitles, brolls, tracks, script]);

  const activeSubs = subtitles.filter((s) => playhead >= s.start && playhead < s.end);
  const activeSub = activeSubs[0] ?? null;
  const activeBrolls = brolls.filter((b) => playhead >= b.start && playhead < b.end);

  // shared subtitle-style clipboard (lives in the store so it survives tab switches)
  const [styleClipboard, setStyleClipboard] = useState<SubStyle | null>(null);
  const copyStyle = () => {
    const s = subtitles.find((x) => x.id === selSubId);
    if (s) setStyleClipboard({ ...s.style });
  };
  const pasteStyle = () => {
    if (styleClipboard && selSubId) updateSubStyle(selSubId, styleClipboard);
  };

  // select = highlight only (does NOT move the playhead — used by timeline clips)
  const selectSub = useCallback((id: string) => setSelSubId(id), []);
  const selectBroll = useCallback((id: string) => setSelBrollId(id), []);
  // focus = select AND jump the playhead to the item (used by side-panel clicks)
  const focusSub = useCallback((id: string) => {
    setSelSubId(id);
    const s = subtitlesRef.current.find((x) => x.id === id);
    if (s) setPlayheadRaw(s.start);
  }, []);
  const focusBroll = useCallback((id: string) => {
    setSelBrollId(id);
    const b = brollsRef.current.find((x) => x.id === id);
    if (b) setPlayheadRaw(b.start);
  }, []);

  const updateSubText = useCallback((id: string, text: string) => {
    setSubtitles((subs) => subs.map((s) => (s.id === id ? { ...s, text } : s)));
  }, []);
  const updateSubTime = useCallback((id: string, start: number, end: number) => {
    setSubtitles((subs) => subs.map((s) => (s.id === id ? { ...s, start, end } : s)));
  }, []);
  const updateSubStyle = useCallback((id: string, patch: Partial<SubStyle>) => {
    setSubtitles((subs) => subs.map((s) => (s.id === id ? { ...s, style: { ...s.style, ...patch } } : s)));
  }, []);
  const applyStyleToAll = useCallback((style: SubStyle) => {
    setSubtitles((subs) => subs.map((s) => ({ ...s, style: { ...style } })));
  }, []);
  const updateAllSubStyle = useCallback((patch: Partial<SubStyle>) => {
    setSubtitles((subs) => subs.map((s) => ({ ...s, style: { ...s.style, ...patch } })));
  }, []);
  const setSubsFromSegments = useCallback((segs: { start: number; end: number; text: string }[]) => {
    const tId = tracksRef.current.find((t) => t.kind === 'text')?.id ?? TEXT_TRACK;
    const subs = segs.map((s) => ({ id: uid('s'), trackId: tId, start: s.start, end: s.end, text: s.text, style: { ...DATA.style } }));
    setSubtitles(subs);
    setSelSubId(subs[0]?.id ?? null);
  }, []);
  const deleteSub = useCallback((id: string) => {
    setSubtitles((subs) => subs.filter((s) => s.id !== id));
    setSelSubId((cur) => (cur === id ? null : cur));
  }, []);
  const addSub = useCallback(() => {
    const tId = tracksRef.current.find((t) => t.kind === 'text')?.id ?? TEXT_TRACK;
    const id = uid('s');
    setSubtitles((subs) => {
      const last = subs[subs.length - 1];
      const start = last ? last.end : 0;
      return [...subs, { id, trackId: tId, start, end: start + 2, text: '新字幕', style: { ...DATA.style } }];
    });
    setSelSubId(id);
  }, []);

  const updateBroll = useCallback((id: string, patch: Partial<BrollItem>) => {
    setBrolls((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);
  const updateBrollTime = useCallback((id: string, start: number, end: number) => {
    setBrolls((bs) => bs.map((b) => (b.id === id ? { ...b, start, end } : b)));
  }, []);
  const setClipTrack = useCallback((kind: 'sub' | 'broll', id: string, trackId: string) => {
    if (kind === 'sub') setSubtitles((subs) => subs.map((s) => (s.id === id ? { ...s, trackId } : s)));
    else setBrolls((bs) => bs.map((b) => (b.id === id ? { ...b, trackId } : b)));
  }, []);
  const addBroll = useCallback((q: string, source: 'pexels' | 'uploaded', url?: string) => {
    let trackId = tracksRef.current.find((t) => t.kind === 'broll')?.id;
    if (!trackId) {
      trackId = uid('tr');
      const tid = trackId;
      setTracks((ts) => [{ id: tid, kind: 'broll', label: 'B-ROLL' }, ...ts]);
    }
    const start = Math.max(0, Math.min(playheadRef.current, durationRef.current - 2.5));
    const item: BrollItem = { id: uid('b'), trackId, start, end: start + 2.5, q, source, url, scale: 1, x: 50, y: 50, cw: 100, ch: 100 };
    setBrolls((bs) => [item, ...bs]);
    setSelBrollId(item.id);
  }, []);
  const deleteBroll = useCallback((id: string) => {
    setBrolls((bs) => bs.filter((b) => b.id !== id));
    setSelBrollId((cur) => (cur === id ? null : cur));
  }, []);
  const setBrollsFromPlan = useCallback((items: { start: number; end: number; q: string; url?: string }[]) => {
    let trackId = tracksRef.current.find((t) => t.kind === 'broll')?.id;
    if (!trackId) {
      trackId = uid('tr');
      const tid = trackId;
      setTracks((ts) => [{ id: tid, kind: 'broll', label: 'B-ROLL' }, ...ts]);
    }
    const tid = trackId;
    const bs: BrollItem[] = items.map((it) => ({
      id: uid('b'), trackId: tid, start: it.start, end: it.end, q: it.q,
      source: 'pexels', url: it.url, scale: 1, x: 50, y: 50, cw: 100, ch: 100,
    }));
    setBrolls(bs);
    setSelBrollId(bs[0]?.id ?? null);
  }, []);

  // track actions
  const addTrack = useCallback((kind: TrackKind) => {
    setTracks((ts) => {
      const n = ts.filter((t) => t.kind === kind).length + 1;
      return [{ id: uid('tr'), kind, label: (kind === 'text' ? '字幕 ' : 'B-ROLL ') + n }, ...ts];
    });
  }, []);
  const removeTrack = useCallback((id: string) => {
    setTracks((ts) => ts.filter((t) => t.id !== id));
    setSubtitles((subs) => subs.filter((s) => s.trackId !== id));
    setBrolls((bs) => bs.filter((b) => b.trackId !== id));
  }, []);
  const renameTrack = useCallback((id: string, label: string) => {
    setTracks((ts) => ts.map((t) => (t.id === id ? { ...t, label: label.trim() || t.label } : t)));
  }, []);
  const moveTrack = useCallback((id: string, dir: number) => {
    setTracks((ts) => {
      const i = ts.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ts.length) return ts;
      const a = [...ts];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  }, []);

  const value: EditorValue = {
    duration,
    playhead,
    playing,
    saveStatus,
    tracks,
    subtitles,
    brolls,
    selSubId,
    selBrollId,
    styleClipboard,
    activeSubs,
    activeSub,
    activeBrolls,
    addTrack,
    removeTrack,
    renameTrack,
    moveTrack,
    setPlayhead,
    togglePlay: () => setPlaying((p) => !p),
    seekStart: () => setPlayhead(0),
    seekEnd: () => setPlayhead(durationRef.current),
    selectSub,
    selectBroll,
    focusSub,
    focusBroll,
    updateSubText,
    updateSubTime,
    updateSubStyle,
    applyStyleToAll,
    updateAllSubStyle,
    setSubsFromSegments,
    copyStyle,
    pasteStyle,
    deleteSub,
    addSub,
    updateBroll,
    updateBrollTime,
    setClipTrack,
    addBroll,
    deleteBroll,
    setBrollsFromPlan,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const fmtTC = (s: number) => '00:' + Math.max(0, s).toFixed(1).padStart(4, '0');
