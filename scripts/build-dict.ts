/**
 * Сборка словарного пакета из открытых источников.
 *
 * Написанный руками инженерный словарь покрывает термины, но не прозу: письмо
 * с «shall be confirmed» превращалось в «следует be confirmed». Общую лексику
 * взять неоткуда, кроме открытых данных, — и вот их отбор.
 *
 * Два источника, и оба выбраны по лицензии, а не по размеру:
 *
 *  • Wikidata через open-dict-data/wikidict-ru — пары названий статей
 *    Википедии, CC0 (общественное достояние). Это термины: узлы, материалы,
 *    процессы, стандарты. Многословные пары здесь сильнее любого словаря.
 *
 *  • OpenRussian (Badestrand/russian-dictionary) — существительные, глаголы и
 *    прилагательные с английскими значениями, CC BY-SA 4.0. Это как раз проза:
 *    связки, причастия, обиходные слова.
 *
 * Отбор жёсткий и объяснимый. Энциклопедия полна имён, географии и фильмов —
 * в техническом переводе они не нужны и вредны: одно случайное совпадение
 * названия группы с русским словом портит строку ведомости. Поэтому пары
 * проходят через чистку и частотность: остаётся то, что человек действительно
 * пишет в документах и письмах.
 *
 * Запуск (нужны скачанные файлы, см. --src):
 *   npx tsx scripts/build-dict.ts --src /путь/к/загрузкам
 *
 * Файлы источников (скачиваются вручную, в репозиторий не кладутся):
 *   en-ru_wiki.txt  https://raw.githubusercontent.com/open-dict-data/wikidict-ru/master/data/en-ru_wiki.txt
 *   nouns.csv       https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/nouns.csv
 *   verbs.csv       https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/verbs.csv
 *   adjectives.csv  https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/adjectives.csv
 *   ru_50k.txt      https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_50k.txt
 *   en_50k.txt      https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt
 *
 * Результат: public/dict/ru-en.tsv.gz + public/dict/SOURCES.md
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { gzipSync } from 'zlib';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const argSrc = process.argv.indexOf('--src');
const SRC = argSrc > 0 ? process.argv[argSrc + 1] : join(ROOT, 'dict-src');
const OUT_DIR = join(ROOT, 'public', 'dict');

/** Сколько пар оставляем. Больше — тяжелее сборка, меньше — дырявее перевод */
const LIMIT = 120000;

const read = (name: string): string => {
  const path = join(SRC, name);
  if (!existsSync(path)) {
    console.error(`Нет файла ${path}. Скачайте источники (адреса — в шапке файла) и укажите --src`);
    process.exit(2);
  }
  return readFileSync(path, 'utf8');
};

// ── Частотность: ею решаем, какое из значений выиграет ──────────────────────
function freqMap(text: string): Map<string, number> {
  const out = new Map<string, number>();
  let rank = 0;
  for (const line of text.split('\n')) {
    const word = line.split(' ')[0]?.trim().toLowerCase();
    if (!word) continue;
    rank++;
    if (!out.has(word)) out.set(word, rank);
  }
  return out;
}

const ruFreq = freqMap(read('ru_50k.txt'));
const enFreq = freqMap(read('en_50k.txt'));

/** Ранг фразы — по самому редкому слову: фраза не частотнее своего худшего слова */
function rankOf(phrase: string, freq: Map<string, number>): number {
  const words = phrase.toLowerCase().split(/[^0-9a-zа-яё-]+/i).filter(Boolean);
  if (!words.length) return 1e9;
  let worst = 0;
  for (const w of words) worst = Math.max(worst, freq.get(w) ?? 1e9);
  return worst;
}

interface Pair {
  ru: string;
  en: string;
  /** wd — Викиданные, or — OpenRussian */
  src: 'wd' | 'or';
  rank: number;
}

const pairs: Pair[] = [];

// ── OpenRussian: общая лексика ──────────────────────────────────────────────
//
// Берём первое значение до точки с запятой и первый вариант до запятой: словарь
// даёт значения по убыванию употребимости, а подстрочнику нужно одно слово, а
// не список из пяти.
function firstSense(raw: string): string {
  const head = String(raw || '').split(';')[0] || '';
  const first = head.split(',')[0] || '';
  return first
    .replace(/\([^)]*\)/g, ' ')          // пометки вроде (coll.)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readOpenRussian(file: string): void {
  const text = read(file);
  const lines = text.split('\n');
  const head = (lines[0] || '').split('\t');
  const iBare = head.indexOf('bare');
  const iEn = head.indexOf('translations_en');
  if (iBare < 0 || iEn < 0) { console.error(`${file}: нет колонок bare/translations_en`); process.exit(2); }
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const ru = (cols[iBare] || '').trim().toLowerCase().replace(/'/g, '');
    const en = firstSense(cols[iEn] || '').toLowerCase();
    if (!ru || !en) continue;
    if (!/^[а-яё][а-яё -]*$/.test(ru)) continue;
    if (!/^[a-z][a-z -]*$/.test(en)) continue;
    if (ru.length > 32 || en.length > 32) continue;
    pairs.push({ ru, en, src: 'or', rank: rankOf(ru, ruFreq) });
  }
}

readOpenRussian('nouns.csv');
readOpenRussian('verbs.csv');
readOpenRussian('adjectives.csv');
const fromOr = pairs.length;

// ── Викиданные: термины ─────────────────────────────────────────────────────
//
// Энциклопедия — не словарь: в ней имена, топонимы, фильмы и виды жуков.
// Отсекаем всё, что похоже на имя собственное, и требуем, чтобы английская
// сторона состояла из слов, которые вообще встречаются в живом языке.
const BAD_CHARS = /[()\[\]{}",:;/\\!?0-9]/;

for (const line of read('en-ru_wiki.txt').split('\n')) {
  const [enRaw, ruRaw] = line.split('\t');
  if (!enRaw || !ruRaw) continue;
  const en = enRaw.trim();
  const ru = ruRaw.trim();
  if (BAD_CHARS.test(en) || BAD_CHARS.test(ru)) continue;
  if (en.length > 42 || ru.length > 42) continue;
  const enWords = en.split(' ');
  const ruWords = ru.split(' ');
  // Только многословные: одиночное название статьи — это чаще всего страна,
  // город или имя, а слово общего языка и так придёт из словаря. Составной же
  // термин («heat exchanger», «circuit breaker») взять больше неоткуда
  if (enWords.length < 2 || enWords.length > 3 || ruWords.length > 3) continue;
  if (!/^[A-Za-z][A-Za-z -]*$/.test(en)) continue;
  if (!/^[А-ЯЁ][а-яёА-ЯЁ -]*$/.test(ru)) continue;
  // Заглавная не в начале — имя собственное: «Baltic Sea», «Ново Место»
  if (enWords.slice(1).some((w) => /^[A-Z]/.test(w))) continue;
  if (ruWords.slice(1).some((w) => /^[А-ЯЁ]/.test(w))) continue;
  // Хотя бы одно слово должно встречаться в живом языке. Требовать этого от
  // всех слов нельзя: «heat exchanger» отпал бы из-за «exchanger», а он-то и
  // нужен. Зато отсеиваются латинские названия видов и деревни в Бельгии
  const enParts = en.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
  if (!enParts.some((w) => enFreq.has(w))) continue;
  pairs.push({ ru: ru.toLowerCase(), en: en.toLowerCase(), src: 'wd', rank: rankOf(ru.toLowerCase(), ruFreq) });
}

// ── Сведение ────────────────────────────────────────────────────────────────
//
// Один русский ключ — один перевод: подстрочник не место для списка вариантов.
// Побеждает словарь, а не энциклопедия; при равенстве — более частотное слово.
const order = { or: 0, wd: 1 };
pairs.sort((a, b) => (order[a.src] - order[b.src]) || (a.rank - b.rank));

const byRu = new Map<string, Pair>();
for (const p of pairs) if (!byRu.has(p.ru)) byRu.set(p.ru, p);

/**
 * Порядок строк в файле — это порядок старшинства, а не алфавит.
 *
 * Программа читает пакет сверху вниз и оставляет первое занявшее ключ значение
 * — и с русской стороны, и с английской. Если пять русских слов переводятся
 * одним английским, при чтении письма выиграет то, что стоит выше, то есть
 * самое частотное. Алфавит здесь дал бы случайного победителя.
 */
const kept = [...byRu.values()]
  .sort((a, b) => a.rank - b.rank)
  .slice(0, LIMIT);

const lines = kept.map((p) => `${p.ru}\t${p.en}\t${p.src}`);
const body = `${lines.join('\n')}\n`;
const packed = gzipSync(Buffer.from(body, 'utf8'), { level: 9 });

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'ru-en.tsv.gz'), packed);

const orKept = kept.filter((p) => p.src === 'or').length;
const wdKept = kept.length - orKept;

writeFileSync(join(OUT_DIR, 'SOURCES.md'), `# Словарный пакет: откуда взяты слова

Файл \`ru-en.tsv.gz\` собран скриптом \`scripts/build-dict.ts\` из открытых
данных. Программа кладёт его ниже своего инженерного словаря и словаря
проекта: он добирает общую лексику, а не переопределяет термины.

В пакете пар: **${kept.length}** (из словаря — ${orKept}, из Викиданных — ${wdKept}).

## Источники и лицензии

| Источник | Что взято | Лицензия |
| --- | --- | --- |
| [Wikidata / open-dict-data/wikidict-ru](https://github.com/open-dict-data/wikidict-ru) | пары названий статей Википедии: термины, узлы, материалы | CC0 1.0 (общественное достояние) |
| [OpenRussian / Badestrand/russian-dictionary](https://github.com/Badestrand/russian-dictionary) | существительные, глаголы, прилагательные с английскими значениями | CC BY-SA 4.0 |
| [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) | частотность слов — только при сборке, в пакет не попадает | CC BY-SA 4.0 |

**Про CC BY-SA.** Данные OpenRussian распространяются с указанием авторства и
на тех же условиях. Файл пакета — производная от них, поэтому он остаётся под
CC BY-SA 4.0, и эта страница едет вместе с ним. На саму программу лицензия
данных не распространяется: пакет лежит отдельным файлом и заменяем.

## Как пересобрать

\`\`\`
npx tsx scripts/build-dict.ts --src <папка со скачанными файлами>
\`\`\`

Адреса файлов-источников перечислены в шапке скрипта.
`);

console.log(`Из словаря OpenRussian: ${fromOr}`);
console.log(`Всего пар после чистки: ${pairs.length}`);
console.log(`В пакете: ${kept.length} (словарь ${orKept}, Викиданные ${wdKept})`);
console.log(`Размер: ${(body.length / 1048576).toFixed(2)} МБ, сжато ${(packed.length / 1048576).toFixed(2)} МБ`);
