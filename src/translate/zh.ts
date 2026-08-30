/**
 * Китайский: разрезать и подписать.
 *
 * В китайском письме нет пробелов между словами, поэтому сначала текст режется
 * по самому длинному совпадению со словарём: 空调机组 — это «вентиляционная
 * установка» целиком, а не «воздух» + «регулировать» + «машина» + «группа».
 * Незнакомые знаки остаются как есть — подменять их выдумкой хуже, чем
 * оставить: человек хотя бы видит, где программа не поняла.
 *
 * Итог честно называется подстрочником. Смысл письма он передаёт, гладкой
 * русской фразой не становится и не притворяется ею.
 */
import { CHINESE } from './dict/chinese';

const MAP = new Map<string, string>();
let MAX_LEN = 1;
for (const p of CHINESE) {
  const zh = (p.zh || '').trim();
  if (!zh || !p.ru) continue;
  if (!MAP.has(zh)) MAP.set(zh, p.ru);
  if (zh.length > MAX_LEN) MAX_LEN = zh.length;
}

const HAN = /[㐀-䶿一-鿿]/;

/**
 * Знаки, которым в русской фразе нет соответствия: показатель определения 的,
 * частицы завершённости и вежливости. По-русски они не значат ничего, и
 * оставлять их иероглифами значит делать вид, что программа их не поняла.
 */
const DROP = new Set(['的', '了', '着', '呢', '吧', '啊', '吗', '地', '得']);

/**
 * Китайские знаки препинания — на привычные. Полноширинная запятая посреди
 * русской фразы выглядит опечаткой, а не цитатой.
 */
const PUNCT: Record<string, string> = {
  '，': ',', '。': '.', '、': ',', '：': ':', '；': ';', '！': '!', '？': '?',
  '（': '(', '）': ')', '「': '«', '」': '»', '《': '«', '》': '»',
};

/**
 * Дата по-китайски — это иероглифы «год», «месяц», «день» между числами.
 * Разобрать её пословно значит получить «2026 год 9 месяц 12 день»: понять
 * можно, но читать нельзя. Переводим её датой до всякого разбора.
 */
function foldDates(text: string): string {
  return String(text || '')
    .replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g,
      (_, y, m, d) => `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`)
    .replace(/(\d{1,2})月(\d{1,2})日/g,
      (_, m, d) => `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`);
}

export interface ZhGloss {
  /** Подстрочник по-русски */
  text: string;
  /** Сколько иероглифов удалось назвать и сколько всего */
  known: number;
  total: number;
}

/** Разрезать китайский текст на известные слова и незнакомые куски. */
export function splitZh(text: string): { word: string; ru: string }[] {
  const s = foldDates(String(text || '')).replace(/[，。、：；！？（）「」《》]/g, (ch) => PUNCT[ch] || ch);
  const out: { word: string; ru: string }[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (!HAN.test(ch)) {
      // Латиница, цифры, знаки — переносим как есть, склеивая подряд идущие
      let j = i;
      while (j < s.length && !HAN.test(s[j])) j++;
      out.push({ word: s.slice(i, j), ru: s.slice(i, j) });
      i = j;
      continue;
    }
    let hit = '';
    for (let len = Math.min(MAX_LEN, s.length - i); len >= 1; len--) {
      const part = s.slice(i, i + len);
      if (MAP.has(part)) { hit = part; break; }
    }
    if (hit) { out.push({ word: hit, ru: MAP.get(hit) || '' }); i += hit.length; }
    else { out.push({ word: ch, ru: '' }); i++; }
  }
  return out;
}

/**
 * Подстрочник целиком. Незнакомый иероглиф остаётся иероглифом — так видно,
 * какая часть письма не разобрана, и можно спросить у отправителя.
 */
export function glossZh(text: string): ZhGloss {
  const parts = splitZh(text);
  let known = 0; let total = 0;
  const words: string[] = [];
  for (const p of parts) {
    if (HAN.test(p.word)) {
      total += p.word.length;
      if (DROP.has(p.word)) { known += p.word.length; continue; }
      if (p.ru) { known += p.word.length; words.push(p.ru); }
      else words.push(p.word);
    } else if (p.word.trim()) {
      words.push(p.word.trim());
    }
  }
  return { text: words.join(' ').replace(/\s+([,.;:!?])/g, '$1').trim(), known, total };
}

/** Насколько разобран текст, 0…1. Ниже половины — честно говорим «мало». */
export function zhCoverage(text: string): number {
  const g = glossZh(text);
  return g.total ? g.known / g.total : 0;
}

export function zhWordCount(): number {
  return MAP.size;
}
