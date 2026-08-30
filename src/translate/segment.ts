/**
 * Деление текста на сегменты и ключ, по которому сегмент ищется в памяти.
 *
 * Сегмент — единица всего: он переводится, он кладётся в память, он показывается
 * в сверке строкой. Слишком крупный сегмент (абзац) почти никогда не совпадёт с
 * прошлым переводом; слишком мелкий (слово) теряет смысл и порядок слов. Поэтому
 * режем по предложениям, а границы абзацев и переводы строк сохраняем: документ
 * должен собраться обратно ровно таким, каким был.
 *
 * Ключ памяти нормализован: «Расход воздуха» и «расход  воздуха.» — один и тот
 * же сегмент, иначе память будет полна почти-дублей и ни один не найдётся.
 */

/** Сокращения, после точки которых предложение не кончается */
const ABBR = new Set([
  'т', 'е', 'п', 'пп', 'рис', 'табл', 'см', 'стр', 'гл', 'разд', 'изм', 'рев',
  'шт', 'экз', 'ул', 'д', 'корп', 'г', 'гг', 'руб', 'коп', 'мин', 'макс',
  'no', 'nos', 'fig', 'figs', 'tab', 'ref', 'rev', 'doc', 'dwg', 'approx',
  'mr', 'mrs', 'ms', 'dr', 'inc', 'ltd', 'co', 'vs', 'etc', 'eg', 'ie',
]);

/**
 * Разбить строку на предложения.
 *
 * Точка кончает предложение, только если за ней пробел и дальше начинается
 * что-то новое — заглавная буква, цифра или иероглиф. Внутри «12.5», «п. 5.2» и
 * «Fig. 3» точка ничего не кончает, и это самая частая порча разбиения: без
 * проверки ведомость разваливается на обрывки, и память не совпадает никогда.
 */
export function splitSentences(line: string): string[] {
  const s = String(line || '');
  if (!s.trim()) return s ? [s] : [];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…' && ch !== '。') continue;
    // Многоточие и «?!» — идём до конца группы
    let end = i;
    while (end + 1 < s.length && '.!?…。'.includes(s[end + 1])) end++;
    const after = s.slice(end + 1);
    const next = after.match(/^\s+(\S)/);
    if (!next && s[end + 1] !== undefined && ch !== '。') { i = end; continue; }
    // Число до точки и число после — это «12.5» или «5.2.1», не конец мысли
    if (ch === '.' && /\d$/.test(s.slice(0, i)) && /^\.?\d/.test(after)) { i = end; continue; }
    if (ch === '.') {
      const word = (s.slice(0, i).match(/([A-Za-zА-Яа-яЁё]+)$/) || [])[1];
      if (word && ABBR.has(word.toLowerCase())) { i = end; continue; }
    }
    const head = next ? next[1] : '';
    if (head && !/[A-ZА-ЯЁ0-9«"'(㐀-䶿一-鿿]/.test(head)) { i = end; continue; }
    out.push(s.slice(start, end + 1));
    start = end + 1;
    i = end;
  }
  if (start < s.length) out.push(s.slice(start));
  return out.filter((x) => x !== '');
}

/**
 * Текст → сегменты. Переводы строк остаются отдельными сегментами: так письмо
 * и документ собираются обратно без потери абзацев и пустых строк.
 */
export function splitSegments(text: string): string[] {
  const src = String(text || '');
  if (!src) return [];
  const out: string[] = [];
  const parts = src.split(/(\r?\n)/);
  for (const part of parts) {
    if (part === '') continue;
    if (/^\r?\n$/.test(part)) { out.push(part); continue; }
    for (const s of splitSentences(part)) out.push(s);
  }
  return out;
}

/** Сегмент, который переводить не нужно: перевод строки, пробелы, пусто */
export function isBlank(seg: string): boolean {
  return !String(seg || '').trim();
}

/**
 * Ключ памяти: регистр, ё, кавычки, тире, повторные пробелы и хвостовая
 * пунктуация не должны делать из одной строки две.
 */
export function normKey(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»""„‟]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—―]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .trim();
}

/** Слова сегмента для нечёткого сравнения */
function words(text: string): string[] {
  return normKey(text).split(/[^0-9a-zа-я㐀-䶿一-鿿]+/i).filter(Boolean);
}

/**
 * Расстояние правки — сколько знаков надо изменить, чтобы получить одно из
 * другого. Строки здесь короткие (предложение, ячейка), поэтому обычная
 * таблица без ухищрений; длинные обрезаются, чтобы одна огромная ячейка не
 * подвесила сверку документа.
 */
function editDistance(a: string, b: string): number {
  const s = a.slice(0, 400); const t = b.slice(0, 400);
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[t.length];
}

/**
 * Похожесть двух сегментов, 0…1.
 *
 * Считается тремя способами сразу, и это не перестраховка. Общие слова говорят,
 * та же ли это мысль. Пары соседних слов ловят порядок: «расход воздуха на
 * притоке» и «на вытяжке» по одним словам почти неотличимы, а перевод у них
 * разный. Знаки ловят мелкую правку — исправленную опечатку, изменённый
 * артикль, — после которой строка по словам совпадает полностью, но человеку
 * всё равно надо взглянуть.
 */
export function similarity(a: string, b: string): number {
  const wa = words(a); const wb = words(b);
  if (!wa.length || !wb.length) return 0;
  const setB = new Map<string, number>();
  for (const w of wb) setB.set(w, (setB.get(w) || 0) + 1);
  let common = 0;
  for (const w of wa) {
    const n = setB.get(w) || 0;
    if (n > 0) { common++; setB.set(w, n - 1); }
  }
  const byWord = (2 * common) / (wa.length + wb.length);
  const ka = normKey(a); const kb = normKey(b);
  const byChar = 1 - editDistance(ka, kb) / Math.max(ka.length, kb.length, 1);
  if (wa.length < 2 || wb.length < 2) return byWord * 0.6 + Math.max(byChar, 0) * 0.4;
  const pairs = (ws: string[]) => ws.slice(1).map((w, i) => `${ws[i]} ${w}`);
  const pa = pairs(wa); const pb = pairs(wb);
  const setP = new Map<string, number>();
  for (const p of pb) setP.set(p, (setP.get(p) || 0) + 1);
  let cp = 0;
  for (const p of pa) {
    const n = setP.get(p) || 0;
    if (n > 0) { cp++; setP.set(p, n - 1); }
  }
  const byPair = (2 * cp) / (pa.length + pb.length);
  return byWord * 0.5 + byPair * 0.25 + Math.max(byChar, 0) * 0.25;
}

/**
 * Отпечаток текста документа: по нему видно, что русский документ изменился
 * после того, как с него сняли английскую версию.
 */
export function fingerprint(segments: string[]): string {
  let h1 = 0x811c9dc5; let h2 = 0x01000193;
  for (const seg of segments) {
    const k = normKey(seg);
    for (let i = 0; i < k.length; i++) {
      h1 = ((h1 ^ k.charCodeAt(i)) * 16777619) >>> 0;
      h2 = ((h2 + k.charCodeAt(i) * (i + 1)) * 31) >>> 0;
    }
    h1 = (h1 ^ 0x5f) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}
