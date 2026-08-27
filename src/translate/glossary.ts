/**
 * Глоссарий: поиск термина в строке.
 *
 * Два правила, из-за нарушения которых машинный подстрочник обычно и выглядит
 * машинным.
 *
 * Первое: побеждает самое длинное совпадение. «Расход воздуха» — это `air flow
 * rate`, а не `expense` + `of air`. Поэтому индекс знает, из скольких слов
 * состоит самый длинный термин, и с этой длины начинает.
 *
 * Второе: слово в тексте стоит в падеже, а в словаре — в именительном.
 * «Расхода воздуха» без огрубления окончаний не найдётся вовсе. Полноценной
 * морфологии здесь нет и не нужно: отрезание окончания даёт ключ, которого
 * хватает для поиска, а показывается человеку всё равно исходное слово рядом с
 * переводом.
 */
import type { Lang, TermPair } from './types';
import { normKey } from './segment';
import { isSlot } from './protect';

export interface Tok {
  /** Кусок текста как есть */
  t: string;
  /** Слово (его можно переводить) или разделитель */
  w: boolean;
}

const WORD_RE = /[0-9A-Za-zА-Яа-яЁё]+/g;

/**
 * Ключ фразы: знаки внутри термина не должны мешать поиску. `м3/ч` в тексте
 * разбирается на слова «м3» и «ч», а в словаре записано слитно — без общего
 * приведения единица так и осталась бы непереведённой.
 */
function phraseKey(text: string): string {
  return normKey(text).replace(/[^0-9a-zа-я㐀-䶿一-鿿]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Разбить строку на слова и разделители, ничего не потеряв. */
export function tokenize(text: string): Tok[] {
  const s = String(text || '');
  const out: Tok[] = [];
  let last = 0;
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), w: false });
    out.push({ t: m[0], w: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last), w: false });
  return out;
}

/** Русские окончания по убыванию длины: длинное отрезается первым */
const RU_END = [
  'ыми', 'ими', 'ому', 'ему', 'ого', 'его', 'ами', 'ями', 'ах', 'ях', 'ам', 'ям',
  // Винительный падеж прилагательного — «вентиляционную установку». Без него
  // самый частый случай их документов, «опросный лист на …», не находился
  'ую', 'юю',
  'ой', 'ей', 'ый', 'ий', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ом', 'ем', 'ов', 'ев',
  'ть', 'ся', 'а', 'я', 'ы', 'и', 'е', 'о', 'у', 'ю', 'ь',
];

/** Огрубление русского слова до основы — только для поиска в словаре */
export function stemRu(word: string): string {
  const w = word.toLowerCase().replace(/ё/g, 'е');
  if (w.length < 5) return w;
  for (const end of RU_END) {
    if (w.length - end.length >= 4 && w.endsWith(end)) return w.slice(0, -end.length);
  }
  return w;
}

/** То же для английского: множественное число и причастия */
export function stemEn(word: string): string {
  const w = word.toLowerCase();
  if (w.length < 5) return w;
  for (const end of ['ies', 'ing', 'ed', 'es', 's']) {
    if (w.length - end.length >= 3 && w.endsWith(end)) {
      return end === 'ies' ? `${w.slice(0, -3)}y` : w.slice(0, -end.length);
    }
  }
  return w;
}

export function stemOf(word: string, lang: Lang): string {
  return lang === 'ru' ? stemRu(word) : lang === 'en' ? stemEn(word) : word.toLowerCase();
}

export interface TermIndex {
  from: Lang;
  to: Lang;
  /** Точный ключ фразы → перевод */
  exact: Map<string, string>;
  /** Огрублённый ключ → перевод; заполняется, только если точного нет */
  loose: Map<string, string>;
  maxWords: number;
  size: number;
}

const EMPTY: TermIndex = { from: 'und', to: 'und', exact: new Map(), loose: new Map(), maxWords: 0, size: 0 };

function sideOf(p: TermPair, lang: Lang): string {
  return lang === 'ru' ? p.ru : lang === 'en' ? p.en : (p.zh || '');
}

/**
 * Построить индекс. Пары идут по убыванию важности: первая занявшая ключ
 * побеждает, поэтому словарь проекта, поданный первым, перебивает встроенный.
 */
export function buildIndex(pairs: TermPair[], from: Lang, to: Lang): TermIndex {
  const idx: TermIndex = { from, to, exact: new Map(), loose: new Map(), maxWords: 1, size: 0 };
  for (const p of pairs) {
    const src = sideOf(p, from);
    const dst = sideOf(p, to);
    if (!src || !dst) continue;
    const key = phraseKey(src);
    if (!key) continue;
    if (!idx.exact.has(key)) { idx.exact.set(key, dst); idx.size++; }
    const words = key.split(' ');
    if (words.length > idx.maxWords) idx.maxWords = words.length;
    const loose = words.map((w) => stemOf(w, from)).join(' ');
    if (loose !== key && !idx.loose.has(loose)) idx.loose.set(loose, dst);
  }
  return idx;
}

/** Склеить несколько индексов в один: первый важнее последнего. */
export function mergeIndexes(list: TermIndex[]): TermIndex {
  const first = list.find((x) => x.size > 0);
  if (!first) return EMPTY;
  const out: TermIndex = {
    from: first.from, to: first.to, exact: new Map(), loose: new Map(), maxWords: 1, size: 0,
  };
  for (const idx of list) {
    for (const [k, v] of idx.exact) if (!out.exact.has(k)) { out.exact.set(k, v); out.size++; }
    for (const [k, v] of idx.loose) if (!out.loose.has(k)) out.loose.set(k, v);
    if (idx.maxWords > out.maxWords) out.maxWords = idx.maxWords;
  }
  return out;
}

export interface TermHit {
  /** Перевод как он записан в словаре */
  dst: string;
  /** Сколько токенов занято совпадением, считая разделители внутри фразы */
  span: number;
  /** Найдено точно или через огрубление окончаний */
  loose: boolean;
}

/**
 * Найти самый длинный термин, начинающийся с токена i.
 *
 * Внутри фразы допускаются только пробелы и дефисы: «расход, воздуха» — это две
 * разные мысли, и склеивать их через запятую значит переводить то, чего в
 * тексте нет.
 */
export function lookupAt(idx: TermIndex, toks: Tok[], i: number): TermHit | null {
  if (!toks[i]?.w || isSlot(toks[i].t)) return null;
  const words: string[] = [];
  let best: TermHit | null = null;
  for (let j = i, n = 0; j < toks.length && n < idx.maxWords; j++) {
    const tok = toks[j];
    if (tok.w) {
      if (isSlot(tok.t)) break;
      words.push(tok.t);
      n++;
      const key = phraseKey(words.join(' '));
      const exact = idx.exact.get(key);
      if (exact) best = { dst: exact, span: j - i + 1, loose: false };
      else if (!best || best.span < j - i + 1) {
        const loose = idx.loose.get(key.split(' ').map((w) => stemOf(w, idx.from)).join(' '));
        if (loose) best = { dst: loose, span: j - i + 1, loose: true };
      }
    } else if (!/^[  \-/]+$/.test(tok.t)) {
      // Внутри термина допустимы пробел, дефис и косая черта («м3/ч»).
      // Запятая и точка — уже другая мысль, склеивать их нельзя.
      break;
    }
  }
  return best;
}

/**
 * Перенести регистр исходного слова на перевод: «РАСХОД» → «AIR FLOW RATE»,
 * «Расход» → «Air flow rate». Иначе шапка таблицы, набранная прописными,
 * после перевода превращается в строчную кашу.
 */
export function applyCase(src: string, dst: string): string {
  if (!dst) return dst;
  const letters = src.replace(/[^A-Za-zА-Яа-яЁё]/g, '');
  if (letters.length > 1 && letters === letters.toUpperCase()) return dst.toUpperCase();
  if (/^[A-ZА-ЯЁ]/.test(src)) return dst.charAt(0).toUpperCase() + dst.slice(1);
  return dst;
}
