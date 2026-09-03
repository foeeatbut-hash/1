/**
 * Правая колонка оболочки: уведомления и помощник.
 *
 * Две беды, ради которых это выделено в правила.
 *
 * Первая: панели накрывали панель задач. Они тянулись от верха окна до самого
 * низа и закрывали часы, календарь и значки трея — то есть ровно то, ради чего
 * панель задач существует. Панель задач — опора оболочки, и всё остальное
 * обязано кончаться над ней.
 *
 * Вторая: панели не умели быть открытыми одновременно. Открытие одной закрывало
 * другую, и человек, читавший уведомление и захотевший спросить помощника, терял
 * уведомление из виду. Теперь они делят колонку по высоте: та, что открыли
 * раньше, остаётся сверху. На узком экране делить нечего — там они становятся
 * двумя вкладками одной панели.
 *
 * Без React и без DOM: у раскладки есть правильный ответ, и его проверяет
 * скрипт (scripts/test-right-panels.ts). Ошибка здесь не падает, а тихо
 * отрезает кусок экрана — заметить это можно только глазами и не сразу.
 */

export type PanelId = 'notifications' | 'assistant';

/** Ширина колонки: столько же, сколько было у панели помощника */
export const PANEL_W = 380;
/** Уже этого делить колонку по высоте бессмысленно — там вкладки */
export const NARROW_W = 1100;
/** Меньше этого куска панель бесполезна: заголовок и полторы строки */
export const MIN_PART = 160;
/** Сколько места достаётся верхней панели, пока человек не подвинул разделитель */
export const DEFAULT_SPLIT = 0.5;

export interface DockPlan {
  /** Что показывать сверху вниз; пусто — колонки нет вовсе */
  order: PanelId[];
  /** Вкладками, а не по высоте: экран слишком узкий для двоих */
  tabs: boolean;
  /** Какая вкладка открыта, когда показываются вкладки */
  active: PanelId | null;
  /** Доля высоты у верхней панели (0..1); имеет смысл только при двух панелях */
  split: number;
}

/**
 * Что и как показать.
 *
 * `opened` — порядок открытия: кто раньше, тот и выше. Порядок именно открытия,
 * а не постоянный: человек, открывший помощника первым, ожидает увидеть его
 * там, куда смотрел.
 */
export function dockPlan(
  opened: PanelId[],
  width: number,
  split = DEFAULT_SPLIT,
): DockPlan {
  const order = opened.filter((p, i) => opened.indexOf(p) === i);
  if (order.length < 2) {
    return { order, tabs: false, active: order[0] || null, split: 1 };
  }
  if (width < NARROW_W) {
    // Последняя открытая — та, которую человек хотел видеть сейчас
    return { order, tabs: true, active: order[order.length - 1], split: 1 };
  }
  return { order, tabs: false, active: null, split: clampSplit(split, 0) };
}

/** Доля верхней панели остаётся в разумных пределах, даже если её тянут за край */
export function clampSplit(split: number, height: number): number {
  const raw = Number.isFinite(split) ? split : DEFAULT_SPLIT;
  if (!height) return Math.min(0.85, Math.max(0.15, raw));
  const min = MIN_PART / height;
  const max = 1 - MIN_PART / height;
  // Колонка ниже двух минимумов: делить нечего, отдаём поровну
  if (min >= max) return 0.5;
  return Math.min(max, Math.max(min, raw));
}

/** Высота верхней и нижней частей в точках */
export function partHeights(height: number, split: number): { top: number; bottom: number } {
  const s = clampSplit(split, height);
  const top = Math.round(height * s);
  return { top, bottom: height - top };
}

/**
 * Открыть панель: она встаёт в конец очереди, если её там ещё нет.
 * Возвращает новый порядок — состояние живёт снаружи.
 */
export function openPanel(opened: PanelId[], id: PanelId): PanelId[] {
  return opened.includes(id) ? opened : [...opened, id];
}

/** Закрыть панель */
export function closePanel(opened: PanelId[], id: PanelId): PanelId[] {
  return opened.filter((p) => p !== id);
}

/** Нажали на кнопку панели: открыта — закроем, закрыта — откроем */
export function togglePanel(opened: PanelId[], id: PanelId): PanelId[] {
  return opened.includes(id) ? closePanel(opened, id) : openPanel(opened, id);
}

/** Заголовок вкладки — тот же, что подпись кнопки на рельсе */
export const panelTitle = (id: PanelId): string =>
  (id === 'notifications' ? 'Уведомления' : 'Помощник');
