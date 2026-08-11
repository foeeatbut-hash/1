import React from 'react';

/**
 * ЧЕРНОВИК нового Флакси. Не входит в приложение — только стенд.
 *
 * Пропорции «детские»: голова 54 из 100 единиц роста, туловище маленькое,
 * конечности короткие, кисти и ступни крупные. Лицо светлое, глаза тёмные —
 * наоборот к прежнему тёмному визору с зелёными огоньками.
 */

export const H = 100;

const HIP_Y = -24;
const KNEE_Y = -15;
const SHOULDER_Y = -42;
const ELBOW_Y = -31;
const NECK_Y = -46;   // низ головы, вокруг него наклон

export const NPIVOTS: Record<string, [number, number]> = {
  headTilt: [0, NECK_Y], headTurn: [0, NECK_Y],
  shoulderL: [-19, SHOULDER_Y], elbowL: [-19, ELBOW_Y],
  shoulderR: [19, SHOULDER_Y], elbowR: [19, ELBOW_Y],
  hipL: [-7, HIP_Y], kneeL: [-7, KNEE_Y],
  hipR: [7, HIP_Y], kneeR: [7, KNEE_Y],
  antenna: [0, -98], lean: [0, HIP_Y],
};

const C = {
  shell: 'oklch(0.97 0.021 160)',      // светлая «скорлупа» головы
  shellEdge: 'oklch(0.86 0.05 162)',   // её контур
  shade: 'oklch(0.91 0.035 162)',      // тень под подбородком
  cap: 'oklch(0.74 0.135 163)',        // шапка-шлем и корпус
  capDark: 'oklch(0.65 0.135 164)',
  limb: 'oklch(0.60 0.115 165)',
  limbDark: 'oklch(0.50 0.10 167)',    // кисти и ботинки
  ink: 'oklch(0.32 0.045 250)',        // глаза и рот
  blush: 'oklch(0.76 0.115 25)',
  bulb: 'oklch(0.87 0.16 150)',
  bib: 'oklch(0.93 0.03 162)',
};

export type NJoint =
  | 'bodyY' | 'lean' | 'squash' | 'headTilt' | 'headTurn'
  | 'shoulderL' | 'elbowL' | 'shoulderR' | 'elbowR'
  | 'hipL' | 'kneeL' | 'hipR' | 'kneeR' | 'antenna';

export type NPose = Record<NJoint, number>;

export const N_NEUTRAL: NPose = {
  bodyY: 0, lean: 0, squash: 1, headTilt: 0, headTurn: 0,
  shoulderL: 8, elbowL: 6, shoulderR: -8, elbowR: -6,
  hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, antenna: 0,
};

const p = (o: Partial<NPose>): NPose => ({ ...N_NEUTRAL, ...o });

export const N_POSES = {
  stand: N_NEUTRAL,
  // Сидит на полу: таз вниз, ноги вперёд-в стороны, руки опираются
  sit: p({ bodyY: 20, hipL: 42, kneeL: -58, hipR: -42, kneeR: 58, shoulderL: 30, shoulderR: -30, elbowL: 20, elbowR: -20 }),
  sitSwing: p({ bodyY: 20, hipL: 34, kneeL: -44, hipR: -54, kneeR: 72, shoulderL: 30, shoulderR: -30, elbowL: 20, elbowR: -20, headTilt: -5 }),
  plop: p({ bodyY: 16, hipL: 30, kneeL: -96, hipR: -30, kneeR: 96, shoulderL: 26, shoulderR: -26, elbowL: 16, elbowR: -16 }),
  wave: p({ shoulderL: 132, elbowL: 24, headTilt: -7 }),
  cheer: p({ shoulderL: 152, shoulderR: -152, elbowL: -12, elbowR: 12, bodyY: -7 }),
  jump: p({ bodyY: -16, squash: 1.07, hipL: -16, hipR: 16, kneeL: 22, kneeR: -22, shoulderL: 126, shoulderR: -126 }),
  land: p({ bodyY: 6, squash: 0.88, hipL: 16, hipR: -16, kneeL: -22, kneeR: 22, shoulderL: 26, shoulderR: -26 }),
  windup: p({ lean: -8, hipR: 38, kneeR: -46, hipL: -4, shoulderL: 44, shoulderR: -30 }),
  kick: p({ lean: 9, hipR: -54, kneeR: 0, hipL: 10, kneeL: -6, shoulderL: 54, shoulderR: -86, headTilt: -5 }),
  hold: p({ shoulderL: 76, shoulderR: -76, elbowL: 48, elbowR: -48, lean: 4 }),
  sip: p({ shoulderL: 26, shoulderR: -100, elbowR: -72, headTilt: 7 }),
  think: p({ shoulderR: -108, elbowR: -80, headTilt: 9, lean: -3 }),
  // Развалился на диване: откинулся, ноги вперёд, рука за головой
  lounge: p({ bodyY: 15, lean: -12, hipL: 66, kneeL: -22, hipR: -50, kneeR: 16, shoulderL: 126, elbowL: 58, shoulderR: -36, elbowR: -14, headTilt: -6 }),
  // Спит сидя: голова свесилась, руки обмякли
  sleep: p({ bodyY: 23, lean: 7, hipL: 26, kneeL: -50, hipR: -26, kneeR: 50, shoulderL: 18, shoulderR: -18, elbowL: 10, elbowR: -10, headTilt: 15, antenna: 18 }),
  // Пожал плечами: локти прижаты, ладони вверх-в стороны
  shrug: p({ shoulderL: 118, elbowL: -46, shoulderR: -118, elbowR: 46, headTilt: -8, bodyY: -2 }),
  // Руки в боки
  proud: p({ shoulderL: 74, elbowL: 96, shoulderR: -74, elbowR: -96, lean: -5 }),
  // Шаг: колени почти прямые — так ноги читаются даже в 70 px
  walkA: p({ hipL: 26, hipR: -22, shoulderL: -18, shoulderR: 22, lean: 4, bodyY: -3 }),
  walkB: p({ hipL: -22, hipR: 26, shoulderL: 22, shoulderR: -18, lean: 4, bodyY: -3 }),
  walkMid: p({ hipL: 4, hipR: -4, shoulderL: 2, shoulderR: -2, lean: 4, bodyY: 1 }),
  startle: p({ bodyY: -10, shoulderL: 112, shoulderR: -112, elbowL: -18, elbowR: 18, antenna: -16 }),
  shy: p({ shoulderL: 62, elbowL: 70, shoulderR: -62, elbowR: -70, headTilt: 11, lean: 7 }),
  reach: p({ lean: 12, shoulderL: 64, shoulderR: -64, elbowL: 24, elbowR: -24, headTilt: 3 }),
  dribble: p({ lean: 7, shoulderR: -70, elbowR: -34, hipL: 8, hipR: -8 }),
  shoot: p({ bodyY: -11, shoulderL: 140, shoulderR: -148, elbowR: 22, lean: -4, hipL: -12, hipR: 12 }),
  sweep: p({ shoulderL: 86, elbowL: 30, shoulderR: -46, elbowR: -16, lean: 9 }),
  pet: p({ lean: 17, shoulderL: 96, elbowL: 42, shoulderR: -26, headTilt: 9, hipL: 10, kneeL: -12 }),
  listen: p({ lean: 10, headTilt: -5, shoulderL: 4, shoulderR: -4, antenna: -9 }),
  fall: p({ bodyY: 26, lean: -26, hipL: 74, kneeL: -28, hipR: -74, kneeR: 28, shoulderL: 128, shoulderR: -128, elbowL: -22, elbowR: 22, headTilt: -12 }),
} satisfies Record<string, NPose>;

export type NPoseName = keyof typeof N_POSES;

// ── Лицо ───────────────────────────────────────────────────────────────────

export interface NFace {
  eye: 'round' | 'happy' | 'closed' | 'wide' | 'squint' | 'spiral' | 'star' | 'heart';
  mouth: 'smile' | 'grin' | 'open' | 'small' | 'flat' | 'wave' | 'sad' | 'cat';
  brow?: number;
  blush?: number;
  extra?: 'none' | 'sweat' | 'spark' | 'question' | 'excl' | 'zzz' | 'note';
}

export const N_FACES = {
  neutral:  { eye: 'round',  mouth: 'smile', blush: 0.5 },
  happy:    { eye: 'happy',  mouth: 'grin',  blush: 0.8 },
  delight:  { eye: 'star',   mouth: 'open',  blush: 0.9, extra: 'spark' },
  curious:  { eye: 'round',  mouth: 'small', brow: -8, blush: 0.5, extra: 'question' },
  surprise: { eye: 'wide',   mouth: 'open',  brow: -12, blush: 0.5, extra: 'excl' },
  proud:    { eye: 'squint', mouth: 'grin',  brow: 7, blush: 0.7 },
  shy:      { eye: 'happy',  mouth: 'wave',  blush: 1, extra: 'sweat' },
  tired:    { eye: 'squint', mouth: 'wave',  brow: 5, blush: 0.4, extra: 'sweat' },
  sleep:    { eye: 'closed', mouth: 'small', blush: 0.6, extra: 'zzz' },
  dizzy:    { eye: 'spiral', mouth: 'wave',  blush: 0.6 },
  focus:    { eye: 'squint', mouth: 'flat',  brow: 10, blush: 0.4 },
  sad:      { eye: 'wide',   mouth: 'sad',   brow: -10, blush: 0.5 },
  love:     { eye: 'heart',  mouth: 'cat',   blush: 1 },
  cross:    { eye: 'squint', mouth: 'sad',   brow: 13, blush: 0.6, extra: 'excl' },
} as const satisfies Record<string, NFace>;

export type NFaceName = keyof typeof N_FACES;

export type NRefs = Record<string, SVGGElement | null>;

// ── Тело ───────────────────────────────────────────────────────────────────

export default function NextRig({ refs, face, blink, id = 'nx' }:
  { refs: NRefs; face: NFaceName; blink?: boolean; id?: string }) {
  const f: NFace = N_FACES[face];
  const eye = blink && f.eye !== 'spiral' ? 'closed' : f.eye;
  const set = (k: string) => (el: SVGGElement | null) => { refs[k] = el; };

  return (
    <g ref={set('root')}>
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor={C.shade} />
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.cap} />
          <stop offset="100%" stopColor={C.capDark} />
        </linearGradient>
        <radialGradient id={`${id}-sh`}>
          <stop offset="0%" stopColor="black" stopOpacity="0.26" />
          <stop offset="100%" stopColor="black" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-head`}>
          <rect x="-31" y="-100" width="62" height="54" rx="25" />
        </clipPath>
      </defs>

      <g ref={set('shadow')}>
        <ellipse cx="0" cy="1" rx="22" ry="4.6" fill={`url(#${id}-sh)`} />
      </g>

      {/* Всё тело поднимается целиком: ноги больше не отстают от корпуса */}
      <g ref={set('lift')}>
        <Leg side={1} set={set} />
        <Leg side={-1} set={set} />

        <g ref={set('body')}>
          <Arm side={1} set={set} />

          {/* Туловище — маленькое яйцо */}
          <rect x="-20" y="-48" width="40" height="27" rx="13" fill={`url(#${id}-cap)`} />
          <rect x="-13" y="-45" width="26" height="20" rx="9" fill={C.bib} opacity="0.85" />
          {/* Значок Flux на груди — две волны из фирменного знака */}
          <g stroke={C.cap} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.95">
            <path d="M-7,-38.4 q3.5,-3.6 7,0 t7,0" />
            <path d="M-7,-32 q3.5,3.6 7,0 t7,0" />
          </g>

          <g ref={set('headTilt')}>
            <g ref={set('headTurn')}>
              <g ref={set('antenna')}>
                <path d="M0,-97 q-1.5,-6 0.5,-10" stroke={C.capDark} strokeWidth="2.6" fill="none" strokeLinecap="round" />
                <circle cx="0.5" cy="-110" r="4.8" fill={C.bulb} className="flux-flx-bulb" />
                <circle cx="-0.8" cy="-111.4" r="1.4" fill="white" opacity="0.75" />
              </g>

              {/* Ушки-наушники: торчат из-за головы, поэтому силуэт узнаётся */}
              <circle cx="-33" cy="-70" r="8" fill={C.capDark} />
              <circle cx="33" cy="-70" r="8" fill={C.capDark} />

              {/* Голова: светлая скорлупа + тёмная шапочка сверху */}
              <rect x="-31" y="-100" width="62" height="54" rx="25" fill={`url(#${id}-shell)`} />
              <g clipPath={`url(#${id}-head)`}>
                <path d="M-31,-100 h62 v18 q-16,7 -31,-1 q-15,8 -31,1 z" fill={`url(#${id}-cap)`} />
                <ellipse cx="-11" cy="-94" rx="9.5" ry="3.6" fill="white" opacity="0.32" transform="rotate(-12 -11 -94)" />
              </g>
              <circle cx="-33" cy="-70" r="3.2" fill={C.bulb} opacity="0.6" />
              <circle cx="33" cy="-70" r="3.2" fill={C.bulb} opacity="0.6" />
              <rect x="-31" y="-100" width="62" height="54" rx="25" fill="none"
                stroke={C.shellEdge} strokeWidth="1.3" />

              {f.blush ? (
                <>
                  <ellipse cx="-23" cy="-59" rx="5.6" ry="3.4" fill={C.blush} opacity={f.blush * 0.5} />
                  <ellipse cx="23" cy="-59" rx="5.6" ry="3.4" fill={C.blush} opacity={f.blush * 0.5} />
                </>
              ) : null}

              <g ref={set('pupils')}><Eyes shape={eye} /></g>
              {f.brow ? <Brows tilt={f.brow} /> : null}
              <Mouth shape={f.mouth} />
              <Extra kind={f.extra || 'none'} />
            </g>
          </g>

          {/* Ближняя рука рисуется поверх головы: иначе поднятая ладонь
              и кружка у «рта» пропадают за черепом */}
          <Arm side={-1} set={set} />
        </g>
      </g>
    </g>
  );
}

function Leg({ side, set }: { side: 1 | -1; set: (k: string) => (el: SVGGElement | null) => void }) {
  const x = 7 * side;
  return (
    <g ref={set(side === -1 ? 'hipL' : 'hipR')}>
      {/* Бедро и голень перекрываются, поэтому на сгибе нет разрыва */}
      <rect x={x - 5.5} y={HIP_Y - 1} width="11" height="12" rx="5.5" fill={C.limb} />
      <g ref={set(side === -1 ? 'kneeL' : 'kneeR')}>
        <rect x={x - 5} y={KNEE_Y - 3} width="10" height="11" rx="5" fill={C.limb} />
        {/* Ботинок крупный и круглый, носок наружу — на нём робот твёрдо стоит */}
        <rect x={x - 9 + 1.6 * side} y="-9.5" width="18" height="9.5" rx="4.75" fill={C.limbDark} />
      </g>
    </g>
  );
}

function Arm({ side, set }: { side: 1 | -1; set: (k: string) => (el: SVGGElement | null) => void }) {
  const x = 19 * side;
  return (
    <g ref={set(side === -1 ? 'shoulderL' : 'shoulderR')}>
      <rect x={x - 4.6} y={SHOULDER_Y - 2} width="9.2" height="15" rx="4.6" fill={C.limb} />
      <g ref={set(side === -1 ? 'elbowL' : 'elbowR')}>
        <rect x={x - 4.3} y={ELBOW_Y - 3} width="8.6" height="13" rx="4.3" fill={C.limb} />
        {/* Варежка шире предплечья — так рука не выглядит палкой */}
        <circle cx={x} cy={-21} r="6.8" fill={C.limbDark} />
        <circle cx={x - 5.2 * side} cy={-23.4} r="2.7" fill={C.limbDark} />
      </g>
    </g>
  );
}

// ── Черты лица ─────────────────────────────────────────────────────────────

const EX = 14, EY = -68;

function Eyes({ shape }: { shape: string }) {
  const k = C.ink;
  if (shape === 'closed') return (
    <g stroke={k} strokeWidth="2.6" fill="none" strokeLinecap="round">
      <path d={`M${-EX - 6},${EY + 1} q6,-6 12,0`} />
      <path d={`M${EX - 6},${EY + 1} q6,-6 12,0`} />
    </g>
  );
  if (shape === 'happy') return (
    <g stroke={k} strokeWidth="3" fill="none" strokeLinecap="round">
      <path d={`M${-EX - 6.5},${EY + 2.5} q6.5,-9 13,0`} />
      <path d={`M${EX - 6.5},${EY + 2.5} q6.5,-9 13,0`} />
    </g>
  );
  if (shape === 'squint') return (
    <g stroke={k} strokeWidth="2.8" fill="none" strokeLinecap="round">
      <path d={`M${-EX - 6.5},${EY - 1} q6.5,4 13,0`} />
      <path d={`M${EX - 6.5},${EY - 1} q6.5,4 13,0`} />
    </g>
  );
  if (shape === 'spiral') return (
    <g stroke={k} strokeWidth="1.9" fill="none" strokeLinecap="round">
      <path d={`M${-EX + 4},${EY} a4,4 0 1 1 -3.6,-2.6 a2.3,2.3 0 1 0 2.1,1.6`} />
      <path d={`M${EX + 4},${EY} a4,4 0 1 1 -3.6,-2.6 a2.3,2.3 0 1 0 2.1,1.6`} />
    </g>
  );
  if (shape === 'heart') return (
    <g fill="oklch(0.62 0.19 18)">
      <path d={`M${-EX},${EY + 6} c-7,-5.4 -7,-11.6 -2.8,-11.6 c1.7,0 2.8,1.4 2.8,2.5 c0,-1.1 1.1,-2.5 2.8,-2.5 c4.2,0 4.2,6.2 -2.8,11.6 z`} />
        <path d={`M${EX},${EY + 6} c-7,-5.4 -7,-11.6 -2.8,-11.6 c1.7,0 2.8,1.4 2.8,2.5 c0,-1.1 1.1,-2.5 2.8,-2.5 c4.2,0 4.2,6.2 -2.8,11.6 z`} />
    </g>
  );
  if (shape === 'star') return (
    <g fill={k}>
      {[-EX, EX].map((cx, i) => (
        <path key={i} d={`M${cx},${EY - 8.5} l2.6,5.4 l5.9,0.9 l-4.3,4.2 l1,5.9 l-5.2,-2.8 l-5.2,2.8 l1,-5.9 l-4.3,-4.2 l5.9,-0.9 z`} />
      ))}
    </g>
  );
  const rx = shape === 'wide' ? 8.4 : 7.6;
  const ry = shape === 'wide' ? 9.6 : 8.8;
  return (
    <g>
      <ellipse cx={-EX} cy={EY} rx={rx} ry={ry} fill={k} />
      <ellipse cx={EX} cy={EY} rx={rx} ry={ry} fill={k} />
      <circle cx={-EX + 2.6} cy={EY - 3.2} r="2.7" fill="white" />
      <circle cx={EX + 2.6} cy={EY - 3.2} r="2.7" fill="white" />
      <circle cx={-EX - 2.4} cy={EY + 3.4} r="1.3" fill="white" opacity="0.8" />
      <circle cx={EX - 2.4} cy={EY + 3.4} r="1.3" fill="white" opacity="0.8" />
    </g>
  );
}

function Brows({ tilt }: { tilt: number }) {
  const y = EY - 12;
  return (
    <g stroke={C.ink} strokeWidth="2.4" strokeLinecap="round" opacity="0.75">
      <path d={`M${-EX - 5},${y} h10`} transform={`rotate(${tilt} ${-EX} ${y})`} />
      <path d={`M${EX - 5},${y} h10`} transform={`rotate(${-tilt} ${EX} ${y})`} />
    </g>
  );
}

function Mouth({ shape }: { shape: string }) {
  const k = C.ink;
  const s = { stroke: k, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round' as const };
  switch (shape) {
    case 'grin':  return <path d="M-6.5,-55.5 a6.5,6.5 0 0 0 13,0 z" fill={k} />;
    case 'open':  return <ellipse cx="0" cy="-53.5" rx="4.6" ry="4" fill={k} />;
    case 'small': return <circle cx="0" cy="-53.5" r="2.4" fill={k} />;
    case 'flat':  return <path d="M-4.5,-54 h9" {...s} />;
    case 'wave':  return <path d="M-6,-54 q3,-2.8 6,0 t6,0" {...s} strokeWidth={2} />;
    case 'sad':   return <path d="M-5.5,-52 q5.5,-4.8 11,0" {...s} />;
    case 'cat':   return <path d="M-6.5,-55.5 q3.25,3.4 6.5,0 q3.25,3.4 6.5,0" {...s} strokeWidth={2} />;
    default:      return <path d="M-5,-55.6 q5,4 10,0" {...s} />;
  }
}

function Extra({ kind }: { kind: string }) {
  switch (kind) {
    case 'sweat': return <path d="M27,-84 q3.6,4.8 0,7.2 q-3.6,-2.4 0,-7.2 z" fill="oklch(0.80 0.09 230)" opacity="0.9" className="flux-flx-sweat" />;
    case 'spark': return (
      <g fill={C.bulb}>
        <path d="M34,-98 l1.7,3.8 l3.8,1.7 l-3.8,1.7 l-1.7,3.8 l-1.7,-3.8 l-3.8,-1.7 l3.8,-1.7 z" className="flux-flx-spark1" />
        <path d="M-36,-90 l1.2,2.8 l2.8,1.2 l-2.8,1.2 l-1.2,2.8 l-1.2,-2.8 l-2.8,-1.2 l2.8,-1.2 z" opacity="0.8" className="flux-flx-spark2" />
      </g>
    );
    case 'question': return <text x="32" y="-92" fontSize="15" fontWeight="800" fill={C.capDark} className="flux-flx-pop">?</text>;
    case 'excl': return <text x="32" y="-92" fontSize="15" fontWeight="800" fill="oklch(0.72 0.16 55)" className="flux-flx-pop">!</text>;
    case 'zzz': return (
      <g fill={C.capDark}>
        <text x="30" y="-96" fontSize="12" fontWeight="800" opacity="0.7" className="flux-robot-z">z</text>
        <text x="38" y="-104" fontSize="9" fontWeight="800" opacity="0.5" className="flux-robot-z2">z</text>
      </g>
    );
    default: return null;
  }
}

// ── Раскладка снимка в узлы (та же схема, что в apply.ts) ──────────────────

export function applyNext(refs: NRefs, j: NPose, x: number, floor: number, scale: number, flip = 1) {
  const set = (k: string, tr: string) => { const el = refs[k]; if (el) el.setAttribute('transform', tr); };
  const rot = (a: number, k: string) => `rotate(${a.toFixed(2)} ${NPIVOTS[k][0]} ${NPIVOTS[k][1]})`;
  set('root', `translate(${x} ${floor}) scale(${(scale * flip).toFixed(3)} ${scale.toFixed(3)})`);
  set('lift', `translate(0 ${j.bodyY.toFixed(2)})`);
  set('body', `${rot(j.lean, 'lean')} translate(0 ${HIP_Y}) scale(1 ${j.squash.toFixed(3)}) translate(0 ${-HIP_Y})`);
  set('headTilt', rot(j.headTilt, 'headTilt'));
  set('headTurn', `translate(${j.headTurn.toFixed(2)} 0)`);
  set('antenna', rot(j.antenna, 'antenna'));
  for (const k of ['shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR']) {
    set(k, rot((j as any)[k], k));
  }
  const sh = refs.shadow;
  if (sh) {
    const s = Math.max(0.42, Math.min(1.15, 1 + j.bodyY / 34));
    sh.setAttribute('transform', `scale(${s.toFixed(3)} 1)`);
    sh.setAttribute('opacity', String(Math.max(0.35, s)));
  }
}
