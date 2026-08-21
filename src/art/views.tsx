import React from 'react';
import { PAINTINGS, PaintingScene } from './paintings';
import {
  Scenery, seasonOf, partOf, weathersFor, sceneryLabel, sceneryIsDark,
  SEASON_RU, PART_RU,
} from './scenery';

/**
 * Что показывает полка.
 *
 * Два рода видов, и они чередуются: картина — пейзаж — картина — пейзаж.
 * Подряд восемь картин полка выглядела бы музейным каталогом, подряд четыре
 * пейзажа — заставкой; вперемешку каждое следующее нажатие даёт что-то
 * непохожее на предыдущее.
 *
 * Пейзажей меньше, чем картин, поэтому они кончаются раньше — дальше идут
 * оставшиеся картины. Порядок один и тот же при каждом запуске: полка помнит
 * номер и продолжает с него, а не бросает кости заново.
 */

export interface ShelfView {
  id: string;
  /** Крупная строка подписи */
  title: string;
  /** Мелкая строка: автор и год либо время года и суток */
  sub: string;
  /** Тёмный ли вид — по нему выбирается цвет подписи, если она ляжет поверх */
  dark: boolean;
  render: () => React.ReactElement;
}

function paintingViews(): ShelfView[] {
  return PAINTINGS.map((p) => ({
    id: `art:${p.id}`,
    title: p.title,
    sub: `${p.artist}, ${p.year}`,
    dark: p.dark,
    render: () => <PaintingScene painting={p} />,
  }));
}

function sceneryViews(now: Date): ShelfView[] {
  const season = seasonOf(now);
  const part = partOf(now);
  return weathersFor(season).map((w) => {
    const { title, sub } = sceneryLabel(w, season, part);
    return {
      id: `sky:${w}`,
      title,
      sub,
      dark: sceneryIsDark(part),
      render: () => <Scenery season={season} part={part} weather={w} />,
    };
  });
}

/** Вперемешку: картина, пейзаж, картина, пейзаж, дальше — что осталось. */
function weave(a: ShelfView[], b: ShelfView[]): ShelfView[] {
  const out: ShelfView[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/**
 * Список видов на сейчас.
 *
 * Зависит от даты: в июле в списке летние пейзажи, в январе — зимние, вечером
 * — вечерние. Поэтому список собирается при открытии панели, а не один раз при
 * загрузке программы: Flux нередко не закрывают сутками, и полка, застрявшая
 * на «летнем дне» в декабре, читалась бы как поломка.
 */
export function buildViews(now: Date = new Date()): ShelfView[] {
  return weave(paintingViews(), sceneryViews(now));
}

/** Сегодняшние время года и время суток словами — для подсказки на кнопке. */
export function todayWords(now: Date = new Date()): string {
  return `${SEASON_RU[seasonOf(now)]}, ${PART_RU[partOf(now)]}`;
}
