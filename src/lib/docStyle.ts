/**
 * Линейка и интервалы текстового документа — вся арифметика.
 *
 * Зачем отдельным модулем. Линейка живёт на границе двух систем координат: у
 * документа пункты, у экрана пиксели с масштабом, у человека сантиметры. Пока
 * пересчёт сидел бы внутри компонента, единственным способом проверить его была
 * бы возня мышью. Здесь он проверяется числами (scripts/test-doc-style.ts), а
 * компонент только рисует и слушает мышь.
 *
 * Правила, которые здесь закреплены и которые легко нарушить незаметно:
 * — бегунок не уезжает за соседний: левое поле не заходит за правое, отступ не
 *   выходит за текстовую область. Иначе документ становится непечатаемым;
 * — тянем с прилипанием к полумиллиметру: без него поле получается 20,37 мм, и
 *   в паре с чертёжником рядом такой лист не совпадёт;
 * — ноль остаётся нулём: «нет отступа» и «отступ 0,4 мм» человек на экране не
 *   различит, а в документе это разные вещи.
 */

const MM_PER_PT = 25.4 / 72;
/** Пункты в миллиметры и обратно */
export const ptToMm = (pt: number) => pt * MM_PER_PT;
export const mmToPt = (mm: number) => mm / MM_PER_PT;
/**
 * Пункты в экранные пиксели листа.
 *
 * Один пункт — один пиксель при масштабе 100%. Это не «96 точек на дюйм»: так
 * рисует полотно движка, проверено измерением листа на экране (А4 шириной
 * 595,3 pt занимает 595 px при 100%, альбомный 841,9 pt — 842 px). Возьмёшь
 * привычные 96/72 — и линейка окажется на треть шире листа.
 */
export const ptToPx = (pt: number, zoom = 1) => pt * zoom;
export const pxToPt = (px: number, zoom = 1) => px / (zoom || 1);

/** Округление до полумиллиметра — шаг, на котором ещё видно разницу */
export const snapMm = (mm: number, step = 0.5) => Math.round(mm / step) * step;

/** Значение в пунктах с прилипанием и ограничителями */
export function snapPt(pt: number, min: number, max: number, stepMm = 0.5): number {
  const clamped = Math.min(Math.max(pt, min), max);
  const snapped = mmToPt(snapMm(ptToMm(clamped), stepMm));
  // Прилипание могло вытолкнуть за границу — возвращаем внутрь
  return Math.min(Math.max(snapped, min), max);
}

/** Подпись значения для подсказки при перетаскивании */
export const fmtMm = (pt: number) => `${(Math.round(ptToMm(pt) * 10) / 10).toString().replace('.', ',')} мм`;

// ── Что за бегунки на линейке ──────────────────────────────────────────────
// Поля принадлежат странице, отступы — выделенным абзацам. Разделение важное:
// поле сдвигает весь документ, отступ — только то, что выделено. В Ворде это
// разные бегунки на одной линейке, и путать их нельзя.
export type RulerHandle =
  | 'marginLeft' | 'marginRight'      // поля страницы
  | 'firstLine' | 'indentStart' | 'indentEnd';   // отступы абзаца

export interface RulerModel {
  /** Ширина листа, pt */
  pageWidthPt: number;
  marginLeftPt: number;
  marginRightPt: number;
  /** Отступы выделенного абзаца относительно текстовой области, pt */
  firstLinePt: number;
  indentStartPt: number;
  indentEndPt: number;
}

/** Ширина текстовой области, pt */
export const textWidthPt = (m: RulerModel) => Math.max(0, m.pageWidthPt - m.marginLeftPt - m.marginRightPt);

/**
 * Положение бегунка на линейке, pt от левого края листа.
 * Отступы абзаца считаются от границы текстовой области — как в Ворде.
 */
export function handlePosPt(m: RulerModel, h: RulerHandle): number {
  switch (h) {
    case 'marginLeft': return m.marginLeftPt;
    case 'marginRight': return m.pageWidthPt - m.marginRightPt;
    case 'firstLine': return m.marginLeftPt + m.indentStartPt + m.firstLinePt;
    case 'indentStart': return m.marginLeftPt + m.indentStartPt;
    case 'indentEnd': return m.pageWidthPt - m.marginRightPt - m.indentEndPt;
  }
}

/** Наименьший разумный остаток текстовой области — уже этого лист бессмысленен */
export const MIN_TEXT_PT = mmToPt(20);

/**
 * Куда встанет бегунок, если отпустить мышь в точке x (pt от левого края листа).
 * Возвращает новое значение той величины, за которую тянут, — уже с прилипанием
 * и ограничителями.
 */
export function dragTo(m: RulerModel, h: RulerHandle, xPt: number): number {
  switch (h) {
    case 'marginLeft':
      // Левое поле не заходит за правое: минимум 20 мм текста между ними
      return snapPt(xPt, 0, m.pageWidthPt - m.marginRightPt - MIN_TEXT_PT);
    case 'marginRight':
      return snapPt(m.pageWidthPt - xPt, 0, m.pageWidthPt - m.marginLeftPt - MIN_TEXT_PT);
    case 'indentStart': {
      // Отступ считаем от текстовой области; в минус (на поле) не уводим
      const max = textWidthPt(m) - m.indentEndPt - mmToPt(5);
      return snapPt(xPt - m.marginLeftPt, 0, Math.max(0, max));
    }
    case 'indentEnd': {
      const max = textWidthPt(m) - m.indentStartPt - mmToPt(5);
      return snapPt(m.pageWidthPt - m.marginRightPt - xPt, 0, Math.max(0, max));
    }
    case 'firstLine': {
      // Красная строка отсчитывается от отступа абзаца и может быть
      // отрицательной — это «висячая строка» из Ворда, ей пользуются в списках
      const base = m.marginLeftPt + m.indentStartPt;
      const max = textWidthPt(m) - m.indentStartPt - m.indentEndPt - mmToPt(5);
      return snapPt(xPt - base, -m.indentStartPt, Math.max(0, max));
    }
  }
}

// ── Междустрочный интервал ─────────────────────────────────────────────────
// Значение — множитель, как в Ворде. Для записок по ГОСТ нужен 1,5, поэтому он
// в наборе, а не «настройте сами».
export const LINE_SPACINGS: { v: number; label: string }[] = [
  { v: 1, label: 'Одинарный' },
  { v: 1.15, label: '1,15' },
  { v: 1.5, label: '1,5 · ГОСТ' },
  { v: 2, label: 'Двойной' },
];

/** Интервалы до и после абзаца, pt. 0 — «без интервала», как в Ворде */
export const PARA_SPACINGS: { v: number; label: string }[] = [
  { v: 0, label: 'Нет' },
  { v: 6, label: '6 pt' },
  { v: 12, label: '12 pt' },
  { v: 18, label: '18 pt' },
];

/** Красная строка: 1,25 см — то, что стоит в записках по ГОСТ */
export const FIRST_LINE_GOST_PT = mmToPt(12.5);

/**
 * Стиль абзаца → как его показать человеку. Пустой стиль означает «как в
 * документе по умолчанию», а не «одинарный»: подменять одно другим нельзя,
 * иначе кнопка врёт про состояние.
 */
export function describeParagraph(st: any): { lineSpacing?: number; before?: number; after?: number; firstLinePt: number; startPt: number; endPt: number } {
  const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  return {
    lineSpacing: num(st?.lineSpacing),
    before: num(st?.spaceAbove?.v),
    after: num(st?.spaceBelow?.v),
    firstLinePt: num(st?.indentFirstLine?.v) ?? 0,
    startPt: num(st?.indentStart?.v) ?? 0,
    endPt: num(st?.indentEnd?.v) ?? 0,
  };
}

/**
 * Деления линейки: длинные с подписью на каждом сантиметре, короткие на
 * половинах. Считаем от левого края листа, подписи — от начала текстовой
 * области, как в Ворде: инженеру важно, сколько осталось до края текста.
 */
export function rulerTicks(m: RulerModel): { xPt: number; big: boolean; label?: string }[] {
  const out: { xPt: number; big: boolean; label?: string }[] = [];
  const totalMm = ptToMm(m.pageWidthPt);
  const originMm = ptToMm(m.marginLeftPt);
  for (let halfCm = 0; halfCm * 5 <= totalMm + 0.01; halfCm++) {
    const mm = halfCm * 5;
    const big = halfCm % 2 === 0;
    const fromOriginCm = Math.round((mm - originMm) / 10);
    // Подписываем целые сантиметры текстовой области; ноль не подписываем —
    // в Ворде на его месте стоит бегунок отступа
    const inText = mm >= originMm - 0.01 && mm <= totalMm - ptToMm(m.marginRightPt) + 0.01;
    const label = big && inText && fromOriginCm > 0 && Math.abs((mm - originMm) / 10 - fromOriginCm) < 0.01
      ? String(fromOriginCm) : undefined;
    out.push({ xPt: mmToPt(mm), big, label });
  }
  return out;
}
