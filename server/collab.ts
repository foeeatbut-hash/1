/**
 * Комната документа на стороне сервера.
 *
 * Совместная работа здесь устроена просто и честно: сервер не сводит правки и
 * не хранит их поток — он раздаёт. Кто в документе, где стоит его курсор, какая
 * операция движка только что произошла и когда документ записан — всё это
 * расходится по комнате `constructor:<docId>`. Сведение одновременных правок
 * (§19.2 дизайна) — отдельная работа, и до неё правило одно: последний
 * записавший прав, а отставшее окно ловится сверкой времени.
 *
 * Присутствие живёт в памяти и исчезает вместе с соединением. База ему не
 * нужна: вопрос «кто сейчас в файле» не имеет смысла после перезапуска.
 *
 * Отдельным модулем — потому что это законченный кусок с собственным
 * состоянием, а server.ts и так самый большой файл в проекте.
 */
import type { Server, Socket } from 'socket.io';

const PRESENCE_COLORS = ['#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

/**
 * Цвет участника — от его идентификатора, а не от порядка входа: человек
 * обязан быть одного цвета во всех окнах и на всех машинах, иначе рамка
 * выделения ничего не говорит о том, чья она.
 */
export const presenceColor = (userId: string): string => {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
};

interface RoomPeer { userId: string; name: string; color: string; selection: any }

/** docId → (socketId → участник) */
const docPresence = new Map<string, Map<string, RoomPeer>>();

const emitRoster = (io: Server, docId: string) => {
  const room = docPresence.get(docId);
  const roster = room ? Array.from(room.entries()).map(([sid, p]) => ({ socketId: sid, ...p })) : [];
  io.to(`constructor:${docId}`).emit('constructor:presence', { docId, peers: roster });
};

/**
 * Подписать одно соединение на события комнаты. Зовётся из обработчика
 * connection: имя участника берётся работой, чтобы модуль не знал про базу.
 */
export function setupDocRooms(
  io: Server,
  socket: Socket,
  nameOf: (userId: string) => Promise<string>,
): { leaveAll: () => void } {
  const joined = new Set<string>();

  socket.on('constructor:join', async ({ docId }: { docId: string }) => {
    if (!docId) return;
    const userId = String((socket as any).userId || '');
    let name = 'Сотрудник';
    try { name = (await nameOf(userId)) || name; } catch (_) { /* без имени участник всё равно виден */ }
    socket.join(`constructor:${docId}`);
    joined.add(docId);
    if (!docPresence.has(docId)) docPresence.set(docId, new Map());
    docPresence.get(docId)!.set(socket.id, { userId, name, color: presenceColor(userId), selection: null });
    emitRoster(io, docId);
  });

  socket.on('constructor:leave', ({ docId }: { docId: string }) => {
    if (!docId) return;
    socket.leave(`constructor:${docId}`);
    joined.delete(docId);
    docPresence.get(docId)?.delete(socket.id);
    emitRoster(io, docId);
  });

  // Выделение участника (троттлится на клиенте) — остальным в комнате
  socket.on('constructor:selection', ({ docId, selection }: { docId: string; selection: any }) => {
    const p = docPresence.get(docId)?.get(socket.id);
    if (!p) return;
    p.selection = selection;
    socket.to(`constructor:${docId}`).emit('constructor:selection', { socketId: socket.id, selection });
  });

  // Мутация движка от одного участника — всем остальным в комнате
  socket.on('constructor:op', ({ docId, op }: { docId: string; op: any }) => {
    if (!docId || !op) return;
    socket.to(`constructor:${docId}`).emit('constructor:op', { socketId: socket.id, op });
  });

  /**
   * «Я записал документ, теперь его время такое».
   *
   * Запись поверх чужой правки ловится сверкой времени: окно шлёт время, с
   * которым читало документ, и если оно не совпало — отказ (src/lib/docConflict.ts).
   * Но окно, сидящее в комнате, чужие правки получает операциями и отставшим
   * не является, а время у него остаётся прежним. Без этой рассылки оно,
   * показав чужую правку, тут же получало бы отказ на собственное
   * автосохранение — «документ изменился», хотя изменился он ровно на то, что
   * это окно только что и показало. Так и было, пока проверка двух окон
   * (scripts/test-collab-live.ts) это не поймала.
   */
  socket.on('constructor:saved', ({ docId, at }: { docId: string; at: string }) => {
    if (!docId || !at) return;
    socket.to(`constructor:${docId}`).emit('constructor:saved', { socketId: socket.id, at });
  });

  // Соединение закрылось — участник исчезает из всех своих комнат: иначе в
  // шапке документа навсегда осталась бы висеть чужая буква
  return {
    leaveAll: () => {
      for (const docId of joined) {
        docPresence.get(docId)?.delete(socket.id);
        emitRoster(io, docId);
      }
      joined.clear();
    },
  };
}
