import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import PhotoKitten, { PHOTO_POSES, PHOTO_NEUTRAL, PhotoPose, PhotoPoseName, PhotoRefs, applyPhoto } from './__photo';
import { PhotoLife } from './__photoLife';
import { KITTEN_MAP, PartName } from './__photoMap';

/**
 * ЧЕРНОВИК: стенд оживлённого рисунка. В приложение не входит.
 *
 * Три вещи, которые здесь проверяются: держит ли оснастка позы, не рвутся ли
 * стыки на движении и читается ли котёнок в размер полки.
 */

const M = KITTEN_MAP;
const CHAR_H = M.h / M.unit;

function Still({ pose, scale = 1, label, uid, w = 190, h = 205, floor = 196, bg = '#f8fafc' }:
  { pose: PhotoPose; scale?: number; label?: string; uid: string;
    w?: number; h?: number; floor?: number; bg?: string }) {
  const refs = useRef<PhotoRefs>({});
  useLayoutEffect(() => { applyPhoto(refs.current, pose, w / 2, floor, scale); });
  return (
    <div style={{ width: w, textAlign: 'center' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ background: bg, borderRadius: 10 }}>
        <PhotoKitten refs={refs.current} id={uid} />
      </svg>
      {label ? <div style={{ font: '11px system-ui', color: '#64748b', marginTop: 2 }}>{label}</div> : null}
    </div>
  );
}

/** Живой котёнок: пружины, дыхание, моргание. */
function Alive({ pose, energy, gaze, scale, uid, w, h, floor, bg }:
  { pose: PhotoPose; energy: number; gaze: number; scale: number; uid: string;
    w: number; h: number; floor: number; bg?: string }) {
  const refs = useRef<PhotoRefs>({});
  const life = useRef(new PhotoLife());
  const target = useRef(pose);
  target.current = pose;
  const mood = useRef({ energy, gaze });
  mood.current = { energy, gaze };

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      const dt = now - prev; prev = now;
      life.current.mood = mood.current;
      applyPhoto(refs.current, life.current.update(dt, target.current), w / 2, floor, scale);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [w, floor, scale]);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ background: bg ?? '#f8fafc', borderRadius: 12 }}>
      <PhotoKitten refs={refs.current} id={uid} />
    </svg>
  );
}

/** Разметка вырезов поверх рисунка — этим её и подгоняют. */
function MaskDebug() {
  const names = Object.keys(M.parts) as PartName[];
  const colors: Record<string, string> = {
    tail: '#0ea5e9', tailTip: '#38bdf8', body: '#22c55e', earL: '#f97316',
    earR: '#fb923c', head: '#a855f7', pawL: '#ef4444', pawR: '#f87171',
  };
  const k = 0.42;
  return (
    <svg viewBox={`0 0 ${M.w} ${M.h}`} width={M.w * k} height={M.h * k} style={{ background: '#fff', borderRadius: 10 }}>
      <image href={M.src} x={0} y={0} width={M.w} height={M.h} opacity={0.5} />
      {names.map((n) => (
        <g key={n}>
          <path d={M.parts[n]!.clip} fill="none" stroke={colors[n]} strokeWidth={3} />
          <circle cx={M.parts[n]!.pivot[0]} cy={M.parts[n]!.pivot[1]} r={7} fill={colors[n]} />
        </g>
      ))}
      <line x1={0} y1={M.anchor[1]} x2={M.w} y2={M.anchor[1]} stroke="#0f172a" strokeDasharray="8 6" />
      <circle cx={M.anchor[0]} cy={M.anchor[1]} r={9} fill="#0f172a" />
      {(M.eyes ?? []).map((e, i) => (
        <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill="none" stroke="#0f172a" strokeWidth={3} />
      ))}
    </svg>
  );
}

const POSES = Object.keys(PHOTO_POSES) as PhotoPoseName[];
const STRIP: PhotoPoseName[] = ['sit', 'tilt', 'pawStepL', 'cheer', 'alert', 'shy', 'doze', 'proud'];
const hdr: React.CSSProperties = { font: '700 15px system-ui', color: '#0f172a', margin: '20px 0 8px' };

function App() {
  const [pose, setPose] = useState<PhotoPoseName>('sit');
  const [energy, setEnergy] = useState(1);
  const [gaze, setGaze] = useState(0);

  return (
    <div style={{ background: 'white', padding: 18, font: '13px system-ui' }}>
      <div style={{ ...hdr, marginTop: 0 }}>Живой</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Alive pose={PHOTO_POSES[pose]} energy={energy} gaze={gaze}
               scale={2.1} uid="live" w={360} h={380} floor={352} />
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <div style={{ color: '#64748b', marginBottom: 4 }}>Поза</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 420 }}>
              {POSES.map((n) => (
                <button key={n} onClick={() => setPose(n)}
                  style={{ font: '12px system-ui', padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                           border: '1px solid #cbd5e1', background: n === pose ? '#0f172a' : '#fff',
                           color: n === pose ? '#fff' : '#0f172a' }}>{n}</button>
              ))}
            </div>
          </div>
          <label>Бодрость {energy.toFixed(1)}
            <input type="range" min={0} max={2} step={0.1} value={energy}
                   onChange={(e) => setEnergy(+e.target.value)} style={{ width: 260, display: 'block' }} />
          </label>
          <label>Взгляд {gaze.toFixed(1)}
            <input type="range" min={-1} max={1} step={0.1} value={gaze}
                   onChange={(e) => setGaze(+e.target.value)} style={{ width: 260, display: 'block' }} />
          </label>
        </div>
      </div>

      <div style={hdr}>Разметка вырезов</div>
      <MaskDebug />

      <div style={hdr}>Позы</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {POSES.map((n) => <Still key={n} pose={PHOTO_POSES[n]} label={n} uid={`p-${n}`} scale={1.4} />)}
      </div>

      <div style={hdr}>Полка 88 px — светлая тема</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#fff', padding: 6, border: '1px solid #e2e8f0' }}>
        {STRIP.map((n) => <Still key={n} pose={PHOTO_POSES[n]} label={n} uid={`l-${n}`}
                                 scale={0.66} w={96} h={88} floor={84} bg="#ffffff" />)}
      </div>
      <div style={hdr}>Полка 88 px — тёмная тема</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#0f172a', padding: 6 }}>
        {STRIP.map((n) => <Still key={n} pose={PHOTO_POSES[n]} uid={`d-${n}`}
                                 scale={0.66} w={96} h={88} floor={84} bg="#111c30" />)}
      </div>
      <div style={{ color: '#64748b', marginTop: 10 }}>
        рост персонажа {CHAR_H.toFixed(0)} единиц · картинка {M.w}×{M.h}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
