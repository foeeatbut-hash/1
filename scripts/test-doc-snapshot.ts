/**
 * Снапшот текстового документа: проверяем настоящим движком, что в документе
 * есть всё, во что движок собирается писать.
 *
 * Проверки идут не на нашей копии правил, а на самом Univer: строим операции
 * ровно теми же вызовами, какими их строит движок при вставке колонтитула и
 * таблицы (createHeaderFooterAction и doc.command.insert-table), и применяем к
 * модели документа. Иначе легко написать проверку, которая согласна с нашим
 * кодом и расходится с движком, — а падало именно на движке.
 */
import { JSONX, DocumentDataModel } from '@univerjs/core';
import { emptyDocSnapshot, normalizeDocSnapshot, docSnapshotProblems } from '../src/lib/docSnapshot.js';

let f = 0;
const ok = (n: string, c: boolean, d?: any) =>
  c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? JSON.stringify(d).slice(0, 220) : ''));

/** Тело колонтитула — как getEmptyHeaderFooterBody движка */
const segmentBody = () => ({
  dataStream: '\r\n',
  textRuns: [{ st: 0, ed: 0, ts: { fs: 9 } }],
  customBlocks: [],
  paragraphs: [{ startIndex: 0, paragraphStyle: { spaceAbove: { v: 0 }, lineSpacing: 1.5, spaceBelow: { v: 0 } } }],
  sectionBreaks: [{ startIndex: 1 }],
});

/** Вставка верхнего колонтитула: те же операции, что у движка */
function headerActions(documentStyle: any) {
  const jsonX = JSONX.getInstance();
  const acts: any[] = [
    jsonX.insertOp(['headers', 'hdr001'], { headerId: 'hdr001', body: segmentBody() }),
    jsonX.insertOp(['footers', 'ftr001'], { footerId: 'ftr001', body: segmentBody() }),
  ];
  for (const [k, id] of [['defaultHeaderId', 'hdr001'], ['defaultFooterId', 'ftr001']]) {
    acts.push(documentStyle[k] != null ? jsonX.replaceOp(['documentStyle', k], documentStyle[k], id)
      : jsonX.insertOp(['documentStyle', k], id));
  }
  return acts.reduce((a, b) => JSONX.compose(a, b));
}

/** Вставка таблицы: движок кладёт её описание в tableSource */
const tableActions = () =>
  JSONX.getInstance().insertOp(['tableSource', 'tbl001'], { tableId: 'tbl001', tableRows: [], tableColumns: [] });

/** Применить операции к модели; вернуть текст ошибки или пусто */
function applyTo(snap: any, actions: any): string {
  const model = new DocumentDataModel(snap);
  try { model.apply(actions); return ''; } catch (e: any) { return String(e?.message || e); }
}

console.log('1. Новый документ принимает вставки');
const fresh = emptyDocSnapshot('doc1', 'Пояснительная записка');
ok('в новом документе нет изъянов', docSnapshotProblems(fresh).length === 0, docSnapshotProblems(fresh));
ok('колонтитул вставляется', applyTo(emptyDocSnapshot('doc1', 'Д'), headerActions(fresh.documentStyle)) === '',
  applyTo(emptyDocSnapshot('doc1', 'Д'), headerActions(fresh.documentStyle)));
ok('таблица вставляется', applyTo(emptyDocSnapshot('doc1', 'Д'), tableActions()) === '',
  applyTo(emptyDocSnapshot('doc1', 'Д'), tableActions()));

console.log('2. Документ без контейнеров — то, из-за чего падало');
const legacy = () => ({
  id: 'old', title: 'Старый',
  body: { dataStream: '\r\n', textRuns: [], customBlocks: [], paragraphs: [{ startIndex: 0 }], sectionBreaks: [{ startIndex: 1 }] },
  documentStyle: { marginTop: 72, marginBottom: 72, marginLeft: 72, marginRight: 72 },
});
ok('движок сам их не достраивает', docSnapshotProblems(legacy()).length === 3, docSnapshotProblems(legacy()));
const brokeHeader = applyTo(legacy(), headerActions(legacy().documentStyle));
ok('колонтитул падает «Cannot insert into missing item»',
  brokeHeader.includes('Cannot insert into missing item'), brokeHeader);
const brokeTable = applyTo(legacy(), tableActions());
ok('и таблица падает так же', brokeTable.includes('Cannot insert into missing item'), brokeTable);

console.log('3. Починка при открытии');
const fixed = normalizeDocSnapshot(legacy());
ok('изъянов не осталось', docSnapshotProblems(fixed).length === 0, docSnapshotProblems(fixed));
ok('колонтитул вставляется', applyTo(normalizeDocSnapshot(legacy()), headerActions(fixed.documentStyle)) === '');
ok('таблица вставляется', applyTo(normalizeDocSnapshot(legacy()), tableActions()) === '');
ok('текст документа не тронут', JSON.stringify(fixed.body) === JSON.stringify(legacy().body));
ok('поля страницы не тронуты', fixed.documentStyle.marginLeft === 72);

console.log('4. Висячая ссылка на колонтитул');
// Так остались документы, где вставка колонтитула упала на половине: в стиле
// имя сегмента есть, самого сегмента нет — движок падает при каждой правке
const dangling = () => {
  const s: any = legacy();
  s.documentStyle.defaultHeaderId = 'hdr404';
  s.documentStyle.evenPageFooterId = 'ftr404';
  return s;
};
ok('изъян замечен', docSnapshotProblems(dangling()).some(x => x.includes('defaultHeaderId')), docSnapshotProblems(dangling()));
const repaired = normalizeDocSnapshot(dangling());
ok('ссылка на несуществующий верхний убрана', repaired.documentStyle.defaultHeaderId === undefined);
ok('и на нижний тоже', repaired.documentStyle.evenPageFooterId === undefined);
ok('после починки изъянов нет', docSnapshotProblems(repaired).length === 0, docSnapshotProblems(repaired));

console.log('5. Живой колонтитул не выбрасывается');
const alive = () => {
  const s: any = normalizeDocSnapshot(legacy());
  s.headers.hdr001 = { headerId: 'hdr001', body: segmentBody() };
  s.documentStyle.defaultHeaderId = 'hdr001';
  return s;
};
ok('ссылка на существующий сегмент остаётся',
  normalizeDocSnapshot(alive()).documentStyle.defaultHeaderId === 'hdr001');
ok('сам сегмент на месте', Object.keys(normalizeDocSnapshot(alive()).headers).length === 1);

console.log('6. Мусор вместо снапшота не роняет починку');
ok('null', normalizeDocSnapshot(null) === null);
ok('строка', normalizeDocSnapshot('' as any) === '');
ok('пустой объект достраивается', docSnapshotProblems(normalizeDocSnapshot({})).length === 0);

console.log(f === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${f}`);
process.exit(f === 0 ? 0 : 1);
