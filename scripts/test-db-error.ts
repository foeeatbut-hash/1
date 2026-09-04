/**
 * Отказ базы доходит до человека и до журнала.
 *
 * Проверка написана по случаю, когда в настройках перестали заводиться роли и
 * их доступы. Сломано было три вещи сразу, и каждая по отдельности выглядела
 * невинно:
 *
 *  1. в общей базе колонка прав была на 191 символ (за это отвечает test-ddl);
 *  2. сервер отдавал наружу дамп драйвера вместо предложения по-русски;
 *  3. журнал сбоев обрезал этот дамп по началу — ровно там, где стояла причина.
 *
 * Итог: «роль не создаётся», и ни одного слова о том, почему.
 *
 * Запуск: npx tsx scripts/test-db-error.ts
 */
import { explainDbError } from '../server/dbError';
import { failureText } from '../src/lib/failureText';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

// Настоящий отказ MariaDB на создание роли: так он и выглядел в журнале
const REAL = `
Invalid \`prisma2.role.create()\` invocation in
C:\\Users\\RAUPOV~1.KHK\\AppData\\Local\\Temp\\3IqUTq8H\\resources\\app.asar\\dist\\server.cjs:11352:39

  11349 if (!code) code = "ROLE_" + Date.now().toString(36).toUpperCase();
  11350 const dup = await prisma2.role.findUnique({ where: { code } });
  11351 if (dup) return res.status(400).json({ message: "Роль с таким кодом уже есть." });
→ 11352 const role = await prisma2.role.create(
Data too long for column 'permissions' at row 1`;

console.log('Причина отказа называется по-русски');
{
  const said = explainDbError(REAL, 'Роль');
  check('сказано, что не сохранилось', said.startsWith('Роль не сохранилась'), said);
  check('названо поле, в котором не поместилось', said.includes('permissions'), said);
  check('сказано, что делать', /перезапустите/i.test(said), said);
  check('дампа драйвера в ответе нет', !said.includes('prisma2') && !said.includes('server.cjs'), said);
  check('исходника программы наружу тоже нет', !said.includes('11352'), said);

  check('нет колонки — база отстала от программы',
    /старее программы/.test(explainDbError("Unknown column 'onlineHidden' in 'field list'")), '');
  check('нет таблицы — тоже',
    /нет нужной таблицы/.test(explainDbError("Table 'flux.PdfMarkup' doesn't exist")), '');
  check('повтор уникального значения назван повтором',
    /уже есть/.test(explainDbError("Duplicate entry 'ENGINEER' for key 'Role_code_key'")), '');
  check('обрыв связи назван обрывом связи',
    /нет связи с общей базой/.test(explainDbError('Cannot execute new commands: connection closed')), '');
  check('обязательное поле названо обязательным',
    /обязательное поле/.test(explainDbError("Column 'name' cannot be null")), '');

  // Незнакомый отказ не должен превращаться в молчание: берём последнюю
  // содержательную строку, она у драйверов и есть причина
  const unknown = explainDbError('Invalid `x.y()` invocation\n\nЧто-то совсем новое');
  check('незнакомый отказ всё равно объяснён', unknown.includes('Что-то совсем новое'), unknown);
  check('пустой отказ не оставляет пустоту', explainDbError('').length > 20, explainDbError(''));
}

console.log('Журнал сохраняет причину, а не только начало дампа');
{
  const line = failureText(JSON.stringify({ message: REAL }));
  check('строка одна, без переносов', !line.includes('\n'), line);
  check('видно, о чём речь', line.includes('role.create'), line);
  check('и видно ПРИЧИНУ — её обрезали раньше всего',
    line.includes("Data too long for column 'permissions'"), line);

  // Короткий отказ не должен обрастать многоточиями
  const short = failureText('{"message":"Роль с таким кодом уже есть."}');
  check('короткий отказ передан целиком', short === 'Роль с таким кодом уже есть.', short);
  check('не JSON читается как текст', failureText('  Bad Gateway  ') === 'Bad Gateway', failureText('Bad Gateway'));
  check('пустое тело — пустая строка', failureText('') === '', failureText(''));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nОтказ базы доходит до человека: все проверки пройдены');
