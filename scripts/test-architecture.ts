/**
 * Проверка границ между частями программы.
 *
 * То же, что в React-проектах делают правилом ESLint `import/no-restricted-paths`
 * (подход bulletproof-react), только без нового инструмента: у Flux нет ESLint,
 * зато есть привычка проверять всё скриптами в scripts/test-*.ts. Смысл правил
 * один — зависимости текут в одну сторону, слои не путаются, а разрастание
 * файлов не проходит незамеченным.
 *
 * Запуск: npx tsx scripts/test-architecture.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

let f = 0;
const ok = (n: string, c: boolean, d?: any) =>
  c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? JSON.stringify(d) : ''));

const ROOT = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const rel = `${dir}/${e}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e)) out.push(rel);
  }
  return out;
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Пути импорта из файла: и статические, и динамические */
function importsOf(rel: string): string[] {
  const src = read(rel);
  const out: string[] = [];
  const re = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

const SRC = walk('src');
const ELECTRON = walk('electron');

console.log('1. Разделы рабочего стола независимы друг от друга');
// Раздел — экран, зарегистрированный в SECTIONS. Файлы screens/, которых там
// нет (TitlePanel, VdrPanel и т.п.) — по сути общие компоненты, им можно.
const sectionsSrc = read('src/workspace/sections.tsx');
const sectionNames = new Set(
  [...sectionsSrc.matchAll(/import\(['"]\.\.\/screens\/([A-Za-z0-9_]+)['"]\)/g)].map((m) => m[1]),
);
ok('реестр разделов прочитан', sectionNames.size >= 10, sectionNames.size);
for (const file of SRC.filter((p) => p.startsWith('src/screens/'))) {
  const self = file.replace(/^src\/screens\//, '').replace(/\.tsx?$/, '');
  for (const imp of importsOf(file)) {
    const target = imp.match(/^\.\/([A-Za-z0-9_]+)$|^\.\.\/screens\/([A-Za-z0-9_]+)$/);
    const name = target?.[1] || target?.[2];
    if (name && sectionNames.has(name)) {
      ok(`${self} не тянет раздел ${name}`, false, imp);
    }
  }
}
ok('ни один раздел не импортирован другим экраном', f === 0);

console.log('2. Хранилища не зависят от интерфейса');
for (const file of SRC.filter((p) => p.startsWith('src/store/'))) {
  const bad = importsOf(file).filter((i) => /(^|\/)(screens|components)\//.test(i));
  ok(`${file.replace('src/store/', '')} без экранов и компонентов`, bad.length === 0, bad);
}

console.log('3. Логические модули не зависят от React и состояния');
// capture / import / assistant разбирают текст и данные. Их держим пригодными
// для запуска в скрипте и в тесте — без React, без хранилищ, без сети.
for (const dir of ['src/capture', 'src/import', 'src/assistant']) {
  for (const file of SRC.filter((p) => p.startsWith(dir + '/') && !p.endsWith('.tsx'))) {
    const bad = importsOf(file).filter((i) => /(^|\/)(screens|components|store)\//.test(i) || i === 'react');
    ok(`${relative(dir, file)} чист`, bad.length === 0, bad);
  }
}

console.log('4. Клиент и сервер не смешиваются');
const clientToServer = SRC.filter((p) => importsOf(p).some((i) => /(^|\/)server(\/|\.ts|$)/.test(i)));
ok('ни один файл src/ не импортирует серверный код', clientToServer.length === 0, clientToServer);
const electronToSrc = ELECTRON.filter((p) => importsOf(p).some((i) => i.includes('../src/')));
ok('главный процесс Electron не импортирует src/', electronToSrc.length === 0, electronToSrc);

console.log('5. Программа остаётся офлайн: никаких внешних ИИ-сервисов');
// Требование заказчика: программа работает на сервере компании, «ИИ» в ней
// программный — алгоритмы и локальная база знаний, а не вызовы чужого API.
// Инженер должен иметь возможность проверить любой вывод программы глазами.
const AI_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.deepseek.com',
  'api.cohere.ai',
  'openrouter.ai',
  'huggingface.co/api',
];
const offenders: string[] = [];
for (const file of [...SRC, ...ELECTRON, 'server.ts', ...walk('server')]) {
  const src = read(file);
  for (const host of AI_HOSTS) if (src.includes(host)) offenders.push(`${file} → ${host}`);
}
ok('нет обращений к внешним языковым моделям', offenders.length === 0, offenders);

console.log('6. Размер файлов не растёт (храповик)');
// Крупные файлы достались из истории проекта. Правило простое: новый файл не
// должен рождаться большим, а старый — расти. Уменьшать записанные числа после
// выноса кода в отдельные модули не только можно, но и нужно.
const BUDGET = 1200;
const LEGACY: Record<string, number> = {
  'src/screens/Registry.tsx': 6071,
  'server.ts': 4225,
  'src/screens/Explorer.tsx': 2560,
  'src/screens/DictionaryEditor.tsx': 2279,
  'src/screens/ChatManagement.tsx': 2029,
  'src/screens/ConstructorScreen.tsx': 1909,
  'src/screens/SettingsScreen.tsx': 1620,
  'src/store/assistantStore.ts': 1238,
};
const SLACK = 50; // мелкие правки в старых файлах не должны ронять проверку
const all = [...SRC, ...ELECTRON, ...walk('server'), ...walk('scripts'), 'server.ts'];
for (const file of all) {
  const lines = read(file).replace(/\n$/, '').split('\n').length;
  const cap = LEGACY[file];
  if (cap !== undefined) {
    ok(`${file} не растёт (${lines} ≤ ${cap + SLACK})`, lines <= cap + SLACK, lines);
  } else {
    ok(`${file} в пределах ${BUDGET} строк`, lines <= BUDGET, lines);
  }
}
const gone = Object.keys(LEGACY).filter((p) => !all.includes(p));
ok('в списке крупных файлов нет исчезнувших путей', gone.length === 0, gone);

console.log(f === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${f}`);
process.exit(f === 0 ? 0 : 1);
