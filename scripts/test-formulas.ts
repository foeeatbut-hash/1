/**
 * Формулы документа: проверка решений из docs/formulas-design.md.
 *
 * Каждая проверка названа по ситуации из разбора — если поведение поменяют,
 * будет видно, какое именно решение отменили.
 */
import {
  renderFormula, renderField, formatDate, formatName, isEmptyValue, findCycle, cycleNames,
  type Formula, type FormulaContext,
} from '../src/lib/docFormula.js';
import { cutBackground, inkRatio, fitToHeight, checkFile, DEFAULT_THRESHOLD,
         inkBounds, suggestThreshold, looksEmpty } from '../src/lib/signature.js';

let f = 0;
const ok = (n: string, c: boolean, d?: any) =>
  c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? JSON.stringify(d) : ''));

const cat = (list: Formula[]) => Object.fromEntries(list.map((x) => [x.id, x])) as Record<string, Formula>;
const txt = (r: ReturnType<typeof renderFormula>) => (r.kind === 'text' ? r.text : `«${r.kind}»`);

const CTX: FormulaContext = {
  'doc.code': 'ПЗ-001',
  'doc.revision': 'B',
  'doc.name': 'Пояснительная записка',
  'project.customer': 'ООО «Заказчик»',
  date: '2026-08-16',
  page: 1,
  pages: 3,
  'person.author.lastName': 'Иванов',
  'person.author.firstName': 'Иван',
  'person.author.middleName': 'Иванович',
  'person.author.signature': 'data:image/png;base64,AAA',
  'person.author.signatureHeightMm': 8,
  'person.current.lastName': 'Петров',
  'person.current.firstName': 'Пётр',
  'person.current.middleName': 'Петрович',
};

console.log('1. Пустое значение');
ok('пустая строка — пусто', isEmptyValue(''));
ok('пробелы — пусто', isEmptyValue('   '));
ok('null — пусто', isEmptyValue(null));
ok('ноль — НЕ пусто', isEmptyValue(0) === false);
ok('«0» строкой — НЕ пусто', isEmptyValue('0') === false);

console.log('2. Дата: порядок и вид частей');
ok('по умолчанию 16.08.2026', formatDate('2026-08-16') === '16.08.2026', formatDate('2026-08-16'));
ok('год-месяц-день', formatDate('2026-08-16', { order: 'ymd', sep: '-' }) === '2026-08-16', formatDate('2026-08-16', { order: 'ymd', sep: '-' }));
ok('месяц-день-год', formatDate('2026-08-16', { order: 'mdy', sep: '/' }) === '08/16/2026', formatDate('2026-08-16', { order: 'mdy', sep: '/' }));
ok('месяц словом в родительном', formatDate('2026-08-16', { month: 'gen' }) === '16 августа 2026', formatDate('2026-08-16', { month: 'gen' }));
ok('месяц словом в именительном', formatDate('2026-08-16', { month: 'nom' }) === '16 Август 2026', formatDate('2026-08-16', { month: 'nom' }));
ok('месяц римскими', formatDate('2026-08-16', { month: 'roman' }) === '16 VIII 2026', formatDate('2026-08-16', { month: 'roman' }));
ok('год двумя цифрами', formatDate('2026-08-16', { year: 'short' }) === '16.08.26', formatDate('2026-08-16', { year: 'short' }));
ok('год с «г.»', formatDate('2026-08-16', { year: 'suffix' }) === '16.08.2026 г.', formatDate('2026-08-16', { year: 'suffix' }));
ok('дата дд.мм.гггг тоже разбирается', formatDate('16.08.2026') === '16.08.2026');
ok('пустая дата → пусто, а не 01.01.1970', formatDate('') === '' && formatDate(null) === '');
ok('мусор вместо даты → пусто', formatDate('не дата') === '', formatDate('не дата'));

console.log('3. ФИО: вид вывода');
const P = { lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович' };
ok('полностью', formatName(P, 'full') === 'Иванов Иван Иванович');
ok('инициалы после фамилии', formatName(P, 'initialsAfter') === 'Иванов\u00A0И.И.', formatName(P, 'initialsAfter'));
ok('инициалы перед фамилией', formatName(P, 'initialsBefore') === 'И.И.\u00A0Иванов', formatName(P, 'initialsBefore'));
ok('только фамилия', formatName(P, 'last') === 'Иванов');
ok('без отчества инициал не выдумывается', formatName({ lastName: 'Ким', firstName: 'Олег' }, 'initialsAfter') === 'Ким\u00A0О.', formatName({ lastName: 'Ким', firstName: 'Олег' }, 'initialsAfter'));
ok('старый профиль одной строкой разбирается', formatName({ name: 'Сидоров Сидор Сидорович' }, 'initialsAfter') === 'Сидоров\u00A0С.С.', formatName({ name: 'Сидоров Сидор Сидорович' }, 'initialsAfter'));
ok('пустое ФИО → пусто', formatName({}, 'full') === '');
const R = { lastName: 'Раупов', firstName: 'Хусрав', middleName: 'Хуршедович' };
ok('Раупов Хусрав Хуршедович → Раупов Х.Х.', formatName(R, 'initialsAfter') === 'Раупов\u00A0Х.Х.', formatName(R, 'initialsAfter'));
ok('он же перед фамилией → Х.Х. Раупов', formatName(R, 'initialsBefore') === 'Х.Х.\u00A0Раупов', formatName(R, 'initialsBefore'));
ok('инициалы слитно, без пробела внутри', !/Х\.\s+Х\./.test(formatName(R, 'initialsAfter')));

console.log('4. Сборка: разделитель принадлежит части');
const shifr: Formula = {
  id: 'f1', name: 'Шифр с ревизией', kind: 'compose',
  config: { parts: [
    { kind: 'field', value: 'doc.code' },
    { kind: 'field', value: 'doc.revision', sep: ' рев. ' },
    { kind: 'formula', value: 'fdate', sep: ', ' },
  ] },
};
const fdate: Formula = { id: 'fdate', name: 'Дата', kind: 'value', config: { field: 'date' } };
const C1 = cat([shifr, fdate]);
ok('всё на месте', txt(renderFormula(shifr, CTX, C1)) === 'ПЗ-001 рев. B, 16.08.2026', txt(renderFormula(shifr, CTX, C1)));

const noRev = { ...CTX, 'doc.revision': '' };
ok('нет ревизии — нет и «рев. »', txt(renderFormula(shifr, noRev, C1)) === 'ПЗ-001, 16.08.2026', txt(renderFormula(shifr, noRev, C1)));

const onlyCode = { ...CTX, 'doc.revision': '', date: '' };
ok('осталась одна часть — хвостовых разделителей нет', txt(renderFormula(shifr, onlyCode, C1)) === 'ПЗ-001', txt(renderFormula(shifr, onlyCode, C1)));

const nothing = { ...CTX, 'doc.code': '', 'doc.revision': '', date: '' };
ok('все части пусты — пустая строка', txt(renderFormula(shifr, nothing, C1)) === '', txt(renderFormula(shifr, nothing, C1)));

const zero: Formula = { id: 'z', name: 'Лист', kind: 'compose', config: { parts: [
  { kind: 'text', value: 'Лист ' }, { kind: 'field', value: 'zeroPage' },
] } };
ok('ноль печатается, а не выпадает', txt(renderFormula(zero, { ...CTX, zeroPage: 0 }, cat([zero]))) === 'Лист 0', txt(renderFormula(zero, { ...CTX, zeroPage: 0 }, cat([zero]))));

console.log('5. Подпись');
const sig: Formula = { id: 's1', name: 'Подпись', kind: 'signature', config: { person: 'author' } };
const r1 = renderFormula(sig, CTX, cat([sig]));
ok('подпись автора — картинка', r1.kind === 'image', r1);
ok('высота берётся из профиля', r1.kind === 'image' && r1.heightMm === 8, r1);
const noSig = { ...CTX, 'person.author.signature': '' };
ok('подписи нет — пусто, а НЕ ФИО вместо неё', txt(renderFormula(sig, noSig, cat([sig]))) === '', txt(renderFormula(sig, noSig, cat([sig]))));
const sigCur: Formula = { id: 's2', name: 'Подпись открывшего', kind: 'signature', config: { person: 'current' } };
ok('у текущего пользователя подписи нет — пусто', txt(renderFormula(sigCur, CTX, cat([sigCur]))) === '');

console.log('6. Чьё ФИО');
const fioAuthor: Formula = { id: 'n1', name: 'Инициалы', kind: 'value', config: { field: 'person', name: 'initialsAfter', person: 'author' } };
const fioCurrent: Formula = { id: 'n2', name: 'Инициалы открывшего', kind: 'value', config: { field: 'person', name: 'initialsAfter', person: 'current' } };
ok('автор', txt(renderFormula(fioAuthor, CTX, cat([fioAuthor]))) === 'Иванов\u00A0И.И.');
ok('кто открыл', txt(renderFormula(fioCurrent, CTX, cat([fioCurrent]))) === 'Петров\u00A0П.П.');
const fioUser: Formula = { id: 'n3', name: 'Проверил', kind: 'value', config: { field: 'person', name: 'initialsAfter', person: 'user', userId: 'u7' } };
ok('выбранный сотрудник не найден — пусто', txt(renderFormula(fioUser, CTX, cat([fioUser]))) === '');
ok('выбранный сотрудник найден', txt(renderFormula(fioUser, { ...CTX, 'person.u7.lastName': 'Смирнов', 'person.u7.firstName': 'Семён' }, cat([fioUser]))) === 'Смирнов\u00A0С.');

console.log('7. Ссылки формул друг на друга');
const a: Formula = { id: 'a', name: 'A', kind: 'compose', config: { parts: [{ kind: 'formula', value: 'b' }] } };
const b: Formula = { id: 'b', name: 'B', kind: 'compose', config: { parts: [{ kind: 'formula', value: 'a' }] } };
const cyc = cat([a, b]);
const chain = findCycle('a', cyc);
ok('кольцо находится', !!chain, chain);
ok('в сообщении видна цепочка', chain ? cycleNames(chain, cyc) === 'A → B → A' : false, chain && cycleNames(chain, cyc));
ok('кольца нет там, где его нет', findCycle('f1', C1) === null);
ok('вывод не виснет на кольце', txt(renderFormula(a, CTX, cyc)) === '');

const deleted: Formula = { id: 'd', name: 'Со ссылкой на удалённую', kind: 'compose', config: { parts: [
  { kind: 'field', value: 'doc.code' }, { kind: 'formula', value: 'нет-такой', sep: ' / ' },
] } };
ok('ссылка на удалённую формулу ведёт себя как пусто', txt(renderFormula(deleted, CTX, cat([deleted]))) === 'ПЗ-001', txt(renderFormula(deleted, CTX, cat([deleted]))));

console.log('8. Старые выражения продолжают работать');
const old: Formula = { id: 'e', name: 'Осталось', kind: 'expr', config: { expr: 'pages - page & " осталось"' } };
ok('выражение считает как раньше', txt(renderFormula(old, CTX, cat([old]))) === '2 осталось', txt(renderFormula(old, CTX, cat([old]))));
const oldCat: Formula = { id: 'e2', name: 'Шифр', kind: 'expr', config: { expr: 'doc.code & " рев. " & doc.revision' } };
ok('склейка через &', txt(renderFormula(oldCat, CTX, cat([oldCat]))) === 'ПЗ-001 рев. B');
const bad: Formula = { id: 'e3', name: 'Опечатка', kind: 'expr', config: { expr: 'нетТакогоПоля & "!"' } };
ok('неизвестное поле не ломает вывод', txt(renderFormula(bad, CTX, cat([bad]))) === '!', txt(renderFormula(bad, CTX, cat([bad]))));

console.log('9. Испорченная настройка не мешает открыть документ');
const broken: Formula = { id: 'x', name: 'Битая', kind: 'compose', config: null as any };
ok('пустая настройка → пусто, без исключения', txt(renderFormula(broken, CTX, cat([broken]))) === '');
ok('неизвестной формулы нет в каталоге', renderFormula(undefined, CTX, {}).kind === 'missing');

console.log('10. Поле напрямую');
ok('обычное поле как есть', renderField('doc.name', CTX) === 'Пояснительная записка');
ok('поле-дата форматируется', renderField('date', CTX, { date: { month: 'gen' } }) === '16 августа 2026', renderField('date', CTX, { date: { month: 'gen' } }));
ok('пустое поле — пусто', renderField('нет.такого', CTX) === '');



// ── Подпись: удаление фона ──────────────────────────────────────────────────

console.log('11. Подпись: удаление фона');
/** Полоска: белый фон, серый край, чёрный штрих */
const strip = () => new Uint8ClampedArray([
  255, 255, 255, 255,   // белый — фон
  240, 240, 240, 255,   // почти белый — тоже фон
  128, 128, 128, 255,   // серый — край штриха
  20, 20, 20, 255,      // чёрный — штрих
]);

const s1 = strip();
cutBackground(s1, DEFAULT_THRESHOLD);
ok('белый фон стал прозрачным', s1[3] === 0, s1[3]);
ok('почти белый тоже убран', s1[7] === 0, s1[7]);
ok('чёрный штрих остался непрозрачным', s1[15] === 255, s1[15]);
ok('серый край не выброшен целиком', s1[11] > 0, s1[11]);

const s0 = strip();
cutBackground(s0, 0);
ok('порог 0 не трогает ничего', s0[3] === 255 && s0[15] === 255);

const s100 = strip();
cutBackground(s100, 100);
ok('порог 100 стирает всё', inkRatio(s100) === 0, inkRatio(s100));

ok('доля чернил считается', Math.abs(inkRatio(strip()) - 1) < 1e-9);
ok('порог вне диапазона не ломает', (() => { const x = strip(); cutBackground(x, 999); return inkRatio(x) === 0; })());

console.log('12. Подпись: размер и проверка файла');
ok('низкая картинка не растягивается', JSON.stringify(fitToHeight(400, 100, 300)) === JSON.stringify({ w: 400, h: 100 }));
ok('высокая уменьшается с пропорциями', JSON.stringify(fitToHeight(1200, 600, 300)) === JSON.stringify({ w: 600, h: 300 }), fitToHeight(1200, 600, 300));
ok('png принимается', checkFile({ type: 'image/png', size: 1000 }) === null);
ok('pdf отвергается понятным текстом', /PNG/.test(String(checkFile({ type: 'application/pdf', size: 10 }))), checkFile({ type: 'application/pdf', size: 10 }));
ok('слишком большой файл отвергается', /8 МБ/.test(String(checkFile({ type: 'image/png', size: 9e6 }))), checkFile({ type: 'image/png', size: 9e6 }));



console.log('13. Подпись: обрезка полей и подбор порога');
{
  // Лист 6×4 с точкой посередине — как скан с большими полями
  const W = 6, H = 4;
  const sheet = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < sheet.length; i += 4) { sheet[i] = sheet[i+1] = sheet[i+2] = 250; sheet[i+3] = 255; }
  const put = (x: number, y: number) => { const o = (y * W + x) * 4; sheet[o] = sheet[o+1] = sheet[o+2] = 10; };
  put(2, 1); put(3, 1);

  const t = suggestThreshold(sheet);
  ok('порог подобран в разумных пределах', t >= 5 && t <= 95, t);
  cutBackground(sheet, t);
  ok('после подбора бумага ушла', sheet[3] === 0, sheet[3]);
  ok('штрих остался', sheet[(1 * W + 2) * 4 + 3] > 0);

  const b = inkBounds(sheet, W, H, 0);
  ok('границы штриха найдены', !!b && b.x === 2 && b.y === 1 && b.w === 2 && b.h === 1, b);
  const bp = inkBounds(sheet, W, H, 2);
  ok('запас вокруг штриха не вылезает за лист', !!bp && bp.x === 0 && bp.y === 0 && bp.w === 6 && bp.h === 4, bp);

  const blank = new Uint8ClampedArray(W * H * 4);
  ok('на пустой картинке границ нет', inkBounds(blank, W, H) === null);
  ok('пустая картинка распознаётся как пустая', looksEmpty(blank));
  ok('картинка со штрихом пустой не считается', !looksEmpty(sheet));
}

console.log(f === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${f}`);
process.exit(f === 0 ? 0 : 1);
