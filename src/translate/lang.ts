/**
 * Какой это язык.
 *
 * Определяем по письменности, а не по словам: у русского и китайского свои
 * буквы, и этого достаточно. Со словарями частотных слов пришлось бы тянуть
 * данные ради задачи, которую решает подсчёт знаков.
 *
 * Тонкость, из-за которой нельзя просто «есть кириллица → русский»: в русском
 * техническом письме полно латиницы (марки, DN, IP, названия фирм), а в
 * английском письме от китайского поставщика попадаются иероглифы в подписи.
 * Поэтому решают доли, а не наличие.
 */
import type { Lang } from './types';
import { nothingToTranslate } from './protect';

const CYR = /[Ѐ-ӿ]/;
const LAT = /[A-Za-z]/;
// Иероглифы: основной блок + расширение A + японская кана (её тоже увидим как
// «не наш язык», и лучше честно сказать «не разобрали», чем звать китайским)
const CJK = /[㐀-䶿一-鿿]/;
const KANA = /[぀-ヿ]/;

export interface LangCount {
  cyr: number;
  lat: number;
  cjk: number;
  kana: number;
}

export function countScripts(text: string): LangCount {
  const c: LangCount = { cyr: 0, lat: 0, cjk: 0, kana: 0 };
  for (const ch of String(text || '')) {
    if (CYR.test(ch)) c.cyr++;
    else if (LAT.test(ch)) c.lat++;
    else if (CJK.test(ch)) c.cjk++;
    else if (KANA.test(ch)) c.kana++;
  }
  return c;
}

/**
 * Язык текста.
 *
 * Иероглифы решают первыми: даже несколько штук в письме означают, что письмо
 * пришло не на английском, а латиница в нём — это адреса и коды. Дальше
 * сравниваются кириллица и латиница долей, а не «больше-меньше»: строка
 * «Расход 1200 m3/h AHU-01» — русская, хотя латинских букв в ней больше.
 */
export function detectLang(text: string): Lang {
  const c = countScripts(text);
  const letters = c.cyr + c.lat + c.cjk + c.kana;
  if (!letters) return 'und';
  if (c.kana > 0 && c.kana >= c.cjk) return 'und';   // японский — не наш случай
  if (c.cjk / letters > 0.05) return 'zh';
  if (c.cyr === 0) return c.lat ? 'en' : 'und';
  if (c.lat === 0) return 'ru';
  // Кириллица весит больше: латинские вкрапления в русском тексте — норма,
  // русские вкрапления в английском письме почти не встречаются
  return c.cyr * 2 >= c.lat ? 'ru' : 'en';
}

/** Куда переводить, если пришёл текст на этом языке. Китайский — понять. */
export function defaultTarget(from: Lang): Lang {
  return from === 'ru' ? 'en' : 'ru';
}

/**
 * Стоит ли вообще предлагать перевод. Пустая строка, число, код — нет.
 * Отдельно от detectLang: «нечего переводить» и «не понял язык» — разное.
 */
export function worthTranslating(text: string): boolean {
  const s = String(text || '').trim();
  if (s.length < 2) return false;
  const c = countScripts(s);
  if (c.cyr + c.lat + c.cjk < 2) return false;
  // Тег, номер документа и дата состоят из букв, но переводить в них нечего
  return !nothingToTranslate(s);
}
