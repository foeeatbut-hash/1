/**
 * Полка: список работ и файлы репродукций.
 *
 * Главное, что проверяется, — совпадение имён. Файл кладут в папку руками, и
 * опечатка в имени («Mona.JPG», «мона.jpg», «mona lisa.jpg») означает картину,
 * которая лежит на диске и не показывается. Молча: ошибки нет, рамы нет,
 * искать нечего. Здесь такой файл называется поимённо.
 *
 * Запуск: npx tsx scripts/test-art.ts
 */
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { WORKS } from '../src/art/works';
import { PAINTINGS } from '../src/art/paintings';

let bad = 0;
const ok = (name: string, cond: boolean, got?: any) =>
  cond ? console.log('  ✓', name) : (bad++, console.error('  ✗', name, got !== undefined ? JSON.stringify(got) : ''));

const IMAGES = join(__dirname, '..', 'src/art/images');
const ids = new Set(WORKS.map((w) => w.id));

console.log('1. Список работ');
{
  const dupes = WORKS.map((w) => w.id).filter((id, i, a) => a.indexOf(id) !== i);
  ok('идентификаторы не повторяются', dupes.length === 0, dupes);

  const titles = WORKS.map((w) => w.title);
  ok('названия не повторяются', new Set(titles).size === titles.length,
    titles.filter((t, i, a) => a.indexOf(t) !== i));

  const empty = WORKS.filter((w) => !w.title.trim() || !w.artist.trim() || !w.year.trim());
  ok('у всех есть название, автор и год', empty.length === 0, empty.map((w) => w.id));

  // Идентификатор — он же имя файла: пробелы и кириллица в имени файла
  // работают не везде одинаково, а искать причину потом неоткуда
  const odd = WORKS.filter((w) => !/^[a-z][a-z0-9-]*$/.test(w.id));
  ok('идентификаторы годятся в имена файлов', odd.length === 0, odd.map((w) => w.id));

  const stages = ['gallery', 'studio', 'desk'];
  const wrong = WORKS.filter((w) => !stages.includes(w.stage));
  ok('обстановка у всех известная', wrong.length === 0, wrong.map((w) => w.id));
}

console.log('\n2. Нарисованный запас');
{
  // Рисунок работы, которой нет в списке, не показался бы никогда
  const orphans = PAINTINGS.filter((p) => !ids.has(p.id));
  ok('каждый рисунок привязан к работе из списка', orphans.length === 0, orphans.map((p) => p.id));
  ok('рисунков не больше, чем работ', PAINTINGS.length <= WORKS.length, [PAINTINGS.length, WORKS.length]);
}

console.log('\n3. Файлы репродукций');
{
  ok('папка для снимков существует', existsSync(IMAGES), IMAGES);
  const files = existsSync(IMAGES)
    ? readdirSync(IMAGES).filter((f) => f !== 'README.md' && !f.startsWith('.'))
    : [];

  const known = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];
  const wrongExt = files.filter((f) => !known.some((e) => f.toLowerCase().endsWith(e)));
  ok('лишних файлов в папке нет', wrongExt.length === 0, wrongExt);

  const nameOf = (f: string) => f.slice(0, f.lastIndexOf('.'));
  const named = files.filter((f) => !wrongExt.includes(f)).map(nameOf);

  // Ровно то, ради чего этот набор и написан
  const unknown = named.filter((n) => !ids.has(n));
  ok('имя каждого файла совпадает с работой из списка', unknown.length === 0, unknown);

  const caseWrong = named.filter((n) => n !== n.toLowerCase());
  ok('имена файлов в нижнем регистре', caseWrong.length === 0, caseWrong);

  const twice = named.filter((n, i, a) => a.indexOf(n) !== i);
  ok('одна работа — один файл', twice.length === 0, twice);

  console.log(`     репродукций в папке: ${named.length} из ${WORKS.length}`);
  const drawn = new Set(PAINTINGS.map((p) => p.id));
  const shown = WORKS.filter((w) => named.includes(w.id) || drawn.has(w.id));
  console.log(`     всего покажется на полке: ${shown.length}`);
  ok('полка не окажется пустой', shown.length > 0, shown.length);
}

console.log(bad === 0 ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
