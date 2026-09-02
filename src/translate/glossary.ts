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

/**
 * То же для английского: множественное число и причастия.
 *
 * Отрезаем по кругу, пока слово меняется, но не больше трёх раз. Один проход
 * даёт разные основы одному слову: «processing» теряет «ing» и становится
 * «process», а «process» теряет «s» и становится «proces» — и в словаре они
 * уже не встречаются. Круг делает огрубление устойчивым: оба приходят к
 * «proces». Три — потому что дальше слова не сокращаются, а рассыпаются.
 */
export function stemEn(word: string): string {
  let w = word.toLowerCase();
  for (let pass = 0; pass < 3; pass++) {
    if (w.length < 5) return w;
    let cut = '';
    for (const end of ['ies', 'ing', 'ed', 'es', 's']) {
      if (w.length - end.length >= 3 && w.endsWith(end)) { cut = end; break; }
    }
    if (!cut) return w;
    w = cut === 'ies' ? `${w.slice(0, -3)}y` : w.slice(0, -cut.length);
    if (cut === 'ies') return w;
  }
  return w;
}

/**
 * Формы неправильных глаголов: форма → начальная форма.
 *
 * Список нужен не для спряжения, а для отбора при сборке словаря: в открытых
 * данных такая форма нередко стоит отдельной статьёй со своим значением, и это
 * значение почти всегда не то. Здесь только формы, отличные от начальной, —
 * «read» и «cut» в списке не нужны.
 */
const EN_IRREGULAR: Record<string, string> = {
  found: 'find', bound: 'bind', ground: 'grind', wound: 'wind',
  left: 'leave', felt: 'feel', fell: 'fall', felled: 'fell',
  meant: 'mean', kept: 'keep', slept: 'sleep', swept: 'sweep', wept: 'weep', crept: 'creep',
  dealt: 'deal', built: 'build', spent: 'spend', sent: 'send', lent: 'lend', bent: 'bend',
  held: 'hold', sold: 'sell', told: 'tell', fed: 'feed', led: 'lead', bled: 'bleed',
  made: 'make', took: 'take', taken: 'take', gave: 'give', given: 'give',
  saw: 'see', seen: 'see', went: 'go', gone: 'go', came: 'come',
  ran: 'run', rang: 'ring', rung: 'ring', sang: 'sing', sung: 'sing',
  drove: 'drive', driven: 'drive', rose: 'rise', risen: 'rise',
  bore: 'bear', borne: 'bear', broke: 'break', broken: 'break',
  chose: 'choose', chosen: 'choose', froze: 'freeze', frozen: 'freeze',
  spoke: 'speak', spoken: 'speak', stole: 'steal', stolen: 'steal',
  wore: 'wear', worn: 'wear', tore: 'tear', torn: 'tear',
  threw: 'throw', thrown: 'throw', grew: 'grow', grown: 'grow',
  blew: 'blow', blown: 'blow', drew: 'draw', drawn: 'draw',
  flew: 'fly', flown: 'fly', knew: 'know', known: 'know',
  wrote: 'write', written: 'write', drank: 'drink', drunk: 'drink',
  began: 'begin', begun: 'begin', swam: 'swim', swum: 'swim',
  lay: 'lie', lain: 'lie', laid: 'lay', paid: 'pay', said: 'say',
  bought: 'buy', brought: 'bring', caught: 'catch', taught: 'teach',
  fought: 'fight', sought: 'seek', thought: 'think', sank: 'sink', sunk: 'sink',
  stuck: 'stick', struck: 'strike', hung: 'hang', dug: 'dig', shot: 'shoot',
  lost: 'lose', met: 'meet', sat: 'sit', stood: 'stand', understood: 'understand',
  wrought: 'work', shone: 'shine', shown: 'show', sewn: 'sew',
};

/**
 * Английское слово — форма неправильного глагола, а не самостоятельное слово.
 *
 * Нужно при сборке словаря: «found» в чужих данных встречается как «основать»,
 * и точное совпадение с ним побеждало бы поиск по основе, где «found» — это
 * «найти». В письме второе вероятнее в разы, поэтому такую пару в точный
 * список не берём, оставляя её только огрублённому поиску.
 */
export function isIrregularForm(word: string): boolean {
  const w = word.toLowerCase();
  const base = EN_IRREGULAR[w];
  return !!base && base !== w;
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
    const single = key.indexOf(' ') < 0;
    if (!(from === 'en' && single && isIrregularForm(key)) && !idx.exact.has(key)) {
      idx.exact.set(key, dst);
      idx.size++;
    }
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
