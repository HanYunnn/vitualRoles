// PHASE 3 · Rendering wait  +  PHASE 4 · Publish (multi-platform).
import { useState } from 'react';

export function Phase3() {
  const stages = ['去背 Chroma key', '燒錄字幕 Burn subtitles', '混音 Mix audio', '編碼輸出 Encode'];
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 30,
        background: 'radial-gradient(120% 90% at 50% 0%,#1c160e,var(--bg))',
      }}
    >
      <div style={{ position: 'relative', width: 92, height: 92 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid rgba(196,214,0,.14)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid transparent', borderTopColor: 'var(--g)', animation: 'vltspin 0.9s linear infinite' }} />
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 22, color: 'var(--g)' }}>
          V
        </span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 10px' }}>RENDERING FINAL VIDEO…</h1>
        <p style={{ fontSize: 14, color: 'var(--mut)', margin: 0 }}>Applying chroma key, burning subtitles, and mixing audio.</p>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {stages.map((s, i) => (
          <span key={s} className="vlt-tag" style={{ animation: `vltpulse 1.6s ease ${i * 0.25}s infinite`, fontSize: 9.5 }}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function FinalPreview({ videoUrl }: { videoUrl?: string }) {
  const frame: React.CSSProperties = {
    position: 'relative',
    height: 470,
    aspectRatio: '9/16',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#08080a',
    boxShadow: '0 30px 70px rgba(0,0,0,.55)',
    outline: '1px solid rgba(255,255,255,.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  if (videoUrl) {
    return (
      <div style={frame}>
        <video src={videoUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={frame}>
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(125deg,#16161a 0 13px,#101013 13px 26px)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(110% 70% at 50% 30%, rgba(59,41,255,.18), transparent 60%)' }} />
      <span
        style={{
          position: 'relative',
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(196,214,0,.92)',
          color: 'var(--gd)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          cursor: 'pointer',
        }}
      >
        ▶
      </span>
      <span
        style={{
          position: 'absolute',
          bottom: '13%',
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: "'Noto Sans TC',sans-serif",
          fontWeight: 900,
          fontSize: 19,
          color: '#c4d600',
          WebkitTextStroke: '3px #000',
          paintOrder: 'stroke fill',
        }}
      >
        而今晚，我們要聊的，是一隻黑貓
      </span>
      <span style={{ position: 'absolute', top: 12, right: 12, fontFamily: 'var(--mono)', fontSize: 9.5, color: '#fff', background: 'rgba(0,0,0,.5)', padding: '3px 7px', borderRadius: 4 }}>
        00:10 · 1080×1920
      </span>
    </div>
  );
}

interface Platform {
  id: string;
  label: string;
  icon: string;
  color: string;
  cta: string;
}

export function Phase4({ onBack, videoUrl }: { onBack: () => void; videoUrl?: string }) {
  const platforms: Platform[] = [
    { id: 'youtube', label: 'YouTube', icon: '▶', color: '#ff0033', cta: 'PUBLISH TO YOUTUBE' },
    { id: 'instagram', label: 'Instagram', icon: '◉', color: '#e1306c', cta: 'SHARE TO REELS' },
    { id: 'tiktok', label: 'TikTok', icon: '♪', color: '#25f4ee', cta: 'POST TO TIKTOK' },
  ];
  const [pf, setPf] = useState('youtube');
  const cur = platforms.find((p) => p.id === pf)!;
  const privacy = ['公開 Public', '不公開 Unlisted', '私人 Private'];
  const [priv, setPriv] = useState(0);
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, background: 'radial-gradient(120% 80% at 50% -10%,#1c160e,var(--bg))' }}>
      {/* left — preview */}
      <div
        style={{
          width: 460,
          flex: '0 0 460px',
          borderRight: '1px solid var(--bd)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: 30,
        }}
      >
        <span className="vlt-tag g">渲染完成 · final_kuro_ep01.mp4</span>
        <FinalPreview videoUrl={videoUrl} />
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="vlt-btn sec" onClick={onBack}>
            ← BACK TO EDIT
          </button>
          <a
            href={videoUrl || undefined}
            download="final_kuro_ep01.mp4"
            className="vlt-btn pri"
            style={{ textDecoration: 'none', pointerEvents: videoUrl ? 'auto' : 'none', opacity: videoUrl ? 1 : 0.4 }}
          >
            ↓ DOWNLOAD MP4
          </a>
        </div>
      </div>
      {/* right — publish form */}
      <div className="vlt-scroll" style={{ flex: 1, overflow: 'auto', padding: '34px 40px' }}>
        <span className="vlt-tag" style={{ marginBottom: 10, display: 'inline-flex' }}>
          PHASE 4 · PUBLISH
        </span>
        <h1 style={{ fontFamily: 'var(--disp)', fontWeight: 900, fontSize: 32, letterSpacing: '-.02em', margin: '8px 0 22px' }}>發布到社群</h1>

        {/* platform tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setPf(p.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '13px 15px',
                borderRadius: 12,
                cursor: 'pointer',
                border: 'none',
                background: pf === p.id ? 'var(--pan2)' : 'var(--pan)',
                color: pf === p.id ? '#fff' : 'var(--mut)',
                boxShadow: pf === p.id ? `inset 0 0 0 1.5px ${p.color}` : 'inset 0 0 0 1px var(--bd)',
                fontFamily: 'var(--disp)',
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: p.color,
                  color: p.id === 'tiktok' ? '#000' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                }}
              >
                {p.icon}
              </span>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ maxWidth: 540 }}>
          <div className="vlt-field">
            <label>Video Title</label>
            <input className="vlt-inp" defaultValue="深夜黑貓物語 ｜ 看見牠就會交好運？#shorts" />
          </div>
          <div className="vlt-field">
            <label>Description</label>
            <textarea
              className="vlt-inp vlt-scroll"
              style={{ height: 96, resize: 'none', lineHeight: 1.6 }}
              defaultValue={'深夜城市裡的一隻黑貓，與牠帶來的好運傳說。\n\n#黑貓 #都市傳說 #熙 #AI虛擬角色 #shorts'}
            />
          </div>
          <div className="vlt-field">
            <label>Privacy</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {privacy.map((p, i) => (
                <button
                  key={p}
                  onClick={() => setPriv(i)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 9,
                    cursor: 'pointer',
                    border: 'none',
                    fontFamily: 'var(--body)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: priv === i ? 'rgba(196,214,0,.12)' : 'var(--card)',
                    color: priv === i ? 'var(--g)' : 'var(--mut)',
                    boxShadow: priv === i ? 'inset 0 0 0 1.5px var(--g)' : 'inset 0 0 0 1px var(--bd)',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          {pf !== 'youtube' && (
            <p style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.04em', color: 'var(--mut2)', lineHeight: 1.7, margin: '4px 0 18px' }}>
              {cur.label} 串接尚在規劃中（策略文件待討論項）。介面已預留分頁，串接後即可一鍵發布。
            </p>
          )}
          <button
            className="vlt-btn xl"
            style={{ width: '100%', justifyContent: 'center', background: cur.color, color: pf === 'tiktok' ? '#000' : '#fff', marginTop: 8, boxShadow: `0 6px 22px ${cur.color}55` }}
          >
            <span style={{ fontSize: 16 }}>{cur.icon}</span> {cur.cta}
          </button>
          <p style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.05em', color: 'var(--mut2)', marginTop: 14 }}>
            將透過 {cur.label} OAuth 授權上傳
          </p>
        </div>
      </div>
    </div>
  );
}
