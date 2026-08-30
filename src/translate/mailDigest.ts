/**
 * Разбор письма на чужом языке: о чём, что просят, к какому сроку.
 *
 * Перевод письма целиком отвечает на вопрос «что здесь написано». Но человеку,
 * у которого сорок писем в день, нужен другой ответ: «надо ли мне это сейчас и
 * что от меня хотят». Поэтому кроме перевода собирается карточка — короткая,
 * по-русски, с найденными сроками и номерами документов.
 *
 * Для китайского письма карточка — единственный честный итог: подстрочник по
 * словарю читается плохо, а «просят ревизию B к 12 сентября» понятно и по нему.
 *
 * Даты разбираются здесь, а не общим разборщиком времени из строки Ctrl+K: там
 * русские «завтра в 9», здесь — «by 12 September», «no later than 12.09.2026»
 * и «9月12日». Общий разборщик, натянутый на оба случая, стал бы вдвое сложнее
 * и врал бы в обоих.
 */
import type { Lang } from './types';
import { splitSentences } from './segment';

/** Слова, после которых в письме идёт просьба. Порядок не важен, регистр — нет */
const ASK_WORDS: Record<string, RegExp> = {
  en: /\b(please|kindly|request|require[ds]?|could you|would you|we need|awaiting|expect|submit|provide|confirm|advise|revert)\b/i,
  ru: /(прос(им|ьба)|треб(уется|уем)|необходимо|ожидаем|подтвердите|направьте|вышлите|предоставьте|сообщите)/i,
  zh: /(请|需要|要求|尽快|确认|提供|回复)/,
};

/** Слова срока: рядом с ними дата в письме почти всегда и есть срок */
const DUE_WORDS = /\b(by|before|no later than|deadline|due|until)\b|(не позднее|до|срок|крайний срок)|(之前|期限|截止)/i;

const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
const MONTHS_RU = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл',
  'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

export interface FoundDate {
  at: Date;
  /** Как это было написано в письме — показываем рядом, чтобы можно было сверить */
  said: string;
  /** Стоит рядом со словом срока: «by 12 September» */
  due: boolean;
}

function mk(y: number, m: number, d: number, now: Date): Date | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const year = y || now.getFullYear();
  const at = new Date(year, m, d, 12, 0, 0, 0);
  if (at.getMonth() !== m || at.getDate() !== d) return null;
  // Год не назван, а дата уже прошла — значит, речь о следующем годе: письмо
  // про срок в прошлом бессмысленно, а про январь из декабря — обычное дело
  if (!y && at.getTime() < now.getTime() - 30 * 864e5) at.setFullYear(year + 1);
  return at;
}

/** Все даты письма с пометкой, стоит ли рядом слово срока. */
export function findDates(text: string, now = new Date()): FoundDate[] {
  const s = String(text || '');
  const out: FoundDate[] = [];
  const push = (at: Date | null, said: string, index: number) => {
    if (!at) return;
    const around = s.slice(Math.max(0, index - 40), index + said.length + 10);
    out.push({ at, said, due: DUE_WORDS.test(around) });
  };

  // 12.09.2026 · 12/09/26 · 12-09-2026 — день первым, как пишут в России и Европе
  for (const m of s.matchAll(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/g)) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    push(mk(y, Number(m[2]) - 1, Number(m[1]), now), m[0], m.index || 0);
  }
  // 2026-09-12
  for (const m of s.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
    push(mk(Number(m[1]), Number(m[2]) - 1, Number(m[3]), now), m[0], m.index || 0);
  }
  // 12 September 2026 · September 12 · 12 сентября
  const en = MONTHS_EN.join('|');
  for (const m of s.matchAll(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${en})\\.?,?\\s*(\\d{4})?`, 'gi'))) {
    push(mk(Number(m[3] || 0), MONTHS_EN.indexOf(m[2].toLowerCase()), Number(m[1]), now), m[0], m.index || 0);
  }
  // Число не должно быть началом года: в «September 2026» дня нет, и без
  // запрета на следующую цифру разбор находил здесь двадцатое сентября
  for (const m of s.matchAll(new RegExp(`(${en})\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?,?\\s*(\\d{4})?`, 'gi'))) {
    push(mk(Number(m[3] || 0), MONTHS_EN.indexOf(m[1].toLowerCase()), Number(m[2]), now), m[0], m.index || 0);
  }
  for (const m of s.matchAll(/(\d{1,2})\s+([а-яё]{3,})\s*(\d{4})?/gi)) {
    const idx = MONTHS_RU.findIndex((x) => m[2].toLowerCase().startsWith(x));
    if (idx < 0) continue;
    push(mk(Number(m[3] || 0), idx, Number(m[1]), now), m[0], m.index || 0);
  }
  // 2026年9月12日 · 9月12日
  for (const m of s.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g)) {
    push(mk(Number(m[1] || 0), Number(m[2]) - 1, Number(m[3]), now), m[0], m.index || 0);
  }

  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  // Одна и та же дата, написанная дважды, — это одна дата
  const seen = new Set<number>();
  return out.filter((d) => (seen.has(d.at.getTime()) ? false : (seen.add(d.at.getTime()), true)));
}

/** Срок письма: ближайшая дата, рядом с которой стоит слово срока */
export function deadlineOf(text: string, now = new Date()): FoundDate | null {
  const all = findDates(text, now);
  const future = all.filter((d) => d.at.getTime() >= now.getTime() - 864e5);
  return future.find((d) => d.due) || future[0] || null;
}

/** Предложения, в которых что-то просят */
export function asksIn(text: string, lang: Lang): string[] {
  const re = ASK_WORDS[lang] || ASK_WORDS.en;
  const out: string[] = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    for (const sentence of splitSentences(line)) {
      const s = sentence.trim();
      if (s.length < 6 || s.length > 300) continue;
      if (!re.test(s)) continue;
      // Подпись «Best regards» и вежливое «thank you» просьбами не считаем
      if (/^(best|kind)\s+regards|^thank you\b|^с уважением/i.test(s)) continue;
      out.push(s);
      if (out.length >= 5) return out;
    }
  }
  return out;
}

/** Номера документов и ревизии, названные в письме */
export function codesIn(text: string): string[] {
  const s = String(text || '');
  const out = new Set<string>();
  for (const m of s.matchAll(/(?<![0-9A-Za-zА-Яа-яЁё])[0-9A-ZА-Я]{2,}(?:-[0-9A-ZА-Я]{1,6}){2,}(?![0-9A-Za-zА-Яа-яЁё])/g)) {
    out.add(m[0]);
  }
  for (const m of s.matchAll(/\b(?:rev\.?|revision|ревизия|рев\.?)\s*([A-Z0-9]{1,2})\b/gi)) {
    out.add(`рев. ${m[1].toUpperCase()}`);
  }
  return [...out].slice(0, 12);
}

export interface Digest {
  lang: Lang;
  asks: string[];
  deadline: FoundDate | null;
  codes: string[];
  /** Насколько письмо разобрано словарём, 0…1. Для китайского это главное число */
  coverage: number;
}

/**
 * Собрать разбор. Перевод просьб делает вызывающий: движок перевода живёт в
 * хранилище со словарём проекта, а этот модуль обязан оставаться пригодным для
 * запуска в скрипте.
 */
export function digestOf(text: string, lang: Lang, now = new Date()): Digest {
  return {
    lang,
    asks: asksIn(text, lang),
    deadline: deadlineOf(text, now),
    codes: codesIn(text),
    coverage: 0,
  };
}

/** «через 16 дней», «завтра», «срок прошёл 3 дня назад» */
export function dueLabel(at: Date, now = new Date()): string {
  const days = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
    - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 864e5);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days === -1) return 'вчера — срок прошёл';
  if (days < 0) return `срок прошёл ${-days} дн. назад`;
  if (days < 7) return `через ${days} дн.`;
  if (days < 31) return `через ${Math.round(days / 7)} нед.`;
  return `через ${Math.round(days / 30)} мес.`;
}
