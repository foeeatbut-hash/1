import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import Kitten4, { K4_POSES, K4_NEUTRAL, K4_FACES, K4Pose, K4PoseName, K4FaceName, K4Refs, applyKitten4 } from './__kitten4';

/** Стенд четвероногого котёнка. В приложение не входит. */

function Cat({ joints, face = 'happy', scale = 1.15, label, uid, w = 190, h = 130, floor = 118, bg = '#f8fafc' }:
  { joints: Partial<K4Pose>; face?: K4FaceName; scale?: number; label?: string; uid: string;
    w?: number; h?: number; floor?: number; bg?: string }) {
  const refs = useRef<K4Refs>({});
  useLayoutEffect(() => { applyKitten4(refs.current, { ...K4_NEUTRAL, ...joints }, w / 2 - 6 * scale, floor, scale); });
  return (
    <div style={{ width: w, textAlign: 'center' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ background: bg, borderRadius: 10 }}>
        <line x1="0" y1={floor + 0.5} x2={w} y2={floor + 0.5} stroke="rgba(128,128,128,.25)" />
        <Kitten4 refs={refs.current} face={face} id={uid} />
      </svg>
      {label ? <div style={{ font: '11px system-ui', color: '#64748b', marginTop: 2 }}>{label}</div> : null}
    </div>
  );
}

const POSES = Object.keys(K4_POSES) as K4PoseName[];
const FACES = Object.keys(K4_FACES) as K4FaceName[];
const STRIP: K4PoseName[] = ['sit', 'loaf', 'stand', 'walkA', 'pawUp', 'beg', 'crouch', 'sleep', 'stretchOut', 'groom'];
const hdr: React.CSSProperties = { font: '700 15px system-ui', color: '#0f172a', margin: '18px 0 8px' };

function App() {
  return (
    <div style={{ background: 'white', padding: 18 }}>
      <div style={{ ...hdr, marginTop: 0 }}>Позы</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {POSES.map((p) => <Cat key={p} joints={K4_POSES[p]} label={p} uid={`p-${p}`} />)}
      </div>

      <div style={hdr}>Мордочки</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {FACES.map((f) => <Cat key={f} joints={K4_POSES.sit} face={f} label={f} uid={`f-${f}`} w={165} h={120} floor={110} scale={1.05} />)}
      </div>

      <div style={hdr}>Полка 88 px — светлая тема</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#fff', padding: 6, border: '1px solid #e2e8f0' }}>
        {STRIP.map((p) => <Cat key={p} joints={K4_POSES[p]} label={p} uid={`l-${p}`} scale={0.72} w={120} h={88} floor={84} bg="#ffffff" />)}
      </div>
      <div style={hdr}>Полка 88 px — тёмная тема</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#0f172a', padding: 6 }}>
        {STRIP.map((p) => <Cat key={p} joints={K4_POSES[p]} uid={`d-${p}`} scale={0.72} w={120} h={88} floor={84} bg="#111c30" />)}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
