/**
 * Кто сейчас в сети — на стороне сервера.
 *
 * Присутствие живёт в ОБЩЕЙ БАЗЕ, а не в памяти этого сервера, и это не выбор
 * стиля, а исправление настоящей поломки. В отделе база одна на всех, а сервер
 * у каждого свой — встроенный в его же программу. Пока присутствие было
 * памятью сервера, каждый сотрудник сидел в своей комнате один: чат работал,
 * сообщения ходили через общую базу, а зелёных точек не было ни у кого и
 * никогда. Именно это и выглядело как «статус в сети не работает».
 *
 * Поэтому каждый сервер отмечает СВОИХ людей в общей таблице, а список «кто в
 * сети» собирает из неё же. Свои сокеты добавляются к списку безусловно: про
 * них известно точно, а отметка могла ещё не записаться.
 *
 * Правила свежести (сколько ждать, кого гасить) лежат отдельно и проверяются
 * скриптом — src/lib/presenceTime.ts.
 */
import { rosterOf, mergeLocal, BEAT_MS, FRESH_MS } from '../src/lib/presenceTime.js';
import { ensureTables } from './ddl.js';

export interface Roster { online: string[]; lastSeen: Record<string, number> }

export interface PresenceDeps {
  /** Клиент базы берётся лениво: он пересоздаётся при переключении базы */
  getPrisma: () => any;
  /** Чьи сокеты держит этот сервер прямо сейчас */
  localOnline: () => string[];
  /** Когда этот сервер видел своих в последний раз */
  localSeen: () => Record<string, number>;
  /** Разослать список своим окнам */
  broadcast: (roster: Roster) => void;
}

export function setupPresence(deps: PresenceDeps): {
  markPresence: (userId: string) => Promise<void>;
  markGone: (userId: string) => Promise<void>;
  rosterFromDb: () => Promise<Roster>;
} {
  /**
   * Общей таблицы может не быть — например, база создана старой версией.
   * Тогда работаем как раньше, по памяти: это хуже, но лучше, чем падать на
   * каждом подключении.
   */
  let tableOk = true;

  const markPresence = async (userId: string): Promise<void> => {
    const prisma = deps.getPrisma();
    if (!userId || !prisma || !tableOk) return;
    try {
      const at = new Date();
      await prisma.presence.upsert({ where: { userId }, update: { at }, create: { userId, at } });
    } catch (_) {
      const why = await ensureTables(prisma, [{
        table: 'Presence',
        cols: [
          { name: 'userId', kind: 'text', pk: true },
          { name: 'at', kind: 'time', notNull: true, def: 'now', indexed: true },
        ],
        indexes: [{ name: 'Presence_at_idx', cols: ['at'] }],
      }], (m) => console.error('[Присутствие]', m));
      if (why) {
        tableOk = false;
        console.error('[Присутствие] Работаю без общей таблицы:', why);
      }
    }
  };

  /**
   * Человек ушёл: отметка сразу становится несвежей.
   *
   * Просто перестать отмечать мало — строка в базе остаётся свежей ещё
   * сорок пять секунд, и ушедший «воскресает» на ближайшей же рассылке
   * списка, в том числе на чужих машинах. Поэтому время сдвигается назад
   * ровно на срок свежести: для всех он офлайн немедленно, а «был(а) N
   * назад» остаётся верным с точностью до минуты — а больше от этой подписи
   * и не требуется.
   */
  const markGone = async (userId: string): Promise<void> => {
    const prisma = deps.getPrisma();
    if (!userId || !prisma || !tableOk) return;
    try {
      const at = new Date(Date.now() - FRESH_MS);
      await prisma.presence.upsert({ where: { userId }, update: { at }, create: { userId, at } });
    } catch (_) { /* таблицы нет — работаем по памяти, как раньше */ }
  };

  const localRoster = (): Roster => ({ online: deps.localOnline(), lastSeen: deps.localSeen() });

  const rosterFromDb = async (): Promise<Roster> => {
    const prisma = deps.getPrisma();
    if (!prisma || !tableOk) return localRoster();
    try {
      // Неделя — предел памяти о людях: «был(а) в мае» никому не нужно, а
      // список от этого растёт с каждым уволившимся
      const rows = await prisma.presence.findMany({
        where: { at: { gte: new Date(Date.now() - 7 * 86400000) } },
        select: { userId: true, at: true },
        take: 500,
      });
      const r = rosterOf(rows as any, Date.now(), FRESH_MS);
      const mine = localRoster();
      return {
        online: mergeLocal(r.online, mine.online),
        lastSeen: { ...r.lastSeen, ...mine.lastSeen },
      };
    } catch (_) {
      return localRoster();
    }
  };

  /**
   * Удар сердца: своих — в базу, свежий список — своим окнам.
   *
   * Один запрос раз в пятнадцать секунд на сервер, независимо от числа окон.
   * Спрашивать список из каждого окна было бы дороже и вразнобой.
   */
  setInterval(() => {
    void (async () => {
      for (const uid of deps.localOnline()) await markPresence(uid);
      deps.broadcast(await rosterFromDb());
    })();
  }, BEAT_MS);

  return { markPresence, markGone, rosterFromDb };
}
