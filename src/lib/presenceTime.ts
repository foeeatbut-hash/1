/**
 * Кто считается «в сети» — по одной отметке времени.
 *
 * Присутствие перестало быть памятью одного сервера. Причина простая и
 * обнаружилась у заказчика: в отделе база одна на всех, а сервер у каждого
 * свой, встроенный в его же программу. Пока присутствие жило в памяти сервера,
 * каждый сотрудник сидел в своей комнате один — и все остальные были для него
 * «не в сети», сколько бы их ни работало рядом.
 *
 * Теперь каждый сервер отмечает своих людей в общей базе, а «в сети» — это
 * свежая отметка. Здесь правила этой свежести: сколько ждать, кого считать
 * ушедшим и что показать, если отметки нет вовсе.
 *
 * Без React, без сети и без базы — числа здесь важнее кода, и ошибиться в них
 * легко: слишком короткий срок гасит человека между двумя ударами сердца,
 * слишком длинный показывает зелёную точку у того, кто ушёл домой.
 */

/** Как часто программа отмечается, что человек ещё здесь */
export const BEAT_MS = 15_000;

/**
 * Сколько отметка считается свежей.
 *
 * Втрое больше удара сердца, а не вдвое: один пропущенный удар — обычное дело
 * при заснувшем на минуту ноутбуке или моргнувшей сети, и гасить из-за него
 * человека нельзя. Два пропущенных подряд — уже настоящий уход.
 */
export const FRESH_MS = BEAT_MS * 3;

/** Свежая ли отметка: он ещё здесь */
export function isFresh(at: number | string | Date | null | undefined, now = Date.now(), ttl = FRESH_MS): boolean {
  if (at === null || at === undefined) return false;
  const t = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(String(at));
  if (!Number.isFinite(t)) return false;
  // Отметка из будущего — часы на чужой машине спешат. Считаем свежей: гасить
  // человека из-за расхождения часов хуже, чем показать его лишнюю минуту
  if (t > now) return true;
  return now - t < ttl;
}

export interface PresenceRow { userId: string; at: number | string | Date }

/**
 * Из отметок базы — список тех, кто в сети, и когда видели остальных.
 *
 * Оба списка нужны сразу: «в сети» отвечает, дойдёт ли сообщение сейчас, а
 * «был(а) N назад» — стоит ли ждать ответа сегодня.
 */
export function rosterOf(rows: PresenceRow[], now = Date.now(), ttl = FRESH_MS): {
  online: string[]; lastSeen: Record<string, number>;
} {
  const online: string[] = [];
  const lastSeen: Record<string, number> = {};
  for (const r of rows || []) {
    const id = String(r?.userId || '');
    if (!id) continue;
    const t = r.at instanceof Date ? r.at.getTime()
      : typeof r.at === 'number' ? r.at : Date.parse(String(r.at));
    if (!Number.isFinite(t)) continue;
    lastSeen[id] = t;
    if (isFresh(t, now, ttl) && !online.includes(id)) online.push(id);
  }
  return { online, lastSeen };
}

/**
 * Слить своих (те, чьи сокеты держит этот сервер) с теми, кого видно по базе.
 *
 * Своих добавляем безусловно: про них сервер знает точно, а отметка в базе
 * могла не успеть записаться — например, человек только что подключился.
 */
export function mergeLocal(dbOnline: string[], localOnline: string[]): string[] {
  const all = new Set(dbOnline || []);
  for (const id of localOnline || []) if (id) all.add(id);
  return Array.from(all);
}
