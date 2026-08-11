import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import NextRig, { N_POSES, N_NEUTRAL, N_FACES, NPose, NPoseName, NFaceName, NRefs, applyNext } from './__next';

/** Временный стенд для разглядывания робота. Не входит в приложение. */

function Cell({ joints, face = 'happy', scale = 1.3, label, uid, w = 150, h = 165, floor = 152, bg = '#f8fafc' }:
  { joints: Partial<NPose>; face?: NFaceName; scale?: number; label: string; uid: string;
    w?: number; h?: number; floor?: number; bg?: string }) {
  const refs = useRef<NRefs>({});
  useLayoutEffect(() => { applyNext(refs.current, { ...N_NEUTRAL, ...joints }, w / 2, floor, scale); });
  return (
    <div style={{ width: w, textAlign: 'center' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ background: bg, borderRadius: 10 }}>
        <line x1="0" y1={floor + 0.5} x2={w} y2={floor + 0.5} stroke="rgba(128,128,128,.25)" />
        <NextRig refs={refs.current} face={face} id={uid} />
      </svg>
      <div style={{ font: '11px system-ui', color: '#64748b', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const POSE_LIST = Object.keys(N_POSES) as NPoseName[];
const FACE_LIST = Object.keys(N_FACES) as NFaceName[];
const STRIP: NPoseName[] = ['sit', 'sitSwing', 'stand', 'wave', 'walkA', 'kick', 'hold', 'sip', 'lounge', 'sleep', 'cheer', 'think'];

function App() {
  return (
    <div style={{ background: 'white', padding: 16 }}>
      <div style={{ font: '600 14px system-ui', margin: '4px 0 8px' }}>Позы</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {POSE_LIST.map((p) => <Cell key={p} joints={N_POSES[p]} label={p} uid={`p-${p}`} />)}
      </div>

      <div style={{ font: '600 14px system-ui', margin: '18px 0 8px' }}>Лица</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {FACE_LIST.map((f) => (
          <Cell key={f} joints={N_POSES.stand} face={f} label={f} uid={`f-${f}`} w={130} h={140} floor={130} scale={1.15} />
        ))}
      </div>

      <div style={{ font: '600 14px system-ui', margin: '18px 0 8px' }}>Полка 88 px — светлая тема</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#ffffff', padding: 6, border: '1px solid #e2e8f0' }}>
        {STRIP.map((p) => <Cell key={p} joints={N_POSES[p]} label={p} uid={`l-${p}`} scale={0.74} w={100} h={88} floor={84} bg="#ffffff" />)}
      </div>

      <div style={{ font: '600 14px system-ui', margin: '18px 0 8px' }}>Полка 88 px — тёмная тема</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#0f172a', padding: 6 }}>
        {STRIP.map((p) => <Cell key={p} joints={N_POSES[p]} label={p} uid={`d-${p}`} scale={0.74} w={100} h={88} floor={84} bg="#111c30" />)}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
