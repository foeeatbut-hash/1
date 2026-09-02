/**
 * Проверка единой меры оболочки.
 *
 * Размеры разъезжаются не сразу и не заметно: кто-то ставит кнопке `h-9`, потом
 * рядом появляется значок `w-[19px]`, и через месяц панель задач на четверть
 * выше системной, а значок на столе крупнее значка в Пуске. Глазом это видно
 * только в сравнении с настоящим рабочим столом — то есть тогда, когда правка
 * стоит уже дорого.
 *
 * Поэтому здесь два дела: сами числа сходятся между собой, и в разметке
 * оболочки нет размеров мимо src/lib/metrics.ts.
 *
 * Запуск: npx tsx scripts/test-metrics.ts
 */
import { readFileSync } from 'fs';
import { BAR_H, BAR_BTN, BAR_ICON, BAR_EDGE, DESK, DESK_SCALES, DESK_DEFAULT, deskMetric, ROW_H } from '../src/lib/metrics';
import { Z } from '../src/lib/layers';
import { CELL_W, CELL_H, gridSize, layout, arrange, cellToXY, xyToCell } from '../src/lib/desktop';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

console.log('Числа сходятся');
{
  check('кнопка помещается в панель с воздухом', BAR_BTN < BAR_H && BAR_H - BAR_BTN >= 6, [BAR_BTN, BAR_H]);
  check('значок меньше кнопки', BAR_ICON * 2 <= BAR_BTN, [BAR_ICON, BAR_BTN]);
  check('полоска «показать стол» уже кнопки', BAR_EDGE < BAR_BTN);
  check('панель не выше системной', BAR_H <= 48, BAR_H);
  check('плотная строка ниже обычной', ROW_H.dense < ROW_H.normal);

  const order = DESK_SCALES.map((s) => DESK[s.id].w);
  check('размеры идут по убыванию', order[0] > order[1] && order[1] > order[2], order);
  for (const s of DESK_SCALES) {
    const m = DESK[s.id];
    check(`${s.label}: значок влезает в клетку с подписью`, m.icon + m.label * 2 + 8 <= m.h, m);
    check(`${s.label}: клетка не у́же значка`, m.w > m.icon);
  }
  check('обычный размер — тот, что по умолчанию', deskMetric() === DESK[DESK_DEFAULT]);
  check('неизвестное имя не ломает стол', deskMetric('огромные' as any) === DESK[DESK_DEFAULT]);
  check('стол берёт клетку из общей меры', CELL_W === DESK.normal.w && CELL_H === DESK.normal.h);
}

console.log('Сетка считает по выбранному размеру');
{
  const area = { w: 1366, h: 728 };
  const big = gridSize(area, DESK.large);
  const small = gridSize(area, DESK.small);
  check('мелкими помещается больше', small.cols * small.rows > big.cols * big.rows, [small, big]);
  check('обычными на ноутбуке помещается не меньше 130 клеток',
    gridSize(area, DESK.normal).cols * gridSize(area, DESK.normal).rows >= 130,
    gridSize(area, DESK.normal));

  // Одна клетка — один значок при любом размере, и ничего не уезжает за край
  const items = Array.from({ length: 40 }, (_, i) => ({
    id: `f${i}`, kind: 'file' as const, name: `Файл ${i}`, shared: false,
  }));
  for (const s of DESK_SCALES) {
    const m = DESK[s.id];
    const view = layout(items, {}, area, m);
    const taken = new Set<string>();
    view.cells.forEach((c) => taken.add(`${c.col}:${c.row}`));
    check(`${s.label}: значок под значком не лежит`, taken.size === view.cells.size);
    view.cells.forEach((c) => {
      const at = cellToXY(c, m);
      check(`${s.label}: значок в пределах стола`, at.x + m.w <= area.w && at.y + m.h <= area.h, at);
    });
    const back = xyToCell(cellToXY({ col: 3, row: 2 }, m).x, cellToXY({ col: 3, row: 2 }, m).y, area, m);
    check(`${s.label}: клетка находится там же, где нарисована`, back.col === 3 && back.row === 2, back);
    const ordered = arrange(items, 'name', area, m);
    check(`${s.label}: упорядочивание раскладывает всё`, Object.keys(ordered).length === items.length);
  }
}

console.log('Слои идут снизу вверх');
{
  const order: (keyof typeof Z)[] = [
    'desktop', 'windows', 'taskbar', 'tray', 'start', 'drag', 'modal', 'toast', 'boot',
  ];
  for (let i = 1; i < order.length; i++) {
    check(`${order[i]} выше, чем ${order[i - 1]}`, Z[order[i]] > Z[order[i - 1]], [order[i], Z[order[i]]]);
  }
  check('Пуск выше окон — иначе он не Пуск', Z.start > Z.windows);
  check('Пуск выше панели задач', Z.start > Z.taskbar);
  check('между соседями есть место под новый слой', Z.tray - Z.taskbar >= 100);
}

console.log('В разметке оболочки нет своих размеров');
{
  // Файлы оболочки: то, из чего складывается «чувство системы». Числа в них
  // обязаны приходить из общей меры, а не появляться на месте
  const FILES = [
    'src/components/Taskbar.tsx',
    'src/components/StartMenu.tsx',
    'src/components/desktop/DeskIcon.tsx',
  ];
  // Классы вида h-9, w-10, h-[52px], text-[13px] — размер, поставленный руками
  const SIZE = /\b(?:w|h)-(?:\d{1,2}|\[\d+px\])(?![\w-])/g;
  // Отступы, скругления и промежутки мерой не считаем: они про воздух, а не
  // про размер элемента, и держать их в общем модуле — лишняя связанность
  const ALLOW = new Set(['w-2', 'h-2', 'w-3', 'h-3', 'w-4', 'h-4', 'w-full', 'h-full', 'w-0']);
  for (const file of FILES) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const found = (src.match(SIZE) || []).filter((m) => !ALLOW.has(m));
    check(`${file}: размеры берутся из общей меры`, found.length === 0, found.slice(0, 6));
  }
  const bar = readFileSync(new URL('../src/components/Taskbar.tsx', import.meta.url), 'utf8');
  check('панель задач ссылается на общую меру', bar.includes("from '../lib/metrics'"));
  check('панель задач ссылается на лестницу слоёв', bar.includes("from '../lib/layers'"));
  const start = readFileSync(new URL('../src/components/StartMenu.tsx', import.meta.url), 'utf8');
  check('Пуск рисуется порталом, а не внутри панели', start.includes('createPortal'));
  check('Пуск берёт свой слой из лестницы', start.includes('Z.start'));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВся мера оболочки сходится');
