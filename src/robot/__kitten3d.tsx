import React from 'react';

/**
 * ЧЕРНОВИК: объёмный котёнок. В приложение не входит.
 *
 * Отличие от плоской версии — не форма, а светотень. Объём собирается из
 * четырёх слоёв на каждой части: пушистая подложка чуть больше самой части,
 * заливка градиентом (свет сверху-слева), собственная тень снизу и падающая
 * тень от того, что выше. Контуров нет вовсе: край держит подложка.
 *
 * Вид — три четверти спереди: так видно грудь, обе передние лапы и всю
 * мордочку, как на живых котятах. Смотрит на нас, поэтому это его домашняя поза.
 */

export const K3_HEIGHT = 120;

const HEAD: [number, number] = [0, -70];
const NECK: [number, number] = [0, -46];
const HIP_Y = -12;

export const K3_PIVOTS: Record<string, [number, number]> = {
  lean: [0, -4], headTilt: NECK, headTurn: NECK,
  earL: [-14, -84], earR: [14, -84],
  shoulderL: [-13, -30], elbowL: [-13, -16],
  shoulderR: [13, -30], elbowR: [13, -16],
  hipL: [-26, HIP_Y], kneeL: [-26, -6],
  hipR: [26, HIP_Y], kneeR: [26, -6],
  tail: [12, -8], tailTip: [37, -27],
};

const C = {
  // Рыжий табби: пять ступеней от подпалины до глубокой тени
  cream: 'oklch(0.975 0.014 82)',
  light: 'oklch(0.935 0.035 76)',
  mid: 'oklch(0.855 0.085 68)',
  deep: 'oklch(0.775 0.115 62)',
  shade: 'oklch(0.685 0.115 55)',
  deepest: 'oklch(0.60 0.105 50)',
  stripe: 'oklch(0.665 0.125 54)',
  ear: 'oklch(0.845 0.075 22)',
  nose: 'oklch(0.755 0.105 18)',
  iris: 'oklch(0.70 0.135 78)',
  irisDeep: 'oklch(0.48 0.105 66)',
  pupil: 'oklch(0.20 0.02 60)',
  line: 'oklch(0.34 0.035 55)',
  collar: 'oklch(0.56 0.135 163)',
  tag: 'oklch(0.84 0.15 95)',
};

export type K3Joint =
  | 'bodyY' | 'lean' | 'squash' | 'headTilt' | 'headTurn'
  | 'shoulderL' | 'elbowL' | 'shoulderR' | 'elbowR'
  | 'hipL' | 'kneeL' | 'hipR' | 'kneeR'
  | 'earL' | 'earR' | 'tail' | 'tailTip';

export type K3Pose = Record<K3Joint, number>;

export const K3_NEUTRAL: K3Pose = {
  bodyY: 0, lean: 0, squash: 1, headTilt: 0, headTurn: 0,
  shoulderL: 0, elbowL: 0, shoulderR: 0, elbowR: 0,
  hipL: 0, kneeL: 0, hipR: 0, kneeR: 0,
  earL: 0, earR: 0, tail: 0, tailTip: 0,
};

const p = (o: Partial<K3Pose>): K3Pose => ({ ...K3_NEUTRAL, ...o });

export const K3_POSES = {
  sit: K3_NEUTRAL,
  sitTail: p({ tail: 18, tailTip: 14, headTilt: -4 }),
  // Голову набок — самый милый жест, которым он спрашивает
  tilt: p({ headTilt: -13, earL: -5, earR: -8, tail: 12, tailTip: 10 }),
  // Лапку вверх
  pawUp: p({ shoulderL: -54, elbowL: 30, headTilt: -7, tail: 20, tailTip: 16 }),
  pawHigh: p({ shoulderL: -96, elbowL: 26, headTilt: -10, tail: 26, tailTip: 22 }),
  // Обе лапы вверх — радость
  cheer: p({ shoulderL: -104, elbowL: 22, shoulderR: -104, elbowR: -22, bodyY: -4, tail: -18, tailTip: -14 }),
  // Умывается
  groom: p({ shoulderL: -70, elbowL: 74, headTilt: 15, tail: -10, tailTip: -8 }),
  // Батон: осел, лапы спрятал
  loaf: p({ bodyY: 9, squash: 0.93, shoulderL: 42, elbowL: -40, shoulderR: 42, elbowR: 40, hipL: 8, hipR: -8, tail: -24, tailTip: -20, earL: -4, earR: 4 }),
  // Спит: осел ещё ниже, голова свесилась
  sleep: p({ bodyY: 12, squash: 0.9, shoulderL: 46, elbowL: -44, shoulderR: 46, elbowR: 44, hipL: 10, hipR: -10, headTilt: 16, tail: -40, tailTip: -34, earL: -9, earR: 9 }),
  // Потянулся вверх
  stretchUp: p({ bodyY: -5, squash: 1.05, shoulderL: -30, elbowL: 16, shoulderR: -30, elbowR: -16, headTilt: -6, tail: -46, tailTip: -30 }),
  // Тянется вперёд к предмету
  reach: p({ lean: 7, shoulderL: -46, elbowL: 20, shoulderR: -14, elbowR: -6, headTilt: 6, tail: -22, tailTip: -16 }),
  // Крадётся: прижался
  crouch: p({ bodyY: 7, squash: 0.94, lean: 4, shoulderL: 20, elbowL: -22, shoulderR: 20, elbowR: 22, headTilt: -3, earL: -7, earR: 7, tail: -4, tailTip: 16 }),
  // Прыжок
  pounce: p({ bodyY: -16, squash: 1.07, shoulderL: -64, elbowL: 22, shoulderR: -64, elbowR: -22, hipL: -12, hipR: 12, tail: -42, tailTip: -28, earL: -5, earR: 5 }),
  land: p({ bodyY: 5, squash: 0.89, shoulderL: 16, elbowL: -14, shoulderR: 16, elbowR: 14, tail: 28, tailTip: 18 }),
  // Испугался: шерсть дыбом, уши прижаты, хвост трубой
  startle: p({ bodyY: -7, squash: 1.05, shoulderL: -22, elbowL: 12, shoulderR: -22, elbowR: -12, tail: -78, tailTip: -14, earL: -22, earR: 22, headTilt: -6 }),
  // Смутился
  shy: p({ bodyY: 3, shoulderL: 24, elbowL: 10, shoulderR: 24, elbowR: -10, earL: -15, earR: 15, headTilt: 13, tail: -18, tailTip: -22 }),
  // Пожал плечами
  shrug: p({ shoulderL: -50, elbowL: -30, shoulderR: -50, elbowR: 30, headTilt: -7, earL: -9, earR: 9, tail: -6, tailTip: 10 }),
  proud: p({ bodyY: -2, headTilt: -3, tail: -66, tailTip: -6, earL: 4, earR: -4 }),
  listen: p({ lean: 5, headTilt: -5, earL: 9, earR: -9, tail: 8, tailTip: 12 }),
  // Месит лапами
  knead: p({ bodyY: 8, squash: 0.95, shoulderL: -28, elbowL: 26, shoulderR: 20, elbowR: -20, headTilt: -4, tail: -16, tailTip: -14 }),
  // Шаг на месте: фазы, между которыми качается корпус
  stepA: p({ bodyY: -2, shoulderL: -22, elbowL: 12, shoulderR: 14, elbowR: -8, hipL: -8, hipR: 6, tail: -14, tailTip: -12, lean: 2 }),
  stepB: p({ bodyY: -2, shoulderL: 14, elbowL: -8, shoulderR: -22, elbowR: 12, hipL: 6, hipR: -8, tail: -10, tailTip: -14, lean: -2 }),
  fall: p({ bodyY: 8, squash: 0.94, lean: -10, shoulderL: -76, elbowL: 36, shoulderR: -76, elbowR: -36, tail: 40, tailTip: 26, earL: -16, earR: 16, headTilt: -12 }),
} satisfies Record<string, K3Pose>;

export type K3PoseName = keyof typeof K3_POSES;

// ── Мордочка ───────────────────────────────────────────────────────────────

export interface K3Face {
  eye: 'open' | 'happy' | 'closed' | 'wide' | 'squint' | 'spiral' | 'star' | 'heart';
  mouth: 'cat' | 'open' | 'small' | 'flat' | 'wave' | 'sad' | 'grin';
  brow?: number;
  extra?: 'none' | 'sweat' | 'spark' | 'question' | 'excl' | 'zzz';
}

export const K3_FACES = {
  neutral:  { eye: 'open',   mouth: 'cat' },
  happy:    { eye: 'happy',  mouth: 'grin' },
  delight:  { eye: 'star',   mouth: 'open', extra: 'spark' },
  curious:  { eye: 'wide',   mouth: 'small', brow: -7, extra: 'question' },
  surprise: { eye: 'wide',   mouth: 'open', brow: -11, extra: 'excl' },
  proud:    { eye: 'squint', mouth: 'grin', brow: 6 },
  shy:      { eye: 'happy',  mouth: 'wave', extra: 'sweat' },
  tired:    { eye: 'squint', mouth: 'wave', brow: 4, extra: 'sweat' },
  sleep:    { eye: 'closed', mouth: 'small', extra: 'zzz' },
  dizzy:    { eye: 'spiral', mouth: 'wave' },
  focus:    { eye: 'squint', mouth: 'flat', brow: 9 },
  sad:      { eye: 'wide',   mouth: 'sad', brow: -9 },
  love:     { eye: 'heart',  mouth: 'cat' },
  cross:    { eye: 'squint', mouth: 'sad', brow: 12, extra: 'excl' },
} as const satisfies Record<string, K3Face>;

export type K3FaceName = keyof typeof K3_FACES;
export type K3Refs = Record<string, SVGGElement | null>;

// ── Тело ───────────────────────────────────────────────────────────────────

export default function Kitten3d({ refs, face, blink, id = 'k3' }:
  { refs: K3Refs; face: K3FaceName; blink?: boolean; id?: string }) {
  const f: K3Face = K3_FACES[face];
  const eye = blink && f.eye !== 'spiral' ? 'closed' : f.eye;
  const set = (k: string) => (el: SVGGElement | null) => { refs[k] = el; };
  const u = (n: string) => `url(#${id}-${n})`;

  return (
    <g ref={set('root')}>
      <defs>
        {/* Свет сверху-слева: смещённый фокус даёт круглость без обводки */}
        <radialGradient id={`${id}-head`} cx="0.36" cy="0.24" r="0.82">
          <stop offset="0%" stopColor={C.light} />
          <stop offset="46%" stopColor={C.mid} />
          <stop offset="82%" stopColor={C.deep} />
          <stop offset="100%" stopColor={C.shade} />
        </radialGradient>
        <radialGradient id={`${id}-body`} cx="0.36" cy="0.18" r="0.88">
          <stop offset="0%" stopColor={C.mid} />
          <stop offset="55%" stopColor={C.deep} />
          <stop offset="100%" stopColor={C.shade} />
        </radialGradient>
        <radialGradient id={`${id}-ruff`} cx="0.42" cy="0.2" r="0.85">
          <stop offset="0%" stopColor="white" />
          <stop offset="60%" stopColor={C.cream} />
          <stop offset="100%" stopColor={C.light} />
        </radialGradient>
        <linearGradient id={`${id}-limb`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0%" stopColor={C.light} />
          <stop offset="55%" stopColor={C.cream} />
          <stop offset="100%" stopColor={C.mid} />
        </linearGradient>
        <linearGradient id={`${id}-tail`} x1="0" y1="1" x2="0.5" y2="0">
          <stop offset="0%" stopColor={C.deep} />
          <stop offset="100%" stopColor={C.mid} />
        </linearGradient>
        <radialGradient id={`${id}-ear`} cx="0.5" cy="0.85" r="0.8">
          <stop offset="0%" stopColor={C.ear} />
          <stop offset="100%" stopColor={C.light} />
        </radialGradient>
        <radialGradient id={`${id}-iris`} cx="0.42" cy="0.32" r="0.75">
          <stop offset="0%" stopColor={C.iris} />
          <stop offset="62%" stopColor={C.iris} />
          <stop offset="100%" stopColor={C.irisDeep} />
        </radialGradient>
        {/* Мягкая тень на полу: без фильтров, одним градиентом */}
        <radialGradient id={`${id}-floor`}>
          <stop offset="0%" stopColor="oklch(0.45 0.06 55)" stopOpacity="0.30" />
          <stop offset="60%" stopColor="oklch(0.45 0.06 55)" stopOpacity="0.13" />
          <stop offset="100%" stopColor="oklch(0.45 0.06 55)" stopOpacity="0" />
        </radialGradient>
        {/* Собственная тень: тёмный низ, прозрачный верх */}
        <linearGradient id={`${id}-occl`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={C.deepest} stopOpacity="0.5" />
          <stop offset="55%" stopColor={C.deepest} stopOpacity="0.14" />
          <stop offset="100%" stopColor={C.deepest} stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clipHead`}>
          <ellipse cx="0" cy="-70" rx="28" ry="25.6" />
        </clipPath>
        <clipPath id={`${id}-clipBody`}>
          <path d={BODY_D} />
        </clipPath>
      </defs>

      <g ref={set('shadow')}>
        <ellipse cx="0" cy="0" rx="34" ry="6" fill={u('floor')} />
      </g>

      <g ref={set('lift')}>
        {/* Хвост уходит за корпус */}
        <g ref={set('tail')}>
          <path d="M12,-8 C30,-8 38,-16 37,-28" fill="none" stroke={C.light} strokeWidth="14.5" strokeLinecap="round" opacity="0.8" />
          <path d="M12,-8 C30,-8 38,-16 37,-28" fill="none" stroke={u('tail')} strokeWidth="11.5" strokeLinecap="round" />
          <g ref={set('tailTip')}>
            <path d="M37,-27 C36,-40 40,-49 47,-53" fill="none" stroke={C.light} strokeWidth="13.5" strokeLinecap="round" opacity="0.8" />
            <path d="M37,-27 C36,-40 40,-49 47,-53" fill="none" stroke={u('tail')} strokeWidth="10.6" strokeLinecap="round" />
            <g stroke={C.stripe} strokeWidth="4" strokeLinecap="round" opacity="0.42">
              <path d="M35.8,-36 l3.4,1" />
              <path d="M38.6,-44 l3.4,1.6" />
            </g>
            <path d="M45,-52.4 C46.6,-53 47,-53 47.4,-53" fill="none" stroke={C.cream} strokeWidth="10.2" strokeLinecap="round" />
          </g>
        </g>

        <g ref={set('body')}>
          {/* Пушистая подложка: край мягкий, потому что светлее и шире */}
          <path d={BODY_D} fill={C.light} transform="scale(1.045)" opacity="0.85" />
          <path d={FLUFF_D} fill={C.light} opacity="0.9" />
          <path d={BODY_D} fill={u('body')} />

          <g clipPath={`url(#${id}-clipBody)`}>
            {/* Полоски по бокам */}
            <g stroke={C.stripe} strokeWidth="4.6" strokeLinecap="round" opacity="0.28" fill="none">
              <path d="M-27,-36 q5,7 4,14" />
              <path d="M-29,-20 q6,6 5,12" />
              <path d="M27,-36 q-5,7 -4,14" />
              <path d="M29,-20 q-6,6 -5,12" />
            </g>
            {/* Собственная тень корпуса снизу */}
            <path d={BODY_D} fill={u('occl')} />
            {/* Свет по левому верху */}
            <ellipse cx="-14" cy="-38" rx="13" ry="9" fill="white" opacity="0.20" transform="rotate(-24 -14 -38)" />
          </g>

          {/* Грудь и живот — светлая шерсть */}
          <path d={RUFF_D} fill={u('ruff')} />
          <path d={RUFF_D} fill={u('occl')} opacity="0.5" />

          <Leg set={set} side={-1} u={u} />
          <Leg set={set} side={1} u={u} />

          {/* Ошейник с биркой Flux */}
          <path d="M-15,-45.5 q15,9 30,-1" fill="none" stroke={C.collar} strokeWidth="5" strokeLinecap="round" />
          <path d="M-15,-45.5 q15,9 30,-1" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.28" />
          <circle cx="0" cy="-37.5" r="4.2" fill={C.tag} />
          <circle cx="-1.2" cy="-38.8" r="1.4" fill="white" opacity="0.55" />

          <g ref={set('headTilt')}>
            <g ref={set('headTurn')}>
              <Ear set={set} side={-1} u={u} />
              <Ear set={set} side={1} u={u} />

              {/* Голова: подложка, щёчная опушка, заливка, тень под подбородком */}
              <ellipse cx="0" cy="-70" rx="29.5" ry="27" fill={C.light} opacity="0.85" />
              <path d={CHEEK_D} fill={C.light} opacity="0.92" />
              <ellipse cx="0" cy="-70" rx="28" ry="25.6" fill={u('head')} />
              <g clipPath={`url(#${id}-clipHead)`}>
                {/* Полоски «М» на лбу */}
                <g stroke={C.stripe} strokeWidth="3.4" strokeLinecap="round" opacity="0.4" fill="none">
                  <path d="M-10,-94 q1.4,6 0.6,10" />
                  <path d="M0,-95.5 q0,6 0,10.5" />
                  <path d="M10,-94 q-1.4,6 -0.6,10" />
                  <path d="M-22,-86 q3,4.5 3.4,7" />
                  <path d="M22,-86 q-3,4.5 -3.4,7" />
                </g>
                {/* Блик сверху-слева и тень снизу */}
                <ellipse cx="-10" cy="-85" rx="12" ry="7" fill="white" opacity="0.26" transform="rotate(-18 -10 -85)" />
                <ellipse cx="0" cy="-43" rx="28" ry="13" fill={C.shade} opacity="0.25" />
              </g>

              {/* Светлая маска вокруг носа и рта */}
              <ellipse cx="0" cy="-56" rx="17" ry="12" fill={C.cream} opacity="0.85" />
              <ellipse cx="-7.5" cy="-53" rx="8" ry="6.4" fill={C.cream} />
              <ellipse cx="7.5" cy="-53" rx="8" ry="6.4" fill={C.cream} />
              <ellipse cx="-7.5" cy="-51.5" rx="8" ry="5" fill={u('occl')} opacity="0.5" />
              <ellipse cx="7.5" cy="-51.5" rx="8" ry="5" fill={u('occl')} opacity="0.5" />

              <g stroke={C.shade} strokeWidth="1.1" strokeLinecap="round" opacity="0.5" fill="none">
                <path d="M-14,-57 C-22,-59 -27,-60 -32,-59" />
                <path d="M-14,-54 C-22,-54 -28,-53 -33,-51.5" />
                <path d="M-14,-51 C-22,-49.5 -26,-48 -30,-45.5" />
                <path d="M14,-57 C22,-59 27,-60 32,-59" />
                <path d="M14,-54 C22,-54 28,-53 33,-51.5" />
                <path d="M14,-51 C22,-49.5 26,-48 30,-45.5" />
              </g>

              <g ref={set('pupils')}><Eyes shape={eye} u={u} /></g>
              {f.brow ? <Brows tilt={f.brow} /> : null}
              <Nose />
              <Mouth shape={f.mouth} />
              <Extra kind={f.extra || 'none'} />
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

// Силуэты вынесены: их же используют подложка и обтравка
const BODY_D =
  'M-18,-50 C-27,-40 -30,-24 -29,-12 C-28,-4 -22,-0.5 -14,-0.5 L14,-0.5 C22,-0.5 28,-4 29,-12 C30,-24 27,-40 18,-50 Z';
const FLUFF_D =
  'M-28,-32 q-5,4 -3,9 q-4,3 -2,8 q-3,4 1,7 l4,2 z M28,-32 q5,4 3,9 q4,3 2,8 q3,4 -1,7 l-4,2 z';
const RUFF_D =
  'M-10,-49 C-15,-38 -16,-24 -13,-12 C-11,-5 -6,-2 0,-2 C6,-2 11,-5 13,-12 C16,-24 15,-38 10,-49 Z';
const CHEEK_D =
  'M-27,-62 q-6,4 -4,9 q-3,4 2,7 q4,3 9,2 z M27,-62 q6,4 4,9 q3,4 -2,7 q-4,3 -9,2 z';

function Ear({ set, side, u }:
  { set: (k: string) => (el: SVGGElement | null) => void; side: 1 | -1; u: (n: string) => string }) {
  const s = side;
  // Ухо: внутреннее основание на макушке, кончик высоко, наружное основание у виска
  const halo = `M${6 * s},-84 C${6 * s},-96 ${11 * s},-106 ${19 * s},-111 C${29 * s},-104 ${34 * s},-92 ${34 * s},-79 Z`;
  const d = `M${8 * s},-85 C${8.5 * s},-95 ${13 * s},-104 ${19.5 * s},-108 C${28 * s},-101 ${32 * s},-90 ${32 * s},-80 Z`;
  const inner = `M${13 * s},-85 C${13 * s},-93 ${16 * s},-99 ${20 * s},-102 C${25.5 * s},-96 ${28 * s},-89 ${28 * s},-82 Z`;
  return (
    <g ref={set(s === -1 ? 'earL' : 'earR')}>
      <path d={halo} fill={C.light} opacity="0.85" />
      <path d={d} fill={u('head')} />
      <path d={inner} fill={u('ear')} />
      {/* Пучок шерсти в ухе */}
      <g stroke={C.cream} strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
        <path d={`M${15 * s},-87 l${1.6 * s},-6`} />
        <path d={`M${19 * s},-88 l${1.2 * s},-6`} />
        <path d={`M${23 * s},-87 l${0.6 * s},-5`} />
      </g>
    </g>
  );
}

function Leg({ set, side, u }:
  { set: (k: string) => (el: SVGGElement | null) => void; side: 1 | -1; u: (n: string) => string }) {
  const x = 13 * side;
  return (
    <g ref={set(side === -1 ? 'shoulderL' : 'shoulderR')}>
      <g ref={set(side === -1 ? 'elbowL' : 'elbowR')}>
        {/* Передняя лапа: столбик и мягкая ступня с пальцами */}
        <path d={`M${x - 6.6},-24 C${x - 7.4},-14 ${x - 7.8},-7 ${x - 7.4},-3
                  C${x - 7.2},-0.2 ${x + 7.2},-0.2 ${x + 7.4},-3
                  C${x + 7.8},-7 ${x + 7.4},-14 ${x + 6.6},-24 Z`} fill={C.light} opacity="0.9" />
        <path d={`M${x - 5.6},-24 C${x - 6.4},-14 ${x - 6.8},-7 ${x - 6.4},-3.2
                  C${x - 6.2},-0.6 ${x + 6.2},-0.6 ${x + 6.4},-3.2
                  C${x + 6.8},-7 ${x + 6.4},-14 ${x + 5.6},-24 Z`} fill={u('limb')} />
        {/* Тень от груди на лапу — она и отделяет лапу от корпуса */}
        <path d={`M${x - 5.6},-24 C${x - 6.4},-14 ${x - 6.8},-7 ${x - 6.4},-3.2
                  C${x - 6.2},-0.6 ${x + 6.2},-0.6 ${x + 6.4},-3.2
                  C${x + 6.8},-7 ${x + 6.4},-14 ${x + 5.6},-24 Z`} fill={u('occl')} opacity="0.45" />
        <ellipse cx={x} cy={-3.6} rx="6.5" ry="3.4" fill={C.cream} opacity="0.85" />
        <g stroke={C.mid} strokeWidth="1.1" strokeLinecap="round" opacity="0.5" fill="none">
          <path d={`M${x - 2.4},-1 v-3.6`} />
          <path d={`M${x + 2.4},-1 v-3.6`} />
        </g>
      </g>
    </g>
  );
}

// ── Черты мордочки ─────────────────────────────────────────────────────────

const EX = 13.5, EY = -68;

function Eyes({ shape, u }: { shape: string; u: (n: string) => string }) {
  const k = C.line;
  if (shape === 'closed') return (
    <g stroke={k} strokeWidth="2.6" fill="none" strokeLinecap="round">
      <path d={`M${-EX - 6},${EY + 1} q6,-6 12,0`} />
      <path d={`M${EX - 6},${EY + 1} q6,-6 12,0`} />
    </g>
  );
  if (shape === 'happy') return (
    <g stroke={k} strokeWidth="3" fill="none" strokeLinecap="round">
      <path d={`M${-EX - 6.4},${EY + 2.4} q6.4,-9 12.8,0`} />
      <path d={`M${EX - 6.4},${EY + 2.4} q6.4,-9 12.8,0`} />
    </g>
  );
  if (shape === 'squint') return (
    <g stroke={k} strokeWidth="2.8" fill="none" strokeLinecap="round">
      <path d={`M${-EX - 6.4},${EY - 1} q6.4,4 12.8,0`} />
      <path d={`M${EX - 6.4},${EY - 1} q6.4,4 12.8,0`} />
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
      {[-EX, EX].map((cx, i) => (
        <path key={i} d={`M${cx},${EY + 6.5} c-7.6,-6 -7.6,-12.6 -3,-12.6 c1.9,0 3,1.5 3,2.7 c0,-1.2 1.1,-2.7 3,-2.7 c4.6,0 4.6,6.6 -3,12.6 z`} />
      ))}
    </g>
  );
  if (shape === 'star') return (
    <g fill={C.iris}>
      {[-EX, EX].map((cx, i) => (
        <g key={i}>
          <path d={`M${cx},${EY - 10} l2.9,6 l6.6,1 l-4.8,4.7 l1.1,6.6 l-5.8,-3.1 l-5.8,3.1 l1.1,-6.6 l-4.8,-4.7 l6.6,-1 z`} />
        </g>
      ))}
    </g>
  );
  const rx = shape === 'wide' ? 10 : 9.2;
  const ry = shape === 'wide' ? 11.4 : 10.6;
  return (
    <g>
      {[-EX, EX].map((cx, i) => (
        <g key={i}>
          {/* Впадина глазницы — она и даёт глубину */}
          <ellipse cx={cx} cy={EY + 0.6} rx={rx + 1.6} ry={ry + 1.4} fill={C.shade} opacity="0.22" />
          <ellipse cx={cx} cy={EY} rx={rx} ry={ry} fill={u('iris')} />
          {/* Тень верхнего века */}
          <path d={`M${cx - rx},${EY} a${rx},${ry} 0 0 1 ${rx * 2},0 z`} fill={C.irisDeep} opacity="0.32" />
          <ellipse cx={cx} cy={EY} rx={rx * 0.42} ry={ry * 0.86} fill={C.pupil} />
          <circle cx={cx - rx * 0.34} cy={EY - ry * 0.36} r={rx * 0.34} fill="white" opacity="0.96" />
          <circle cx={cx + rx * 0.36} cy={EY + ry * 0.34} r={rx * 0.17} fill="white" opacity="0.7" />
          {/* Обод: тонкая тёмная линия по верху */}
          <path d={`M${cx - rx - 0.4},${EY - 1} a${rx + 0.4},${ry + 0.4} 0 0 1 ${(rx + 0.4) * 2},0`}
            fill="none" stroke={C.line} strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

function Brows({ tilt }: { tilt: number }) {
  const y = EY - 14;
  return (
    <g stroke={C.shade} strokeWidth="2.4" strokeLinecap="round" opacity="0.6">
      <path d={`M${-EX - 5},${y} h10`} transform={`rotate(${tilt} ${-EX} ${y})`} />
      <path d={`M${EX - 5},${y} h10`} transform={`rotate(${-tilt} ${EX} ${y})`} />
    </g>
  );
}

function Nose() {
  return (
    <>
      <path d="M0,-49.6 C-4.4,-50 -5.4,-53.6 -3.2,-55 C-1.2,-56.2 1.2,-56.2 3.2,-55 C5.4,-53.6 4.4,-50 0,-49.6 Z" fill={C.nose} />
      <path d="M-1.6,-54.4 C-0.6,-55 0.8,-55 1.6,-54.6" fill="none" stroke="white" strokeWidth="1.1" strokeLinecap="round" opacity="0.6" />
    </>
  );
}

function Mouth({ shape }: { shape: string }) {
  const k = C.line;
  const s = { stroke: k, strokeWidth: 1.9, fill: 'none', strokeLinecap: 'round' as const, opacity: 0.85 };
  const y = -48.4;
  switch (shape) {
    case 'grin':  return <path d={`M-6,${y} a6,6 0 0 0 12,0 z`} fill={k} opacity="0.88" />;
    case 'open':  return <ellipse cx="0" cy={y + 2.4} rx="4.4" ry="3.8" fill={k} opacity="0.88" />;
    case 'small': return <circle cx="0" cy={y + 2} r="2.2" fill={k} opacity="0.88" />;
    case 'flat':  return <path d={`M-4.6,${y + 1.4} h9.2`} {...s} />;
    case 'wave':  return <path d={`M-6,${y + 1.4} q3,-2.6 6,0 t6,0`} {...s} />;
    case 'sad':   return <path d={`M-5.4,${y + 3.6} q5.4,-4.6 10.8,0`} {...s} />;
    default:      return <path d={`M-6.2,${y - 0.6} q3.1,3.6 6.2,0 q3.1,3.6 6.2,0`} {...s} />;
  }
}

function Extra({ kind }: { kind: string }) {
  switch (kind) {
    case 'sweat': return <path d="M31,-92 q3.6,4.8 0,7.2 q-3.6,-2.4 0,-7.2 z" fill="oklch(0.80 0.09 230)" opacity="0.9" className="flux-flx-sweat" />;
    case 'spark': return (
      <g fill="oklch(0.86 0.14 92)">
        <path d="M38,-106 l1.8,3.9 l3.9,1.8 l-3.9,1.8 l-1.8,3.9 l-1.8,-3.9 l-3.9,-1.8 l3.9,-1.8 z" className="flux-flx-spark1" />
        <path d="M-38,-98 l1.2,2.8 l2.8,1.2 l-2.8,1.2 l-1.2,2.8 l-1.2,-2.8 l-2.8,-1.2 l2.8,-1.2 z" opacity="0.8" className="flux-flx-spark2" />
      </g>
    );
    case 'question': return <text x="36" y="-98" fontSize="15" fontWeight="800" fill={C.shade} className="flux-flx-pop">?</text>;
    case 'excl': return <text x="36" y="-98" fontSize="15" fontWeight="800" fill="oklch(0.72 0.16 55)" className="flux-flx-pop">!</text>;
    case 'zzz': return (
      <g fill={C.shade}>
        <text x="34" y="-100" fontSize="12" fontWeight="800" opacity="0.8" className="flux-robot-z">z</text>
        <text x="42" y="-108" fontSize="9" fontWeight="800" opacity="0.6" className="flux-robot-z2">z</text>
      </g>
    );
    default: return null;
  }
}

export function applyKitten3d(refs: K3Refs, j: K3Pose, x: number, floor: number, scale: number, flip = 1) {
  const set = (k: string, tr: string) => { const el = refs[k]; if (el) el.setAttribute('transform', tr); };
  const rot = (a: number, k: string) => `rotate(${a.toFixed(2)} ${K3_PIVOTS[k][0]} ${K3_PIVOTS[k][1]})`;
  set('root', `translate(${x} ${floor}) scale(${(scale * flip).toFixed(3)} ${scale.toFixed(3)})`);
  set('lift', `translate(0 ${j.bodyY.toFixed(2)})`);
  set('body', `${rot(j.lean, 'lean')} translate(0 -4) scale(1 ${j.squash.toFixed(3)}) translate(0 4)`);
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
