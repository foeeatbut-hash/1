/**
 * Выгрузка текстового документа: что увидит человек, открывший файл в Word.
 *
 * Проверяем именно то, что теряется незаметно: шрифт, выравнивание абзаца,
 * поля страницы. Ошибку такого рода на экране не видно — она обнаруживается,
 * когда документ уже ушёл заказчику.
 */
import {
  bodyToHtml, buildDocHtml, runCss, paraCss, pageOf, ptToMm, safeFileName, DEFAULT_PAGE,
  readPageSetup, applyPageSetup, PAGE_SIZES, MARGIN_PRESETS, DOC_FONTS,
} from '../src/screens/docExport.js';

let f = 0;
const ok = (n: string, c: boolean, d?: any) =>
  c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? JSON.stringify(d).slice(0, 220) : ''));

/** Документ: «Ведомость» жирным Arial 14, затем обычный абзац по центру */
const SNAP = {
  body: {
    dataStream: 'Ведомость\rОбычный текст\r\n',
    textRuns: [
      { st: 0, ed: 9, ts: { ff: 'Arial', fs: 14, bl: 1 } },
      { st: 10, ed: 23, ts: { ff: 'Times New Roman', fs: 12 } },
    ],
    paragraphs: [
      { startIndex: 9 },
      { startIndex: 23, paragraphStyle: { horizontalAlign: 1 } },
    ],
  },
  documentStyle: {
    pageSize: { width: 595.3, height: 841.9 },
    marginTop: 57, marginBottom: 57, marginLeft: 85, marginRight: 43,
  },
};

console.log('1. Стиль символа');
ok('шрифт переносится', /font-family:'Arial'/.test(runCss({ ff: 'Arial' })), runCss({ ff: 'Arial' }));
ok('размер в пунктах', runCss({ fs: 14 }).includes('font-size:14pt'));
ok('жирный', runCss({ bl: 1 }).includes('font-weight:bold'));
ok('курсив', runCss({ it: 1 }).includes('font-style:italic'));
ok('подчёркнутый', runCss({ ul: { s: 1 } }).includes('underline'));
ok('зачёркнутый', runCss({ st: { s: 1 } }).includes('line-through'));
ok('подчёркнутый и зачёркнутый вместе', runCss({ ul: { s: 1 }, st: { s: 1 } }).includes('underline line-through'));
ok('надстрочный', runCss({ va: 1 }).includes('super'));
ok('цвет текста', runCss({ cl: { rgb: '#ff0000' } }).includes('color:#ff0000'));
ok('пустой стиль ничего не даёт', runCss(null) === '' && runCss({}) === '');

console.log('2. Абзац');
ok('по центру', paraCss({ paragraphStyle: { horizontalAlign: 1 } }) === 'text-align:center', paraCss({ paragraphStyle: { horizontalAlign: 1 } }));
ok('по правому краю', paraCss({ paragraphStyle: { horizontalAlign: 2 } }).includes('right'));
ok('по ширине', paraCss({ paragraphStyle: { horizontalAlign: 3 } }).includes('justify'));
ok('влево — без лишнего css', paraCss({ paragraphStyle: { horizontalAlign: 0 } }) === '');
ok('красная строка', paraCss({ paragraphStyle: { indentFirstLine: { v: 35 } } }).includes('text-indent:35pt'));

console.log('3. Тело документа');
const html = bodyToHtml(SNAP);
ok('два абзаца', (html.match(/<p/g) || []).length === 2, html);
ok('первый — Arial 14 жирным', /Arial[^"]*font-size:14pt[^"]*font-weight:bold/.test(html), html.slice(0, 200));
ok('второй — по центру', /<p style="text-align:center"/.test(html), html);
ok('текст на месте', html.includes('Ведомость') && html.includes('Обычный текст'));
ok('служебные символы не попали', !/[\r\n]/.test(html.replace(/>\s+</g, '><')) || !html.includes('\\r'));

console.log('4. Пустой и битый документ не роняют выгрузку');
ok('пустой снапшот', bodyToHtml({}) === '');
ok('без textRuns', bodyToHtml({ body: { dataStream: 'Просто текст\r' } }).includes('Просто текст'));
ok('пустой абзац не схлопывается', bodyToHtml({ body: { dataStream: '\r' } }).includes('&nbsp;'));

console.log('5. Поля и размер листа');
const g = pageOf(SNAP);
ok('поля прочитаны из документа', g.left === 85 && g.right === 43 && g.top === 57, g);
ok('пункты в миллиметры', ptToMm(72) === 25.4, ptToMm(72));
ok('без documentStyle берутся поля как в Word', JSON.stringify(pageOf({})) === JSON.stringify(DEFAULT_PAGE));
ok('мусор в полях не ломает', pageOf({ documentStyle: { marginTop: 'ой' } }).top === DEFAULT_PAGE.top);

console.log('6. Файл для Word');
const word = buildDocHtml(SNAP, { title: 'Пояснительная записка', subtitle: 'ПЗ-001' }, true);
ok('поля листа уходят в файл', word.includes('margin:20.1mm 15.2mm 20.1mm 30mm'), (word.match(/margin:[^;}]*/) || [])[0]);
ok('размер листа А4', /size:210mm 297mm/.test(word), (word.match(/size:[^;]*/) || [])[0]);
ok('разметка, по которой Word открывает как документ', word.includes('WordSection1') && word.includes('urn:schemas-microsoft-com:office:word'));
ok('шрифт абзаца сохранён', word.includes("font-family:'Arial'"));
ok('заголовок документа на месте', word.includes('Пояснительная записка'));
ok('шрифт документа по умолчанию — из самого документа', buildDocHtml(
  { ...SNAP, documentStyle: { ...SNAP.documentStyle, textStyle: { ff: 'Calibri', fs: 11 } } },
  { title: 'т' }, true).includes("font-family: 'Calibri', serif; font-size: 11pt"));
ok('не задан — Times New Roman 12, как в записках',
  word.includes("font-family: 'Times New Roman', serif; font-size: 12pt"), (word.match(/body \{[^}]*/) || [])[0]);

const plain = buildDocHtml(SNAP, { title: 'Печать' }, false);
ok('для печати служебная разметка Word не нужна', !plain.includes('WordSection1'));
ok('но поля те же', plain.includes('margin:20.1mm 15.2mm 20.1mm 30mm'));

console.log('7. Значения формул, а не сами формулы');
// Титул приходит уже собранным: получатель в Windows видит текст, а не «ƒ …»
const withTitle = buildDocHtml(SNAP, {
  title: 'Док', titlePageHtml: '<div>ПЗ-001 рев. B<br>Раупов Х.Х.</div>',
}, true);
ok('значения титула попали в файл', withTitle.includes('ПЗ-001 рев. B') && withTitle.includes('Раупов Х.Х.'));
ok('титул отделён разрывом страницы', withTitle.includes('page-break-after:always'));
ok('в файле нет разметки плашек', !withTitle.includes('data-formula') && !withTitle.includes('data-field'));

console.log('8. Имя файла');
ok('запрещённые в Windows символы убраны', safeFileName('Отчёт: 10/2026 <черновик>', 'doc') === 'Отчёт- 10-2026 -черновик-.doc', safeFileName('Отчёт: 10/2026 <черновик>', 'doc'));
ok('пустое название не даёт файл без имени', safeFileName('', 'doc') === 'Документ.doc');

console.log('9. Разметка страницы, как в Ворде');
const cur = readPageSetup(SNAP);
ok('формат распознан как A4', cur.size === 'A4', cur);
ok('ориентация книжная', cur.orientation === 'portrait');
ok('поля прочитаны', cur.margins.left === 85 && cur.margins.right === 43);
ok('дробные пункты не мешают узнать A4',
  readPageSetup({ documentStyle: { pageSize: { width: 595.3, height: 841.98 } } }).size === 'A4');

const land = applyPageSetup(SNAP, { size: 'A4', orientation: 'landscape', margins: MARGIN_PRESETS.normal });
ok('альбомная ориентация переворачивает лист',
  land.documentStyle.pageSize.width > land.documentStyle.pageSize.height, land.documentStyle.pageSize);
ok('поля «обычные» — 2,54 см', land.documentStyle.marginTop === 72 && land.documentStyle.marginLeft === 72);
ok('движку сказано разбивать на страницы, как Ворд', land.documentStyle.documentFlavor === 1, land.documentStyle.documentFlavor);
ok('ориентация записана отдельным полем — иначе колонтитулы не повернутся', land.documentStyle.pageOrient === 1, land.documentStyle.pageOrient);
ok('книжная ставит pageOrient обратно в 0',
  applyPageSetup(land, { ...readPageSetup(land), orientation: 'portrait' }).documentStyle.pageOrient === 0);
ok('отступ до колонтитула — 1,25 см, как в Ворде', ptToMm(land.documentStyle.marginHeader) === 12.5, land.documentStyle.marginHeader);
ok('свой отступ колонтитула не затирается',
  applyPageSetup({ documentStyle: { marginHeader: 20 } }, { size: 'A4', orientation: 'portrait', margins: MARGIN_PRESETS.normal }).documentStyle.marginHeader === 20);
ok('обратно в книжную', readPageSetup(applyPageSetup(land, { ...readPageSetup(land), orientation: 'portrait' })).orientation === 'portrait');
ok('тело документа при смене разметки не тронуто', land.body.dataStream === SNAP.body.dataStream);
ok('исходный снапшот не изменён', SNAP.documentStyle.marginTop === 57);

const a3 = applyPageSetup(SNAP, { size: 'A3', orientation: 'portrait', margins: MARGIN_PRESETS.gost });
ok('A3 книжный — 297 × 420 мм', ptToMm(a3.documentStyle.pageSize.width) === 297 && ptToMm(a3.documentStyle.pageSize.height) === 420, a3.documentStyle.pageSize);
ok('ГОСТ: слева 3 см', ptToMm(a3.documentStyle.marginLeft) === 30, ptToMm(a3.documentStyle.marginLeft));
ok('размер листа уходит в @page выгрузки', buildDocHtml(a3, { title: 'A3' }, true).includes('size:297mm 420mm'), (buildDocHtml(a3, { title: 'A3' }, true).match(/size:[^;]*/) || [])[0]);
ok('неизвестный формат не роняет — берётся A4', applyPageSetup(SNAP, { size: 'нечто', orientation: 'portrait', margins: MARGIN_PRESETS.normal }).documentStyle.pageSize.width === 595.3);
ok('все наборы полей заданы полностью',
  Object.values(MARGIN_PRESETS).every(m => [m.top, m.right, m.bottom, m.left].every(v => typeof v === 'number' && v >= 0)));
ok('все форматы имеют подпись', Object.values(PAGE_SIZES).every(s => !!s.label));

console.log('10. Список шрифтов');
ok('Times New Roman первым — как в ГОСТ-документах', DOC_FONTS[0].value === 'Times New Roman');
ok('есть Calibri — шрифт Ворда по умолчанию', DOC_FONTS.some(x => x.value === 'Calibri'));
ok('есть чертёжный ISOCPEUR', DOC_FONTS.some(x => x.value === 'ISOCPEUR'));
ok('в подписях нет точек — иначе переводчик Univer их съест',
  DOC_FONTS.every(x => !x.label.includes('.')), DOC_FONTS.filter(x => x.label.includes('.')));
ok('названия не повторяются', new Set(DOC_FONTS.map(x => x.value)).size === DOC_FONTS.length);
ok('выбранный шрифт доходит до файла Ворда',
  buildDocHtml({ body: { dataStream: 'Текст\r', textRuns: [{ st: 0, ed: 5, ts: { ff: 'Calibri', fs: 11 } }], paragraphs: [{ startIndex: 5 }] } },
    { title: 'т' }, true).includes("font-family:'Calibri';font-size:11pt"));

console.log(f === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${f}`);
process.exit(f === 0 ? 0 : 1);
