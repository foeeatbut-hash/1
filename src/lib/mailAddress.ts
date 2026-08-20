/**
 * Разбор почтовых адресов и подписей к ним.
 *
 * Чистый модуль: только данные внутрь, только данные наружу. Поэтому он и
 * покрыт проверками — на живой почте такое ловить дорого и поздно.
 */

export interface Addr {
  /** Имя, если отправитель его указал */
  name: string;
  /** Собственно адрес, всегда в нижнем регистре */
  addr: string;
}

/**
 * Разобрать строку заголовка вида
 *   «Иванов И.И.» <ivanov@example.ru>, petrov@example.ru
 *
 * Запятая внутри кавычек — часть имени, а не разделитель: «Иванов, Иван»
 * встречается в письмах постоянно и наивным split(',') рвётся пополам.
 */
export function parseAddrList(raw: string): Addr[] {
  const src = String(raw || '');
  const parts: string[] = [];
  let buf = '';
  let inQuote = false;
  let inAngle = false;
  for (const ch of src) {
    if (ch === '"') { inQuote = !inQuote; buf += ch; continue; }
    if (ch === '<') inAngle = true;
    if (ch === '>') inAngle = false;
    if ((ch === ',' || ch === ';') && !inQuote && !inAngle) { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  parts.push(buf);

  const out: Addr[] = [];
  for (const p of parts) {
    const one = parseAddr(p);
    if (one.addr || one.name) out.push(one);
  }
  return out;
}

/** Разобрать один адрес. */
export function parseAddr(raw: string): Addr {
  const s = String(raw || '').trim();
  if (!s) return { name: '', addr: '' };

  const angle = s.match(/^(.*)<([^>]*)>\s*$/);
  if (angle) {
    return { name: cleanName(angle[1]), addr: angle[2].trim().toLowerCase() };
  }
  // Голый адрес без имени
  if (s.includes('@')) return { name: '', addr: s.replace(/^["']|["']$/g, '').trim().toLowerCase() };
  return { name: cleanName(s), addr: '' };
}

function cleanName(s: string): string {
  return String(s || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Собрать обратно в строку заголовка. */
export function formatAddrList(list: Addr[]): string {
  return (list || [])
    .map((a) => {
      if (!a.addr) return a.name;
      if (!a.name) return a.addr;
      // Имя с запятой или точкой обязано быть в кавычках, иначе заголовок
      // разъедется у получателя
      const needsQuotes = /[,;<>@"]/.test(a.name);
      return `${needsQuotes ? `"${a.name.replace(/"/g, '')}"` : a.name} <${a.addr}>`;
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Как показать отправителя в списке: имя, если оно есть, иначе часть адреса
 * до собаки. Полный адрес в узкой колонке не читается всё равно.
 */
export function displayName(a: Addr | { name?: string; addr?: string }): string {
  const name = cleanName(a?.name || '');
  if (name) return name;
  const addr = String(a?.addr || '');
  const at = addr.indexOf('@');
  return at > 0 ? addr.slice(0, at) : addr;
}

/**
 * Кружок с буквами вместо картинки. Две буквы для «Иван Петров», одна для
 * односложного имени. Пустая строка даёт «?» — не пустой кружок.
 */
export function initialsOf(a: Addr | { name?: string; addr?: string }): string {
  const shown = displayName(a).trim();
  if (!shown) return '?';
  const words = shown.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return shown.slice(0, 2).toUpperCase();
}

/**
 * Цвет кружка. Не случайный: один и тот же отправитель обязан быть одного
 * цвета всегда, иначе список «мигает» при каждой перерисовке. Палитра — из
 * системы оформления, чужих оттенков здесь нет.
 */
const AVATAR_TONES = ['emerald', 'sky', 'amber', 'rose', 'slate'] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

export function toneOf(a: Addr | { name?: string; addr?: string }): AvatarTone {
  const key = String(a?.addr || a?.name || '');
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[sum % AVATAR_TONES.length];
}

/** Есть ли адрес в списке — для «письмо адресовано лично мне». */
export function listHas(raw: string, addr: string): boolean {
  const needle = String(addr || '').toLowerCase();
  if (!needle) return false;
  return parseAddrList(raw).some((a) => a.addr === needle);
}
