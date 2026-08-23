/**
 * Мазки.
 *
 * Полка высотой 88 точек — размер, на котором рисунок контуром не читается:
 * первая попытка нарисовать «Большую волну» пятью кривыми дала синее пятно.
 * На таком размере глаз узнаёт не силуэт, а цвет, фактуру и ритм мазка — и
 * Ван Гог, и Моне, и Айвазовский узнаются именно мазком.
 *
 * Поэтому сцены собираются из сотен коротких штрихов, разложенных вдоль
 * течения. Это и ближе к оригиналу, и лучше держит мелкий размер: отдельный
 * штрих не виден, а их строй — виден.
 *
 * Модуль чистый: только числа на входе и на выходе, ни React, ни DOM.
 */

/** Свой генератор чисел: одна и та же сцена должна выглядеть одинаково при
 *  каждой отрисовке. Math.random() перекладывал бы мазки на каждый кадр. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export interface Stroke {
  x: number; y: number;
  /** Длина и толщина мазка */
  len: number; w: number;
  /** Наклон в градусах */
  a: number;
  /** Индекс цвета в палитре сцены */
  c: number;
  /** Прозрачность */
  o: number;
}

export interface FieldSpec {
  seed: number;
  count: number;
  /** Границы области, в которую кладём мазки */
  x0: number; y0: number; x1: number; y1: number;
  /** Направление мазка в точке — в градусах */
  angle: (x: number, y: number, r: () => number) => number;
  /** Длина мазка */
  len: [min: number, max: number];
  /** Толщина */
  w: [min: number, max: number];
  /** Сколько цветов в палитре */
  colors: number;
  /** Прозрачность */
  opacity: [min: number, max: number];
  /** Пропустить мазок — вырезать область (например, под силуэт) */
  skip?: (x: number, y: number) => boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function field(spec: FieldSpec): Stroke[] {
  const r = rng(spec.seed);
  const out: Stroke[] = [];
  // Кладём с запасом: часть мазков отсеет skip, и без запаса в вырезанных
  // местах получалась бы заметная проплешина по краю
  const tries = Math.round(spec.count * 1.35);
  for (let i = 0; i < tries && out.length < spec.count; i++) {
    const x = lerp(spec.x0, spec.x1, r());
    const y = lerp(spec.y0, spec.y1, r());
    if (spec.skip && spec.skip(x, y)) continue;
    out.push({
      x, y,
      len: lerp(spec.len[0], spec.len[1], r()),
      w: lerp(spec.w[0], spec.w[1], r()),
      a: spec.angle(x, y, r),
      c: Math.floor(r() * spec.colors),
      o: lerp(spec.opacity[0], spec.opacity[1], r()),
    });
  }
  return out;
}

/**
 * Течение вокруг точки — так у Ван Гога закручено небо.
 * Возвращает угол касательной к окружности с центром (cx, cy).
 */
export function swirlAngle(cx: number, cy: number, twist = 0) {
  return (x: number, y: number) => {
    const a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    return a + 90 + twist;
  };
}

/** Мазки вдоль дуги: волна, гребень, полоса воды. */
export function waveAngle(amp: number, period: number, phase = 0, base = 0) {
  return (x: number) => base + Math.cos((x / period) * Math.PI * 2 + phase) * amp;
}

/** Складываем несколько течений с весами по расстоянию — небо перестаёт
 *  выглядеть как одна ровная спираль и начинает жить. */
export function blend(
  sources: Array<{ cx: number; cy: number; angle: (x: number, y: number) => number; power: number }>,
  fallback = 0,
) {
  return (x: number, y: number) => {
    let sx = 0, sy = 0, total = 0;
    for (const s of sources) {
      const d = Math.hypot(x - s.cx, y - s.cy) + 6;
      const wgt = s.power / (d * d);
      const a = (s.angle(x, y) * Math.PI) / 180;
      sx += Math.cos(a) * wgt; sy += Math.sin(a) * wgt; total += wgt;
    }
    if (!total) return fallback;
    return (Math.atan2(sy, sx) * 180) / Math.PI;
  };
}
