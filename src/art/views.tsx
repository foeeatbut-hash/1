import React from 'react';
import { PAINTINGS, drawnById, StagedScene } from './paintings';
import { WORKS } from './works';
import { photoOf, usePhotoAspect, PhotoCanvas } from './photos';
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

/**
 * Снимок в раме. Отдельный компонент, а не кусок разметки: соотношение сторон
 * у снимка узнаётся при загрузке файла, а узнавать что-либо посреди сборки
 * списка нельзя — там нет ни состояния, ни жизненного цикла.
 *
 * Пока размер не известен, показываем нарисованный запас, если он есть. Файл
 * лежит внутри программы и читается за считаные миллисекунды, но пустая рама
 * даже на это время выглядит поломкой.
 */
function PhotoScene({ workId, stage, url }: { workId: string; stage: 'gallery' | 'studio' | 'desk'; url: string }) {
  const aspect = usePhotoAspect(url);
  const drawn = drawnById(workId);

  if (!aspect) return drawn ? <StagedScene stage={stage} canvas={drawn.canvas} /> : null;
  return (
    <StagedScene
      stage={stage}
      canvas={{ aspect, Draw: () => <PhotoCanvas url={url} aspect={aspect} /> }}
    />
  );
}

/**
 * Картины: сперва настоящие снимки, а чего нет — то нарисованное.
 *
 * Работа, у которой нет ни файла, ни рисунка, на полку не попадает и никак
 * себя не проявляет. Так список работ можно вести с запасом, пополняя папку
 * по мере того, как снимки находятся, — и ничего не ломается по дороге.
 */
function paintingViews(): ShelfView[] {
  const out: ShelfView[] = [];
  for (const w of WORKS) {
    const url = photoOf(w.id);
    const drawn = drawnById(w.id);
    if (!url && !drawn) continue;
    out.push({
      id: `art:${w.id}`,
      title: w.title,
      sub: `${w.artist}, ${w.year}`,
      dark: w.dark,
      render: () => (url
        ? <PhotoScene workId={w.id} stage={w.stage} url={url} />
        : <StagedScene stage={drawn!.stage} canvas={drawn!.canvas} />),
    });
  }
  return out;
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
