// PHASE 2 · NLE 剪輯工作站 — every surface (SCRIPT / B-ROLL / STYLE panels,
// 9:16 monitor, transport bar, filmstrip timeline) is bound to one shared
// editor store, so edits and the play clock propagate everywhere live.
import { useEffect, useRef, useState } from 'react';
import { Slider, ColorField } from '../components/shared';
import { EditorProvider, useEditor, fmtTC, VIDEO_H } from './editorStore';
import type { SubStyle } from '../data';
import { FONTS, fontCss } from '../data';
import { transcribe, searchPexels, autoBroll, rerollBroll, listFonts, genAssetUrl } from '../api';

let _sysFontsCache: string[] | null = null;   // 整個 session 只抓一次

const isVideoUrl = (u?: string) => !!u && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);

const monoLabel = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--mut)',
} as const;

// ── SCRIPT ──────────────────────────────────────────────────────────────────
function ScriptTab() {
  const ed = useEditor();
  const [subBusy, setSubBusy] = useState(false);
  const [subErr, setSubErr] = useState('');
  const genSubs = async () => {
    setSubBusy(true);
    setSubErr('');
    const r = await transcribe();
    if (r.segments) ed.setSubsFromSegments(r.segments);
    else setSubErr(r.error || '轉錄失敗');
    setSubBusy(false);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="vlt-btn pri sm" onClick={genSubs} disabled={subBusy} style={{ flex: 1, justifyContent: 'center' }}>
          {subBusy ? '轉錄中…' : '✦ 從配音生成字幕（Whisper）'}
        </button>
        <button className="vlt-btn sec sm" onClick={() => ed.addSub()} title="手動新增一句字幕（接在最後，可再改文字/時間）">
          ＋ 新增字幕
        </button>
      </div>
      {subErr && <p style={{ color: '#ff8a72', fontSize: 11, fontFamily: 'var(--mono)', margin: 0 }}>⚠ {subErr}</p>}
      {ed.subtitles.map((l) => {
        const playing = ed.activeSubs.some((a) => a.id === l.id);
        const sel = ed.selSubId === l.id;
        return (
          <div
            key={l.id}
            onClick={() => ed.focusSub(l.id)}
            style={{
              borderRadius: 12,
              padding: '11px 13px',
              cursor: 'pointer',
              background: playing ? 'rgba(196,214,0,.08)' : 'var(--card)',
              boxShadow: playing
                ? 'inset 3px 0 0 var(--g), inset 0 0 0 1px var(--bd)'
                : sel
                ? 'inset 0 0 0 1.5px var(--bd2)'
                : 'inset 0 0 0 1px var(--bd)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="vlt-tc" style={{ color: playing ? 'var(--g)' : 'var(--mut)' }}>
                {l.start.toFixed(2)}s – {l.end.toFixed(2)}s
              </span>
              {playing && (
                <span className="vlt-tag g" style={{ fontSize: 8 }}>
                  播放中
                </span>
              )}
            </div>
            <textarea
              className="vlt-inp"
              value={l.text}
              onChange={(e) => ed.updateSubText(l.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              title="按 Enter 換行"
              style={{ background: 'transparent', border: 'none', padding: 0, fontSize: 14.5, lineHeight: 1.45, color: '#efe9df', resize: 'vertical', minHeight: 46, height: 46, whiteSpace: 'pre-wrap' }}
            />
            {sel && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 9 }}>
                <button className="vlt-btn danger sm" onClick={(e) => { e.stopPropagation(); ed.deleteSub(l.id); }}>
                  DELETE
                </button>
              </div>
            )}
          </div>
        );
      })}
      {ed.subtitles.length === 0 && (
        <p style={{ color: 'var(--mut2)', fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'center', padding: 20 }}>沒有字幕了</p>
      )}
    </div>
  );
}

// ── B-ROLL ──────────────────────────────────────────────────────────────────
function BrollTab() {
  const ed = useEditor();
  const [q, setQ] = useState('');
  const [bbusy, setBbusy] = useState(false);
  const [berr, setBerr] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [rrBusy, setRrBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoPlan = async () => {
    setAiBusy(true);
    setBerr('');
    const r = await autoBroll(ed.subtitles.map((s) => ({ start: s.start, end: s.end, text: s.text })));
    if (r.items) ed.setBrollsFromPlan(r.items);
    else setBerr(r.error || 'AI 配 B-roll 失敗');
    setAiBusy(false);
  };
  const search = async (query: string) => {
    setBbusy(true);
    setBerr('');
    const r = await searchPexels(query);
    if (r.url) {
      ed.addBroll(query, 'pexels', r.url);
      setQ('');
    } else setBerr(r.error || '找不到素材');
    setBbusy(false);
  };
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    ed.addBroll(f.name, 'uploaded', URL.createObjectURL(f));
    e.target.value = '';
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
      <button className="vlt-btn pri sm" style={{ justifyContent: 'center' }} onClick={autoPlan} disabled={aiBusy}>
        {aiBusy ? 'AI 分析 + 下載中…' : '✦ AI 自動配 B-roll'}
      </button>
      <p style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--mut2)', margin: '0 0 2px', lineHeight: 1.5 }}>
        GPT-4o 讀字幕挑 3–5 個點位、自動抓 Pexels 影片填入（會取代現有 B-roll）
      </p>
      <hr className="vlt-divline" style={{ margin: '2px 0' }} />
      <div style={{ display: 'flex', gap: 7 }}>
        <input
          className="vlt-inp"
          placeholder="或手動搜尋 Pexels 素材…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) search(q.trim()); }}
          style={{ fontSize: 12.5, padding: '9px 11px' }}
        />
        <button className="vlt-btn pri sm" onClick={() => { if (q.trim()) search(q.trim()); }} disabled={bbusy}>
          {bbusy ? '…' : '搜尋'}
        </button>
      </div>
      {berr && <p style={{ color: '#ff8a72', fontSize: 11, fontFamily: 'var(--mono)', margin: 0 }}>⚠ {berr}</p>}
      <button className="vlt-btn sec sm" style={{ justifyContent: 'center' }} onClick={() => fileRef.current?.click()}>
        ↑ 上傳自己的素材（MP4 / PNG / JPG）
      </button>
      <input ref={fileRef} type="file" accept="video/*,image/*" style={{ display: 'none' }} onChange={onUpload} />
      <hr className="vlt-divline" style={{ margin: '2px 0' }} />
      {ed.brolls.map((b) => {
        const sel = ed.selBrollId === b.id;
        const playing = ed.activeBrolls.some((x) => x.id === b.id);
        return (
          <div
            key={b.id}
            onClick={() => ed.focusBroll(b.id)}
            style={{
              borderRadius: 12,
              cursor: 'pointer',
              background: sel ? 'rgba(106,91,255,.07)' : 'var(--card)',
              boxShadow: sel ? 'inset 3px 0 0 var(--b), inset 0 0 0 1px var(--bd)' : 'inset 0 0 0 1px var(--bd)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px' }}>
              {b.url ? (
                isVideoUrl(b.url) ? (
                  <video src={b.url} muted style={{ width: 30, height: 30, borderRadius: 7, flex: '0 0 30px', objectFit: 'cover' }} />
                ) : (
                  <img src={b.url} alt={b.q} style={{ width: 30, height: 30, borderRadius: 7, flex: '0 0 30px', objectFit: 'cover' }} />
                )
              ) : (
                <span style={{ width: 30, height: 30, borderRadius: 7, flex: '0 0 30px', background: 'repeating-linear-gradient(135deg,rgba(106,91,255,.3) 0 5px,rgba(106,91,255,.1) 5px 10px)' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#efe9df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.q}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span className="vlt-tc" style={{ color: sel ? '#bcb2ff' : 'var(--mut)' }}>
                    {b.start.toFixed(1)}s – {b.end.toFixed(1)}s
                  </span>
                  <span className="vlt-tag" style={{ fontSize: 7.5, background: b.source === 'uploaded' ? 'rgba(196,214,0,.14)' : 'var(--pan2)', color: b.source === 'uploaded' ? 'var(--g)' : 'var(--mut)' }}>
                    {b.source === 'uploaded' ? 'UPLOADED' : 'PEXELS'}
                  </span>
                </div>
              </div>
              {playing && (
                <span className="vlt-tag b" style={{ fontSize: 8 }}>
                  播放中
                </span>
              )}
            </div>
            {sel && (
              <div style={{ padding: '2px 13px 13px' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input
                    className="vlt-inp"
                    value={b.q}
                    onChange={(e) => ed.updateBroll(b.id, { q: e.target.value })}
                    placeholder="關鍵字（英文）"
                    style={{ flex: 1, fontSize: 12, padding: '7px 9px' }}
                  />
                  <button
                    className="vlt-btn sec sm"
                    disabled={rrBusy}
                    onClick={async () => {
                      setRrBusy(true);
                      const r = await rerollBroll(b.q, Math.floor(Math.random() * 14) + 1);
                      if (r.url) ed.updateBroll(b.id, { url: r.url });
                      setRrBusy(false);
                    }}
                    title="改關鍵字後可重抓；或直接換另一支"
                  >
                    {rrBusy ? '…' : '🔄 換一張'}
                  </button>
                </div>
                <Slider k="Scale" value={b.scale} min={0.5} max={2} step={0.01} unit="x" decimals={2} onChange={(v) => ed.updateBroll(b.id, { scale: v })} />
                <Slider k="X 位置" value={b.x} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => ed.updateBroll(b.id, { x: v })} />
                <Slider k="Y 位置" value={b.y} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => ed.updateBroll(b.id, { y: v })} />
                <Slider k="Crop W" value={b.cw} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => ed.updateBroll(b.id, { cw: v })} />
                <Slider k="Crop H" value={b.ch} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => ed.updateBroll(b.id, { ch: v })} />
                <button className="vlt-btn danger sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => ed.deleteBroll(b.id)}>
                  DELETE CLIP
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── STYLE ───────────────────────────────────────────────────────────────────
function StyleTab() {
  const ed = useEditor();
  const [sysFonts, setSysFonts] = useState<string[]>(_sysFontsCache ?? []);
  useEffect(() => {
    if (_sysFontsCache) return;
    listFonts().then((f) => {
      _sysFontsCache = f;
      setSysFonts(f);
    });
  }, []);
  const sub = ed.subtitles.find((s) => s.id === ed.selSubId) ?? null;
  const fills = ['#c4d600', '#ffffff', '#ffd166', '#ff6b6b', '#6a5bff'];
  const strokes = ['#000000', '#3b29ff', '#7c3aed', '#1a1500'];
  if (!sub) {
    return <p style={{ color: 'var(--mut2)', fontSize: 12, padding: 20, lineHeight: 1.7 }}>請先在 SCRIPT 分頁或時間軸選取一句字幕，再調整它的樣式。</p>;
  }
  const st = sub.style;
  const set = (k: keyof SubStyle) => (v: number) => ed.updateSubStyle(sub.id, { [k]: v });
  const setC = (k: keyof SubStyle) => (v: string) => ed.updateSubStyle(sub.id, { [k]: v });
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ borderRadius: 11, padding: '13px', background: 'var(--card)', boxShadow: 'inset 0 0 0 1px var(--bd)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--mut)', marginBottom: 9 }}>正在編輯這一句 · 即時預覽</div>
        <div style={{ position: 'relative', background: '#0c0c0e', borderRadius: 8, height: 96, overflow: 'hidden' }}>
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: `${st.bottom}%`, textAlign: 'center', padding: '0 10px', fontFamily: fontCss(st.font), fontWeight: 900, fontSize: (st.size * 96) / VIDEO_H, lineHeight: 1.25, color: st.fill, WebkitTextStroke: `${((st.strokeW * 96) / VIDEO_H).toFixed(1)}px ${st.stroke}`, paintOrder: 'stroke fill', whiteSpace: 'pre-wrap' }}>
            {sub.text}
          </span>
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={monoLabel}>字體</label>
          <button
            className="vlt-btn ghost sm"
            style={{ padding: '3px 9px', fontSize: 11 }}
            onClick={() => ed.updateAllSubStyle({ font: st.font })}
            title="把目前這句的字體套用到所有字幕"
          >
            套用全部
          </button>
        </div>
        <select
          className="vlt-inp"
          value={st.font}
          onChange={(e) => ed.updateSubStyle(sub.id, { font: e.target.value })}
          style={{ width: '100%', padding: '8px 10px', fontSize: 13 }}
        >
          <optgroup label="內建（粗體·render 一致）">
            {FONTS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </optgroup>
          {sysFonts.length > 0 && (
            <optgroup label="電腦已安裝字型">
              {sysFonts.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div>
        <label style={monoLabel}>字體顏色</label>
        <ColorField presets={fills} value={st.fill} onChange={setC('fill')} />
      </div>
      <div>
        <label style={monoLabel}>外框顏色</label>
        <ColorField presets={strokes} value={st.stroke} onChange={setC('stroke')} />
      </div>
      <div>
        <Slider k="字級 px" value={st.size} min={16} max={240} step={2} unit="px" decimals={0} onChange={set('size')} />
        <Slider k="外框 px" value={st.strokeW} min={0} max={24} step={1} unit="px" decimals={0} onChange={set('strokeW')} />
        <Slider k="垂直位置 離底%" value={st.bottom} min={0} max={95} step={1} unit="%" decimals={0} onChange={set('bottom')} />
        <Slider k="水平位置 X%" value={st.x} min={0} max={100} step={1} unit="%" decimals={0} onChange={set('x')} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="vlt-btn sec sm" style={{ flex: 1, justifyContent: 'center' }} onClick={ed.copyStyle}>
          COPY 樣式
        </button>
        <button className="vlt-btn sec sm" style={{ flex: 1, justifyContent: 'center' }} disabled={!ed.styleClipboard} onClick={ed.pasteStyle}>
          PASTE 樣式
        </button>
      </div>
      <button className="vlt-btn pri sm" style={{ justifyContent: 'center' }} onClick={() => ed.applyStyleToAll(st)}>
        APPLY TO ALL SUBTITLES
      </button>
    </div>
  );
}

// ── 9:16 monitor (dynamic) ───────────────────────────────────────────────────
// Everything is laid out on a FIXED base canvas (BASE_W×BASE_H) and uniformly
// scaled with transform:scale() to fit the available box — so the preview never
// reflows or breaks when the monitor shrinks/grows.
const BASE_W = 360;
const BASE_H = 640;

function EditorMonitor() {
  const ed = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const [box, setBox] = useState({ w: BASE_W, h: BASE_H });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  // sync the base composite video with the editor clock
  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    if (ed.playing) v.play().catch(() => {});
    else v.pause();
  }, [ed.playing]);
  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    // 正常播放時影片自走（差距小不動）；外部 seek 造成大落差才校正，連帶聲音一起跳
    if (Math.abs(v.currentTime - ed.playhead) > 0.3) v.currentTime = ed.playhead;
  }, [ed.playhead]);
  const scale = Math.min(box.w / BASE_W, box.h / BASE_H);
  const offX = (box.w - BASE_W * scale) / 2;
  const offY = (box.h - BASE_H * scale) / 2;

  // drag a subtitle / B-Roll directly on the preview (screen px → base canvas % via scale)
  const startMonitorDrag = (e: React.PointerEvent, kind: 'sub' | 'broll', id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sc = scale || 1;
    const sx = e.clientX;
    const sy = e.clientY;
    if (kind === 'sub') {
      const sub = ed.subtitles.find((s) => s.id === id);
      if (!sub) return;
      ed.selectSub(id);
      const ox = sub.style.x;
      const ob = sub.style.bottom;
      const move = (ev: PointerEvent) => {
        const nx = Math.max(0, Math.min(100, ox + ((ev.clientX - sx) / sc / BASE_W) * 100));
        const nb = Math.max(0, Math.min(95, ob - ((ev.clientY - sy) / sc / BASE_H) * 100));
        ed.updateSubStyle(id, { x: Math.round(nx), bottom: Math.round(nb) });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    } else {
      const b = ed.brolls.find((x) => x.id === id);
      if (!b) return;
      ed.selectBroll(id);
      const ox = b.x;
      const oy = b.y;
      const move = (ev: PointerEvent) => {
        const nx = Math.max(0, Math.min(100, ox + ((ev.clientX - sx) / sc / BASE_W) * 100));
        const ny = Math.max(0, Math.min(100, oy + ((ev.clientY - sy) / sc / BASE_H) * 100));
        ed.updateBroll(id, { x: Math.round(nx), y: Math.round(ny) });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        height: '100%',
        maxHeight: '100%',
        maxWidth: '100%',
        aspectRatio: '9 / 16',
        borderRadius: 14,
        overflow: 'hidden',
        background: '#08080a',
        boxShadow: '0 30px 70px rgba(0,0,0,.55)',
        outline: '1px solid rgba(255,255,255,.1)',
      }}
    >
      <div style={{ position: 'absolute', left: offX, top: offY, width: BASE_W, height: BASE_H, transformOrigin: 'top left', transform: `scale(${scale})` }}>
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(125deg,#16161a 0 13px,#101013 13px 26px)' }} />
        <video
          ref={vidRef}
          src={genAssetUrl('final_composite.mp4')}
          playsInline
          preload="auto"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => ((e.currentTarget as HTMLVideoElement).style.display = 'none')}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 50% 16%, rgba(59,41,255,.16), transparent 60%)' }} />
        <span style={{ position: 'absolute', top: 12, left: 13, fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'rgba(255,255,255,.42)' }}>
          MOTION&nbsp;BG ↻ · 前景對嘴 FG
        </span>
        {/* active B-Roll overlays — stacked by track order (top track = front) */}
        {ed.activeBrolls.map((b) => {
          const z = ed.tracks.length - ed.tracks.findIndex((t) => t.id === b.trackId);
          return (
            <div
              key={b.id}
              onPointerDown={(e) => startMonitorDrag(e, 'broll', b.id)}
              title="拖曳調整位置"
              style={{
                position: 'absolute',
                zIndex: z,
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: `${b.cw}%`,
                height: `${b.ch}%`,
                transform: `translate(-50%,-50%) scale(${b.scale})`,
                background: b.url ? '#000' : 'repeating-linear-gradient(135deg, rgba(106,91,255,.5) 0 9px, rgba(124,58,237,.3) 9px 18px)',
                border: '1.5px solid var(--b)',
                display: 'flex',
                alignItems: 'flex-end',
                padding: 8,
                overflow: 'hidden',
                cursor: 'move',
                touchAction: 'none',
              }}
            >
              {b.url &&
                (isVideoUrl(b.url) ? (
                  <video src={b.url} autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                ) : (
                  <img src={b.url} alt={b.q} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                ))}
              <span style={{ position: 'relative', fontFamily: 'var(--mono)', fontSize: 8.5, letterSpacing: 0.5, color: '#fff', background: 'rgba(8,8,12,.6)', padding: '2px 5px', borderRadius: 3 }}>
                B-ROLL · {b.q}
              </span>
            </div>
          );
        })}
        <div style={{ position: 'absolute', top: 11, right: 12, fontFamily: 'var(--mono)', fontSize: 9.5, color: 'rgba(255,255,255,.8)', background: 'rgba(8,8,12,.55)', padding: '3px 7px', borderRadius: 4 }}>
          {fmtTC(ed.playhead)} / {fmtTC(ed.duration)}
        </div>
        {/* active subtitles (all overlapping), each with its own style/position — draggable */}
        {ed.activeSubs.map((sub) => (
          <div
            key={sub.id}
            onPointerDown={(e) => startMonitorDrag(e, 'sub', sub.id)}
            title="拖曳調整位置"
            style={{ position: 'absolute', zIndex: 50, left: `${sub.style.x}%`, bottom: `${sub.style.bottom}%`, transform: 'translateX(-50%)', width: 'max-content', maxWidth: '98%', textAlign: 'center', padding: '0 2px', cursor: 'move', userSelect: 'none', touchAction: 'none' }}
          >
            <span
              style={{
                fontFamily: fontCss(sub.style.font),
                fontWeight: 900,
                fontSize: (sub.style.size * BASE_H) / VIDEO_H,
                lineHeight: 1.25,
                color: sub.style.fill,
                WebkitTextStroke: `${((sub.style.strokeW * BASE_H) / VIDEO_H).toFixed(1)}px ${sub.style.stroke}`,
                paintOrder: 'stroke fill',
                whiteSpace: 'pre-wrap',
              }}
            >
              {sub.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── transport ────────────────────────────────────────────────────────────────
function TransportBar() {
  const ed = useEditor();
  const btn = (ic: string, onClick: () => void, opt: { big?: boolean; title?: string } = {}) => (
    <button
      onClick={onClick}
      title={opt.title}
      style={{ width: opt.big ? 46 : 38, height: opt.big ? 46 : 38, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: opt.big ? 17 : 13, background: opt.big ? 'var(--g)' : 'var(--pan2)', color: opt.big ? 'var(--gd)' : '#d6cab6', boxShadow: opt.big ? '0 4px 14px rgba(196,214,0,.3)' : 'none' }}
    >
      {ic}
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--pan)', border: '1px solid var(--bd)', borderRadius: 14, padding: '8px 18px', boxShadow: '0 8px 24px rgba(0,0,0,.32)' }}>
      <span className="vlt-tc" style={{ fontSize: 12, color: 'var(--g)', minWidth: 104, fontVariantNumeric: 'tabular-nums' }}>
        {fmtTC(ed.playhead)} / {fmtTC(ed.duration)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {btn('⏮', ed.seekStart, { title: '回到開頭' })}
        {btn(ed.playing ? '⏸' : '▶', ed.togglePlay, { big: true, title: '播放 / 暫停' })}
        {btn('⏭', ed.seekEnd, { title: '跳到結尾' })}
      </div>
      <span style={{ width: 1, height: 22, background: 'var(--bd)' }} />
      <span className="vlt-tag" style={{ fontSize: 8.5 }}>
        9:16 · 1080×1920
      </span>
    </div>
  );
}

// ── timeline (3 bound lanes) ─────────────────────────────────────────────────
const LABELW = 92;

interface ClipDrag {
  kind: 'sub' | 'broll';
  mode: 'move' | 'trimL' | 'trimR';
  id: string;
  startX: number;
  origStart: number;
  origEnd: number;
}

function Timeline({ height, collapsed, onToggleCollapse }: { height: number; collapsed: boolean; onToggleCollapse: () => void }) {
  const ed = useEditor();
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ClipDrag | 'ph' | null>(null);
  const laneRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const ticks = Array.from({ length: Math.floor(ed.duration) + 1 }, (_, i) => i);
  const [addOpen, setAddOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const fracAt = (clientX: number) => {
    if (!laneRef.current) return 0;
    const r = laneRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      if (d === 'ph') {
        ed.setPlayhead(fracAt(e.clientX) * ed.duration);
        return;
      }
      if (!laneRef.current) return;
      const r = laneRef.current.getBoundingClientRect();
      const deltaSec = ((e.clientX - d.startX) / r.width) * ed.duration;
      const MIN = 0.3;

      // magnetic snapping: other clips' edges, the playhead, and integer seconds
      const SNAP = (7 / r.width) * ed.duration;
      const pts: number[] = [ed.playhead];
      ed.subtitles.forEach((s) => { if (s.id !== d.id) pts.push(s.start, s.end); });
      ed.brolls.forEach((b) => { if (b.id !== d.id) pts.push(b.start, b.end); });
      for (let i = 0; i <= Math.floor(ed.duration); i++) pts.push(i);
      const snap = (v: number) => {
        let best = v;
        let bd = SNAP;
        for (const p of pts) {
          const dd = Math.abs(p - v);
          if (dd < bd) { bd = dd; best = p; }
        }
        return best;
      };

      let start: number;
      let end: number;
      if (d.mode === 'move') {
        const dur = d.origEnd - d.origStart;
        let s = Math.max(0, Math.min(ed.duration - dur, d.origStart + deltaSec));
        let e2 = s + dur;
        const ss = snap(s);
        const se = snap(e2);
        if (Math.abs(ss - s) <= Math.abs(se - e2)) {
          if (ss !== s) { s = Math.max(0, Math.min(ed.duration - dur, ss)); e2 = s + dur; }
        } else if (se !== e2) {
          e2 = Math.max(dur, Math.min(ed.duration, se)); s = e2 - dur;
        }
        start = s;
        end = e2;
        // cross-track: reassign to whichever same-kind lane the pointer is over
        const wantKind = d.kind === 'sub' ? 'text' : 'broll';
        const target = ed.tracks.find((t) => {
          const el = laneRowRefs.current[t.id];
          if (!el) return false;
          const rr = el.getBoundingClientRect();
          return e.clientY >= rr.top && e.clientY <= rr.bottom;
        });
        if (target && target.kind === wantKind) {
          const cur = (d.kind === 'sub' ? ed.subtitles : ed.brolls).find((c) => c.id === d.id);
          if (cur && cur.trackId !== target.id) ed.setClipTrack(d.kind, d.id, target.id);
        }
      } else if (d.mode === 'trimL') {
        start = Math.max(0, Math.min(d.origEnd - MIN, snap(d.origStart + deltaSec)));
        end = d.origEnd;
      } else {
        start = d.origStart;
        end = Math.max(d.origStart + MIN, Math.min(ed.duration, snap(d.origEnd + deltaSec)));
      }
      start = parseFloat(start.toFixed(2));
      end = parseFloat(end.toFixed(2));
      if (d.kind === 'sub') ed.updateSubTime(d.id, start, end);
      else ed.updateBrollTime(d.id, start, end);
    };
    const up = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [ed]);

  const startScrub = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = 'ph';
    document.body.style.cursor = 'ew-resize';
    ed.setPlayhead(fracAt(e.clientX) * ed.duration);
  };
  const startClipDrag = (e: React.PointerEvent, kind: 'sub' | 'broll', id: string, start: number, end: number, mode: ClipDrag['mode']) => {
    e.preventDefault();
    e.stopPropagation();
    if (kind === 'sub') ed.selectSub(id);
    else ed.selectBroll(id); // select only — does NOT move the playhead
    dragRef.current = { kind, mode, id, startX: e.clientX, origStart: start, origEnd: end };
    // eslint-disable-next-line react-hooks/immutability -- imperative drag cursor, cleared on pointerup
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
  };
  const trimStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 7,
    cursor: 'ew-resize',
    zIndex: 3,
    background: 'rgba(255,255,255,.22)',
    ...(side === 'left' ? { left: 0, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 } : { right: 0, borderTopRightRadius: 5, borderBottomRightRadius: 5 }),
  });

  if (collapsed) {
    return (
      <div style={{ flex: '0 0 44px', height: 44, borderTop: '1px solid var(--bd)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px' }}>
        <button onClick={onToggleCollapse} title="展開軌道區" style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(196,214,0,.16)', color: 'var(--g)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>▴</span>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 15, letterSpacing: '-.01em', color: 'var(--tx)' }}>TIMELINE</span>
        </button>
        <span className="vlt-tc" style={{ fontSize: 12, color: 'var(--g)' }}>
          {fmtTC(ed.playhead)} / {fmtTC(ed.duration)}
        </span>
        <span style={{ flex: 1 }} />
        <button className="vlt-btn sec sm" onClick={onToggleCollapse}>▴ 展開軌道</button>
      </div>
    );
  }

  const phPct = (ed.playhead / ed.duration) * 100;
  const META: Record<string, [string, string]> = {
    text: ['#8d7bff', 'rgba(106,91,255,.16)'],
    broll: ['#a78bfa', 'rgba(124,58,237,.16)'],
  };

  const renameCommit = () => {
    if (editId) ed.renameTrack(editId, editVal);
    setEditId(null);
  };

  const subClip = (s: typeof ed.subtitles[number]) => {
    const selOrActive = ed.selSubId === s.id || ed.activeSubs.some((a) => a.id === s.id);
    return (
      <div
        key={s.id}
        onPointerDown={(e) => startClipDrag(e, 'sub', s.id, s.start, s.end, 'move')}
        title="拖曳移動 · 拖邊緣調整長度"
        style={{ position: 'absolute', top: 0, bottom: 0, left: (s.start / ed.duration) * 100 + '%', width: ((s.end - s.start) / ed.duration) * 100 + '%', borderRadius: 5, background: 'linear-gradient(180deg,#5b4bff,#3b29ff)', display: 'flex', alignItems: 'center', padding: '0 9px', cursor: 'grab', outline: selOrActive ? '2px solid #fff' : 'none', outlineOffset: -1, overflow: 'hidden' }}
      >
        <div onPointerDown={(e) => startClipDrag(e, 'sub', s.id, s.start, s.end, 'trimL')} style={trimStyle('left')} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{s.text}</span>
        <div onPointerDown={(e) => startClipDrag(e, 'sub', s.id, s.start, s.end, 'trimR')} style={trimStyle('right')} />
      </div>
    );
  };
  const brollClip = (b: typeof ed.brolls[number]) => {
    const selOrActive = ed.selBrollId === b.id || ed.activeBrolls.some((x) => x.id === b.id);
    const w = ((b.end - b.start) / ed.duration) * 100;
    return (
      <div
        key={b.id}
        onPointerDown={(e) => startClipDrag(e, 'broll', b.id, b.start, b.end, 'move')}
        title="拖曳移動 · 拖邊緣調整長度"
        style={{ position: 'absolute', top: 0, bottom: 0, left: (b.start / ed.duration) * 100 + '%', width: w + '%', borderRadius: 5, display: 'flex', cursor: 'grab', outline: selOrActive ? '2px solid #fff' : 'none', outlineOffset: -1, overflow: 'hidden' }}
      >
        {Array.from({ length: Math.max(2, Math.round(w / 6)) }, (_, k) => (
          <div key={k} style={{ flex: 1, borderRight: '1px solid rgba(0,0,0,.4)', pointerEvents: 'none', background: 'repeating-linear-gradient(135deg,rgba(139,92,246,.55) 0 6px,rgba(124,58,237,.32) 6px 12px)' }} />
        ))}
        <span style={{ position: 'absolute', left: 6, bottom: 4, fontFamily: 'var(--mono)', fontSize: 8.5, color: '#fff', background: 'rgba(0,0,0,.45)', padding: '1px 5px', borderRadius: 3, pointerEvents: 'none' }}>{b.q}</span>
        <div onPointerDown={(e) => startClipDrag(e, 'broll', b.id, b.start, b.end, 'trimL')} style={trimStyle('left')} />
        <div onPointerDown={(e) => startClipDrag(e, 'broll', b.id, b.start, b.end, 'trimR')} style={trimStyle('right')} />
      </div>
    );
  };

  return (
    <div style={{ flex: `0 0 ${height}px`, height, borderTop: '1px solid var(--bd)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ height: 42, flex: '0 0 42px', display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', borderBottom: '1px solid var(--bd)' }}>
        <button onClick={onToggleCollapse} title="收合軌道區" style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(196,214,0,.16)', color: 'var(--g)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>▾</span>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 15, letterSpacing: '-.01em', color: 'var(--tx)' }}>TIMELINE</span>
        </button>
        <span className="vlt-tag" style={{ color: 'var(--g)', background: 'rgba(196,214,0,.12)' }}>縮圖型 FILMSTRIP</span>
        <span className="vlt-tc" style={{ fontSize: 10, color: 'var(--mut2)' }}>拖曳播放頭或 clip · 軌道順序＝疊放層級 · 與面板、監視器即時連動</span>
        <span style={{ flex: 1 }} />
        {ed.saveStatus !== 'idle' && (
          <span className="vlt-tc" style={{ fontSize: 10, color: ed.saveStatus === 'saved' ? 'var(--g)' : 'var(--mut)' }}>
            {ed.saveStatus === 'saving' ? '● 儲存中…' : '✓ 已存本機'}
          </span>
        )}
        <div style={{ position: 'relative' }}>
          <button className="vlt-btn sec sm" onClick={() => setAddOpen((o) => !o)} style={{ padding: '7px 12px' }}>+ 軌道</button>
          {addOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, background: 'var(--pan)', border: '1px solid var(--bd2)', borderRadius: 10, padding: 6, minWidth: 160, boxShadow: '0 14px 40px rgba(0,0,0,.5)' }}>
              <button className="vlt-btn ghost sm" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4, border: 'none' }} onClick={() => { ed.addTrack('text'); setAddOpen(false); }}>
                ＋ 字幕軌（疊字卡）
              </button>
              <button className="vlt-btn ghost sm" style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }} onClick={() => { ed.addTrack('broll'); setAddOpen(false); }}>
                ＋ B-ROLL 軌（疊素材）
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="vlt-scroll" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* ruler */}
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 6, background: 'var(--bg2)' }}>
          <div style={{ width: LABELW, flex: `0 0 ${LABELW}px`, borderBottom: '1px solid var(--bd)', borderRight: '1px solid var(--bd)' }} />
          <div ref={laneRef} onPointerDown={startScrub} style={{ flex: 1, height: 28, position: 'relative', borderBottom: '1px solid var(--bd)', cursor: 'ew-resize' }}>
            {ticks.map((s) => (
              <div key={s} style={{ position: 'absolute', top: 0, bottom: 0, left: (s / ed.duration) * 100 + '%', borderLeft: '1px solid rgba(245,238,226,.07)' }}>
                <span style={{ position: 'absolute', top: 4, left: 5, fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 12, color: 'var(--mut)', fontVariantNumeric: 'tabular-nums' }}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* dynamic tracks (order top→bottom = front→back) */}
        {ed.tracks.map((t, ti) => {
          const [col, bg] = META[t.kind];
          const first = ti === 0;
          const last = ti === ed.tracks.length - 1;
          const clips = t.kind === 'text'
            ? ed.subtitles.filter((s) => s.trackId === t.id).map(subClip)
            : ed.brolls.filter((b) => b.trackId === t.id).map(brollClip);
          return (
            <div
              key={t.id}
              ref={(el) => {
                laneRowRefs.current[t.id] = el;
              }}
              style={{ display: 'flex', borderBottom: '1px solid rgba(245,238,226,.04)' }}
            >
              <div style={{ position: 'relative', width: LABELW, flex: `0 0 ${LABELW}px`, height: 50, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, padding: '0 8px', borderRight: '1px solid var(--bd)', background: bg }}>
                {editId === t.id ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onBlur={renameCommit}
                    onKeyDown={(e) => { if (e.key === 'Enter') renameCommit(); if (e.key === 'Escape') setEditId(null); }}
                    style={{ width: '100%', minWidth: 0, background: 'var(--bg2)', border: '1px solid var(--g)', borderRadius: 4, color: '#fff', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 11, padding: '2px 4px', outline: 'none' }}
                  />
                ) : (
                  <span onDoubleClick={() => { setEditId(t.id); setEditVal(t.label); }} title="雙擊重新命名" style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 11.5, color: col, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' }}>
                    {t.label}
                  </span>
                )}
                <button onClick={() => setMenuId(menuId === t.id ? null : t.id)} title="更多選項" style={{ alignSelf: 'flex-start', width: 32, height: 17, borderRadius: 5, border: '1px solid var(--bd)', background: 'rgba(0,0,0,.25)', color: '#d6cab6', cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>⋯</button>
                {menuId === t.id && (
                  <div style={{ position: 'absolute', ...(last ? { bottom: 8 } : { top: 30 }), left: 6, zIndex: 40, minWidth: 150, background: 'var(--pan)', border: '1px solid var(--bd2)', borderRadius: 10, padding: 6, boxShadow: '0 14px 40px rgba(0,0,0,.5)' }}>
                    {([
                      ['重新命名', () => { setEditId(t.id); setEditVal(t.label); }, false, false],
                      ['上移一層', () => ed.moveTrack(t.id, -1), first, false],
                      ['下移一層', () => ed.moveTrack(t.id, 1), last, false],
                      ['刪除軌道', () => ed.removeTrack(t.id), false, true],
                    ] as [string, () => void, boolean, boolean][]).map(([label, fn, disabled, danger]) => (
                      <button
                        key={label}
                        disabled={disabled}
                        onClick={() => { setMenuId(null); fn(); }}
                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 6, padding: '8px 10px', fontFamily: 'var(--body)', fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', color: danger ? '#ff8a72' : disabled ? 'var(--mut2)' : 'var(--tx)', opacity: disabled ? 0.5 : 1 }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div onPointerDown={startScrub} style={{ flex: 1, height: 50, position: 'relative', cursor: 'ew-resize' }}>
                {clips.length === 0 && (
                  <span style={{ position: 'absolute', inset: 6, border: '1.5px dashed var(--bd2)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.06em', color: 'var(--mut2)', pointerEvents: 'none' }}>空軌</span>
                )}
                <div style={{ position: 'absolute', inset: '3px 0' }}>{clips}</div>
              </div>
            </div>
          );
        })}

        {/* 原始片 lane (locked, always bottom) */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(245,238,226,.04)' }}>
          <div style={{ width: LABELW, flex: `0 0 ${LABELW}px`, height: 50, display: 'flex', alignItems: 'center', padding: '0 10px', borderRight: '1px solid var(--bd)', background: 'rgba(196,214,0,.16)' }}>
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 11.5, color: '#c4d600' }}>原始片</span>
          </div>
          <div onPointerDown={startScrub} style={{ flex: 1, height: 50, position: 'relative', cursor: 'ew-resize' }}>
            <div style={{ position: 'absolute', inset: '3px 0' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%', borderRadius: 5, display: 'flex', overflow: 'hidden' }}>
                {Array.from({ length: 16 }, (_, k) => (
                  <div key={k} style={{ flex: 1, borderRight: '1px solid rgba(0,0,0,.4)', background: 'repeating-linear-gradient(135deg,rgba(196,214,0,.22) 0 6px,rgba(120,130,0,.12) 6px 12px)' }} />
                ))}
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--mono)', fontSize: 9, color: '#e8efb0', background: 'rgba(8,8,4,.5)', padding: '2px 6px', borderRadius: 3 }}>kuro_ep01.mp4 · FG+BG 合成</span>
              </div>
            </div>
          </div>
        </div>

        {menuId && <div onPointerDown={() => setMenuId(null)} style={{ position: 'fixed', inset: 0, zIndex: 35 }} />}

        {/* playhead */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${LABELW}px + (100% - ${LABELW}px) * ${phPct / 100})`, width: 2.5, background: '#ff3b3b', zIndex: 7, pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', top: -1, left: -6, width: 14, height: 12, background: '#ff3b3b', clipPath: 'polygon(0 0,100% 0,100% 55%,50% 100%,0 55%)' }} />
        </div>
      </div>
    </div>
  );
}

// ── Phase 2 shell ────────────────────────────────────────────────────────────
function Phase2Body() {
  const ed = useEditor();
  const [tab, setTab] = useState<'script' | 'broll' | 'style'>('script');
  const [tlHeight, setTlHeight] = useState(() => {
    const v = parseInt(localStorage.getItem('vlt-tlh') || '272', 10);
    return v >= 160 && v <= 560 ? v : 272;
  });
  const [tlCollapsed, setTlCollapsed] = useState(() => localStorage.getItem('vlt-tlc') === '1');
  useEffect(() => { localStorage.setItem('vlt-tlh', String(Math.round(tlHeight))); }, [tlHeight]);
  useEffect(() => { localStorage.setItem('vlt-tlc', tlCollapsed ? '1' : '0'); }, [tlCollapsed]);
  const tabs: [typeof tab, string][] = [
    ['script', 'SCRIPT'],
    ['broll', 'B-ROLL'],
    ['style', 'STYLE'],
  ];

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = tlHeight;
    const move = (ev: PointerEvent) => setTlHeight(Math.max(160, Math.min(560, startH + (startY - ev.clientY))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.style.cursor = 'ns-resize';
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside style={{ width: 340, flex: '0 0 340px', borderRight: '1px solid var(--bd)', background: 'var(--pan)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 3, margin: 14, marginBottom: 0, background: 'var(--bg2)', borderRadius: 10, padding: 4 }}>
            {tabs.map(([id, l]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 12.5, letterSpacing: '.02em', background: tab === id ? 'var(--pan2)' : 'transparent', color: tab === id ? '#fff' : 'var(--mut)', boxShadow: tab === id ? '0 1px 4px rgba(0,0,0,.3)' : 'none' }}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="vlt-scroll" style={{ flex: 1, overflow: 'auto' }}>
            {tab === 'script' && <ScriptTab />}
            {tab === 'broll' && <BrollTab />}
            {tab === 'style' && <StyleTab />}
          </div>
        </aside>
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 0 18px', background: 'radial-gradient(130% 100% at 50% -10%,#211a11,#100c07)' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <EditorMonitor />
          </div>
          <TransportBar />
          <span style={{ fontSize: 12, color: 'var(--mut)' }}>
            配音 <b style={{ color: '#cdbfa8', fontWeight: 600 }}>熙 / Xī</b> · 背景 <b style={{ color: '#cdbfa8', fontWeight: 600 }}>Ken Burns 循環</b> · {ed.subtitles.length} 句字幕 · {ed.brolls.length} 段 B-Roll
          </span>
        </main>
      </div>
      {!tlCollapsed && (
        <div onPointerDown={startResize} title="拖曳調整軌道高度" style={{ height: 8, flex: '0 0 8px', cursor: 'ns-resize', background: 'var(--bg2)', borderTop: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 44, height: 3, borderRadius: 2, background: 'var(--bd2)' }} />
        </div>
      )}
      <Timeline height={tlHeight} collapsed={tlCollapsed} onToggleCollapse={() => setTlCollapsed((c) => !c)} />
    </div>
  );
}

export function Phase2({ script }: { script: string }) {
  return (
    <EditorProvider script={script}>
      <Phase2Body />
    </EditorProvider>
  );
}
