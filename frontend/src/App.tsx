// Voltlites Editor — app shell: phase routing, persistent header + stepper,
// global settings modal, and backend flow orchestration (generate / render).
import { useEffect, useRef, useState } from 'react';
import { AppHeader, SettingsModal } from './components/shared';
import { Phase1 } from './phases/Phase1';
import { Phase2 } from './phases/Phase2';
import { Phase3, Phase4 } from './phases/Phase34';
import { DATA } from './data';
import * as api from './api';
import { getStoredKeys } from './api';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function App() {
  const [phase, setPhase] = useState<number>(() => {
    const p = parseInt(localStorage.getItem('vlt-phase') || '1', 10);
    return p >= 1 && p <= 4 ? p : 1;
  });
  const [settings, setSettings] = useState(false);
  const [hasKeys, setHasKeys] = useState(() => Object.keys(getStoredKeys()).length > 0);
  const [renderedUrl, setRenderedUrl] = useState('');
  const [script, setScript] = useState(DATA.script);
  const rendering = useRef(false);

  useEffect(() => {
    localStorage.setItem('vlt-phase', String(phase));
  }, [phase]);

  // Safety net: if the user lands on the render screen via the stepper (not via
  // a real render), still advance to Publish after the animation.
  useEffect(() => {
    if (phase !== 3 || rendering.current) return;
    const t = setTimeout(() => setPhase(4), 3200);
    return () => clearTimeout(t);
  }, [phase]);

  // Phase 1 → AI generation, then into the editor.
  const handleProceed = async () => {
    await api.generate(script, 'cinematic black cat on a neon-lit alley at night');
    setPhase(2);
  };

  // Phase 2 → render the timeline; show the render screen for at least the
  // animation duration, then reveal the finished video in Publish.
  const handleRender = async () => {
    rendering.current = true;
    setPhase(3);
    const [url] = await Promise.all([api.render(), delay(2600)]);
    setRenderedUrl(url);
    rendering.current = false;
    setPhase(4);
  };

  const action =
    phase === 2 ? (
      <button className="vlt-btn blue" onClick={handleRender}>
        ▶ RENDER VIDEO
      </button>
    ) : null;

  return (
    <div className="vlt vlt-app">
      <AppHeader phase={phase} setPhase={setPhase} action={action} onSettings={() => setSettings(true)} />
      {!hasKeys && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'rgba(255,180,60,.12)', borderBottom: '1px solid var(--bd)', fontSize: 12.5, color: '#e8c06a' }}>
          <span>⚠️ 尚未設定 API 金鑰，部分功能無法使用（本機若已在 .env 設定可忽略）</span>
          <span style={{ flex: 1 }} />
          <button className="vlt-btn pri sm" style={{ padding: '3px 10px' }} onClick={() => setSettings(true)}>設定金鑰</button>
        </div>
      )}
      {phase === 1 && <Phase1 onProceed={handleProceed} script={script} setScript={setScript} />}
      {phase === 2 && <Phase2 script={script} />}
      {phase === 3 && <Phase3 />}
      {phase === 4 && <Phase4 onBack={() => setPhase(2)} videoUrl={renderedUrl} />}
      {settings && <SettingsModal onClose={() => { setSettings(false); setHasKeys(Object.keys(getStoredKeys()).length > 0); }} />}
    </div>
  );
}
