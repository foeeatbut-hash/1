import React from 'react';
import { FACES, Face, FaceName, Joint } from './poses';

/**
 * Тело Флакси: голова с антенной и ушками, корпус с нагрудным экранчиком,
 * руки с плечом, локтем и варежкой, ноги с бедром, коленом и ботинком.
 *
 * Каждая подвижная часть — своя <g> с известной точкой вращения. Позы сюда
 * не передаются: их выставляет проигрыватель напрямую в узлы через ссылки,
 * без перерисовки React. Здесь только форма и лицо.
 *
 * Пропорции выбраны «детские»: голова больше половины роста, крупные глаза,
 * короткие конечности, широкие ботинки, ни одного острого угла.
 */

// ── Геометрия (начало координат — между ступнями, вверх отрицательный) ──
export const RIG_HEIGHT = 86;      // от пола до кончика антенны
const HIP_Y = -24;
const KNEE_Y = -13;
const SHOULDER_Y = -42;
const ELBOW_Y = -31;
const NECK_Y = -48;

/** Точки вращения суставов: нужны и здесь, и проигрывателю. */
export const PIVOTS: Record<Joint, [number, number]> = {
  bodyY: [0, HIP_Y], lean: [0, HIP_Y], squash: [0, HIP_Y],
  headTilt: [0, NECK_Y], headTurn: [0, NECK_Y],
  shoulderL: [-15, SHOULDER_Y], elbowL: [-15, ELBOW_Y],
  shoulderR: [15, SHOULDER_Y], elbowR: [15, ELBOW_Y],
  hipL: [-6, HIP_Y], kneeL: [-6, KNEE_Y],
  hipR: [6, HIP_Y], kneeR: [6, KNEE_Y],
  antenna: [0, -75],
};

export type RigRefs = Partial<Record<Joint | 'root' | 'body' | 'pupils' | 'shadow', SVGGElement | null>>;

interface Props {
  refs: RigRefs;
  face: FaceName;
  blink: boolean;
  /** Значок на нагрудном экранчике — им робот «говорит» о состоянии. */
  chest?: 'idle' | 'work' | 'wait' | 'ok' | 'love';
  idPrefix?: string;
}

const C = {
  bodyTop: 'oklch(0.74 0.13 163)',
  bodyBot: 'oklch(0.54 0.13 163)',
  limb: 'oklch(0.62 0.12 163)',
  limbDark: 'oklch(0.50 0.11 163)',
  outline: 'oklch(0.42 0.10 163)',
  screen: 'oklch(0.20 0.03 163)',
  glow: 'oklch(0.92 0.14 163)',
  bulb: 'oklch(0.82 0.17 150)',
  cheek: 'oklch(0.72 0.13 20)',
};

export default function Rig({ refs, face, blink, chest = 'idle', idPrefix = 'flx' }: Props) {
  const f: Face = FACES[face];
  const eye = blink && f.eye !== 'spiral' ? 'closed' : f.eye;

  const set = (k: keyof RigRefs) => (el: SVGGElement | null) => { refs[k] = el; };

  return (
    <g ref={set('root')}>
      <defs>
        <linearGradient id={`${idPrefix}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.bodyTop} />
          <stop offset="100%" stopColor={C.bodyBot} />
        </linearGradient>
        <radialGradient id={`${idPrefix}-shadow`}>
          <stop offset="0%" stopColor="black" stopOpacity="0.28" />
          <stop offset="100%" stopColor="black" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Тень: сжимается в прыжке — без неё робот висит в воздухе */}
      <g ref={set('shadow')}>
        <ellipse cx="0" cy="1" rx="19" ry="4.4" fill={`url(#${idPrefix}-shadow)`} />
      </g>

      {/* Дальняя нога — рисуем первой, чтобы уходила за корпус */}
      <Leg side={1} set={set} />
      <Leg side={-1} set={set} />

      {/* Корпус со всем, что выше пояса */}
      <g ref={set('body')}>
        <Arm side={1} set={set} idPrefix={idPrefix} />

        <rect x="-15" y="-46" width="30" height="23" rx="10" fill={`url(#${idPrefix}-body)`} />
        <rect x="-15" y="-46" width="30" height="23" rx="10" fill="none" stroke={C.outline} strokeWidth="1" opacity="0.35" />
        {/* Воротник */}
        <rect x="-9" y="-48.5" width="18" height="4.5" rx="2.2" fill={C.limbDark} />
        {/* Нагрудный экранчик */}
        <rect x="-9" y="-41" width="18" height="12" rx="5" fill={C.screen} opacity="0.9" />
        <ChestIcon kind={chest} />

        <Arm side={-1} set={set} idPrefix={idPrefix} />

        {/* ── Голова ── */}
        <g ref={set('headTilt')}>
          <g ref={set('headTurn')}>
            {/* Антенна */}
            <g ref={set('antenna')}>
              <line x1="0" y1="-74" x2="0" y2="-81" stroke={C.limbDark} strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="0" cy="-83.2" r="3.2" fill={C.bulb} className="flux-flx-bulb" />
            </g>
            {/* Ушки */}
            <rect x="-24.5" y="-66" width="5" height="11" rx="2.5" fill={C.limbDark} />
            <rect x="19.5" y="-66" width="5" height="11" rx="2.5" fill={C.limbDark} />
            {/* Череп */}
            <rect x="-20" y="-75" width="40" height="28" rx="12" fill={`url(#${idPrefix}-body)`} />
            <rect x="-20" y="-75" width="40" height="28" rx="12" fill="none" stroke={C.outline} strokeWidth="1" opacity="0.35" />
            {/* Блик по корпусу головы — делает поверхность объёмной */}
            <rect x="-15" y="-72" width="12" height="4" rx="2" fill="white" opacity="0.18" />
            {/* Экран лица */}
            <rect x="-14.5" y="-70" width="29" height="18.5" rx="8" fill={C.screen} opacity="0.94" />

            <g ref={set('pupils')}>
              <Eyes shape={eye} />
            </g>
            <Brows tilt={f.brow} y={f.browY} />
            <Mouth shape={f.mouth} />
            {f.cheeks && (
              <>
                <ellipse cx="-11.5" cy="-56" rx="3" ry="2.1" fill={C.cheek} opacity="0.5" />
                <ellipse cx="11.5" cy="-56" rx="3" ry="2.1" fill={C.cheek} opacity="0.5" />
              </>
            )}
            <Extra kind={f.extra || 'none'} />
          </g>
        </g>
      </g>
    </g>
  );
}

// ── Части тела ─────────────────────────────────────────────────────────────

function Leg({ side, set }: { side: 1 | -1; set: (k: keyof RigRefs) => (el: SVGGElement | null) => void }) {
  const x = 6 * side;
  const hip = side === -1 ? 'hipL' : 'hipR';
  const knee = side === -1 ? 'kneeL' : 'kneeR';
  return (
    <g ref={set(hip)}>
      <rect x={x - 4} y={HIP_Y} width="8" height="12" rx="4" fill={C.limb} stroke={C.outline} strokeWidth="0.7" strokeOpacity="0.35" />
      <g ref={set(knee)}>
        <rect x={x - 3.5} y={KNEE_Y} width="7" height="9" rx="3.5" fill={C.limb} stroke={C.outline} strokeWidth="0.7" strokeOpacity="0.35" />
        {/* Ботинок: широкий, чтобы робот твёрдо стоял */}
        <path d={`M${x - 5.5},-6 h7 a3,3 0 0 1 3,3 v3 h-13 v-3 a3,3 0 0 1 3,-3 z`} fill={C.limbDark} />
      </g>
    </g>
  );
}

function Arm({ side, set, idPrefix }: { side: 1 | -1; set: (k: keyof RigRefs) => (el: SVGGElement | null) => void; idPrefix: string }) {
  const x = 15 * side;
  const shoulder = side === -1 ? 'shoulderL' : 'shoulderR';
  const elbow = side === -1 ? 'elbowL' : 'elbowR';
  return (
    <g ref={set(shoulder)}>
      <circle cx={x} cy={SHOULDER_Y} r="4" fill={C.limbDark} />
      <rect x={x - 3.4} y={SHOULDER_Y} width="6.8" height="12" rx="3.4" fill={C.limb} stroke={C.outline} strokeWidth="0.7" strokeOpacity="0.35" />
      <g ref={set(elbow)}>
        <rect x={x - 3.1} y={ELBOW_Y} width="6.2" height="11" rx="3.1" fill={C.limb} stroke={C.outline} strokeWidth="0.7" strokeOpacity="0.35" />
        {/* Варежка: ладонь и большой палец — ею робот берёт предметы */}
        <circle cx={x} cy={-19.5} r="4.4" fill={C.limbDark} stroke={C.outline} strokeWidth="0.7" strokeOpacity="0.3" />
        <circle cx={x - 3.4 * side} cy={-21.5} r="1.9" fill={C.limbDark} />
      </g>
    </g>
  );
}

function ChestIcon({ kind }: { kind: 'idle' | 'work' | 'wait' | 'ok' | 'love' }) {
  const col = C.glow;
  if (kind === 'work') return <path d="M-3,-35 l3,-3 l3,3 l-3,3 z" fill={col} opacity="0.8" />;
  if (kind === 'wait') return (
    <>
      <circle cx="-3.5" cy="-35" r="1.2" fill={col} opacity="0.8" className="flux-flx-dot1" />
      <circle cx="0" cy="-35" r="1.2" fill={col} opacity="0.8" className="flux-flx-dot2" />
      <circle cx="3.5" cy="-35" r="1.2" fill={col} opacity="0.8" className="flux-flx-dot3" />
    </>
  );
  if (kind === 'ok') return <path d="M-3.5,-35 l2.5,2.5 l4.5,-5" stroke={col} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  if (kind === 'love') return <path d="M0,-32.5 c-4,-3 -4,-6.5 -1.6,-6.5 c1,0 1.6,0.8 1.6,1.4 c0,-0.6 0.6,-1.4 1.6,-1.4 c2.4,0 2.4,3.5 -1.6,6.5 z" fill="oklch(0.72 0.16 20)" opacity="0.9" />;
  return <rect x="-4.5" y="-35.8" width="9" height="1.6" rx="0.8" fill={col} opacity="0.55" />;
}

// ── Лицо ───────────────────────────────────────────────────────────────────

function Eyes({ shape }: { shape: string }) {
  const g = C.glow;
  if (shape === 'closed') return (
    <>
      <rect x="-11" y="-61.6" width="8" height="2.2" rx="1.1" fill={g} />
      <rect x="3" y="-61.6" width="8" height="2.2" rx="1.1" fill={g} />
    </>
  );
  if (shape === 'arc') return (
    <>
      <path d="M-11,-59.4 q4,-5.4 8,0" stroke={g} strokeWidth="2.3" fill="none" strokeLinecap="round" />
      <path d="M3,-59.4 q4,-5.4 8,0" stroke={g} strokeWidth="2.3" fill="none" strokeLinecap="round" />
    </>
  );
  if (shape === 'squint') return (
    <>
      <path d="M-11.4,-60.6 q4.4,2.6 8.8,0" stroke={g} strokeWidth="2.3" fill="none" strokeLinecap="round" />
      <path d="M2.6,-60.6 q4.4,2.6 8.8,0" stroke={g} strokeWidth="2.3" fill="none" strokeLinecap="round" />
    </>
  );
  if (shape === 'spiral') return (
    <>
      <path d="M-7,-60.6 a2.6,2.6 0 1 1 -2.4,-1.6 a1.5,1.5 0 1 0 1.4,1" stroke={g} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M7,-60.6 a2.6,2.6 0 1 1 -2.4,-1.6 a1.5,1.5 0 1 0 1.4,1" stroke={g} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </>
  );
  const r = shape === 'wide' ? 5.4 : 4.6;
  return (
    <>
      <circle cx="-7" cy="-60.4" r={r} fill={g} />
      <circle cx="7" cy="-60.4" r={r} fill={g} />
      <circle cx="-5.4" cy="-62" r="1.6" fill="white" opacity="0.95" />
      <circle cx="8.6" cy="-62" r="1.6" fill="white" opacity="0.95" />
    </>
  );
}

function Brows({ tilt, y }: { tilt: number; y: number }) {
  return (
    <>
      <rect x="-11.5" y={-68.4 + y} width="9" height="2" rx="1" fill={C.glow} opacity="0.72"
        transform={`rotate(${tilt} -7 ${-67.4 + y})`} />
      <rect x="2.5" y={-68.4 + y} width="9" height="2" rx="1" fill={C.glow} opacity="0.72"
        transform={`rotate(${-tilt} 7 ${-67.4 + y})`} />
    </>
  );
}

function Mouth({ shape }: { shape: string }) {
  const g = C.glow;
  const s = { stroke: g, strokeWidth: 1.9, fill: 'none', strokeLinecap: 'round' as const };
  switch (shape) {
    case 'grin':  return <path d="M-5.6,-56.6 q5.6,5.6 11.2,0" {...s} strokeWidth={2.1} />;
    case 'open':  return <ellipse cx="0" cy="-54.6" rx="4.2" ry="3.4" fill={g} />;
    case 'small': return <circle cx="0" cy="-54.2" r="2.2" fill={g} />;
    case 'flat':  return <path d="M-4,-54.4 h8" {...s} />;
    case 'wave':  return <path d="M-5.5,-54.6 q2.7,-2.6 5.5,0 t5.5,0" {...s} strokeWidth={1.7} />;
    case 'sad':   return <path d="M-5,-52.8 q5,-4.4 10,0" {...s} />;
    case 'none':  return null;
    default:      return <path d="M-4.5,-56 q4.5,3.4 9,0" {...s} />;
  }
}

function Extra({ kind }: { kind: string }) {
  const g = C.glow;
  switch (kind) {
    case 'sweat':
      return <path d="M17,-70 q3,4 0,6 q-3,-2 0,-6 z" fill="oklch(0.80 0.09 230)" opacity="0.85" className="flux-flx-sweat" />;
    case 'spark':
      return (
        <>
          <path d="M22,-74 l1.4,3.2 l3.2,1.4 l-3.2,1.4 l-1.4,3.2 l-1.4,-3.2 l-3.2,-1.4 l3.2,-1.4 z" fill={g} opacity="0.85" className="flux-flx-spark1" />
          <path d="M-23,-70 l1,2.3 l2.3,1 l-2.3,1 l-1,2.3 l-1,-2.3 l-2.3,-1 l2.3,-1 z" fill={g} opacity="0.7" className="flux-flx-spark2" />
        </>
      );
    case 'question':
      return <text x="20" y="-72" fontSize="11" fontWeight="700" fill={g} opacity="0.85" className="flux-flx-pop">?</text>;
    case 'excl':
      return <text x="20" y="-72" fontSize="11" fontWeight="700" fill="oklch(0.82 0.15 60)" className="flux-flx-pop">!</text>;
    case 'zzz':
      return (
        <>
          <text x="19" y="-76" fontSize="9" fontWeight="700" fill={g} opacity="0.75" className="flux-robot-z">z</text>
          <text x="25" y="-82" fontSize="7" fontWeight="700" fill={g} opacity="0.6" className="flux-robot-z2">z</text>
        </>
      );
    case 'stars':
      return (
        <>
          <circle cx="-16" cy="-78" r="1.8" fill="oklch(0.85 0.14 90)" className="flux-flx-orbit1" />
          <circle cx="16" cy="-78" r="1.8" fill="oklch(0.85 0.14 90)" className="flux-flx-orbit2" />
        </>
      );
    case 'heart':
      return <path d="M20,-72 c-4.5,-3.4 -4.5,-7.4 -1.8,-7.4 c1.1,0 1.8,0.9 1.8,1.6 c0,-0.7 0.7,-1.6 1.8,-1.6 c2.7,0 2.7,4 -1.8,7.4 z" fill="oklch(0.70 0.17 15)" opacity="0.9" className="flux-flx-heart" />;
    default:
      return null;
  }
}
