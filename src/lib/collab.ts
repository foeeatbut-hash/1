/**
 * Совместная работа в документе: кто рядом и что делать после обрыва связи.
 *
 * Присутствие и рассылка правок уже работают: окно входит в комнату документа,
 * получает список участников и чужие операции движка. Но у этой схемы есть
 * дыра, которую видно только в неудачный день, — ОБРЫВ СВЯЗИ.
 *
 * Сокет отвалился (уснул ноутбук, моргнула сеть, перезапустился сервер), а
 * автосохранение по HTTP живёт своей жизнью и раз в две с половиной секунды
 * пишет на сервер мою книгу. Чужие правки в это время до меня не доходят —
 * значит, я пишу поверх них. Ошибки нет, всё «сохранено», и через неделю по
 * ведомости заказывают то, чего в ней уже не должно быть. Это ровно тот случай,
 * про который написано в docConflict.ts, только приходит он не через неделю, а
 * через минуту после того, как в лифте пропал вайфай.
 *
 * Поэтому здесь три правила, и все три — про потерю данных, а не про красоту:
 *
 *   1. Связь потеряна, а в документе есть кто-то ещё — автосохранение
 *      останавливается. Правка человека при этом цела: она на экране, и уйдёт,
 *      как только связь вернётся.
 *   2. Связь вернулась — окно решает по своему состоянию, а не гадает:
 *      своего несохранённого нет — перечитать документ и увидеть чужое;
 *      своё есть — попытаться записать, и пусть сервер скажет про столкновение
 *      (тогда откроется обычный разбор из docConflict.ts).
 *   3. Одиночка не страдает от чужих правил: если в документе я один, обрыв
 *      связи ничего не меняет — сохраняю как сохранял.
 *
 * Без React и без DOM: правила проверяются скриптом, а не разглядыванием окна
 * с выдернутым проводом.
 */

/** Участник, открывший тот же документ. Цвет назначает сервер по userId */
export interface Peer {
  socketId: string;
  userId: string;
  name: string;
  color: string;
  /** Где стоит его курсор. Вид зависит от редактора, сюда не смотрим */
  selection?: unknown;
}

/** Сколько аватаров помещается в шапке; остальные — числом «+N» */
export const MAX_AVATARS = 5;

/**
 * Через сколько молчания возвращение считается возвращением «издалека».
 *
 * Короткая рябь сети (доли секунды) не повод перечитывать документ: за это
 * время ничего не случилось. Полминуты — уже повод: за полминуты коллега
 * успевает заполнить строку.
 */
export const RESYNC_AFTER = 30_000;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Список участников из ответа сервера: без себя, без мусора, в устойчивом
 * порядке.
 *
 * Порядок важен не для красоты: аватары, пляшущие местами на каждом обновлении
 * присутствия, читаются как «кто-то зашёл» — и человек отвлекается на пустое.
 * Сортируем по имени, при совпадении — по socketId (один человек с двух окон).
 */
export function normalizePeers(roster: unknown, selfSocketId: string): Peer[] {
  if (!Array.isArray(roster)) return [];
  const out: Peer[] = [];
  const seen = new Set<string>();
  for (const raw of roster) {
    const p = raw as Record<string, unknown> | null;
    if (!p || typeof p !== 'object') continue;
    const socketId = str(p.socketId);
    if (!socketId || socketId === selfSocketId || seen.has(socketId)) continue;
    seen.add(socketId);
    out.push({
      socketId,
      userId: str(p.userId),
      name: str(p.name).trim() || 'Сотрудник',
      color: str(p.color) || '#64748b',
      selection: p.selection ?? null,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.socketId.localeCompare(b.socketId));
  return out;
}

/**
 * Новое выделение участника. Сообщение о выделении может прийти от того, кого
 * в списке уже нет (ушёл, а сообщение было в пути) — такое молча пропускаем:
 * иначе в списке заведётся участник без имени и цвета.
 */
export function withSelection(peers: Peer[], socketId: string, selection: unknown): Peer[] {
  if (!peers.some((p) => p.socketId === socketId)) return peers;
  return peers.map((p) => (p.socketId === socketId ? { ...p, selection } : p));
}

/** Сколько живых людей в документе кроме меня: два окна одного — один человек */
export function coauthors(peers: Peer[]): number {
  const ids = new Set<string>();
  for (const p of peers) ids.add(p.userId || p.socketId);
  return ids.size;
}

/** Состояние связи с комнатой документа */
export type Link = 'live' | 'lost';

/** Что известно об обрыве: когда случился и сколько народу было в документе */
export interface Drop {
  at: number;
  peers: number;
}

/**
 * Останавливать ли автосохранение.
 *
 * Только когда обе беды сразу: связи нет И в документе есть кто-то ещё. Один
 * человек без связи пишет как обычно — иначе правка, сделанная в самолёте,
 * не сохранится вовсе, а это хуже любого столкновения.
 */
export function holdSave(link: Link, peersAtDrop: number): boolean {
  return link === 'lost' && peersAtDrop > 0;
}

/** Что делать, когда связь вернулась */
export type Recovery =
  /** Своего несохранённого нет — перечитать документ и увидеть чужие правки */
  | 'resync'
  /** Своё есть, документ мог уйти — записать и дать серверу объявить столкновение */
  | 'resolve'
  /** Ничего не случилось: работать дальше */
  | 'resume';

/**
 * Решение принимается по двум фактам, и оба честные: есть ли у меня
 * несохранённое и был ли в документе кто-то, пока меня не было.
 *
 * Перечитывать документ при несохранённой правке нельзя ни при каких условиях:
 * это и есть тихая потеря, от которой всё затевалось. Поэтому при своей правке
 * всегда 'resolve' — запись с базой времени, а дальше решает сервер.
 */
export function afterReconnect(dirty: boolean, drop: Drop | null, now: number = Date.now()): Recovery {
  if (dirty) return 'resolve';
  if (!drop) return 'resume';
  if (drop.peers > 0) return 'resync';
  return now - drop.at >= RESYNC_AFTER ? 'resync' : 'resume';
}

/**
 * Строка о связи для шапки документа. Пустая — говорить не о чем.
 *
 * Молчать об обрыве нельзя: человек продолжает печатать, считая, что его видят.
 * Но и пугать одиночку незачем — ему обрыв ничем не грозит.
 */
export function linkNote(link: Link, peersAtDrop: number): string {
  if (link === 'live') return '';
  if (peersAtDrop > 0) return 'связь потеряна — правки не уходят коллегам';
  return 'связь потеряна';
}

/** Буква на аватаре: первая буква имени, заглавная */
export function initial(name: string): string {
  const clean = (name || '').trim();
  return clean ? clean.charAt(0).toUpperCase() : '?';
}

/** Подсказка к аватарам: «В документе: Иванов, Петров» */
export function peersLabel(peers: Peer[]): string {
  if (!peers.length) return '';
  const names: string[] = [];
  for (const p of peers) if (!names.includes(p.name)) names.push(p.name);
  return `В документе: ${names.join(', ')}`;
}

/** Сколько аватаров не поместилось: «+2» рядом с пятью кружками */
export const extraPeers = (peers: Peer[]): number => Math.max(0, peers.length - MAX_AVATARS);
