import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import OldRig, { RigRefs } from './rig';
import { POSES, PoseName, FaceName } from './poses';
import { applySnapshot, poseSnapshot } from './apply';
import NextRig, { N_POSES, N_NEUTRAL, NPoseName, NFaceName, NRefs, applyNext } from './__next';

/** Сравнение старого и нового Флакси. Стенд, в приложение не входит. */

function Old({ pose, face, scale, uid, w, h, floor, bg }:
  { pose: PoseName; face: FaceName; scale: number; uid: string; w: number; h: number; floor: number; bg: string }) {
  const refs = useRef<RigRefs>({});
  useLayoutEffect(() => { applySnapshot({ refs: refs.current as any, floor, scale }, poseSnapshot(POSES[pose], w / 2)); });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ background: bg, borderRadius: 8 }}>
      <line x1="0" y1={floor + 0.5} x2={w} y2={floor + 0.5} stroke="rgba(128,128,128,.25)" />
      <OldRig refs={refs.current} face={face} blink={false} idPrefix={uid} />
    </svg>
  );
}

function New({ pose, face, scale, uid, w, h, floor, bg }:
  { pose: NPoseName; face: NFaceName; scale: number; uid: string; w: number; h: number; floor: number; bg: string }) {
  const refs = useRef<NRefs>({});
  useLayoutEffect(() => { applyNext(refs.current, { ...N_NEUTRAL, ...N_POSES[pose] }, w / 2, floor, scale); });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ background: bg, borderRadius: 8 }}>
      <line x1="0" y1={floor + 0.5} x2={w} y2={floor + 0.5} stroke="rgba(128,128,128,.25)" />
      <NextRig refs={refs.current} face={face} id={uid} />
    </svg>
  );
}

const PAIRS: [PoseName, NPoseName, string][] = [
  ['stand', 'stand', 'стоит'],
  ['sit', 'sit', 'сидит'],
  ['wave', 'wave', 'машет'],
  ['kick', 'kick', 'бьёт по мячу'],
  ['cheer', 'cheer', 'радуется'],
  ['lounge', 'lounge', 'на диване'],
];
const FACES: [FaceName, NFaceName][] = [
  ['neutral', 'neutral'], ['happy', 'happy'], ['delight', 'delight'],
  ['curious', 'curious'], ['sad', 'sad'], ['love', 'love'], ['sleep', 'sleep'],
];

const cap: React.CSSProperties = { font: '600 12px system-ui', color: '#334155', textAlign: 'center', marginTop: 3 };
const hdr: React.CSSProperties = { font: '700 15px system-ui', color: '#0f172a', margin: '18px 0 8px' };
const tag: React.CSSProperties = { font: '700 11px system-ui', color: '#64748b', width: 58, paddingTop: 60 };

function App() {
  return (
    <div style={{ background: 'white', padding: 18, width: 1000 }}>
      <div style={{ ...hdr, marginTop: 0 }}>Было → стало</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={tag}>БЫЛО</div>
        {PAIRS.map(([o], i) => (
          <div key={i}><Old pose={o} face="happy" scale={1.35} uid={`o${i}`} w={130} h={150} floor={140} bg="#f8fafc" /></div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
        <div style={tag}>СТАЛО</div>
        {PAIRS.map(([, n], i) => (
          <div key={i}>
            <New pose={n} face="happy" scale={1.15} uid={`n${i}`} w={130} h={150} floor={140} bg="#f8fafc" />
            <div style={cap}>{PAIRS[i][2]}</div>
          </div>
        ))}
      </div>

      <div style={hdr}>Лица</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ ...tag, paddingTop: 40 }}>БЫЛО</div>
        {FACES.map(([o], i) => (
          <Old key={i} pose="stand" face={o} scale={2.2} uid={`of${i}`} w={110} h={110} floor={196} bg="#f8fafc" />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
        <div style={{ ...tag, paddingTop: 40 }}>СТАЛО</div>
        {FACES.map(([, n], i) => (
          <div key={i}>
            <New pose="stand" face={n} scale={1.72} uid={`nf${i}`} w={110} h={110} floor={186} bg="#f8fafc" />
            <div style={cap}>{n}</div>
          </div>
        ))}
      </div>

      <div style={hdr}>Настоящий размер в шапке чата (88 px)</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div style={{ ...tag, paddingTop: 0 }}>БЫЛО</div>
        {(['sit', 'wave', 'kick', 'lounge'] as PoseName[]).map((p, i) => (
          <Old key={i} pose={p} face="happy" scale={0.85} uid={`os${i}`} w={100} h={88} floor={84} bg="#ffffff" />
        ))}
        <div style={{ ...tag, paddingTop: 0, marginLeft: 20 }}>СТАЛО</div>
        {(['sit', 'wave', 'kick', 'lounge'] as NPoseName[]).map((p, i) => (
          <New key={i} pose={p} face="happy" scale={0.74} uid={`ns${i}`} w={100} h={88} floor={84} bg="#ffffff" />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6, background: '#0f172a', padding: 6 }}>
        <div style={{ ...tag, paddingTop: 0, color: '#94a3b8' }}>БЫЛО</div>
        {(['sit', 'wave', 'kick', 'lounge'] as PoseName[]).map((p, i) => (
          <Old key={i} pose={p} face="happy" scale={0.85} uid={`od${i}`} w={100} h={88} floor={84} bg="#111c30" />
        ))}
        <div style={{ ...tag, paddingTop: 0, marginLeft: 20, color: '#94a3b8' }}>СТАЛО</div>
        {(['sit', 'wave', 'kick', 'lounge'] as NPoseName[]).map((p, i) => (
          <New key={i} pose={p} face="happy" scale={0.74} uid={`nd${i}`} w={100} h={88} floor={84} bg="#111c30" />
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
