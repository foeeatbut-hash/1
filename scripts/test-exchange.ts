/**
 * Проверки обмена: подпись результата и сборка файла.
 *
 * Ошибки здесь тихие. Файл без BOM открывается крякозябрами, файл с запятой
 * вместо точки с запятой — одним столбцом, а кавычка внутри значения без
 * удвоения рвёт строку посередине. Всё это видно не в программе, а в Excel у
 * заказчика, через день.
 *
 * Запуск: npx tsx scripts/test-exchange.ts
 */
import {
  summary, sizeHint, blocker, toCsv, toClipboard, fileName, pickColumns, TARGET_LABEL,
} from '../src/lib/exchange';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

console.log('Подпись результата');
{
  check('строки и столбцы согласованы по падежам', summary(37, 5) === '37 строк · 5 столбцов · ~4 КБ', summary(37, 5));
  check('одна строка — «строка»', summary(1, 1).startsWith('1 строка'), summary(1, 1));
  check('две строки — «строки»', summary(2, 2).startsWith('2 строки'), summary(2, 2));
  check('одиннадцать — «строк»', summary(11, 1).startsWith('11 строк'), summary(11, 1));
  check('двадцать одна — «строка»', summary(21, 1).startsWith('21 строка'), summary(21, 1));
  check('пусто — сказано словами, а не нулём', summary(0, 5).includes('не попала'), summary(0, 5));
  check('без столбцов — тоже словами', summary(10, 0).includes('столбец'), summary(10, 0));
}

console.log('Оценка размера');
{
  check('мелкое считается в килобайтах', sizeHint(10, 3).endsWith('КБ'));
  check('крупное считается в мегабайтах', sizeHint(200000, 12).endsWith('МБ'), sizeHint(200000, 12));
  check('пустое не даёт ноль килобайт', sizeHint(0, 0) === '~1 КБ', sizeHint(0, 0));
}

console.log('Что мешает выгрузить');
{
  check('всё на месте — ничего не мешает', blocker(5, 3) === '');
  check('без столбцов не выгружаем', blocker(5, 0).includes('столбец'));
  check('без строк не выгружаем', blocker(0, 3).includes('строка'));
}

console.log('CSV для Excel');
{
  const csv = toCsv(['Тег', 'Марка'], [['AHU-2', 'Systemair'], ['VAV "1"', 'Тест;точка']]);
  check('файл начинается с BOM', csv.charCodeAt(0) === 0xfeff, csv.charCodeAt(0));
  check('разделитель — точка с запятой', csv.includes('"Тег";"Марка"'), csv.slice(0, 40));
  check('кавычка внутри значения удвоена', csv.includes('"VAV ""1"""'), csv);
  check('точка с запятой внутри значения не рвёт строку',
    csv.split('\r\n')[2] === '"VAV ""1""";"Тест;точка"', csv.split('\r\n')[2]);
  check('конец строки — CRLF', csv.includes('\r\n'));
  check('пустое значение не роняет сборку', toCsv(['A'], [[undefined as any]]).includes('""'));
}

console.log('Буфер обмена');
{
  const t = toClipboard(['A', 'B'], [['раз', 'два']]);
  check('столбцы разделены табуляцией', t.includes('A\tB'), t);
  check('перевод строки внутри значения не ломает строку',
    !toClipboard(['A'], [['две\nстроки']]).split('\n')[1].includes('строки\n'),
    toClipboard(['A'], [['две\nстроки']]));
}

console.log('Имя файла');
{
  const n = fileName('Теги', 'xlsx', new Date(2026, 8, 3));
  check('в имени раздел', n.includes('Теги'), n);
  check('в имени дата', n.includes('03-09-2026'), n);
  check('расширение по цели', n.endsWith('.xlsx') && fileName('Теги', 'csv').endsWith('.csv'));
  check('запрещённые в имени знаки убраны',
    !fileName('Теги/ВДР: важное', 'csv').includes('/'), fileName('Теги/ВДР: важное', 'csv'));
}

console.log('Столбцы');
{
  const all = [{ key: 'a', label: 'Тег' }, { key: 'b', label: 'Марка' }, { key: 'c', label: 'Отдел' }];
  check('порядок берётся у раздела, а не у выбора',
    pickColumns(all, ['c', 'a']).map((c) => c.key).join() === 'a,c');
  check('неизвестный ключ не добавляет столбца', pickColumns(all, ['a', 'нет']).length === 1);
  check('у каждой цели есть название', Object.values(TARGET_LABEL).every((v) => v.length > 1));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки обмена пройдены');
