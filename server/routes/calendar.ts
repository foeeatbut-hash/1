import type { Express, Request, Response } from 'express';
import { ensureTables as ensureDbTables } from '../ddl.js';
import { getPrisma, resolveProjectId, sendError, notifyUser } from '../context.js';

// ── Календарь: события проекта, личные напоминания и сроки ВДР ──
// Дизайн: docs/os-design.md §15.
//
// Три решения, которые видны насквозь и без которых календарь превратился бы
// во второй реестр:
//
//   1. СРОКИ ВДР — ПРОЕКЦИЯ. Они собираются из реестра при каждом запросе и в
//      таблицу событий не пишутся. Иначе появился бы второй источник правды о
//      сроке: реестр говорит одно, календарь другое, и оба уверены в себе.
//      Поэтому срок из календаря и нельзя подвинуть — его меняют в реестре.
//
//   2. ЛИЧНОЕ — ЛИЧНОЕ. Событие с visibility=private видит только тот, кто его
//      завёл, включая администратора. Памятка «позвонить поставщику» — не
//      данные проекта, и показывать её начальству нельзя, даже случайно.
//
//   3. УЧАСТНИК ВИДИТ ВСТРЕЧУ, ДАЖЕ ЕСЛИ ОНА ЧУЖОГО ПРОЕКТА. Приглашённый —
//      это тот, кого позвали; отбирать у него встречу по границе проекта
//      значит звать и прятать одновременно.

let ensured = false;
/**
 * Таблицы календаря в общей базе.
 *
 * Основную работу делает автомиграция по схеме (server/schema-sync.ts); это
 * подстраховка на случай, когда она не отработала. Раньше она была написана
 * синтаксисом PostgreSQL и на MariaDB падала всегда, а ошибку глотала молча —
 * поэтому у владельца КАЖДЫЙ заход в календарь отвечал 500 без единой строчки
 * о причине. Теперь SQL собирается под движок (server/ddl.ts), а беда
 * возвращается наверх и попадает и в журнал, и в ответ человеку.
 */
let tablesError = '';

async function ensureTables(): Promise<string> {
  if (ensured) return '';
  const prisma = getPrisma();
  try {
    await prisma.calEvent.count();
    ensured = true;
    return '';
  } catch (_) {
    tablesError = await ensureDbTables(prisma, [
      {
        table: 'CalEvent',
        cols: [
          { name: 'id', kind: 'text', pk: true },
          { name: 'projectId', kind: 'text', indexed: true },
          { name: 'kind', kind: 'text', notNull: true, def: 'meeting' },
          { name: 'title', kind: 'text', notNull: true, def: '' },
          { name: 'description', kind: 'text', notNull: true, def: '' },
          { name: 'startsAt', kind: 'time', notNull: true, def: 'now' },
          { name: 'endsAt', kind: 'time', notNull: true, def: 'now' },
          { name: 'allDay', kind: 'bool', notNull: true, def: false },
          { name: 'rrule', kind: 'text', notNull: true, def: '' },
          { name: 'place', kind: 'text', notNull: true, def: '' },
          { name: 'joinUrl', kind: 'text', notNull: true, def: '' },
          { name: 'createdBy', kind: 'text', notNull: true, def: '', indexed: true },
          { name: 'source', kind: 'text', notNull: true, def: 'hand' },
          { name: 'sourceId', kind: 'text', notNull: true, def: '' },
          { name: 'visibility', kind: 'text', notNull: true, def: 'project' },
          { name: 'remindMin', kind: 'int', notNull: true, def: 0 },
          { name: 'createdAt', kind: 'time', notNull: true, def: 'now' },
          { name: 'updatedAt', kind: 'time', notNull: true, def: 'now' },
        ],
        indexes: [
          { name: 'CalEvent_project_start_idx', cols: ['projectId', 'startsAt'] },
          { name: 'CalEvent_createdBy_idx', cols: ['createdBy'] },
        ],
      },
      {
        table: 'CalGuest',
        cols: [
          { name: 'id', kind: 'text', pk: true },
          { name: 'eventId', kind: 'text', notNull: true, def: '', indexed: true },
          { name: 'userId', kind: 'text', notNull: true, def: '', indexed: true },
          { name: 'state', kind: 'text', notNull: true, def: 'invited' },
        ],
        indexes: [
          { name: 'CalGuest_event_user_key', cols: ['eventId', 'userId'], unique: true },
          { name: 'CalGuest_userId_idx', cols: ['userId'] },
        ],
      },
    ], (m) => console.error('[Календарь]', m));
    if (!tablesError) ensured = true;
    return tablesError;
  }
}

/**
 * Отказ, который можно прочитать. Пустой 500 человек видит как «программа
 * сломалась» и выходит из неё; строка про общую базу говорит, что делать.
 */
function tablesFailed(res: Response, why: string): boolean {
  if (!why) return false;
  res.status(503).json({
    error: 'Календарь пока не готов: в общей базе нет его таблиц.',
    details: why,
  });
  return true;
}

const str = (v: any) => String(v ?? '').trim();
const meOf = (req: Request) => (req as any).authUser || null;
const num = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/** Наружу событие уходит с временем числом: разбирать даты на клиенте незачем */
const shape = (ev: any, names: Map<string, string>) => ({
  id: ev.id,
  projectId: ev.projectId || null,
  kind: ev.kind || 'meeting',
  title: ev.title || '',
  description: ev.description || '',
  startsAt: new Date(ev.startsAt).getTime(),
  endsAt: new Date(ev.endsAt).getTime(),
  allDay: !!ev.allDay,
  rrule: ev.rrule || '',
  place: ev.place || '',
  joinUrl: ev.joinUrl || '',
  createdBy: ev.createdBy || '',
  source: ev.source || 'hand',
  sourceId: ev.sourceId || '',
  visibility: ev.visibility || 'project',
  remindMin: Number(ev.remindMin) || 0,
  guests: (ev.guests || []).map((g: any) => ({
    userId: g.userId, name: names.get(g.userId) || 'Сотрудник', state: g.state || 'invited',
  })),
});

export function registerCalendarRoutes(app: Express): void {
  /**
   * События окна [from, to].
   *
   * Окно спрашивается с запасом: событие, начавшееся в прошлом месяце и
   * повторяющееся до сих пор, обязано попасть в выдачу — раскрывает повторы
   * клиент (src/lib/calendar.ts), и без исходного события он не сможет.
   */
  app.get('/api/calendar/events', async (req: Request, res: Response) => {
    try {
      if (tablesFailed(res, await ensureTables())) return;
      const prisma = getPrisma();
      const me = meOf(req);
      const projectId = await resolveProjectId(req.query.projectId as string);
      const to = new Date(num(req.query.to, Date.now() + 90 * 86400000));

      const rows = await prisma.calEvent.findMany({
        where: {
          AND: [
            { startsAt: { lte: to } },
            {
              OR: [
                // Проектные события — всем, кто в проекте
                { projectId, visibility: 'project' },
                // Личные — только автору
                { createdBy: me?.id || '', visibility: 'private' },
                // Встречи, куда позвали: даже если проект другой
                { guests: { some: { userId: me?.id || '' } } },
              ],
            },
          ],
        },
        include: { guests: true },
        orderBy: { startsAt: 'asc' },
        take: 2000,
      });

      // Имена участников одним запросом: иначе на встрече с десятью людьми
      // получилось бы десять запросов к базе на каждое открытие календаря
      const ids = Array.from(new Set(rows.flatMap((r: any) => (r.guests || []).map((g: any) => g.userId))));
      const names = new Map<string, string>();
      if (ids.length) {
        const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
        for (const u of users) names.set(u.id, u.name);
      }

      res.json({ items: rows.map((r: any) => shape(r, names)) });
    } catch (err: any) { sendError(res, err); }
  });

  /**
   * Сроки реестра ВДР за окно — отдельным ответом.
   *
   * Отдельным намеренно: это не события, а срез реестра на момент запроса.
   * Клиент рисует их той же сеткой, но знает, что двигать их нельзя.
   */
  app.get('/api/calendar/deadlines', async (req: Request, res: Response) => {
    try {
      const prisma = getPrisma();
      const projectId = await resolveProjectId(req.query.projectId as string);
      const from = new Date(num(req.query.from, Date.now() - 30 * 86400000));
      const to = new Date(num(req.query.to, Date.now() + 90 * 86400000));

      const rows = await prisma.docRegisterItem.findMany({
        where: { projectId, dueDate: { gte: from, lte: to } },
        include: { register: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 1000,
      });

      res.json({
        items: rows.map((r: any) => ({
          id: r.id,
          title: r.titleRu || r.titleEn || 'Документ',
          dueAt: new Date(r.dueDate).getTime(),
          code: r.contractorNo || r.vdrCode || '',
          register: r.register?.name || '',
          projectId: r.projectId,
        })),
      });
    } catch (err: any) { sendError(res, err); }
  });

  app.post('/api/calendar/events', async (req: Request, res: Response) => {
    try {
      if (tablesFailed(res, await ensureTables())) return;
      const prisma = getPrisma();
      const me = meOf(req);
      const b = req.body || {};
      const visibility = b.visibility === 'private' ? 'private' : 'project';
      const projectId = visibility === 'private' ? null : await resolveProjectId(b.projectId);
      const startsAt = new Date(num(b.startsAt, Date.now()));
      // Конец не раньше начала: событие «с 10:00 до 9:30» рисуется полосой
      // отрицательной длины, то есть не рисуется вовсе
      const endsAt = new Date(Math.max(num(b.endsAt, 0), startsAt.getTime() + 15 * 60000));

      const guests: string[] = Array.isArray(b.guests) ? b.guests.map((g: any) => str(g)).filter(Boolean) : [];

      const ev = await prisma.calEvent.create({
        data: {
          projectId,
          kind: ['meeting', 'reminder', 'note'].includes(b.kind) ? b.kind : 'meeting',
          title: str(b.title) || 'Без названия',
          description: str(b.description),
          startsAt, endsAt,
          allDay: !!b.allDay,
          rrule: str(b.rrule),
          place: str(b.place),
          joinUrl: str(b.joinUrl),
          // Автор — из сессии, а не из тела запроса: чужим именем событие
          // завести нельзя
          createdBy: me?.id || '',
          source: ['hand', 'mail', 'assistant'].includes(b.source) ? b.source : 'hand',
          sourceId: str(b.sourceId),
          visibility,
          remindMin: Math.max(0, num(b.remindMin, 0)),
          guests: guests.length
            ? { create: guests.map((userId) => ({ userId, state: userId === me?.id ? 'yes' : 'invited' })) }
            : undefined,
        },
        include: { guests: true },
      });

      // Приглашение — уведомлением, а не письмом: почта здесь лишний круг
      for (const userId of guests) {
        if (userId === me?.id) continue;
        await notifyUser(
          userId, 'СИСТЕМА', `Встреча: ${ev.title}`,
          `${me?.name || 'Коллега'} зовёт вас`, '/calendar',
        );
      }

      res.json({ item: shape(ev, new Map()) });
    } catch (err: any) { sendError(res, err); }
  });

  app.put('/api/calendar/events/:id', async (req: Request, res: Response) => {
    try {
      if (tablesFailed(res, await ensureTables())) return;
      const prisma = getPrisma();
      const me = meOf(req);
      const b = req.body || {};
      const cur = await prisma.calEvent.findUnique({ where: { id: req.params.id } });
      if (!cur) return res.status(404).json({ error: 'Событие не найдено' });
      // Личное правит только его автор. Проектное — кто угодно из проекта:
      // встречу переносят тем, кто первым узнал о переносе
      if (cur.visibility === 'private' && cur.createdBy !== me?.id) {
        return res.status(403).json({ error: 'Это личное событие' });
      }

      const startsAt = b.startsAt === undefined ? cur.startsAt : new Date(num(b.startsAt, Date.now()));
      const endsAt = b.endsAt === undefined
        ? cur.endsAt
        : new Date(Math.max(num(b.endsAt, 0), new Date(startsAt).getTime() + 15 * 60000));

      const data: any = { startsAt, endsAt };
      for (const key of ['title', 'description', 'place', 'joinUrl', 'rrule'] as const) {
        if (b[key] !== undefined) data[key] = str(b[key]);
      }
      if (b.allDay !== undefined) data.allDay = !!b.allDay;
      if (b.remindMin !== undefined) data.remindMin = Math.max(0, num(b.remindMin, 0));
      if (b.kind !== undefined && ['meeting', 'reminder', 'note'].includes(b.kind)) data.kind = b.kind;

      if (Array.isArray(b.guests)) {
        const ids: string[] = b.guests.map((g: any) => str(g)).filter(Boolean);
        await prisma.calGuest.deleteMany({ where: { eventId: cur.id, userId: { notIn: ids.length ? ids : ['-'] } } });
        for (const userId of ids) {
          const has = await prisma.calGuest.findFirst({ where: { eventId: cur.id, userId } });
          if (!has) await prisma.calGuest.create({ data: { eventId: cur.id, userId, state: 'invited' } });
        }
      }

      const ev = await prisma.calEvent.update({ where: { id: cur.id }, data, include: { guests: true } });
      res.json({ item: shape(ev, new Map()) });
    } catch (err: any) { sendError(res, err); }
  });

  app.delete('/api/calendar/events/:id', async (req: Request, res: Response) => {
    try {
      if (tablesFailed(res, await ensureTables())) return;
      const prisma = getPrisma();
      const me = meOf(req);
      const cur = await prisma.calEvent.findUnique({ where: { id: req.params.id } });
      if (!cur) return res.json({ ok: true });
      if (cur.visibility === 'private' && cur.createdBy !== me?.id) {
        return res.status(403).json({ error: 'Это личное событие' });
      }
      await prisma.calGuest.deleteMany({ where: { eventId: cur.id } });
      await prisma.calEvent.delete({ where: { id: cur.id } });
      res.json({ ok: true });
    } catch (err: any) { sendError(res, err); }
  });

  /** Ответ участника: приду, не приду, может быть */
  app.post('/api/calendar/events/:id/answer', async (req: Request, res: Response) => {
    try {
      if (tablesFailed(res, await ensureTables())) return;
      const prisma = getPrisma();
      const me = meOf(req);
      const state = ['yes', 'no', 'maybe'].includes(req.body?.state) ? req.body.state : 'invited';
      if (!me?.id) return res.status(401).json({ error: 'Требуется вход' });
      const row = await prisma.calGuest.findFirst({ where: { eventId: req.params.id, userId: me.id } });
      if (!row) return res.status(404).json({ error: 'Вас не звали на эту встречу' });
      await prisma.calGuest.update({ where: { id: row.id }, data: { state } });
      res.json({ ok: true, state });
    } catch (err: any) { sendError(res, err); }
  });
}
