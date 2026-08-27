/**
 * Проверки долей экрана.
 *
 * Ошибка здесь не видна глазом: доля, в которую окно не влезает, выглядит как
 * обычная — до нажатия. А щель в точку между двумя окнами замечаешь не сразу,
 * но она превращает ровную раскладку в неряшливую.
 *
 * Запуск: npx tsx scripts/test-layouts.ts
 */
import {
  LAYOUTS, layoutsFor, layoutFits, shareRect, otherShares, panelSpot,
  MIN_SHARE_W, MIN_SHARE_H,
} from '../src/lib/layouts';
import { MIN_W, MIN_H } from '../src/lib/windows';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const WIDE = { w: 1600, h: 900 };

console.log('Состав раскладок');
{
  check('раскладок шесть', LAYOUTS.length === 6, LAYOUTS.length);
  const ids = new Set(LAYOUTS.map((l) => l.id));
  check('имена не повторяются', ids.size === LAYOUTS.length);
  for (const l of LAYOUTS) {
    check(`${l.id}: долей от двух до четырёх`, l.shares.length >= 2 && l.shares.length <= 4, l.shares.length);
    const area = l.shares.reduce((s, x) => s + x.w * x.h, 0);
    check(`${l.id}: доли покрывают стол целиком`, Math.abs(area - 1) < 0.001, area);
    for (const s of l.shares) {
      check(`${l.id}: доля не выходит за стол`,
        s.x >= 0 && s.y >= 0 && s.x + s.w <= 1.001 && s.y + s.h <= 1.001, s);
    }
  }
}

console.log('Доли в точках');
{
  for (const l of LAYOUTS) {
    const rects = l.shares.map((s) => shareRect(s, WIDE));
    const covered = rects.reduce((s, r) => s + r.w * r.h, 0);
    check(`${l.id}: без щелей и нахлёстов`, covered === WIDE.w * WIDE.h, [l.id, covered, WIDE.w * WIDE.h]);
    check(`${l.id}: правый край доходит до края стола`,
      Math.max(...rects.map((r) => r.x + r.w)) === WIDE.w);
    check(`${l.id}: нижний край доходит до края стола`,
      Math.max(...rects.map((r) => r.y + r.h)) === WIDE.h);
  }
  // Нечётная ширина — самый частый случай, когда появляется щель
  const odd = { w: 1367, h: 769 };
  const q = LAYOUTS.find((l) => l.id === 'quarters')!;
  const rects = q.shares.map((s) => shareRect(s, odd));
  check('на нечётном столе четверти сходятся',
    rects.reduce((s, r) => s + r.w * r.h, 0) === odd.w * odd.h, rects);
}

console.log('Что предлагать');
{
  check('на широком столе предлагаются все', layoutsFor(WIDE).length === LAYOUTS.length);
  const narrow = { w: 900, h: 800 };
  const ok = layoutsFor(narrow);
  check('на узком столе трёх колонок нет', !ok.some((l) => l.id === 'thirds'), ok.map((l) => l.id));
  check('на узком столе пополам осталось', ok.some((l) => l.id === 'halves'), ok.map((l) => l.id));
  // 800 × 620: пополам даёт 400 в ширину — уже мало, а верх и низ дают 800 × 310
  const tiny = { w: 800, h: 620 };
  const few = layoutsFor(tiny);
  check('на тесном столе остаётся только верх и низ',
    few.length === 1 && few[0].id === 'rows', few.map((l) => l.id));
  const nothing = layoutsFor({ w: 700, h: 500 });
  check('когда не влезает ничего — не предлагаем ничего', nothing.length === 0, nothing.map((l) => l.id));
  check('наименьшая доля больше наименьшего окна', MIN_SHARE_W > MIN_W && MIN_SHARE_H > MIN_H);
  for (const l of layoutsFor(WIDE)) {
    check(`${l.id}: в каждую долю окно влезает`, layoutFits(l, WIDE));
  }
}

console.log('Соседи по раскладке');
{
  const q = LAYOUTS.find((l) => l.id === 'quarters')!;
  check('после выбора остаются остальные', otherShares(q, 0).length === 3);
  check('выбранная доля не предлагается второй раз',
    !otherShares(q, 0).some((s) => s.x === q.shares[0].x && s.y === q.shares[0].y));
}

console.log('Где раскрыть панель');
{
  const panel = { w: 208, h: 206 };
  const area = { w: 1400, h: 800 };
  const under = panelSpot({ x: 900, y: 100, h: 30 }, panel, area);
  check('обычно раскрывается под кнопкой', under.y === 136, under);
  check('панель не уходит за левый край', panelSpot({ x: 20, y: 60, h: 30 }, panel, area).x >= 0);
  check('панель не уходит за правый край',
    panelSpot({ x: 1395, y: 60, h: 30 }, panel, area).x + panel.w <= area.w);
  const low = panelSpot({ x: 900, y: 760, h: 30 }, panel, area);
  check('у нижнего края раскрывается вверх', low.y < 760, low);
  check('вверх тоже не за край', low.y >= 0, low);
}

console.log(failed === 0 ? '\nВсе проверки долей экрана пройдены' : `\nПровалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
