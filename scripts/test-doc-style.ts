/**
 * Линейка и интервалы: проверяем арифметику, которую мышью не проверишь.
 *
 * Каждая проверка названа ситуацией из работы: «потянули левое поле за правое»,
 * «висячая строка», «отпустили между делениями». Если поведение поменяют, будет
 * видно, какое именно правило отменили.
 */
import {
  ptToMm, mmToPt, ptToPx, pxToPt, snapMm, snapPt, fmtMm,
  textWidthPt, handlePosPt, dragTo, rulerTicks, describeParagraph,
  LINE_SPACINGS, PARA_SPACINGS, FIRST_LINE_GOST_PT, MIN_TEXT_PT,
  type RulerModel,
} from '../src/lib/docStyle.js';

let f = 0;
const ok = (n: string, c: boolean, d?: any) =>
  c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? JSON.stringify(d).slice(0, 220) : ''));
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

/** А4 с полями ГОСТ: слева 30 мм, справа 15 мм */
const M: RulerModel = {
  pageWidthPt: 595.3,
  marginLeftPt: mmToPt(30),
  marginRightPt: mmToPt(15),
  firstLinePt: 0, indentStartPt: 0, indentEndPt: 0,
};

console.log('1. Единицы измерения');
ok('72 pt = 25,4 мм', near(ptToMm(72), 25.4));
ok('обратно без потерь', near(mmToPt(ptToMm(85)), 85));
// Полотно движка рисует пункт в пиксель при 100% — измерено на листе
ok('пункт в пиксель при 100%', near(ptToPx(595.3), 595.3));
ok('масштаб 150% растягивает', near(ptToPx(100, 1.5), 150));
ok('пиксели обратно в пункты', near(pxToPt(595.3), 595.3));
ok('пиксели обратно с масштабом', near(pxToPt(150, 1.5), 100));
ok('нулевой масштаб не делит на ноль', isFinite(pxToPt(100, 0)));

console.log('2. Прилипание к полумиллиметру');
ok('20,37 мм становится 20,5', near(snapMm(20.37), 20.5), snapMm(20.37));
ok('20,2 мм становится 20', near(snapMm(20.2), 20));
ok('ровное значение не портится', near(snapMm(30), 30));
ok('ноль остаётся нулём', snapMm(0) === 0);
ok('прилипание не выталкивает за границу',
  snapPt(mmToPt(29.9), 0, mmToPt(29.9)) <= mmToPt(29.9) + 0.001, ptToMm(snapPt(mmToPt(29.9), 0, mmToPt(29.9))));
ok('отрицательное подтягивается к минимуму', snapPt(-50, 0, 100) === 0);
ok('подпись значения по-русски', fmtMm(mmToPt(20.5)) === '20,5 мм', fmtMm(mmToPt(20.5)));

console.log('3. Где стоят бегунки');
ok('текстовая область — 165 мм', near(ptToMm(textWidthPt(M)), 165), ptToMm(textWidthPt(M)));
ok('левое поле на 30 мм', near(ptToMm(handlePosPt(M, 'marginLeft')), 30));
ok('правое поле на 195 мм от левого края', near(ptToMm(handlePosPt(M, 'marginRight')), 195));
ok('без отступов красная строка совпадает с левым полем',
  near(handlePosPt(M, 'firstLine'), M.marginLeftPt));
{
  const withInd: RulerModel = { ...M, indentStartPt: mmToPt(10), firstLinePt: mmToPt(12.5), indentEndPt: mmToPt(5) };
  ok('отступ абзаца отсчитывается от текстовой области',
    near(ptToMm(handlePosPt(withInd, 'indentStart')), 40), ptToMm(handlePosPt(withInd, 'indentStart')));
  ok('красная строка — от отступа абзаца',
    near(ptToMm(handlePosPt(withInd, 'firstLine')), 52.5), ptToMm(handlePosPt(withInd, 'firstLine')));
  ok('отступ справа — от правого поля внутрь',
    near(ptToMm(handlePosPt(withInd, 'indentEnd')), 190), ptToMm(handlePosPt(withInd, 'indentEnd')));
}

console.log('4. Перетаскивание полей');
ok('потянули левое поле на 25 мм', near(ptToMm(dragTo(M, 'marginLeft', mmToPt(25))), 25));
ok('потянули за левый край листа — упёрлось в ноль', dragTo(M, 'marginLeft', -30) === 0);
ok('потянули левое поле на правое — осталось 20 мм текста',
  near(ptToMm(dragTo(M, 'marginLeft', mmToPt(500))), 210 - 15 - 20), ptToMm(dragTo(M, 'marginLeft', mmToPt(500))));
ok('правое поле считается от правого края',
  near(ptToMm(dragTo(M, 'marginRight', mmToPt(180))), 30), ptToMm(dragTo(M, 'marginRight', mmToPt(180))));
ok('правое поле тоже не съедает текст',
  near(ptToMm(dragTo(M, 'marginRight', 0)), 210 - 30 - 20), ptToMm(dragTo(M, 'marginRight', 0)));
ok('между делениями прилипает', near(ptToMm(dragTo(M, 'marginLeft', mmToPt(24.8))), 25));
ok('минимум текста — 20 мм', near(ptToMm(MIN_TEXT_PT), 20));

console.log('5. Перетаскивание отступов абзаца');
ok('отступ слева на 10 мм от начала текста',
  near(ptToMm(dragTo(M, 'indentStart', mmToPt(40))), 10), ptToMm(dragTo(M, 'indentStart', mmToPt(40))));
ok('на поле не уходит — минимум ноль', dragTo(M, 'indentStart', mmToPt(5)) === 0);
ok('отступ справа на 5 мм',
  near(ptToMm(dragTo(M, 'indentEnd', mmToPt(190))), 5), ptToMm(dragTo(M, 'indentEnd', mmToPt(190))));
ok('красная строка 12,5 мм — как в записках',
  near(ptToMm(dragTo(M, 'firstLine', mmToPt(42.5))), 12.5), ptToMm(dragTo(M, 'firstLine', mmToPt(42.5))));
{
  // Висячая строка: первая строка левее остальных — так набирают списки
  const withInd: RulerModel = { ...M, indentStartPt: mmToPt(10) };
  ok('висячая строка уходит в минус',
    near(ptToMm(dragTo(withInd, 'firstLine', mmToPt(35))), -5), ptToMm(dragTo(withInd, 'firstLine', mmToPt(35))));
  ok('но не левее отступа абзаца',
    near(dragTo(withInd, 'firstLine', 0), -withInd.indentStartPt), ptToMm(dragTo(withInd, 'firstLine', 0)));
  ok('отступы навстречу друг другу оставляют 5 мм',
    ptToMm(dragTo({ ...withInd, indentEndPt: mmToPt(150) }, 'indentStart', mmToPt(500))) <= 165 - 150 - 5 + 0.01,
    ptToMm(dragTo({ ...withInd, indentEndPt: mmToPt(150) }, 'indentStart', mmToPt(500))));
}

console.log('6. Деления линейки');
const ticks = rulerTicks(M);
ok('деления через полсантиметра', ticks.length === Math.floor(ptToMm(M.pageWidthPt) / 5) + 1, ticks.length);
ok('первое деление в нуле', near(ticks[0].xPt, 0) && ticks[0].big);
ok('половинки короткие', ticks[1].big === false);
const labels = ticks.filter(t => t.label).map(t => t.label);
ok('подписи начинаются с 1 см текста', labels[0] === '1', labels.slice(0, 5));
ok('подписей столько, сколько целых сантиметров текста', labels.length === 16, labels.length);
ok('за правым полем подписей нет',
  ticks.filter(t => t.label && t.xPt > M.pageWidthPt - M.marginRightPt + 0.01).length === 0);
ok('в левом поле подписей нет',
  ticks.filter(t => t.label && t.xPt < M.marginLeftPt - 0.01).length === 0);

console.log('7. Наборы интервалов');
ok('в междустрочных есть 1,5 для ГОСТ', LINE_SPACINGS.some(x => x.v === 1.5));
ok('и одинарный, и двойной', LINE_SPACINGS.some(x => x.v === 1) && LINE_SPACINGS.some(x => x.v === 2));
ok('интервал абзаца можно убрать в ноль', PARA_SPACINGS[0].v === 0);
ok('красная строка по ГОСТ — 12,5 мм', near(ptToMm(FIRST_LINE_GOST_PT), 12.5));

console.log('8. Чтение стиля абзаца');
const d = describeParagraph({ lineSpacing: 1.5, spaceAbove: { v: 6 }, indentFirstLine: { v: 35 }, indentStart: { v: 10 } });
ok('интервал прочитан', d.lineSpacing === 1.5);
ok('интервал до абзаца прочитан', d.before === 6);
ok('интервала после нет — и он не выдуман', d.after === undefined);
ok('красная строка прочитана', d.firstLinePt === 35);
ok('отступ слева прочитан', d.startPt === 10);
const empty = describeParagraph(undefined);
ok('пустой стиль не превращается в одинарный интервал', empty.lineSpacing === undefined, empty);
ok('но отступы у пустого — нули', empty.firstLinePt === 0 && empty.startPt === 0 && empty.endPt === 0);
ok('мусор в стиле не ломает чтение', describeParagraph({ lineSpacing: 'ой', indentStart: { v: null } }).lineSpacing === undefined);

console.log(f === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${f}`);
process.exit(f === 0 ? 0 : 1);
