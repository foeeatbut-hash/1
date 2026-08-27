/**
 * Доли экрана: раскладки, которые предлагает кнопка разворота.
 *
 * Прилипание к краям даёт только три исхода — половина слева, половина справа,
 * весь стол. Ведомость и чертёж рядом с почтой в углу так не разложишь.
 * Раскладка ставит окно в готовую долю ровно, без подгонки на глаз.
 *
 * Здесь только счёт, без React и без DOM: доля, в которую окно не влезет, не
 * должна предлагаться вовсе, и проверить это надо скриптом, а не глазами.
 */
import type React from 'react';
import { MIN_W, MIN_H, type Area, type Rect } from './windows';

/** Доля в частях от стола: 0..1 по обеим осям */
export interface Share { x: number; y: number; w: number; h: number }

export interface Layout {
  /** Устойчивое имя: по нему запоминается, чем человек пользуется */
  id: string;
  /** Название — только для подсказки и руководства; в панели подписей нет */
  name: string;
  shares: Share[];
}

/**
 * Наименьшая доля чуть больше наименьшего окна.
 *
 * На десять точек: доля, в которую окно влезает впритык, оставляет человека без
 * возможности потянуть границу — а первое, что делают с раскладкой, это её
 * поправляют.
 */
export const MIN_SHARE_W = MIN_W + 10;
export const MIN_SHARE_H = MIN_H + 10;

/** Порядок тот же, что в панели: слева направо, сверху вниз */
export const LAYOUTS: Layout[] = [
  {
    id: 'halves', name: 'Пополам',
    shares: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }],
  },
  {
    id: 'wide-left', name: 'Главное и подручное',
    shares: [{ x: 0, y: 0, w: 2 / 3, h: 1 }, { x: 2 / 3, y: 0, w: 1 / 3, h: 1 }],
  },
  {
    id: 'one-two', name: 'Одно слева, два справа',
    shares: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'thirds', name: 'Три колонки',
    shares: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
    ],
  },
  {
    id: 'quarters', name: 'Четверти',
    shares: [
      { x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'rows', name: 'Верх и низ',
    shares: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }],
  },
];

/** Доля в точках стола */
export function shareRect(share: Share, area: Area): Rect {
  const x = Math.round(share.x * area.w);
  const y = Math.round(share.y * area.h);
  // Правый и нижний края считаем от края стола, а не сложением ширин: иначе
  // округление оставляет между долями щель в точку, и она видна
  const right = Math.round((share.x + share.w) * area.w);
  const bottom = Math.round((share.y + share.h) * area.h);
  return { x, y, w: right - x, h: bottom - y };
}

/** Влезает ли окно в каждую долю этой раскладки */
export function layoutFits(layout: Layout, area: Area): boolean {
  return layout.shares.every((s) => {
    const r = shareRect(s, area);
    return r.w >= MIN_SHARE_W && r.h >= MIN_SHARE_H;
  });
}

/**
 * Что предлагать на этом столе.
 *
 * Раскладка, в долях которой окно не помещается, не показывается вовсе: панель
 * на узком столе короче, а не полна ловушек. Если не влезает ничего, панель не
 * открывается — кнопка разворота работает как прежде.
 */
export function layoutsFor(area: Area): Layout[] {
  return LAYOUTS.filter((l) => layoutFits(l, area));
}

/**
 * Доля в стилях разметки.
 *
 * Отдельная функция, потому что на этом легко обжечься: у прямоугольника поля
 * x/y/w/h, а у стиля left/top/width/height — и объект, переданный в style как
 * есть, не даёт ни ошибки, ни размера. Ровно так предложение занять доли
 * однажды сжалось в уголок.
 */
export function shareStyle(share: Share, area: Area): React.CSSProperties {
  const r = shareRect(share, area);
  return { left: r.x, top: r.y, width: r.w, height: r.h };
}

/** Соседи по раскладке: доли, оставшиеся свободными после выбранной */
export function otherShares(layout: Layout, taken: number): Share[] {
  return layout.shares.filter((_, i) => i !== taken);
}

/**
 * Где раскрыть панель.
 *
 * Она встаёт под кнопкой разворота, выровненная по правому краю окна, и не
 * уходит за край стола — то же правило, по которому окно нельзя утащить за
 * пределы видимого. Не помещается снизу — раскрывается вверх.
 */
export function panelSpot(
  btn: { x: number; y: number; h: number }, panel: { w: number; h: number }, area: Area,
): { x: number; y: number } {
  const GAP = 6;
  const x = Math.min(Math.max(0, btn.x - panel.w + 26), Math.max(0, area.w - panel.w));
  const below = btn.y + btn.h + GAP;
  const y = below + panel.h <= area.h ? below : Math.max(0, btn.y - panel.h - GAP);
  return { x: Math.round(x), y: Math.round(y) };
}
