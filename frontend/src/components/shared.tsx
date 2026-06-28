// Shared atoms + chrome for the Voltlites Editor 4-phase app.
import { useRef, useState, Fragment } from 'react';
import type { ReactNode } from 'react';
import { DATA } from '../data';
import type { Role } from '../data';

export function Avatar({ r, size = 34 }: { r: Role; size?: number }) {
  return (
    <span
      className="vlt-av"
      style={{
        width: size,
        height: size,
        background: r.c,
        color: r.tc,
        fontSize: r.av.length > 1 ? size * 0.42 : size * 0.5,
      }}
    >
      {r.av}
    </span>
  );
}

interface SliderProps {
  k: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  decimals?: number;
  onChange: (v: number) => void;
}

export function Slider({ k, value, min, max, step = 0.01, unit = '', decimals = 0, onChange }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const setFromClient = (clientX: number) => {
    if (!trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    let nv = min + p * (max - min);
    if (step) nv = Math.round(nv / step) * step;
    onChange(parseFloat(Math.max(min, Math.min(max, nv)).toFixed(6)));
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setFromClient(e.clientX);
    const move = (ev: PointerEvent) => setFromClient(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.style.cursor = 'ew-resize';
  };
  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n)) onChange(parseFloat(Math.max(min, Math.min(max, n)).toFixed(6)));
    setEditing(false);
  };

  return (
    <div className="vlt-sld">
      <span className="k">{k}</span>
      <div className="tr" ref={trackRef} onPointerDown={onDown} style={{ cursor: 'pointer' }}>
        <div className="fl" style={{ width: pct + '%' }} />
        <div className="hb" style={{ left: pct + '%' }} />
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            width: 50,
            flex: '0 0 50px',
            textAlign: 'right',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: '#fff',
            background: 'var(--bg2)',
            border: '1px solid var(--g)',
            borderRadius: 5,
            padding: '2px 5px',
            outline: 'none',
          }}
        />
      ) : (
        <span
          className="v"
          title="點擊輸入數值"
          style={{
            cursor: 'text',
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
            textDecorationColor: 'var(--mut2)',
            textUnderlineOffset: 2,
          }}
          onClick={() => {
            setDraft(value.toFixed(decimals));
            setEditing(true);
          }}
        >
          {value.toFixed(decimals)}
          {unit}
        </span>
      )}
    </div>
  );
}

export function Swatch({ c, on, onClick }: { c: string; on: boolean; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      title={c}
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        background: c,
        cursor: 'pointer',
        boxShadow: on ? '0 0 0 2px var(--bg2),0 0 0 4px var(--g)' : 'inset 0 0 0 1px rgba(255,255,255,.15)',
      }}
    />
  );
}

// preset swatches + a custom color picker (rainbow "+" opens the OS picker)
export function ColorField({
  presets,
  value,
  onChange,
}: {
  presets: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const isCustom = !presets.includes((value || '').toLowerCase()) && !presets.includes(value);
  return (
    <div style={{ display: 'flex', gap: 9, marginTop: 9, alignItems: 'center', flexWrap: 'wrap' }}>
      {presets.map((c) => (
        <Swatch key={c} c={c} on={c === value} onClick={() => onChange(c)} />
      ))}
      <label
        title="自訂顏色"
        style={{
          position: 'relative',
          width: 26,
          height: 26,
          borderRadius: 7,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isCustom
            ? value
            : 'conic-gradient(from 0deg,#ff5757,#ffd166,#7CFF6B,#4FE3E3,#6a5bff,#e15bff,#ff5757)',
          boxShadow: isCustom ? '0 0 0 2px var(--bg2),0 0 0 4px var(--g)' : 'inset 0 0 0 1px rgba(255,255,255,.2)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--disp)',
            fontWeight: 900,
            fontSize: 14,
            color: '#fff',
            mixBlendMode: 'difference',
            pointerEvents: 'none',
          }}
        >
          +
        </span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
        />
      </label>
    </div>
  );
}

// 9:16 monitor preview (WARM BOLD placeholder)
export function Monitor({ h = 540, fill }: { h?: number; fill?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        height: fill ? '100%' : h,
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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(125deg,#16161a 0 13px,#101013 13px 26px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120% 80% at 50% 16%, rgba(59,41,255,.16), transparent 60%)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 12,
          left: 13,
          fontFamily: 'var(--mono)',
          fontSize: 9.5,
          letterSpacing: 1,
          color: 'rgba(255,255,255,.42)',
        }}
      >
        MOTION&nbsp;BG ↻
      </span>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
          width: '78%',
          height: '66%',
          borderTopLeftRadius: 90,
          borderTopRightRadius: 90,
          background: 'repeating-linear-gradient(135deg, rgba(196,214,0,.14) 0 8px, rgba(196,214,0,.04) 8px 16px)',
          border: '1px solid rgba(196,214,0,.22)',
          borderBottom: 'none',
          display: 'flex',
          justifyContent: 'center',
          paddingTop: 20,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            letterSpacing: 1,
            color: 'rgba(196,214,0,.7)',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          前景對嘴
          <br />
          LIP-SYNC&nbsp;FG
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'repeating-linear-gradient(135deg, rgba(106,91,255,.5) 0 9px, rgba(124,58,237,.3) 9px 18px)',
          borderBottom: '1.5px solid var(--b)',
          display: 'flex',
          alignItems: 'flex-end',
          padding: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            letterSpacing: 0.5,
            color: '#fff',
            background: 'rgba(8,8,12,.6)',
            padding: '2px 5px',
            borderRadius: 3,
          }}
        >
          B-ROLL · black cat alley · 上半滿版
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 11,
          right: 12,
          fontFamily: 'var(--mono)',
          fontSize: 9.5,
          color: 'rgba(255,255,255,.8)',
          background: 'rgba(8,8,12,.55)',
          padding: '3px 7px',
          borderRadius: 4,
        }}
      >
        {DATA.timecode} / {DATA.duration}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '13%', textAlign: 'center', padding: '0 14px' }}>
        <span
          style={{
            fontFamily: "'Noto Sans CJK TC','Heiti TC',sans-serif",
            fontWeight: 900,
            fontSize: 22,
            lineHeight: 1.25,
            color: '#c4d600',
            WebkitTextStroke: '3.4px #000',
            paintOrder: 'stroke fill',
          }}
        >
          {DATA.subtitle}
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 26,
          background: 'linear-gradient(transparent,rgba(0,0,0,.78))',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 11px',
        }}
      >
        <span style={{ color: '#c4d600', fontSize: 13 }}>▶</span>
        <div style={{ flex: 1, height: 3.5, borderRadius: 2, background: 'rgba(255,255,255,.22)', position: 'relative' }}>
          <div
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '46%', borderRadius: 2, background: '#c4d600' }}
          />
          <div
            style={{
              position: 'absolute',
              left: '46%',
              top: '50%',
              width: 9,
              height: 9,
              borderRadius: 5,
              background: '#fff',
              transform: 'translate(-50%,-50%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// persistent header with phase stepper
export function AppHeader({
  phase,
  setPhase,
  action,
  onSettings,
}: {
  phase: number;
  setPhase: (n: number) => void;
  action?: ReactNode;
  onSettings: () => void;
}) {
  const steps: [string, string, string][] = [
    ['1', 'SETUP', 'WORKFLOW'],
    ['2', 'EDIT', 'NLE STUDIO'],
    ['3', 'RENDER', 'COMPOSITE'],
    ['4', 'PUBLISH', 'DISTRIBUTE'],
  ];
  return (
    <header className="vlt-hd">
      <div className="vlt-mk">V</div>
      <div className="vlt-wm">
        <b>VOLTLITES</b>
        <span>EDITOR</span>
      </div>
      <nav className="vlt-steps">
        {steps.map(([n, l, sub], i) => (
          <Fragment key={n}>
            {i > 0 && <span className="vlt-sep" />}
            <div
              className={'vlt-step' + (phase === i + 1 ? ' on' : phase > i + 1 ? ' done' : '')}
              onClick={() => setPhase(i + 1)}
            >
              <span className="sn">{phase > i + 1 ? '✓' : n}</span>
              <span className="sl">
                <b>{l}</b>
                <i>{sub}</i>
              </span>
            </div>
          </Fragment>
        ))}
      </nav>
      <div className="sp" />
      <div className="act">
        {action}
        <button className="vlt-gear" title="API Settings" onClick={onSettings}>
          ⚙
        </button>
      </div>
    </header>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const keys = ['OpenAI', 'Pexels', 'Hedra', 'ElevenLabs', 'Fish Audio'];
  return (
    <div className="vlt-ov" onClick={onClose}>
      <div className="vlt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h3>API SETTINGS</h3>
          <button className="vlt-gear" style={{ width: 32, height: 32, border: 'none' }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb vlt-scroll">
          <div className="vlt-field">
            <label>LLM Model</label>
            <select className="vlt-inp">
              <option>GPT-4o</option>
              <option>Claude 3.5 Sonnet</option>
              <option>GPT-4o mini</option>
            </select>
          </div>
          <hr className="vlt-divline" style={{ margin: '4px 0 16px' }} />
          {keys.map((k) => (
            <div className="vlt-field" key={k}>
              <label>{k} API Key</label>
              <input
                className="vlt-inp"
                type="password"
                placeholder={'sk-•••• ' + (k === 'OpenAI' ? '（已設定）' : '留空則用 .env 預設')}
                defaultValue={k === 'OpenAI' || k === 'ElevenLabs' ? '••••••••••••••••' : ''}
              />
            </div>
          ))}
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '.04em',
              color: 'var(--mut2)',
              lineHeight: 1.7,
              margin: '4px 0 0',
            }}
          >
            金鑰只儲存於本機瀏覽器，不會上傳。留空的欄位將回退到後端 .env 預設值。
          </p>
        </div>
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--bd)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button className="vlt-btn sec sm" onClick={onClose}>
            取消
          </button>
          <button className="vlt-btn pri sm" onClick={onClose}>
            儲存設定
          </button>
        </div>
      </div>
    </div>
  );
}
