import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import Kitten3d, { K3_POSES, K3_NEUTRAL, K3_FACES, K3Pose, K3PoseName, K3FaceName, K3Refs, applyKitten3d } from './__kitten3d';

/** Стенд объёмного котёнка. В приложение не входит. */

function Cat({ joints, face = 'neutral', scale = 1.5, label, uid, w = 190, h = 200, floor = 186, bg = '#ffffff' }:
  { joints: Partial<K3Pose>; face?: K3FaceName; scale?: number; label?: string; uid: string;
    w?: number; h?: number; floor?: number; bg?: string }) {
  const refs = useRef<K3Refs>({});
  useLayoutEffect(() => { applyKitten3d(refs.current, { ...K3_NEUTRAL, ...joints }, w / 2, floor, scale); });
  return (
    <div style={{ width: w, textAlign: 'center' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ background: bg, borderRadius: 10 }}>
        <Kitten3d refs={refs.current} face={face} id={uid} />
      </svg>
      {label ? <div style={{ font: '11px system-ui', color: '#64748b', marginTop: 2 }}>{label}</div> : null}
    </div>
  );
}

const POSES = Object.keys(K3_POSES) as K3PoseName[];
const FACES = Object.keys(K3_FACES) as K3FaceName[];
const STRIP: K3PoseName[] = ['sit', 'tilt', 'pawUp', 'loaf', 'groom', 'sleep', 'crouch', 'cheer', 'stretchUp', 'shy'];
const hdr: React.CSSProperties = { font: '700 15px system-ui', color: '#0f172a', margin: '18px 0 8px' };

function App() {
  return (
    <div style={{ background: 'white', padding: 18 }}>
      <div style={{ ...hdr, marginTop: 0 }}>Крупно</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Cat joints={K3_POSES.sit} face="neutral" uid="big1" w={300} h={330} floor={310} scale={2.6} label="покой" />
        <Cat joints={K3_POSES.tilt} face="curious" uid="big2" w={300} h={330} floor={310} scale={2.6} label="голову набок" />
        <Cat joints={K3_POSES.pawUp} face="happy" uid="big3" w={300} h={330} floor={310} scale={2.6} label="лапка вверх" />
      </div>

      <div style={hdr}>Позы</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {POSES.map((p) => <Cat key={p} joints={K3_POSES[p]} label={p} uid={`p-${p}`} />)}
      </div>

      <div style={hdr}>Мордочки</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {FACES.map((f) => <Cat key={f} joints={K3_POSES.sit} face={f} label={f} uid={`f-${f}`} w={165} h={175} floor={164} scale={1.35} />)}
      </div>

      <div style={hdr}>Полка 88 px — светлая тема</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#fff', padding: 6, border: '1px solid #e2e8f0' }}>
        {STRIP.map((p) => <Cat key={p} joints={K3_POSES[p]} face="happy" label={p} uid={`l-${p}`} scale={0.75} w={96} h={88} floor={85} />)}
      </div>
      <div style={hdr}>Полка 88 px — тёмная тема</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#0f172a', padding: 6 }}>
        {STRIP.map((p) => <Cat key={p} joints={K3_POSES[p]} face="happy" uid={`d-${p}`} scale={0.75} w={96} h={88} floor={85} bg="#111c30" />)}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
