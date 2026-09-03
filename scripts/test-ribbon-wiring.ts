/**
 * У каждой кнопки на ленте есть обработчик.
 *
 * Проверка написана по жалобе «убрать всё нерабочее из редакторов файлов».
 * Кнопка, которая ничего не делает, — худший вид поломки: человек нажимает,
 * ничего не происходит, и он решает, что сломана программа целиком. А в коде
 * такую кнопку не видно: лента описана списком в src/lib/ribbon*.ts, а
 * обработчики — свитчем в экране, и они расходятся молча.
 *
 * Проверяем текстом, а не запуском: свитч разбирать честнее по исходнику, чем
 * поднимать движок документа ради одного вопроса «а есть ли case».
 *
 * Запуск: npx tsx scripts/test-ribbon-wiring.ts
 */
import { readFileSync } from 'fs';

const PAIRS: [string, string, string][] = [
  ['Текстовый документ', 'src/lib/ribbonDoc.ts', 'src/screens/TextDocEditor.tsx'],
  ['Таблица', 'src/lib/ribbonSheet.ts', 'src/screens/ConstructorScreen.tsx'],
];

let failed = 0;

for (const [name, ribbonFile, screenFile] of PAIRS) {
  const ribbon = readFileSync(ribbonFile, 'utf8');
  const screen = readFileSync(screenFile, 'utf8');
  const ids = [...new Set([...ribbon.matchAll(/id:\s*'([a-z]+\.[A-Za-z]+)'/g)].map((m) => m[1]))];

  console.log(`${name}: органов на ленте — ${ids.length}`);
  if (!ids.length) { failed++; console.error('  ✗ лента пуста — разбор сломался'); continue; }

  const dead = ids.filter((id) => !screen.includes(`case '${id}'`));
  if (dead.length) {
    failed++;
    console.error(`  ✗ кнопки без обработчика: ${dead.join(', ')}`);
  }

  // Обратная сторона: обработчик есть, а кнопки нет. Это не поломка для
  // человека, но это мёртвый код, который потом принимают за живой
  const handled = [...new Set([...screen.matchAll(/case '([a-z]+\.[A-Za-z]+)'/g)].map((m) => m[1]))]
    .filter((id) => id.startsWith(ids[0].split('.')[0] + '.'));
  const orphan = handled.filter((id) => !ids.includes(id));
  if (orphan.length) {
    failed++;
    console.error(`  ✗ обработчики без кнопки: ${orphan.join(', ')}`);
  }
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе кнопки лент подключены, лишних обработчиков нет');
