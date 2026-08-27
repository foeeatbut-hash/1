/**
 * Проверки геометрии окон.
 *
 * Здесь ошибка не видна глазом: окно, уехавшее за край, или размер,
 * схлопнувшийся в ноль, замечаешь уже когда потерял то, что было внутри.
 * Поэтому проверяются именно границы, а не «в среднем работает».
 */
import {
  initialRect, moveRect, resizeRect, snapZoneAt, snapRect, toggleMaximize,
  raise, topWindow, refit, tile, MIN_W, MIN_H, SNAP_EDGE,
  type WinState, type Rect,
} from '../src/lib/windows';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const AREA = { w: 1400, h: 800 };
const win = (over: Partial<WinState> = {}): WinState => ({
  id: 'w1', path: '/registry', href: '/registry', z: 1, minimized: false, maximized: false, restore: null,
  x: 200, y: 100, w: 800, h: 500, ...over,
});
const inside = (r: Rect, a = AREA) => r.w >= MIN_W && r.h >= MIN_H && r.x + r.w > 0 && r.x < a.w && r.y >= 0;

console.log('Появление');
{
  const r = initialRect(AREA, 0);
  check('первое окно не во весь стол', r.w < AREA.w && r.h < AREA.h, r);
  check('первое окно не меньше наименьшего', r.w >= MIN_W && r.h >= MIN_H, r);
  check('первое окно целиком на столе', r.x >= 0 && r.y >= 0 && r.x + r.w <= AREA.w && r.y + r.h <= AREA.h, r);
  const second = initialRect(AREA, 1);
  check('второе смещено каскадом', second.x > r.x && second.y > r.y, [r, second]);
  const seventh = initialRect(AREA, 6);
  check('седьмое вернулось в начало каскада', seventh.x === r.x && seventh.y === r.y, [r, seventh]);
  const tiny = initialRect({ w: 300, h: 200 }, 0);
  check('на крошечном столе окно не меньше наименьшего', tiny.w === MIN_W && tiny.h === MIN_H, tiny);
}

console.log('Перемещение');
{
  const r = moveRect(win(), 100, 50, AREA);
  check('обычный сдвиг', r.x === 300 && r.y === 150, r);
  const far = moveRect(win(), 5000, 0, AREA);
  check('вправо за край не уходит целиком', far.x < AREA.w, far);
  check('справа осталось за что ухватиться', far.x + far.w > AREA.w, far);
  const left = moveRect(win(), -5000, 0, AREA);
  check('слева осталось видно', left.x + left.w > 0, left);
  const up = moveRect(win(), 0, -5000, AREA);
  check('за верх не уводится: заголовок обязан быть виден', up.y === 0, up);
  const down = moveRect(win(), 0, 5000, AREA);
  check('вниз не уводится ниже стола', down.y <= AREA.h, down);
}

console.log('Размер за восемь краёв');
{
  const base = win();
  check('правый край растит ширину', resizeRect(base, 'e', 100, 0, AREA).w === 900);
  check('нижний край растит высоту', resizeRect(base, 's', 0, 100, AREA).h === 600);
  const w = resizeRect(base, 'w', -100, 0, AREA);
  check('левый край двигает и начало', w.x === 100 && w.w === 900, w);
  const n = resizeRect(base, 'n', 0, -100, AREA);
  check('верхний край двигает и начало', n.y === 0 && n.h === 600, n);
  const nw = resizeRect(base, 'nw', -50, -50, AREA);
  check('угол двигает обе стороны', nw.x === 150 && nw.y === 50 && nw.w === 850 && nw.h === 550, nw);
  const squash = resizeRect(base, 'e', -5000, 0, AREA);
  check('ширина не схлопывается', squash.w === MIN_W, squash);
  const squashH = resizeRect(base, 's', 0, -5000, AREA);
  check('высота не схлопывается', squashH.h === MIN_H, squashH);
  const squashW = resizeRect(base, 'w', 5000, 0, AREA);
  check('левый край не перескакивает правый', squashW.w === MIN_W && squashW.x === 1000 - MIN_W, squashW);
  const grow = resizeRect(base, 'e', 5000, 0, AREA);
  check('вправо не растёт за край стола', grow.x + grow.w <= AREA.w, grow);
  check('за все восемь краёв окно остаётся годным',
    (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const).every((edge) =>
      inside(resizeRect(base, edge, -9999, -9999, AREA)) && inside(resizeRect(base, edge, 9999, 9999, AREA))));
}

console.log('Прилипание');
{
  check('левый край', snapZoneAt(3, 400, AREA) === 'left');
  check('правый край', snapZoneAt(AREA.w - 3, 400, AREA) === 'right');
  check('верх', snapZoneAt(700, 2, AREA) === 'top');
  check('верх важнее левого угла', snapZoneAt(2, 2, AREA) === 'top');
  check('в середине не прилипает', snapZoneAt(700, 400, AREA) === null);
  check('ровно на пороге прилипает', snapZoneAt(SNAP_EDGE, 400, AREA) === 'left');
  check('за порогом уже нет', snapZoneAt(SNAP_EDGE + 1, 400, AREA) === null);
  const l = snapRect('left', AREA);
  const r = snapRect('right', AREA);
  check('половины делят стол без щели', l.w + r.w === AREA.w, [l, r]);
  check('половины не наезжают', l.x + l.w === r.x, [l, r]);
  check('верх разворачивает во весь стол', JSON.stringify(snapRect('top', AREA)) === JSON.stringify({ x: 0, y: 0, w: 1400, h: 800 }));
}

console.log('Разворот');
{
  const m = toggleMaximize(win(), AREA);
  check('развернулось во весь стол', m.w === AREA.w && m.h === AREA.h && m.x === 0 && m.y === 0, m);
  check('запомнило, куда вернуть', !!m.restore && m.restore.w === 800, m.restore);
  const back = toggleMaximize(m, AREA);
  check('вернулось на своё место', back.x === 200 && back.y === 100 && back.w === 800 && back.h === 500, back);
  check('память о месте очищена', back.restore === null && !back.maximized);
  const lost = toggleMaximize({ ...win(), maximized: true, restore: null }, AREA);
  check('без запомненного места не падает', inside(lost), lost);
}

console.log('Порядок наложения');
{
  const list = [win({ id: 'a', z: 1 }), win({ id: 'b', z: 2 }), win({ id: 'c', z: 3 })];
  const r = raise(list, 'a');
  check('поднятое стало выше всех', r.find((w) => w.id === 'a')!.z > 3, r.map((w) => w.z));
  check('порядок в массиве не переставлен', r.map((w) => w.id).join('') === 'abc');
  check('повторный подъём верхнего ничего не меняет', raise(list, 'c') === list);
  check('верхнее найдено', topWindow(list)!.id === 'c');
  const hidden = [win({ id: 'a', z: 1 }), win({ id: 'b', z: 9, minimized: true })];
  check('свёрнутое не считается верхним', topWindow(hidden)!.id === 'a');
  check('когда всё свёрнуто — верхнего нет', topWindow([win({ minimized: true })]) === null);
  check('пустой список не роняет', topWindow([]) === null);
}

console.log('Стол изменился');
{
  const narrow = { w: 700, h: 500 };
  const r = refit([win({ x: 900, y: 700 })], narrow)[0];
  check('окно вернулось на видимое место', r.x < narrow.w && r.y < narrow.h, r);
  check('размер ужат, но не меньше наименьшего', r.w >= MIN_W && r.h >= MIN_H, r);
  const max = refit([win({ maximized: true })], narrow)[0];
  check('развёрнутое подстроилось под новый стол', max.w === narrow.w && max.h === narrow.h, max);
  const tiny = refit([win()], { w: 200, h: 150 })[0];
  check('на столе меньше наименьшего окно не исчезает', tiny.w === MIN_W && tiny.h === MIN_H, tiny);
}

console.log('Разложить по сетке');
{
  const four = ['a', 'b', 'c', 'd'].map((id, i) => win({ id, z: i }));
  const t = tile(four, AREA);
  check('четыре легли в две колонки', t[0].w === 700 && t[0].h === 400, t[0]);
  check('второе правее первого', t[1].x === 700 && t[1].y === 0, t[1]);
  check('третье ниже первого', t[2].x === 0 && t[2].y === 400, t[2]);
  check('развёрнутость снята', t.every((w) => !w.maximized));
  const withHidden = tile([win({ id: 'a' }), win({ id: 'b', minimized: true })], AREA);
  check('свёрнутое не участвует', withHidden.find((w) => w.id === 'b')!.x === 200, withHidden);
  check('одно окно занимает стол целиком', tile([win()], AREA)[0].w === AREA.w);
  check('пустой список не роняет', tile([], AREA).length === 0);
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки геометрии окон пройдены');
