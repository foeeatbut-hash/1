import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import Kitten, { K_POSES, K_NEUTRAL, K_FACES, K_COATS, KPalette, KPose, KPoseName, KFaceName, KRefs, applyKitten } from './__kitten';
import NextRig, { N_POSES, N_NEUTRAL, NPoseName, NFaceName, NRefs, applyNext } from './__next';

/** Стенд котёнка и сравнение с роботом. В приложение не входит. */

function Cat({ joints, face = 'happy', scale = 1.25, label, uid, w = 150, h = 175, floor = 162, bg = '#f8fafc', pal }:
  { joints: Partial<KPose>; face?: KFaceName; scale?: number; label?: string; uid: string;
    w?: number; h?: number; floor?: number; bg?: string; pal?: KPalette }) {
  const refs = useRef<KRefs>({});
  useLayoutEffect(() => { applyKitten(refs.current, { ...K_NEUTRAL, ...joints }, w / 2, floor, scale); });
  return (
    <div style={{ width: w, textAlign: 'center' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ background: bg, borderRadius: 10 }}>
        <line x1="0" y1={floor + 0.5} x2={w} y2={floor + 0.5} stroke="rgba(128,128,128,.25)" />
        <Kitten refs={refs.current} face={face} id={uid} pal={pal} />
      </svg>
      {label ? <div style={{ font: '11px system-ui', color: '#64748b', marginTop: 2 }}>{label}</div> : null}
    </div>
  );
}

function Bot({ pose, face = 'happy', scale = 1.25, uid, w = 150, h = 175, floor = 162, bg = '#f8fafc' }:
  { pose: NPoseName; face?: NFaceName; scale?: number; uid: string;
    w?: number; h?: number; floor?: number; bg?: string }) {
  const refs = useRef<NRefs>({});
  useLayoutEffect(() => { applyNext(refs.current, { ...N_NEUTRAL, ...N_POSES[pose] }, w / 2, floor, scale); });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ background: bg, borderRadius: 10 }}>
      <line x1="0" y1={floor + 0.5} x2={w} y2={floor + 0.5} stroke="rgba(128,128,128,.25)" />
      <NextRig refs={refs.current} face={face} id={uid} />
    </svg>
  );
}

const POSES = Object.keys(K_POSES) as KPoseName[];
const FACES = Object.keys(K_FACES) as KFaceName[];
const STRIP: KPoseName[] = ['sit', 'loaf', 'stand', 'wave', 'paw', 'pounce', 'walkA', 'lounge', 'sleep', 'stretchUp'];
const PAIR: [NPoseName, KPoseName, string][] = [
  ['stand', 'stand', 'стоит'], ['sit', 'sit', 'сидит'], ['wave', 'wave', 'машет'],
  ['kick', 'kick', 'бьёт по мячу'], ['sleep', 'sleep', 'спит'], ['cheer', 'cheer', 'радуется'],
];
const hdr: React.CSSProperties = { font: '700 15px system-ui', color: '#0f172a', margin: '18px 0 8px' };
const tag: React.CSSProperties = { font: '700 11px system-ui', color: '#64748b', width: 62, paddingTop: 70 };

function App() {
  return (
    <div style={{ background: 'white', padding: 18 }}>
      <div style={{ ...hdr, marginTop: 0 }}>Робот и котёнок рядом</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={tag}>РОБОТ</div>
        {PAIR.map(([n], i) => <Bot key={i} pose={n} uid={`b${i}`} />)}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
        <div style={tag}>КОТЁНОК</div>
        {PAIR.map(([, k, cap], i) => <Cat key={i} joints={K_POSES[k]} uid={`c${i}`} label={cap} />)}
      </div>

      <div style={hdr}>Окрасы: рыжий табби, дымчатый, кремово-мятный</div>
      {(['ginger', 'smoke', 'mint'] as const).map((coat) => (
        <div key={coat} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
          <div style={{ ...tag, paddingTop: 60 }}>{coat}</div>
          {(['sit', 'stand', 'loaf', 'wave', 'pounce'] as KPoseName[]).map((p) => (
            <Cat key={p} joints={K_POSES[p]} uid={`${coat}-${p}`} pal={K_COATS[coat]} w={130} h={150} floor={140} scale={1.05} />
          ))}
          <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid #e2e8f0', padding: 4, marginLeft: 12 }}>
            {(['sit', 'wave'] as KPoseName[]).map((p) => (
              <Cat key={p} joints={K_POSES[p]} uid={`${coat}s-${p}`} pal={K_COATS[coat]} scale={0.68} w={80} h={88} floor={84} bg="#ffffff" />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 3, background: '#0f172a', padding: 4 }}>
            {(['sit', 'wave'] as KPoseName[]).map((p) => (
              <Cat key={p} joints={K_POSES[p]} uid={`${coat}d-${p}`} pal={K_COATS[coat]} scale={0.68} w={80} h={88} floor={84} bg="#111c30" />
            ))}
          </div>
        </div>
      ))}

      <div style={hdr}>Позы котёнка</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {POSES.map((p) => <Cat key={p} joints={K_POSES[p]} label={p} uid={`kp-${p}`} />)}
      </div>

      <div style={hdr}>Мордочки</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {FACES.map((f) => (
          <Cat key={f} joints={K_POSES.sit} face={f} label={f} uid={`kf-${f}`} w={130} h={150} floor={140} scale={1.1} />
        ))}
      </div>

      <div style={hdr}>Полка 88 px — светлая и тёмная тема</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#fff', padding: 6, border: '1px solid #e2e8f0' }}>
        {STRIP.map((p) => <Cat key={p} joints={K_POSES[p]} label={p} uid={`kl-${p}`} scale={0.68} w={100} h={88} floor={84} bg="#ffffff" />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#0f172a', padding: 6, marginTop: 6 }}>
        {STRIP.map((p) => <Cat key={p} joints={K_POSES[p]} uid={`kd-${p}`} scale={0.68} w={100} h={88} floor={84} bg="#111c30" />)}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
