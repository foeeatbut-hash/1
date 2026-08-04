import { Scene } from './player';

/**
 * Сценки Флакси — чистые данные.
 *
 * Система координат сцены: ширина 380 (ровно ширина панели помощника),
 * пол на высоте 84. Робот ставится по X, предметы задаются в тех же
 * координатах. Дуга полёта задаётся полем arc: высота горба в пикселях.
 *
 * Правила, которых держимся:
 * • сценка обязана вернуть робота в покой и убрать за собой предметы —
 *   иначе на полке останется мяч от прошлой игры;
 * • спокойные сценки помечены calm: в «спокойном режиме» идут только они;
 * • сценки со временем суток (телевизор вечером, кофе утром) — через hours.
 */

export const FLOOR = 84;
export const HOME_X = 112;
export const STAGE_W = 380;

// ── Покой и мелкая жизнь ───────────────────────────────────────────────────

const sitIdle: Scene = {
  id: 'sitIdle', dur: 6200, weight: 3, calm: true,
  frames: [
    { t: 0, pose: 'sit', face: 'neutral' },
    { t: 900, pose: 'sitSwing', ease: 'inOut' },
    { t: 1800, pose: 'sit', ease: 'inOut' },
    { t: 2700, pose: 'sitSwing', ease: 'inOut', face: 'happy' },
    { t: 3600, pose: 'sit', ease: 'inOut' },
    { t: 4600, pose: 'sitSwing', ease: 'inOut', face: 'neutral' },
    { t: 6200, pose: 'sit', ease: 'inOut' },
  ],
};

const stretch: Scene = {
  id: 'stretch', dur: 4200, weight: 2, calm: true,
  frames: [
    { t: 0, pose: 'sit' },
    { t: 600, pose: 'stand', ease: 'out' },
    { t: 1400, pose: 'cheer', ease: 'inOut', face: 'tired' },
    { t: 2300, pose: 'stand', ease: 'inOut', face: 'happy' },
    { t: 3000, pose: 'proud', ease: 'back' },
    { t: 4200, pose: 'sit', ease: 'inOut', face: 'neutral' },
  ],
};

// ── Спорт ──────────────────────────────────────────────────────────────────

const football: Scene = {
  id: 'football', dur: 7400, weight: 2, props: ['ball', 'goal'],
  frames: [
    { t: 0, pose: 'sit', props: { goal: { x: 322, y: FLOOR, op: 0 }, ball: { x: 150, y: 78, op: 0 } } },
    { t: 500, pose: 'stand', ease: 'out', props: { goal: { op: 0.95 }, ball: { op: 1 } }, face: 'happy' },
    { t: 1200, x: 128, ease: 'inOut', face: 'focus' },
    { t: 1900, pose: 'windup', ease: 'inOut' },
    { t: 2250, pose: 'kick', ease: 'in', shake: 2, props: { ball: { x: 152, y: 76, rot: 0 } }, arc: { ball: 30 } },
    { t: 2950, props: { ball: { x: 316, y: 62, rot: 420 } }, ease: 'linear' },
    { t: 3200, pose: 'stand', ease: 'out', face: 'surprise' },
    { t: 3500, props: { ball: { x: 320, y: 78, rot: 520 } }, ease: 'in', shake: 1 },
    { t: 3700, pose: 'cheer', ease: 'back', face: 'delight', say: 'Гол!' },
    { t: 4600, face: 'happy', say: '' },
    { t: 5200, props: { ball: { x: 150, y: 78, rot: 60 } }, ease: 'out', slow: true },
    { t: 5600, pose: 'stand', ease: 'inOut' },
    { t: 6400, x: HOME_X, pose: 'sit', ease: 'inOut', face: 'neutral', props: { ball: { op: 0 }, goal: { op: 0 } } },
    { t: 7400, pose: 'sit' },
  ],
};

const basket: Scene = {
  id: 'basket', dur: 7200, weight: 2, props: ['ball', 'hoop'],
  frames: [
    { t: 0, pose: 'sit', props: { hoop: { x: 300, y: -20, op: 0 }, ball: { x: 140, y: 78, op: 0 } } },
    { t: 400, pose: 'stand', ease: 'out', props: { hoop: { op: 0.95 }, ball: { op: 1 } } },
    { t: 900, props: { hoop: { y: 4 } }, ease: 'back', face: 'happy' },
    { t: 1500, pose: 'dribble', ease: 'inOut', props: { ball: { x: 146, y: 78 } }, face: 'focus' },
    { t: 1900, props: { ball: { y: 56, rot: 90 } }, ease: 'out' },
    { t: 2300, props: { ball: { y: 78, rot: 180 } }, ease: 'in', shake: 0.6 },
    { t: 2700, props: { ball: { y: 56, rot: 270 } }, ease: 'out' },
    { t: 3100, pose: 'shoot', ease: 'out', props: { ball: { x: 150, y: 40, rot: 300 } }, arc: { ball: 26 } },
    { t: 3900, props: { ball: { x: 300, y: 26, rot: 620 } }, ease: 'linear' },
    { t: 4200, pose: 'stand', ease: 'out', face: 'surprise' },
    { t: 4600, props: { ball: { x: 300, y: 78, rot: 760 } }, ease: 'in', shake: 1 },
    { t: 4800, pose: 'cheer', ease: 'back', face: 'delight' },
    { t: 5600, pose: 'proud', ease: 'inOut', face: 'proud' },
    { t: 6200, props: { ball: { x: 140, y: 78, rot: 820, op: 0 }, hoop: { y: -20, op: 0 } }, ease: 'inOut', slow: true },
    { t: 6600, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 7200, pose: 'sit' },
  ],
};

// ── Отдых ──────────────────────────────────────────────────────────────────

const tvEvening: Scene = {
  id: 'tv', dur: 9000, weight: 2, calm: true, hours: [17, 24], props: ['sofa', 'tv'],
  frames: [
    { t: 0, pose: 'sit', props: { sofa: { x: 60, y: FLOOR, op: 0 }, tv: { x: 300, y: FLOOR, op: 0 } } },
    { t: 500, pose: 'stand', ease: 'out', props: { sofa: { x: 86, op: 0.95 }, tv: { x: 296, op: 0.95 } }, face: 'happy' },
    { t: 1400, x: 100, ease: 'inOut' },
    { t: 2200, pose: 'lounge', ease: 'out', face: 'happy' },
    { t: 4000, face: 'delight' },
    { t: 5200, face: 'happy' },
    { t: 6600, face: 'neutral' },
    { t: 7400, pose: 'stand', ease: 'out', props: { sofa: { op: 0 }, tv: { op: 0 } } },
    { t: 8200, x: HOME_X, pose: 'sit', ease: 'inOut' },
    { t: 9000, pose: 'sit' },
  ],
};

const coffee: Scene = {
  id: 'coffee', dur: 7000, weight: 2, calm: true, hours: [5, 13], props: ['mug'],
  frames: [
    { t: 0, pose: 'sit', props: { mug: { x: HOME_X + 26, y: FLOOR, op: 0 } } },
    { t: 500, pose: 'stand', ease: 'out', props: { mug: { op: 0.95 } }, face: 'happy' },
    { t: 1200, pose: 'reach', ease: 'inOut', face: 'curious' },
    { t: 1900, props: { mug: { x: HOME_X + 16, y: 56 } }, pose: 'hold', ease: 'out' },
    { t: 2700, pose: 'sip', ease: 'inOut', props: { mug: { x: HOME_X + 13, y: 45 } }, face: 'focus' },
    { t: 3600, face: 'delight', say: 'Ах…' },
    { t: 4400, pose: 'hold', ease: 'inOut', props: { mug: { x: HOME_X + 16, y: 56 } }, face: 'happy', say: '' },
    { t: 5200, pose: 'reach', ease: 'inOut', props: { mug: { x: HOME_X + 26, y: FLOOR } } },
    { t: 5900, pose: 'stand', ease: 'out', props: { mug: { op: 0 } } },
    { t: 6400, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 7000, pose: 'sit' },
  ],
};

const catVisit: Scene = {
  id: 'cat', dur: 9000, weight: 1, calm: true, props: ['cat'],
  frames: [
    { t: 0, pose: 'sit', props: { cat: { x: -20, y: FLOOR, op: 0 } } },
    { t: 400, props: { cat: { op: 1 } }, face: 'curious' },
    { t: 2000, props: { cat: { x: HOME_X + 34 } }, ease: 'linear', pose: 'stand', slow: true },
    { t: 2600, face: 'delight' },
    { t: 3200, pose: 'pet', ease: 'out' },
    { t: 4200, face: 'love' },
    { t: 5600, pose: 'pet' },
    { t: 6200, pose: 'stand', ease: 'inOut', face: 'happy' },
    { t: 6600, props: { cat: { x: 400 } }, ease: 'linear', slow: true },
    { t: 8000, props: { cat: { op: 0 } }, pose: 'wave', face: 'happy' },
    { t: 8600, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 9000, pose: 'sit' },
  ],
};

const balloonUp: Scene = {
  id: 'balloon', dur: 6600, weight: 1, calm: true, props: ['balloon'],
  frames: [
    { t: 0, pose: 'sit', props: { balloon: { x: HOME_X + 16, y: 62, s: 0.3, op: 0 } } },
    { t: 500, pose: 'stand', ease: 'out', props: { balloon: { op: 0.95 } }, face: 'focus' },
    { t: 1400, props: { balloon: { s: 0.7 } }, ease: 'out' },
    { t: 2200, props: { balloon: { s: 1.05 } }, ease: 'out', face: 'delight' },
    { t: 3000, pose: 'wave', ease: 'out', props: { balloon: { y: 40 } } },
    { t: 4200, props: { balloon: { x: HOME_X + 40, y: -30, rot: 18 } }, ease: 'linear', pose: 'cheer', face: 'happy', slow: true },
    { t: 5000, props: { balloon: { op: 0 } }, face: 'surprise' },
    { t: 5600, pose: 'stand', ease: 'inOut', face: 'happy' },
    { t: 6100, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 6600, pose: 'sit' },
  ],
};

// ── Работа ─────────────────────────────────────────────────────────────────

const readPlan: Scene = {
  id: 'plan', dur: 8000, weight: 3, calm: true, props: ['blueprint'],
  frames: [
    { t: 0, pose: 'sit', props: { blueprint: { x: HOME_X, y: 60, s: 0.2, op: 0 } } },
    { t: 500, pose: 'hold', ease: 'out', props: { blueprint: { s: 1, op: 0.97 } }, face: 'focus', chest: 'work' },
    { t: 1600, face: 'focus' },
    { t: 2600, face: 'curious' },
    { t: 3600, face: 'focus' },
    { t: 4600, face: 'happy' },
    { t: 5400, chest: 'ok' },
    { t: 6000, props: { blueprint: { s: 0.2, op: 0 } }, ease: 'in' },
    { t: 6600, pose: 'sit', ease: 'inOut', face: 'neutral', chest: 'idle' },
    { t: 8000, pose: 'sit' },
  ],
};

const readBook: Scene = {
  id: 'book', dur: 7000, weight: 2, calm: true, props: ['book'],
  frames: [
    { t: 0, pose: 'sit', props: { book: { x: HOME_X, y: 62, op: 0 } } },
    { t: 500, pose: 'hold', ease: 'out', props: { book: { op: 0.97 } }, face: 'focus', chest: 'work' },
    { t: 2000, face: 'curious' },
    { t: 3400, face: 'delight' },
    { t: 4600, face: 'focus' },
    { t: 5400, props: { book: { op: 0 } }, ease: 'in', chest: 'idle' },
    { t: 5900, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 7000, pose: 'sit' },
  ],
};

const sweepUp: Scene = {
  id: 'sweep', dur: 8200, weight: 2, props: ['broom'],
  frames: [
    { t: 0, pose: 'sit', props: { broom: { x: HOME_X + 14, y: FLOOR, op: 0 } } },
    { t: 500, pose: 'sweep', ease: 'out', props: { broom: { op: 0.95, rot: -14 } }, face: 'focus', chest: 'work' },
    { t: 1300, props: { broom: { rot: 12 } }, ease: 'inOut' },
    { t: 2000, x: 140, props: { broom: { x: 156, rot: -14 } }, ease: 'inOut' },
    { t: 2700, props: { broom: { rot: 12 } }, ease: 'inOut' },
    { t: 3400, x: 176, props: { broom: { x: 192, rot: -14 } }, ease: 'inOut' },
    { t: 4100, props: { broom: { rot: 12 } }, ease: 'inOut' },
    { t: 4800, x: 210, props: { broom: { x: 226, rot: -14 } }, ease: 'inOut', face: 'proud' },
    { t: 5500, props: { broom: { rot: 12 } }, ease: 'inOut' },
    { t: 6100, pose: 'proud', ease: 'out', props: { broom: { op: 0 } }, face: 'proud', chest: 'ok' },
    { t: 6900, x: HOME_X, pose: 'stand', ease: 'inOut', chest: 'idle' },
    { t: 7500, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 8200, pose: 'sit' },
  ],
};

const waterPlant: Scene = {
  id: 'plant', dur: 9000, weight: 2, calm: true, props: ['plant', 'can'],
  frames: [
    { t: 0, pose: 'sit', props: { plant: { x: 250, y: FLOOR, op: 0 }, can: { x: HOME_X + 16, y: 60, op: 0 } } },
    { t: 500, pose: 'stand', ease: 'out', props: { plant: { op: 0.95 }, can: { op: 0.95 } }, face: 'happy' },
    { t: 1600, x: 226, ease: 'inOut', props: { can: { x: 242 } } },
    { t: 2400, pose: 'hold', ease: 'out', props: { can: { x: 244, y: 52, rot: 24 } }, face: 'focus' },
    { t: 4200, props: { plant: { s: 1.12 } }, ease: 'out', face: 'delight', slow: true },
    { t: 5200, pose: 'stand', ease: 'inOut', props: { can: { x: 242, y: 60, rot: 0 } }, face: 'happy' },
    { t: 6200, x: HOME_X, ease: 'inOut', props: { can: { x: HOME_X + 16 } } },
    { t: 7200, props: { plant: { op: 0 }, can: { op: 0 } }, ease: 'in' },
    { t: 7800, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 9000, pose: 'sit' },
  ],
};

const planeThrow: Scene = {
  id: 'plane', dur: 6400, weight: 1, props: ['plane'],
  frames: [
    { t: 0, pose: 'sit', props: { plane: { x: HOME_X + 10, y: 54, op: 0, s: 0.6 } } },
    { t: 600, pose: 'hold', ease: 'out', props: { plane: { op: 0.97, s: 1 } }, face: 'focus', chest: 'work' },
    { t: 1800, face: 'happy', chest: 'ok' },
    { t: 2400, pose: 'shoot', ease: 'out', props: { plane: { x: HOME_X + 30, y: 46, rot: -8 } }, arc: { plane: 14 } },
    { t: 4000, props: { plane: { x: 420, y: 26, rot: 6 } }, ease: 'linear', pose: 'stand', face: 'delight', slow: true },
    { t: 4200, props: { plane: { op: 0 } } },
    { t: 5000, pose: 'wave', ease: 'inOut', face: 'happy', chest: 'idle' },
    { t: 5600, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 6400, pose: 'sit' },
  ],
};

/** Полный набор случайных сценок. */
export const SCENES: Scene[] = [
  sitIdle, stretch, football, basket, tvEvening, coffee,
  catVisit, balloonUp, readPlan, readBook, sweepUp, waterPlant, planeThrow,
];

// ── Реакции: их запускает не расписание, а событие ─────────────────────────

/** Появление на полке при открытии чата. */
export const SCENE_HELLO: Scene = {
  id: 'hello', dur: 2400,
  frames: [
    { t: 0, x: 380, pose: 'walkA', face: 'happy' },
    { t: 400, x: 300, pose: 'walkB', ease: 'linear' },
    { t: 800, x: 220, pose: 'walkA', ease: 'linear' },
    { t: 1200, x: HOME_X + 16, pose: 'walkB', ease: 'linear' },
    { t: 1500, x: HOME_X, pose: 'land', ease: 'out', shake: 1 },
    { t: 1800, pose: 'wave', ease: 'back', face: 'delight' },
    { t: 2100, pose: 'waveHigh', ease: 'inOut' },
    { t: 2400, pose: 'sit', ease: 'inOut', face: 'happy' },
  ],
};

/** Уходит за правый край, когда чат закрывают. */
export const SCENE_BYE: Scene = {
  id: 'bye', dur: 1400,
  frames: [
    { t: 0, pose: 'stand', face: 'happy' },
    { t: 300, pose: 'wave', ease: 'out' },
    { t: 700, x: 240, pose: 'walkA', ease: 'linear' },
    { t: 1100, x: 340, pose: 'walkB', ease: 'linear' },
    { t: 1400, x: 420, pose: 'walkA', ease: 'linear' },
  ],
};

/** Реакции на тычок: по кругу и без повторов подряд. */
export const POKES: Scene[] = [
  {
    id: 'poke-giggle', dur: 1800,
    frames: [
      { t: 0, pose: 'sit', face: 'delight', say: 'Ой! Щекотно' },
      { t: 200, pose: 'shy', ease: 'back' },
      { t: 600, pose: 'sit', ease: 'inOut' },
      { t: 900, pose: 'shy', ease: 'inOut' },
      { t: 1300, pose: 'sit', ease: 'inOut', face: 'happy', say: '' },
      { t: 1800, pose: 'sit' },
    ],
  },
  {
    id: 'poke-startle', dur: 2000,
    frames: [
      { t: 0, pose: 'startle', face: 'surprise', ease: 'out', say: 'Ай!' },
      { t: 400, pose: 'land', ease: 'in', shake: 2 },
      { t: 900, pose: 'stand', ease: 'out', face: 'shy', say: '' },
      { t: 1500, pose: 'sit', ease: 'inOut', face: 'happy' },
      { t: 2000, pose: 'sit' },
    ],
  },
  {
    id: 'poke-fall', dur: 2600,
    frames: [
      { t: 0, pose: 'startle', face: 'surprise', ease: 'out' },
      { t: 350, pose: 'fall', ease: 'in', shake: 3, face: 'dizzy', say: 'Ух…' },
      { t: 1400, pose: 'sit', ease: 'out', face: 'dizzy' },
      { t: 1900, pose: 'stand', ease: 'out', face: 'shy', say: '' },
      { t: 2300, pose: 'sit', ease: 'inOut', face: 'happy' },
      { t: 2600, pose: 'sit' },
    ],
  },
  {
    id: 'poke-blush', dur: 2000,
    frames: [
      { t: 0, pose: 'shy', face: 'shy', ease: 'out', say: 'Ну что вы…' },
      { t: 900, pose: 'shy', face: 'love' },
      { t: 1500, pose: 'sit', ease: 'inOut', face: 'happy', say: '' },
      { t: 2000, pose: 'sit' },
    ],
  },
  {
    id: 'poke-five', dur: 2200,
    frames: [
      { t: 0, pose: 'stand', face: 'happy', ease: 'out', say: 'Дай пять!' },
      { t: 400, pose: 'wave', ease: 'back' },
      { t: 1100, pose: 'cheer', ease: 'back', face: 'delight' },
      { t: 1600, pose: 'stand', ease: 'inOut', face: 'happy', say: '' },
      { t: 1900, pose: 'sit', ease: 'inOut' },
      { t: 2200, pose: 'sit' },
    ],
  },
];

/** Слишком много тычков подряд — робот ненадолго сердится. */
export const SCENE_ENOUGH: Scene = {
  id: 'enough', dur: 2600,
  frames: [
    { t: 0, pose: 'proud', face: 'cross', ease: 'out', say: 'Ну хватит уже!' },
    { t: 1400, face: 'cross' },
    { t: 1800, pose: 'sit', ease: 'inOut', face: 'shy', say: '' },
    { t: 2300, face: 'happy' },
    { t: 2600, pose: 'sit' },
  ],
};

/** Пришло уведомление. */
export const SCENE_BELL: Scene = {
  id: 'bell', dur: 3200, props: ['bell'],
  frames: [
    { t: 0, pose: 'stand', face: 'surprise', props: { bell: { x: HOME_X + 16, y: 58, op: 0 } } },
    { t: 300, pose: 'wave', ease: 'back', props: { bell: { op: 0.97, rot: -20 } } },
    { t: 700, props: { bell: { rot: 20 } }, ease: 'inOut', face: 'happy' },
    { t: 1100, props: { bell: { rot: -20 } }, ease: 'inOut' },
    { t: 1500, props: { bell: { rot: 16 } }, ease: 'inOut' },
    { t: 2100, props: { bell: { op: 0 } }, pose: 'stand', ease: 'inOut' },
    { t: 2700, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 3200, pose: 'sit' },
  ],
};

/** Идёт обработка запроса: ходит и посматривает. */
export const SCENE_WAIT: Scene = {
  id: 'wait', dur: 4000,
  frames: [
    { t: 0, pose: 'stand', face: 'focus', chest: 'wait' },
    { t: 500, x: HOME_X + 26, pose: 'walkA', ease: 'linear' },
    { t: 1000, x: HOME_X + 46, pose: 'walkB', ease: 'linear' },
    { t: 1500, x: HOME_X + 46, pose: 'think', ease: 'out' },
    { t: 2200, x: HOME_X + 20, pose: 'walkA', ease: 'linear', flip: -1 },
    { t: 2700, x: HOME_X, pose: 'walkB', ease: 'linear' },
    { t: 3200, pose: 'stand', ease: 'out', flip: 1 },
    { t: 4000, pose: 'stand' },
  ],
};

/** Ответ пришёл. */
export const SCENE_DONE: Scene = {
  id: 'done', dur: 2200,
  frames: [
    { t: 0, pose: 'cheer', face: 'delight', ease: 'back', chest: 'ok' },
    { t: 900, pose: 'proud', ease: 'inOut', face: 'proud' },
    { t: 1500, pose: 'sit', ease: 'inOut', face: 'happy', chest: 'idle' },
    { t: 2200, pose: 'sit' },
  ],
};

/** Ничего не нашлось. */
export const SCENE_SHRUG: Scene = {
  id: 'shrug', dur: 2400,
  frames: [
    { t: 0, pose: 'shrug', face: 'sad', ease: 'out' },
    { t: 1200, pose: 'shrug', face: 'shy' },
    { t: 1800, pose: 'sit', ease: 'inOut', face: 'neutral' },
    { t: 2400, pose: 'sit' },
  ],
};

/** Человек печатает: развернулся и слушает. */
export const SCENE_LISTEN: Scene = {
  id: 'listen', dur: 1600,
  frames: [
    { t: 0, pose: 'stand', face: 'curious', ease: 'out' },
    { t: 500, pose: 'listen', ease: 'out', face: 'focus' },
    { t: 1600, pose: 'listen' },
  ],
};

/** Долго никого нет — уснул. */
export const SCENE_SLEEP: Scene = {
  id: 'sleep', dur: 2000,
  frames: [
    { t: 0, pose: 'sit', face: 'tired' },
    { t: 800, pose: 'sit', face: 'tired' },
    { t: 1400, pose: 'sleep', ease: 'out', face: 'sleep' },
    { t: 2000, pose: 'sleep', face: 'sleep' },
  ],
};

/** Проснулся: вздрогнул и протёр глаза. */
export const SCENE_WAKE: Scene = {
  id: 'wake', dur: 2000,
  frames: [
    { t: 0, pose: 'startle', face: 'surprise', ease: 'out' },
    { t: 500, pose: 'stand', ease: 'out', face: 'tired' },
    { t: 1100, pose: 'think', ease: 'inOut', face: 'tired' },
    { t: 1600, pose: 'sit', ease: 'inOut', face: 'happy' },
    { t: 2000, pose: 'sit' },
  ],
};
