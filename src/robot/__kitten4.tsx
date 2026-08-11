import React from 'react';

/**
 * ЧЕРНОВИК: настоящий котёнок на четырёх лапах. В приложение не входит.
 *
 * Корпус в профиль, мордочка развёрнута к нам — так и силуэт кошачий, и мимика
 * читается. Смотрит вправо; развороты делает зеркалом всей фигуры.
 *
 * Ноги: ближняя пара рисуется поверх корпуса, дальняя — за ним и темнее.
 * Имена суставов те же, что у прежнего робота, чтобы проигрыватель не менять:
 * shoulder/elbow — передние лапы, hip/knee — задние.
 */

export const K4_HEIGHT = 92;

const FRONT_X = 12;    // ближняя передняя лапа
const BACK_X = -20;    // ближняя задняя
const FAR = -7;        // насколько дальняя пара смещена вглубь
const SH_Y = -32;
const FKNEE_Y = -19;
const HIP_Y = -34;
const BKNEE_Y = -20;
const NECK: [number, number] = [22, -44];
const RUMP: [number, number] = [-27, -19];

export const K4_PIVOTS: Record<string, [number, number]> = {
  lean: RUMP,
  headTilt: NECK, headTurn: NECK,
  shoulderL: [FRONT_X, SH_Y], elbowL: [FRONT_X, FKNEE_Y],
  shoulderR: [FRONT_X + FAR, SH_Y], elbowR: [FRONT_X + FAR, FKNEE_Y],
  hipL: [BACK_X, HIP_Y], kneeL: [BACK_X, BKNEE_Y],
  hipR: [BACK_X + FAR, HIP_Y], kneeR: [BACK_X + FAR, BKNEE_Y],
  earL: [26, -72], earR: [42, -72],
  tail: [-34, -40], tailTip: [-46, -52],
};

const C = {
  fur: 'oklch(0.97 0.018 88)',
  furShade: 'oklch(0.915 0.03 84)',
  furEdge: 'oklch(0.62 0.10 56)',
  cap: 'oklch(0.80 0.105 66)',
  capDark: 'oklch(0.71 0.115 62)',
  capFar: 'oklch(0.66 0.10 60)',
  stripe: 'oklch(0.64 0.115 57)',
  paw: 'oklch(0.955 0.022 86)',
  inner: 'oklch(0.80 0.10 18)',
  ink: 'oklch(0.32 0.045 250)',
  blush: 'oklch(0.78 0.10 25)',
  collar: 'oklch(0.58 0.14 163)',
  tag: 'oklch(0.84 0.15 95)',
};

export type K4Joint =
  | 'bodyY' | 'lean' | 'squash' | 'headTilt' | 'headTurn'
  | 'shoulderL' | 'elbowL' | 'shoulderR' | 'elbowR'
  | 'hipL' | 'kneeL' | 'hipR' | 'kneeR'
  | 'earL' | 'earR' | 'tail' | 'tailTip';

export type K4Pose = Record<K4Joint, number>;

export const K4_NEUTRAL: K4Pose = {
  bodyY: 0, lean: 0, squash: 1, headTilt: 0, headTurn: 0,
  shoulderL: 0, elbowL: 0, shoulderR: -4, elbowR: 2,
  hipL: 0, kneeL: 0, hipR: 4, kneeR: -2,
  earL: 0, earR: 0, tail: 0, tailTip: 0,
};

const p = (o: Partial<K4Pose>): K4Pose => ({ ...K4_NEUTRAL, ...o });

export const K4_POSES = {
  stand: K4_NEUTRAL,

  // Кошачья посадка: круп на полу, передние лапы прямые, задняя подобрана
  sit: p({ lean: -32, shoulderL: 32, shoulderR: 28, hipL: 26, kneeL: -46, hipR: 30, kneeR: -44, tail: -18, tailTip: -14 }),
  sitTail: p({ lean: -32, shoulderL: 32, shoulderR: 28, hipL: 26, kneeL: -46, hipR: 30, kneeR: -44, tail: 26, tailTip: 22, headTilt: -5 }),
  // Батон: лапы под себя, корпус на полу
  loaf: p({ bodyY: 5, squash: 0.94, shoulderL: 74, elbowL: -66, shoulderR: 70, elbowR: -62, hipL: 40, kneeL: -76, hipR: 44, kneeR: -74, tail: -34, tailTip: -30, earL: -4, earR: 4 }),
  // Спит: батон, голова свесилась, хвост обёрнут
  sleep: p({ bodyY: 6, squash: 0.9, shoulderL: 80, elbowL: -74, shoulderR: 76, elbowR: -70, hipL: 44, kneeL: -82, hipR: 48, kneeR: -80, headTilt: 22, tail: -50, tailTip: -46, earL: -10, earR: 10 }),
  // Потягивается: перед на полу, круп вверх
  stretchOut: p({ lean: 22, shoulderL: -46, elbowL: 26, shoulderR: -42, elbowR: 24, hipL: 6, kneeL: -8, hipR: 10, kneeR: -6, tail: -62, tailTip: -38, headTilt: 14 }),
  // Крадётся перед прыжком
  crouch: p({ bodyY: 6, squash: 0.94, shoulderL: 18, elbowL: -24, shoulderR: 14, elbowR: -20, hipL: 20, kneeL: -34, hipR: 24, kneeR: -32, tail: -6, tailTip: 18, earL: -8, earR: 8, headTilt: -4 }),
  // Прыжок: вытянулся в воздухе
  pounce: p({ bodyY: -18, lean: -14, squash: 1.06, shoulderL: -54, elbowL: 20, shoulderR: -50, elbowR: 18, hipL: 44, kneeL: -34, hipR: 48, kneeR: -30, tail: -46, tailTip: -30, earL: -6, earR: 6 }),
  land: p({ bodyY: 5, squash: 0.9, shoulderL: 20, elbowL: -14, shoulderR: 16, elbowR: -12, hipL: 18, kneeL: -30, hipR: 22, kneeR: -28, tail: 34, tailTip: 20 }),

  // Сидит и тянет лапку — трогает, машет, играет
  pawUp: p({ lean: -32, shoulderL: -46, elbowL: 34, shoulderR: 28, hipL: 26, kneeL: -46, hipR: 30, kneeR: -44, tail: 22, tailTip: 18, headTilt: -6 }),
  pawHigh: p({ lean: -34, shoulderL: -86, elbowL: 30, shoulderR: 26, hipL: 26, kneeL: -46, hipR: 30, kneeR: -44, tail: 30, tailTip: 26, headTilt: -9 }),
  // Столбиком на задних — так он здоровается и радуется
  beg: p({ lean: -62, shoulderL: -52, elbowL: 44, shoulderR: -46, elbowR: 40, hipL: 30, kneeL: -52, hipR: 34, kneeR: -50, tail: -30, tailTip: -26, headTilt: 4 }),
  cheer: p({ lean: -66, shoulderL: -110, elbowL: 24, shoulderR: -102, elbowR: 22, hipL: 30, kneeL: -52, hipR: 34, kneeR: -50, tail: -40, tailTip: -34, headTilt: 2 }),
  // Умывается: лапа у мордочки
  groom: p({ lean: -32, shoulderL: -62, elbowL: 76, shoulderR: 28, hipL: 26, kneeL: -46, hipR: 30, kneeR: -44, headTilt: 16, tail: -12, tailTip: -10 }),
  // Месит лапами
  knead: p({ bodyY: 4, squash: 0.96, shoulderL: -26, elbowL: 34, shoulderR: 66, elbowR: -58, hipL: 40, kneeL: -76, hipR: 44, kneeR: -74, tail: -20, tailTip: -18, headTilt: -4 }),
  // Тянется вперёд-вниз к предмету
  reach: p({ lean: 10, shoulderL: -40, elbowL: 16, shoulderR: -12, elbowR: 8, hipL: 4, kneeL: -6, hipR: 8, kneeR: -4, tail: -28, tailTip: -20, headTilt: 8 }),
  // Пьёт из миски
  drink: p({ lean: 12, shoulderL: 12, elbowL: -18, shoulderR: 8, elbowR: -14, hipL: 8, kneeL: -12, hipR: 12, kneeR: -10, headTilt: 26, tail: -16, tailTip: -12 }),
  // Развалился на боку
  lounge: p({ bodyY: 6, squash: 0.92, lean: -10, shoulderL: -66, elbowL: 30, shoulderR: 62, elbowR: -50, hipL: 62, kneeL: -84, hipR: 30, kneeR: -56, tail: 30, tailTip: 24, headTilt: -12 }),

  // Шаг: середину ведёт проигрыватель, A и B — запасные ключевые фазы
  walkMid: p({ bodyY: -1, tail: -14, tailTip: -12 }),
  walkA: p({ bodyY: -2, shoulderL: -26, elbowL: 14, shoulderR: 22, elbowR: -8, hipL: -22, kneeL: 12, hipR: 24, kneeR: -14, tail: -16, tailTip: -14 }),
  walkB: p({ bodyY: -2, shoulderL: 24, elbowL: -10, shoulderR: -24, elbowR: 14, hipL: 24, kneeL: -14, hipR: -22, kneeR: 12, tail: -12, tailTip: -16 }),

  // Испугался: выгнул спину, хвост трубой, уши прижаты
  startle: p({ bodyY: -5, lean: -8, squash: 1.04, shoulderL: -14, elbowL: 8, shoulderR: -10, elbowR: 6, hipL: -8, kneeL: 10, hipR: -4, kneeR: 8, tail: -96, tailTip: -18, earL: -24, earR: 24, headTilt: -8 }),
  shrug: p({ lean: -34, shoulderL: -58, elbowL: -34, shoulderR: -50, elbowR: -30, hipL: 26, kneeL: -46, hipR: 30, kneeR: -44, headTilt: -8, earL: -10, earR: 10, tail: -8, tailTip: 12 }),
  proud: p({ lean: -32, shoulderL: 34, shoulderR: 30, hipL: 26, kneeL: -46, hipR: 30, kneeR: -44, tail: -78, tailTip: -6, headTilt: -4 }),
  listen: p({ lean: -34, shoulderL: 32, shoulderR: 28, hipL: 26, kneeL: -46, hipR: 30, kneeR: -44, earL: 10, earR: -10, headTilt: -6, tail: 10, tailTip: 14 }),
  shy: p({ lean: -26, shoulderL: 28, elbowL: 6, shoulderR: 24, elbowR: 6, hipL: 26, kneeL: -46, hipR: 30, kneeR: -44, earL: -16, earR: 16, headTilt: 14, tail: -22, tailTip: -26 }),
  // Плюхнулся на попу
  fall: p({ bodyY: 4, lean: -52, squash: 0.96, shoulderL: -74, elbowL: 44, shoulderR: -68, elbowR: 40, hipL: 34, kneeL: -58, hipR: 38, kneeR: -56, tail: 44, tailTip: 30, earL: -18, earR: 18, headTilt: -14 }),
} satisfies Record<string, K4Pose>;

export type K4PoseName = keyof typeof K4_POSES;

// ── Мордочка ───────────────────────────────────────────────────────────────

export interface K4Face {
  eye: 'round' | 'happy' | 'closed' | 'wide' | 'squint' | 'spiral' | 'star' | 'heart';
  mouth: 'cat' | 'open' | 'small' | 'flat' | 'wave' | 'sad' | 'grin';
  brow?: number;
  blush?: number;
  extra?: 'none' | 'sweat' | 'spark' | 'question' | 'excl' | 'zzz';
}

export const K4_FACES = {
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
} as const satisfies Record<string, K4Face>;

export type K4FaceName = keyof typeof K4_FACES;
export type K4Refs = Record<string, SVGGElement | null>;

// ── Тело ───────────────────────────────────────────────────────────────────

export default function Kitten4({ refs, face, blink, id = 'k4' }:
  { refs: K4Refs; face: K4FaceName; blink?: boolean; id?: string }) {
  const f: K4Face = K4_FACES[face];
  const eye = blink && f.eye !== 'spiral' ? 'closed' : f.eye;
  const set = (k: string) => (el: SVGGElement | null) => { refs[k] = el; };

  return (
    <g ref={set('root')}>
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.cap} />
          <stop offset="100%" stopColor={C.capDark} />
        </linearGradient>
        <linearGradient id={`${id}-head`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.cap} />
          <stop offset="62%" stopColor={C.cap} />
          <stop offset="100%" stopColor={C.capDark} />
        </linearGradient>
        <radialGradient id={`${id}-sh`}>
          <stop offset="0%" stopColor="black" stopOpacity="0.24" />
          <stop offset="100%" stopColor="black" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-skull`}>
          <rect x="12" y="-80" width="44" height="43" rx="21" />
        </clipPath>
        <clipPath id={`${id}-torso`}>
          <rect x="-36" y="-48" width="56" height="32" rx="16" />
        </clipPath>
      </defs>

      <g ref={set('shadow')}>
        <ellipse cx="-6" cy="1" rx="30" ry="4.4" fill={`url(#${id}-sh)`} />
      </g>

      <g ref={set('lift')}>
        {/* Хвост и задние лапы держатся пола: наклон корпуса их не крутит,
            иначе в позе «столбиком» кот встаёт на голову */}
        <Tail set={set} />
        <Leg set={set} kind="back" far />

        <g ref={set('body')}>
          <Leg set={set} kind="front" far />

          {/* Корпус: спинка темнее, животик светлый */}
          <rect x="-36" y="-48" width="56" height="32" rx="16" fill={`url(#${id}-body)`} />
          <g clipPath={`url(#${id}-torso)`}>
            <ellipse cx="-4" cy="-19" rx="24" ry="10" fill={C.fur} />
            <g stroke={C.stripe} strokeWidth="3" strokeLinecap="round" opacity="0.55" fill="none">
              <path d="M-26,-47 q3,7 1,12" />
              <path d="M-15,-48 q3,8 1,13" />
              <path d="M-4,-48 q3,8 1,13" />
            </g>
          </g>
          <rect x="-36" y="-48" width="56" height="32" rx="16" fill="none" stroke={C.furEdge} strokeWidth="1.5" opacity="0.75" />

          <Leg set={set} kind="front" />

          {/* Голова */}
          <g ref={set('headTilt')}>
            <g ref={set('headTurn')}>
              <Ear set={set} side="L" />
              <Ear set={set} side="R" />

              <rect x="12" y="-80" width="44" height="43" rx="21" fill={`url(#${id}-head)`} />
              <g clipPath={`url(#${id}-skull)`}>
                <g stroke={C.stripe} strokeWidth="2.6" strokeLinecap="round" opacity="0.8" fill="none">
                  <path d="M27,-80 l2,9 M34,-81 l0,10 M41,-80 l-2,9" />
                </g>
                <ellipse cx="34" cy="-45" rx="18.5" ry="12" fill={C.fur} />
              </g>
              <rect x="12" y="-80" width="44" height="43" rx="21" fill="none" stroke={C.furEdge} strokeWidth="1.5" opacity="0.8" />

              {f.blush ? (
                <>
                  <ellipse cx="19" cy="-50" rx="5" ry="3.1" fill={C.blush} opacity={f.blush * 0.5} />
                  <ellipse cx="49" cy="-50" rx="5" ry="3.1" fill={C.blush} opacity={f.blush * 0.5} />
                </>
              ) : null}

              <g stroke={C.furEdge} strokeWidth="1.1" strokeLinecap="round" opacity="0.8">
                <path d="M24,-49 l-13,-4 M24,-46 l-14,1 M24,-43 l-12,5" />
                <path d="M44,-49 l13,-4 M44,-46 l14,1 M44,-43 l12,5" />
              </g>

              <g ref={set('pupils')}><Eyes shape={eye} /></g>
              {f.brow ? <Brows tilt={f.brow} /> : null}
              <path d="M34,-46 l-3,-3.2 h6 z" fill={C.inner} />
              <Mouth shape={f.mouth} />
              <Extra kind={f.extra || 'none'} />
            </g>
          </g>

          {/* Ошейник со значком Flux — на шее, поверх стыка головы и корпуса */}
          <path d="M17,-45 q9,9 19,3" fill="none" stroke={C.collar} strokeWidth="4.6" strokeLinecap="round" />
          <circle cx="28" cy="-38.5" r="3.8" fill={C.tag} stroke={C.collar} strokeWidth="0.8" />
          <g stroke={C.collar} strokeWidth="1" fill="none" strokeLinecap="round">
            <path d="M26,-39.5 q1,-1.1 2,0 t2,0" />
            <path d="M26,-37.3 q1,1.1 2,0 t2,0" />
          </g>
        </g>

        {/* Ближняя задняя лапа поверх корпуса — даёт глубину */}
        <Leg set={set} kind="back" />
      </g>
    </g>
  );
}

function Tail({ set }: { set: (k: string) => (el: SVGGElement | null) => void }) {
  return (
    <g ref={set('tail')}>
      <path d="M-33,-40 c-9,1 -13,-5 -13,-12" fill="none" stroke={C.capDark} strokeWidth="9" strokeLinecap="round" />
      <g ref={set('tailTip')}>
        <path d="M-46,-52 c0,-8 4,-13 10,-15" fill="none" stroke={C.capDark} strokeWidth="8.4" strokeLinecap="round" />
        <g stroke={C.stripe} strokeWidth="2.6" strokeLinecap="round" opacity="0.7">
          <path d="M-46.5,-57 l4,0.6" />
          <path d="M-43,-63 l4,1.4" />
        </g>
        <path d="M-37.5,-66.5 c1.5,-0.5 2,-0.6 2.5,-0.5" fill="none" stroke={C.fur} strokeWidth="8" strokeLinecap="round" />
      </g>
    </g>
  );
}

function Ear({ set, side }: { set: (k: string) => (el: SVGGElement | null) => void; side: 'L' | 'R' }) {
  const d = side === 'L'
    ? 'M15,-69 q-1,-18 4,-24 q8,5 12,19 z'
    : 'M53,-69 q1,-18 -4,-24 q-8,5 -12,19 z';
  const inner = side === 'L'
    ? 'M18.8,-70 q-0.5,-11 2.6,-15.5 q4.4,3.8 7,12 z'
    : 'M49.2,-70 q0.5,-11 -2.6,-15.5 q-4.4,3.8 -7,12 z';
  return (
    <g ref={set(side === 'L' ? 'earL' : 'earR')}>
      <path d={d} fill={C.cap} stroke={C.furEdge} strokeWidth="1.5" strokeLinejoin="round" />
      <path d={inner} fill={C.inner} />
    </g>
  );
}

function Leg({ set, kind, far }:
  { set: (k: string) => (el: SVGGElement | null) => void; kind: 'front' | 'back'; far?: boolean }) {
  const front = kind === 'front';
  const x = (front ? FRONT_X : BACK_X) + (far ? FAR : 0);
  const top = front ? SH_Y : HIP_Y;
  const knee = front ? FKNEE_Y : BKNEE_Y;
  const fill = far ? C.capFar : C.capDark;
  const pawFill = far ? C.furShade : C.paw;
  const key = front ? (far ? 'shoulderR' : 'shoulderL') : (far ? 'hipR' : 'hipL');
  const kkey = front ? (far ? 'elbowR' : 'elbowL') : (far ? 'kneeR' : 'kneeL');
  return (
    <g ref={set(key)}>
      {/* У задней лапы бедро крупное и круглое — узнаваемая кошачья форма */}
      {front
        ? <rect x={x - 5} y={top - 2} width="10" height="17" rx="5" fill={fill} />
        : <ellipse cx={x - 1} cy={top + 5} rx="10.5" ry="10" fill={fill} />}
      <g ref={set(kkey)}>
        <rect x={x - 4.4} y={knee - 3} width="8.8" height="19" rx="4.4" fill={fill} />
        <rect x={x - 5.6} y="-6" width="12.6" height="6.4" rx="3.2" fill={pawFill}
          stroke={far ? 'none' : C.furEdge} strokeWidth="1.1" />
      </g>
    </g>
  );
}

// ── Черты мордочки ─────────────────────────────────────────────────────────

const EX = 9.5, ECX = 34, EY = -58;

function Eyes({ shape }: { shape: string }) {
  const k = C.ink;
  const L = ECX - EX, R = ECX + EX;
  if (shape === 'closed') return (
    <g stroke={k} strokeWidth="2.3" fill="none" strokeLinecap="round">
      <path d={`M${L - 4.6},${EY + 1} q4.6,-5 9.2,0`} />
      <path d={`M${R - 4.6},${EY + 1} q4.6,-5 9.2,0`} />
    </g>
  );
  if (shape === 'happy') return (
    <g stroke={k} strokeWidth="2.7" fill="none" strokeLinecap="round">
      <path d={`M${L - 5},${EY + 2} q5,-7.6 10,0`} />
      <path d={`M${R - 5},${EY + 2} q5,-7.6 10,0`} />
    </g>
  );
  if (shape === 'squint') return (
    <g stroke={k} strokeWidth="2.5" fill="none" strokeLinecap="round">
      <path d={`M${L - 5},${EY - 1} q5,3.4 10,0`} />
      <path d={`M${R - 5},${EY - 1} q5,3.4 10,0`} />
    </g>
  );
  if (shape === 'spiral') return (
    <g stroke={k} strokeWidth="1.7" fill="none" strokeLinecap="round">
      <path d={`M${L + 3},${EY} a3.3,3.3 0 1 1 -3,-2.2 a1.9,1.9 0 1 0 1.8,1.4`} />
      <path d={`M${R + 3},${EY} a3.3,3.3 0 1 1 -3,-2.2 a1.9,1.9 0 1 0 1.8,1.4`} />
    </g>
  );
  if (shape === 'heart') return (
    <g fill="oklch(0.62 0.19 18)">
      <path d={`M${L},${EY + 5} c-5.6,-4.4 -5.6,-9.4 -2.2,-9.4 c1.4,0 2.2,1.1 2.2,2 c0,-0.9 0.8,-2 2.2,-2 c3.4,0 3.4,5 -2.2,9.4 z`} />
      <path d={`M${R},${EY + 5} c-5.6,-4.4 -5.6,-9.4 -2.2,-9.4 c1.4,0 2.2,1.1 2.2,2 c0,-0.9 0.8,-2 2.2,-2 c3.4,0 3.4,5 -2.2,9.4 z`} />
    </g>
  );
  if (shape === 'star') return (
    <g fill={k}>
      {[L, R].map((cx, i) => (
        <path key={i} d={`M${cx},${EY - 7} l2.1,4.4 l4.8,0.7 l-3.5,3.4 l0.8,4.8 l-4.2,-2.3 l-4.2,2.3 l0.8,-4.8 l-3.5,-3.4 l4.8,-0.7 z`} />
      ))}
    </g>
  );
  const rx = shape === 'wide' ? 6.6 : 6;
  const ry = shape === 'wide' ? 7.6 : 7;
  return (
    <g>
      {[L, R].map((cx, i) => (
        <g key={i}>
          <ellipse cx={cx} cy={EY} rx={rx} ry={ry} fill={k} />
          <ellipse cx={cx} cy={EY} rx={rx * 0.28} ry={ry * 0.84} fill="black" opacity="0.5" />
          <circle cx={cx + 2} cy={EY - 2.5} r="2.1" fill="white" />
          <circle cx={cx - 1.9} cy={EY + 2.7} r="1" fill="white" opacity="0.8" />
        </g>
      ))}
    </g>
  );
}

function Brows({ tilt }: { tilt: number }) {
  const y = EY - 9.5;
  const L = ECX - EX, R = ECX + EX;
  return (
    <g stroke={C.ink} strokeWidth="2.1" strokeLinecap="round" opacity="0.7">
      <path d={`M${L - 4},${y} h8`} transform={`rotate(${tilt} ${L} ${y})`} />
      <path d={`M${R - 4},${y} h8`} transform={`rotate(${-tilt} ${R} ${y})`} />
    </g>
  );
}

function Mouth({ shape }: { shape: string }) {
  const k = C.ink;
  const s = { stroke: k, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const };
  const y = -44.5;
  switch (shape) {
    case 'grin':  return <path d={`M${ECX - 5},${y} a5,5 0 0 0 10,0 z`} fill={k} />;
    case 'open':  return <ellipse cx={ECX} cy={y + 2} rx="3.7" ry="3.2" fill={k} />;
    case 'small': return <circle cx={ECX} cy={y + 2} r="1.9" fill={k} />;
    case 'flat':  return <path d={`M${ECX - 4},${y + 1} h8`} {...s} />;
    case 'wave':  return <path d={`M${ECX - 5},${y + 1} q2.5,-2.2 5,0 t5,0`} {...s} />;
    case 'sad':   return <path d={`M${ECX - 4.6},${y + 3} q4.6,-4 9.2,0`} {...s} />;
    default:      return <path d={`M${ECX - 5.4},${y} q2.7,3.1 5.4,0 q2.7,3.1 5.4,0`} {...s} />;
  }
}

function Extra({ kind }: { kind: string }) {
  switch (kind) {
    case 'sweat': return <path d="M55,-76 q3.2,4.2 0,6.4 q-3.2,-2.2 0,-6.4 z" fill="oklch(0.80 0.09 230)" opacity="0.9" className="flux-flx-sweat" />;
    case 'spark': return (
      <g fill="oklch(0.84 0.15 90)">
        <path d="M61,-86 l1.6,3.5 l3.5,1.6 l-3.5,1.6 l-1.6,3.5 l-1.6,-3.5 l-3.5,-1.6 l3.5,-1.6 z" className="flux-flx-spark1" />
        <path d="M10,-76 l1.1,2.5 l2.5,1.1 l-2.5,1.1 l-1.1,2.5 l-1.1,-2.5 l-2.5,-1.1 l2.5,-1.1 z" opacity="0.8" className="flux-flx-spark2" />
      </g>
    );
    case 'question': return <text x="59" y="-80" fontSize="14" fontWeight="800" fill={C.capDark} className="flux-flx-pop">?</text>;
    case 'excl': return <text x="59" y="-80" fontSize="14" fontWeight="800" fill="oklch(0.72 0.16 55)" className="flux-flx-pop">!</text>;
    case 'zzz': return (
      <g fill={C.capDark}>
        <text x="57" y="-82" fontSize="11" fontWeight="800" opacity="0.75" className="flux-robot-z">z</text>
        <text x="64" y="-90" fontSize="8.5" fontWeight="800" opacity="0.55" className="flux-robot-z2">z</text>
      </g>
    );
    default: return null;
  }
}

export function applyKitten4(refs: K4Refs, j: K4Pose, x: number, floor: number, scale: number, flip = 1) {
  const set = (k: string, tr: string) => { const el = refs[k]; if (el) el.setAttribute('transform', tr); };
  const rot = (a: number, k: string) => `rotate(${a.toFixed(2)} ${K4_PIVOTS[k][0]} ${K4_PIVOTS[k][1]})`;
  set('root', `translate(${x} ${floor}) scale(${(scale * flip).toFixed(3)} ${scale.toFixed(3)})`);
  set('lift', `translate(0 ${j.bodyY.toFixed(2)})`);
  set('body', `${rot(j.lean, 'lean')} translate(0 ${RUMP[1]}) scale(1 ${j.squash.toFixed(3)}) translate(0 ${-RUMP[1]})`);
  set('headTilt', rot(j.headTilt, 'headTilt'));
  set('headTurn', `translate(${j.headTurn.toFixed(2)} 0)`);
  for (const k of ['shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR', 'earL', 'earR', 'tail', 'tailTip']) {
    set(k, rot((j as any)[k], k));
  }
  const sh = refs.shadow;
  if (sh) {
    const s = Math.max(0.42, Math.min(1.15, 1 + j.bodyY / 34));
    sh.setAttribute('transform', `scale(${s.toFixed(3)} 1)`);
    sh.setAttribute('opacity', String(Math.max(0.35, s)));
  }
}
