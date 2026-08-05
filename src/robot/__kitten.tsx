import React from 'react';

/**
 * ЧЕРНОВИК котёнка — альтернатива роботу. В приложение не входит.
 *
 * Скелет тот же, что у робота, кроме двух добавок: уши и хвост. Обе — сами по
 * себе выразительные каналы: прижатые уши читаются как испуг, а хвост качается
 * пружиной от любого движения, без единого ключа в сценке.
 */

const HIP_Y = -24;
const KNEE_Y = -15;
const SHOULDER_Y = -42;
const ELBOW_Y = -31;
const NECK_Y = -46;

export const KPIVOTS: Record<string, [number, number]> = {
  headTilt: [0, NECK_Y], headTurn: [0, NECK_Y],
  shoulderL: [-19, SHOULDER_Y], elbowL: [-19, ELBOW_Y],
  shoulderR: [19, SHOULDER_Y], elbowR: [19, ELBOW_Y],
  hipL: [-7, HIP_Y], kneeL: [-7, KNEE_Y],
  hipR: [7, HIP_Y], kneeR: [7, KNEE_Y],
  earL: [-17, -93], earR: [17, -93],
  tail: [11, -26], lean: [0, HIP_Y],
};

const C = {
  fur: 'oklch(0.97 0.018 88)',         // светлая шерсть: мордочка, животик, лапки
  furShade: 'oklch(0.915 0.03 84)',
  furEdge: 'oklch(0.66 0.10 58)',      // кант: без него котёнок тает на белом
  cap: 'oklch(0.80 0.105 66)',         // рыжая шапочка, спинка, лапы, хвост
  capDark: 'oklch(0.71 0.115 62)',
  stripe: 'oklch(0.66 0.115 58)',      // полоски
  paw: 'oklch(0.955 0.022 86)',
  inner: 'oklch(0.80 0.10 18)',        // ушки изнутри, нос, подушечки
  ink: 'oklch(0.32 0.045 250)',
  blush: 'oklch(0.78 0.10 25)',
  collar: 'oklch(0.62 0.135 163)',     // фирменный зелёный Flux
  tag: 'oklch(0.86 0.14 150)',
};

export type KJoint =
  | 'bodyY' | 'lean' | 'squash' | 'headTilt' | 'headTurn'
  | 'shoulderL' | 'elbowL' | 'shoulderR' | 'elbowR'
  | 'hipL' | 'kneeL' | 'hipR' | 'kneeR'
  | 'earL' | 'earR' | 'tail';

export type KPose = Record<KJoint, number>;

export const K_NEUTRAL: KPose = {
  bodyY: 0, lean: 0, squash: 1, headTilt: 0, headTurn: 0,
  shoulderL: 8, elbowL: 6, shoulderR: -8, elbowR: -6,
  hipL: 0, kneeL: 0, hipR: 0, kneeR: 0,
  earL: 0, earR: 0, tail: 0,
};

const p = (o: Partial<KPose>): KPose => ({ ...K_NEUTRAL, ...o });

export const K_POSES = {
  stand: K_NEUTRAL,
  // Сидит по-кошачьи: таз на пол, передние лапы прямо, хвост обёрнут вперёд
  sit: p({ bodyY: 20, hipL: 42, kneeL: -58, hipR: -42, kneeR: 58, shoulderL: 14, shoulderR: -14, elbowL: 6, elbowR: -6, tail: -26 }),
  sitSwing: p({ bodyY: 20, hipL: 42, kneeL: -58, hipR: -42, kneeR: 58, shoulderL: 14, shoulderR: -14, elbowL: 6, elbowR: -6, tail: 22, headTilt: -5 }),
  // Батон: лапы под себя, глаза щёлочками
  loaf: p({ bodyY: 27, squash: 0.94, hipL: 30, kneeL: -92, hipR: -30, kneeR: 92, shoulderL: 74, elbowL: 78, shoulderR: -74, elbowR: -78, tail: -34, earL: -6, earR: 6 }),
  // Потягивается: попа вверх, лапы вперёд
  stretchUp: p({ bodyY: 12, lean: 26, shoulderL: 92, elbowL: 22, shoulderR: -92, elbowR: -22, hipL: -14, hipR: 14, tail: -48, headTilt: -8 }),
  wave: p({ shoulderL: 132, elbowL: 24, headTilt: -7, tail: 20 }),
  cheer: p({ shoulderL: 152, shoulderR: -152, elbowL: -12, elbowR: 12, bodyY: -7, tail: -20 }),
  jump: p({ bodyY: -16, squash: 1.07, hipL: -16, hipR: 16, kneeL: 22, kneeR: -22, shoulderL: 126, shoulderR: -126, tail: -54, earL: -8, earR: 8 }),
  land: p({ bodyY: 6, squash: 0.88, hipL: 16, hipR: -16, kneeL: -22, kneeR: 22, shoulderL: 26, shoulderR: -26, tail: 30 }),
  // Крадётся перед прыжком: прижался, попа виляет
  pounce: p({ bodyY: 16, squash: 0.9, lean: 14, hipL: 34, kneeL: -46, hipR: -34, kneeR: 46, shoulderL: 26, elbowL: 44, shoulderR: -26, elbowR: -44, tail: -8, earL: -10, earR: 10 }),
  // Лапка вверх — трогает что-то
  paw: p({ shoulderL: 112, elbowL: 34, headTilt: -6, tail: 26, bodyY: 2 }),
  windup: p({ lean: -8, hipR: 38, kneeR: -46, hipL: -4, shoulderL: 44, shoulderR: -30, tail: -30 }),
  kick: p({ lean: 9, hipR: -54, kneeR: 0, hipL: 10, kneeL: -6, shoulderL: 54, shoulderR: -86, headTilt: -5, tail: 34 }),
  hold: p({ shoulderL: 76, shoulderR: -76, elbowL: 48, elbowR: -48, lean: 4 }),
  sip: p({ shoulderL: 26, shoulderR: -100, elbowR: -72, headTilt: 7, tail: -18 }),
  think: p({ shoulderR: -108, elbowR: -80, headTilt: 9, lean: -3, tail: 14, earL: -5 }),
  lounge: p({ bodyY: 15, lean: -12, hipL: 66, kneeL: -22, hipR: -50, kneeR: 16, shoulderL: 126, elbowL: 58, shoulderR: -36, elbowR: -14, headTilt: -6, tail: 26 }),
  // Спит клубком
  sleep: p({ bodyY: 26, squash: 0.93, lean: 8, hipL: 30, kneeL: -94, hipR: -30, kneeR: 94, shoulderL: 78, elbowL: 84, shoulderR: -78, elbowR: -84, headTilt: 16, tail: -40, earL: -8, earR: 8 }),
  shrug: p({ shoulderL: 118, elbowL: -46, shoulderR: -118, elbowR: 46, headTilt: -8, bodyY: -2, earL: -8, earR: 8 }),
  proud: p({ shoulderL: 74, elbowL: 96, shoulderR: -74, elbowR: -96, lean: -5, tail: -44 }),
  walkA: p({ hipL: 26, hipR: -22, shoulderL: -18, shoulderR: 22, lean: 4, bodyY: -3, tail: -16 }),
  walkB: p({ hipL: -22, hipR: 26, shoulderL: 22, shoulderR: -18, lean: 4, bodyY: -3, tail: 16 }),
  walkMid: p({ hipL: 4, hipR: -4, shoulderL: 2, shoulderR: -2, lean: 4, bodyY: 1 }),
  // Шерсть дыбом
  startle: p({ bodyY: -10, shoulderL: 112, shoulderR: -112, elbowL: -18, elbowR: 18, tail: -70, earL: -22, earR: 22 }),
  shy: p({ shoulderL: 62, elbowL: 70, shoulderR: -62, elbowR: -70, headTilt: 11, lean: 7, earL: -14, earR: 14, tail: -12 }),
  reach: p({ lean: 12, shoulderL: 64, shoulderR: -64, elbowL: 24, elbowR: -24, headTilt: 3 }),
  sweep: p({ shoulderL: 86, elbowL: 30, shoulderR: -46, elbowR: -16, lean: 9 }),
  listen: p({ lean: 10, headTilt: -5, shoulderL: 4, shoulderR: -4, earL: 8, earR: -8, tail: 10 }),
  fall: p({ bodyY: 26, lean: -26, hipL: 74, kneeL: -28, hipR: -74, kneeR: 28, shoulderL: 128, shoulderR: -128, elbowL: -22, elbowR: 22, headTilt: -12, tail: 52, earL: -18, earR: 18 }),
} satisfies Record<string, KPose>;

export type KPoseName = keyof typeof K_POSES;

// ── Мордочка ───────────────────────────────────────────────────────────────

export interface KFace {
  eye: 'round' | 'happy' | 'closed' | 'wide' | 'squint' | 'spiral' | 'star' | 'heart';
  mouth: 'cat' | 'open' | 'small' | 'flat' | 'wave' | 'sad' | 'grin';
  brow?: number;
  blush?: number;
  extra?: 'none' | 'sweat' | 'spark' | 'question' | 'excl' | 'zzz';
}

export const K_FACES = {
  neutral:  { eye: 'round',  mouth: 'cat',   blush: 0.5 },
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
} as const satisfies Record<string, KFace>;

export type KFaceName = keyof typeof K_FACES;
export type KRefs = Record<string, SVGGElement | null>;

// ── Тело ───────────────────────────────────────────────────────────────────

export type KPalette = Partial<typeof C>;

/** Готовые окрасы: рыжий табби, дымчатый и кремово-мятный под цвета Flux. */
export const K_COATS: Record<string, KPalette> = {
  ginger: {},
  smoke: {
    fur: 'oklch(0.965 0.008 250)', furShade: 'oklch(0.90 0.014 250)',
    furEdge: 'oklch(0.60 0.035 250)', cap: 'oklch(0.75 0.032 250)',
    capDark: 'oklch(0.66 0.036 252)', stripe: 'oklch(0.58 0.038 252)',
    paw: 'oklch(0.95 0.010 250)',
  },
  mint: {
    fur: 'oklch(0.97 0.016 165)', furShade: 'oklch(0.915 0.028 165)',
    furEdge: 'oklch(0.58 0.075 168)', cap: 'oklch(0.76 0.085 166)',
    capDark: 'oklch(0.67 0.095 166)', stripe: 'oklch(0.58 0.095 167)',
    paw: 'oklch(0.955 0.02 165)', inner: 'oklch(0.82 0.09 22)',
    collar: 'oklch(0.45 0.09 30)', tag: 'oklch(0.80 0.13 60)',
  },
};

export default function Kitten({ refs, face, blink, id = 'kt', pal }:
  { refs: KRefs; face: KFaceName; blink?: boolean; id?: string; pal?: KPalette }) {
  const c = { ...C, ...pal };
  const f: KFace = K_FACES[face];
  const eye = blink && f.eye !== 'spiral' ? 'closed' : f.eye;
  const set = (k: string) => (el: SVGGElement | null) => { refs[k] = el; };

  return (
    <g ref={set('root')}>
      <defs>
        <linearGradient id={`${id}-fur`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor={c.furShade} />
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.cap} />
          <stop offset="100%" stopColor={c.capDark} />
        </linearGradient>
        <radialGradient id={`${id}-sh`}>
          <stop offset="0%" stopColor="black" stopOpacity="0.26" />
          <stop offset="100%" stopColor="black" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-head`}>
          <rect x="-31" y="-100" width="62" height="54" rx="27" />
        </clipPath>
      </defs>

      <g ref={set('shadow')}>
        <ellipse cx="0" cy="1" rx="22" ry="4.6" fill={`url(#${id}-sh)`} />
      </g>

      <g ref={set('lift')}>
        {/* Хвост — за телом, качается пружиной от любого движения */}
        <g ref={set('tail')}>
          <path d="M13,-26 c17,-1 24,-10 20,-30" fill="none" stroke={c.furEdge}
            strokeWidth="10.4" strokeLinecap="round" opacity="0.9" />
          <path d="M13,-26 c17,-1 24,-10 20,-30" fill="none" stroke={c.cap}
            strokeWidth="8.4" strokeLinecap="round" />
          <g stroke={c.stripe} strokeWidth="2.6" strokeLinecap="round" opacity="0.75">
            <path d="M23,-27 l3.5,2" />
            <path d="M29.5,-35 l4,1.4" />
          </g>
          <path d="M32,-52 c1,-4 1.5,-4.6 1,-5" fill="none" stroke={c.fur}
            strokeWidth="8" strokeLinecap="round" />
        </g>

        <Leg side={1} set={set} c={c} />
        <Leg side={-1} set={set} c={c} />

        <g ref={set('body')}>
          <Arm side={1} set={set} c={c} />

          {/* Туловище: рыжеватая спинка со светлым животиком */}
          <rect x="-20" y="-48" width="40" height="28" rx="14" fill={`url(#${id}-cap)`} />
          <ellipse cx="0" cy="-31" rx="14" ry="12" fill={`url(#${id}-fur)`} />
          {/* Ошейник со значком Flux */}
          <path d="M-15,-47.5 q15,7 30,0" fill="none" stroke={c.collar} strokeWidth="4.4" strokeLinecap="round" />
          <circle cx="0" cy="-41.5" r="4" fill={c.tag} />
          <g stroke={c.collar} strokeWidth="1.1" fill="none" strokeLinecap="round">
            <path d="M-2.2,-42.6 q1.1,-1.2 2.2,0 t2.2,0" />
            <path d="M-2.2,-40.2 q1.1,1.2 2.2,0 t2.2,0" />
          </g>

          <g ref={set('headTilt')}>
            <g ref={set('headTurn')}>
              {/* Ушки: свои повороты — прижал значит испугался */}
              <g ref={set('earL')}>
                <path d="M-31,-84 q-3,-22 2,-32 q8,7 15,22 z" fill={c.cap}
                  stroke={c.furEdge} strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M-26,-87 q-2,-13 1,-19 q5,5 9,14 z" fill={c.inner} />
              </g>
              <g ref={set('earR')}>
                <path d="M31,-84 q3,-22 -2,-32 q-8,7 -15,22 z" fill={c.cap}
                  stroke={c.furEdge} strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M26,-87 q2,-13 -1,-19 q-5,5 -9,14 z" fill={c.inner} />
              </g>

              {/* Голова: круглая, со светлым низом и рыжей шапочкой */}
              <rect x="-31" y="-100" width="62" height="54" rx="27" fill={`url(#${id}-fur)`} />
              <g clipPath={`url(#${id}-head)`}>
                <path d="M-31,-100 h62 v16 q-16,8 -31,-2 q-15,9 -31,2 z" fill={`url(#${id}-cap)`} />
                <g stroke={c.stripe} strokeWidth="2.8" strokeLinecap="round" opacity="0.85" fill="none">
                  <path d="M-9,-99 l3,9 M0,-100 l0,11 M9,-99 l-3,9" />
                  <path d="M-24,-97 l4,7 M24,-97 l-4,7" />
                </g>
              </g>
              <rect x="-31" y="-100" width="62" height="54" rx="27" fill="none" stroke={c.furEdge} strokeWidth="1.6" opacity="0.85" />

              {f.blush ? (
                <>
                  <ellipse cx="-24" cy="-60" rx="6" ry="3.6" fill={c.blush} opacity={f.blush * 0.45} />
                  <ellipse cx="24" cy="-60" rx="6" ry="3.6" fill={c.blush} opacity={f.blush * 0.45} />
                </>
              ) : null}

              {/* Усы: три с каждой стороны, тонкие */}
              {/* Светлая мордочка */}
              <ellipse cx="0" cy="-54" rx="16" ry="10" fill="white" opacity="0.6" />
              <g stroke={c.furEdge} strokeWidth="1.2" strokeLinecap="round" opacity="0.85">
                <path d="M-16,-58 l-14,-4 M-16,-55 l-15,1 M-16,-52 l-13,5" />
                <path d="M16,-58 l14,-4 M16,-55 l15,1 M16,-52 l13,5" />
              </g>

              <g ref={set('pupils')}><Eyes shape={eye} /></g>
              {f.brow ? <Brows tilt={f.brow} /> : null}
              {/* Нос-сердечко */}
              <path d="M0,-56.5 l-3.2,-3.4 h6.4 z" fill={c.inner} />
              <Mouth shape={f.mouth} />
              <Extra kind={f.extra || 'none'} />
            </g>
          </g>

          <Arm side={-1} set={set} c={c} />
        </g>
      </g>
    </g>
  );
}

function Leg({ side, set, c }: { side: 1 | -1; set: (k: string) => (el: SVGGElement | null) => void; c: typeof C }) {
  const x = 7 * side;
  return (
    <g ref={set(side === -1 ? 'hipL' : 'hipR')}>
      <rect x={x - 5.5} y={HIP_Y - 1} width="11" height="12" rx="5.5" fill={c.cap} />
      <g ref={set(side === -1 ? 'kneeL' : 'kneeR')}>
        <rect x={x - 5} y={KNEE_Y - 3} width="10" height="11" rx="5" fill={c.capDark} />
        {/* Задняя лапка */}
        <rect x={x - 8.5 + 1.4 * side} y="-9.5" width="17" height="9.5" rx="4.75" fill={c.paw} stroke={c.furEdge} strokeWidth="1.1" opacity="0.98" />
      </g>
    </g>
  );
}

function Arm({ side, set, c }: { side: 1 | -1; set: (k: string) => (el: SVGGElement | null) => void; c: typeof C }) {
  const x = 19 * side;
  return (
    <g ref={set(side === -1 ? 'shoulderL' : 'shoulderR')}>
      <rect x={x - 4.6} y={SHOULDER_Y - 2} width="9.2" height="15" rx="4.6" fill={c.cap} />
      <g ref={set(side === -1 ? 'elbowL' : 'elbowR')}>
        <rect x={x - 4.3} y={ELBOW_Y - 3} width="8.6" height="13" rx="4.3" fill={c.capDark} />
        {/* Передняя лапка с подушечками */}
        <circle cx={x} cy={-21} r="6.8" fill={c.paw} stroke={c.furEdge} strokeWidth="1.1" />
        <ellipse cx={x} cy={-19.8} rx="2.6" ry="2.1" fill={c.inner} opacity="0.55" />
      </g>
    </g>
  );
}

const EX = 14, EY = -69;

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
      {/* Кошачий зрачок-щёлочка поверх тёмного глаза */}
      <ellipse cx={-EX} cy={EY} rx={rx * 0.3} ry={ry * 0.82} fill="black" opacity="0.55" />
      <ellipse cx={EX} cy={EY} rx={rx * 0.3} ry={ry * 0.82} fill="black" opacity="0.55" />
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
    <g stroke={C.ink} strokeWidth="2.4" strokeLinecap="round" opacity="0.7">
      <path d={`M${-EX - 5},${y} h10`} transform={`rotate(${tilt} ${-EX} ${y})`} />
      <path d={`M${EX - 5},${y} h10`} transform={`rotate(${-tilt} ${EX} ${y})`} />
    </g>
  );
}

function Mouth({ shape }: { shape: string }) {
  const k = C.ink;
  const s = { stroke: k, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const };
  switch (shape) {
    case 'grin':  return <path d="M-6,-55.4 a6,6 0 0 0 12,0 z" fill={k} />;
    case 'open':  return <ellipse cx="0" cy="-52.6" rx="4.4" ry="3.8" fill={k} />;
    case 'small': return <circle cx="0" cy="-52.6" r="2.2" fill={k} />;
    case 'flat':  return <path d="M-4.5,-53.4 h9" {...s} />;
    case 'wave':  return <path d="M-6,-53.6 q3,-2.6 6,0 t6,0" {...s} />;
    case 'sad':   return <path d="M-5.5,-51.4 q5.5,-4.6 11,0" {...s} />;
    // Кошачий ротик «ω»
    default:      return <path d="M-6.5,-55.4 q3.25,3.6 6.5,0 q3.25,3.6 6.5,0" {...s} />;
  }
}

function Extra({ kind }: { kind: string }) {
  switch (kind) {
    case 'sweat': return <path d="M28,-86 q3.6,4.8 0,7.2 q-3.6,-2.4 0,-7.2 z" fill="oklch(0.80 0.09 230)" opacity="0.9" className="flux-flx-sweat" />;
    case 'spark': return (
      <g fill="oklch(0.84 0.15 90)">
        <path d="M35,-100 l1.7,3.8 l3.8,1.7 l-3.8,1.7 l-1.7,3.8 l-1.7,-3.8 l-3.8,-1.7 l3.8,-1.7 z" className="flux-flx-spark1" />
        <path d="M-37,-92 l1.2,2.8 l2.8,1.2 l-2.8,1.2 l-1.2,2.8 l-1.2,-2.8 l-2.8,-1.2 l2.8,-1.2 z" opacity="0.8" className="flux-flx-spark2" />
      </g>
    );
    case 'question': return <text x="33" y="-94" fontSize="15" fontWeight="800" fill={C.capDark} className="flux-flx-pop">?</text>;
    case 'excl': return <text x="33" y="-94" fontSize="15" fontWeight="800" fill="oklch(0.72 0.16 55)" className="flux-flx-pop">!</text>;
    case 'zzz': return (
      <g fill={C.capDark}>
        <text x="31" y="-98" fontSize="12" fontWeight="800" opacity="0.75" className="flux-robot-z">z</text>
        <text x="39" y="-106" fontSize="9" fontWeight="800" opacity="0.55" className="flux-robot-z2">z</text>
      </g>
    );
    default: return null;
  }
}

export function applyKitten(refs: KRefs, j: KPose, x: number, floor: number, scale: number, flip = 1) {
  const set = (k: string, tr: string) => { const el = refs[k]; if (el) el.setAttribute('transform', tr); };
  const rot = (a: number, k: string) => `rotate(${a.toFixed(2)} ${KPIVOTS[k][0]} ${KPIVOTS[k][1]})`;
  set('root', `translate(${x} ${floor}) scale(${(scale * flip).toFixed(3)} ${scale.toFixed(3)})`);
  set('lift', `translate(0 ${j.bodyY.toFixed(2)})`);
  set('body', `${rot(j.lean, 'lean')} translate(0 ${HIP_Y}) scale(1 ${j.squash.toFixed(3)}) translate(0 ${-HIP_Y})`);
  set('headTilt', rot(j.headTilt, 'headTilt'));
  set('headTurn', `translate(${j.headTurn.toFixed(2)} 0)`);
  for (const k of ['shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR', 'earL', 'earR', 'tail']) {
    set(k, rot((j as any)[k], k));
  }
  const sh = refs.shadow;
  if (sh) {
    const s = Math.max(0.42, Math.min(1.15, 1 + j.bodyY / 34));
    sh.setAttribute('transform', `scale(${s.toFixed(3)} 1)`);
    sh.setAttribute('opacity', String(Math.max(0.35, s)));
  }
}
