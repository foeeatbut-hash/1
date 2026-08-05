/**
 * Флакси: суставы, позы и выражения лица.
 *
 * Здесь только данные. Тело рисуется в rig.tsx, движение считает player.ts,
 * а сценарии лежат в scenes.ts — так новую сценку можно добавить, не трогая
 * ни одной строчки кода отрисовки.
 *
 * Система координат робота: начало — между ступнями, ось Y вверх отрицательная.
 * Пол = 0, макушка ≈ −86. Все углы в градусах, положительный — по часовой.
 */

export type Joint =
  | 'bodyY'      // подъём корпуса: прыжок вверх (−), присед (+)
  | 'lean'       // наклон корпуса вперёд-назад
  | 'squash'     // сжатие корпуса при приземлении (1 — обычный)
  | 'headTilt'   // наклон головы вбок
  | 'headTurn'   // поворот головы (сдвиг лица, не 3D)
  | 'shoulderL' | 'elbowL'
  | 'shoulderR' | 'elbowR'
  | 'hipL' | 'kneeL'
  | 'hipR' | 'kneeR'
  | 'antenna';   // наклон антенны

export type Pose = Record<Joint, number>;

export const NEUTRAL: Pose = {
  bodyY: 0, lean: 0, squash: 1,
  headTilt: 0, headTurn: 0,
  shoulderL: 6, elbowL: 4, shoulderR: -6, elbowR: -4,
  hipL: 0, kneeL: 0, hipR: 0, kneeR: 0,
  antenna: 0,
};

const p = (over: Partial<Pose>): Pose => ({ ...NEUTRAL, ...over });

/**
 * Именованные позы. Держим их читаемыми: сценарий — это список поз по времени,
 * и чем понятнее имена, тем проще придумывать новые сценки.
 */
export const POSES = {
  stand: NEUTRAL,

  // Сидит на полке: корпус ниже, ноги вытянуты вперёд, руки опираются сзади.
  sit: p({ bodyY: 9, hipL: 30, kneeL: -52, hipR: -30, kneeR: 52, shoulderL: 28, shoulderR: -28, elbowL: 22, elbowR: -22 }),
  // Болтает ногами — вторая фаза сидения
  sitSwing: p({ bodyY: 9, hipL: 18, kneeL: -38, hipR: -44, kneeR: 66, shoulderL: 28, shoulderR: -28, elbowL: 22, elbowR: -22, headTilt: -4 }),

  // Приветствие: одна рука поднята
  wave: p({ shoulderL: 128, elbowL: 22, headTilt: -6 }),
  waveHigh: p({ shoulderL: 152, elbowL: -12, headTilt: -9 }),

  // Радость: обе руки вверх
  cheer: p({ shoulderL: 148, shoulderR: -148, elbowL: -14, elbowR: 14, bodyY: -6, headTilt: 0 }),
  // Приземление после прыжка
  land: p({ bodyY: 4, squash: 0.9, hipL: 12, hipR: -12, kneeL: -18, kneeR: 18, shoulderL: 22, shoulderR: -22 }),
  jump: p({ bodyY: -14, squash: 1.06, hipL: -18, hipR: 18, kneeL: 26, kneeR: -26, shoulderL: 120, shoulderR: -120 }),

  // Футбол: замах и удар правой (экранно — правой)
  windup: p({ lean: -8, hipR: 46, kneeR: -34, shoulderL: 44, shoulderR: -30, headTilt: 4 }),
  kick: p({ lean: 10, hipR: -68, kneeR: 22, hipL: 14, shoulderL: 62, shoulderR: -96, headTilt: -6 }),

  // Баскетбол
  dribble: p({ lean: 6, shoulderR: -74, elbowR: -36, hipL: 8, hipR: -8, kneeL: -10, kneeR: 10 }),
  shoot: p({ bodyY: -10, shoulderL: 138, shoulderR: -150, elbowR: 26, lean: -4, hipL: -14, hipR: 14 }),

  // Работа руками: тянется вперёд-вниз
  reach: p({ lean: 10, shoulderL: 62, shoulderR: -62, elbowL: 26, elbowR: -26, headTilt: 3 }),
  // Держит что-то перед собой обеими руками
  hold: p({ shoulderL: 74, shoulderR: -74, elbowL: 54, elbowR: -54, lean: 3 }),
  // Одна рука ко «рту» — пьёт
  sip: p({ shoulderL: 24, shoulderR: -104, elbowR: -78, headTilt: 6, lean: -2 }),
  // Метёт: обе руки вбок
  sweep: p({ shoulderL: 84, shoulderR: -44, elbowL: 34, elbowR: -18, lean: 8 }),
  // Гладит кота: наклон и рука вниз
  pet: p({ lean: 16, shoulderL: 26, shoulderR: -96, elbowR: -46, headTilt: 8, hipL: 10, kneeL: -14 }),
  // Лежит на диване
  lounge: p({ bodyY: 16, lean: -16, hipL: 74, kneeL: -40, hipR: -30, kneeR: 18, shoulderL: 48, shoulderR: -128, elbowR: -20, headTilt: -8 }),
  // Задумался: рука у подбородка
  think: p({ shoulderR: -112, elbowR: -84, headTilt: 8, lean: -3 }),
  // Слушает: наклон вперёд, руки по швам
  listen: p({ lean: 9, headTilt: -4, shoulderL: 2, shoulderR: -2, antenna: -8 }),
  // Ходит взад-вперёд (две фазы)
  walkA: p({ hipL: 22, kneeL: -14, hipR: -20, kneeR: 6, shoulderL: -18, shoulderR: 18, lean: 4 }),
  walkB: p({ hipL: -20, kneeL: 6, hipR: 22, kneeR: -14, shoulderL: 18, shoulderR: -18, lean: 4 }),
  // Спит калачиком
  sleep: p({ bodyY: 20, lean: 14, hipL: 78, kneeL: -58, hipR: -78, kneeR: 58, shoulderL: 66, shoulderR: -66, elbowL: 44, elbowR: -44, headTilt: 12, antenna: 16 }),
  // Упал на спину
  fall: p({ bodyY: 22, lean: -34, hipL: 84, kneeL: -30, hipR: -70, kneeR: 26, shoulderL: 116, shoulderR: -128, headTilt: -14 }),
  // Испугался: подпрыгнул, руки в стороны
  startle: p({ bodyY: -9, shoulderL: 108, shoulderR: -108, elbowL: -20, elbowR: 20, hipL: -12, hipR: 12, antenna: -14 }),
  // Смущение: руки перед собой, голова вниз
  shy: p({ shoulderL: 58, shoulderR: -58, elbowL: 66, elbowR: -66, headTilt: 10, lean: 6 }),
  // Пожал плечами
  shrug: p({ shoulderL: 96, shoulderR: -96, elbowL: 62, elbowR: -62, headTilt: -5 }),
  // Гордость: руки в боки
  proud: p({ shoulderL: 72, elbowL: 96, shoulderR: -72, elbowR: -96, lean: -4 }),
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;

// ── Лицо ───────────────────────────────────────────────────────────────────
// Выражение — набор из четырёх слоёв. Так их дюжина, а рисунок один.

export type EyeShape = 'round' | 'wide' | 'arc' | 'closed' | 'spiral' | 'squint';
export type MouthShape = 'smile' | 'grin' | 'open' | 'small' | 'flat' | 'wave' | 'sad' | 'none';
export type FaceExtra = 'none' | 'sweat' | 'spark' | 'question' | 'excl' | 'zzz' | 'stars' | 'heart';

export interface Face {
  eye: EyeShape;
  mouth: MouthShape;
  /** Наклон бровей: положительный — «домиком» вниз к центру (сердится). */
  brow: number;
  /** Подъём бровей в пикселях: минус — выше (удивление). */
  browY: number;
  cheeks?: boolean;
  extra?: FaceExtra;
}

export const FACES = {
  neutral:  { eye: 'round',  mouth: 'smile', brow: 0,   browY: 0 },
  happy:    { eye: 'arc',    mouth: 'grin',  brow: -4,  browY: -1, cheeks: true },
  delight:  { eye: 'arc',    mouth: 'open',  brow: -8,  browY: -2, cheeks: true, extra: 'spark' },
  curious:  { eye: 'round',  mouth: 'small', brow: -10, browY: -1, extra: 'question' },
  surprise: { eye: 'wide',   mouth: 'small', brow: -14, browY: -3, extra: 'excl' },
  proud:    { eye: 'squint', mouth: 'grin',  brow: 8,   browY: 1 },
  shy:      { eye: 'arc',    mouth: 'wave',  brow: -6,  browY: 0,  cheeks: true, extra: 'sweat' },
  tired:    { eye: 'squint', mouth: 'flat',  brow: 6,   browY: 2,  extra: 'sweat' },
  sleep:    { eye: 'arc',    mouth: 'small', brow: 0,   browY: 2,  extra: 'zzz' },
  dizzy:    { eye: 'spiral', mouth: 'wave',  brow: 0,   browY: 0,  extra: 'stars' },
  focus:    { eye: 'squint', mouth: 'flat',  brow: 12,  browY: 1 },
  sad:      { eye: 'wide',   mouth: 'sad',   brow: -12, browY: 1 },
  love:     { eye: 'arc',    mouth: 'grin',  brow: -4,  browY: -1, cheeks: true, extra: 'heart' },
  cross:    { eye: 'squint', mouth: 'sad',   brow: 14,  browY: 0,  extra: 'excl' },
} as const satisfies Record<string, Face>;

export type FaceName = keyof typeof FACES;
