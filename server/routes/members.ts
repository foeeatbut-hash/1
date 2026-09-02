import type { Express, Request, Response } from 'express';
import { getPrisma, sendError, notifyUser } from '../context.js';

// ── Кто работает над проектом ───────────────────────────────────────────────
// Дизайн: docs/os-design.md §22.5.
//
// Единственное настоящее ограничение доступа в программе. Всё остальное —
// работа, и мешать ей не надо; а вот проект, к которому человек не причастен,
// он не должен видеть вовсе: ни файлов, ни тегов, ни писем.
//
// Два решения, без которых это превратилось бы в мучение:
//
//   1. ПРОЕКТ БЕЗ УЧАСТНИКОВ ВИДЯТ ВСЕ. База, заведённая до этой работы, не
//      знает ни о каких участниках, и включать ограничение задним числом —
//      значит в одно утро отобрать у отдела все проекты разом. Ограничение
//      начинает действовать с того момента, когда в проект позвали первого
//      человека.
//
//   2. АДМИНИСТРАТОР ВИДИТ ВСЁ. Иначе некому чинить.

let ensured = false;
async function ensureTables(): Promise<void> {
  if (ensured) return;
  const prisma = getPrisma();
  try {
    await prisma.projectMember.count();
    ensured = true;
  } catch (_) {
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProjectMember" (
        "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "userId" TEXT NOT NULL,
        "addedBy" TEXT NOT NULL DEFAULT '',
        "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      ensured = true;
    } catch (_) { /* следующая попытка на следующем запросе */ }
  }
}

const meOf = (req: Request) => (req as any).authUser || null;

/**
 * Видит ли человек этот проект.
 *
 * Экспортируется: тем же правилом пользуются маршруты, отдающие данные
 * проекта. Правило, размноженное по обработчикам, однажды разойдётся — и
 * разойдётся именно там, где это дороже всего.
 */
export async function canSeeProject(userId: string, projectId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  if (!projectId) return true;
  const prisma = getPrisma();
  try {
    const total = await prisma.projectMember.count({ where: { projectId } });
    if (total === 0) return true; // в проект ещё никого не звали — он общий
    const mine = await prisma.projectMember.count({ where: { projectId, userId } });
    return mine > 0;
  } catch (_) {
    // Таблицы ещё нет — значит, участников никто не заводил
    return true;
  }
}

export function registerMemberRoutes(app: Express): void {
  /** Состав проекта: кто в нём и кого можно позвать */
  app.get('/api/projects/:projectId/members', async (req: Request, res: Response) => {
    try {
      await ensureTables();
      const prisma = getPrisma();
      const projectId = String(req.params.projectId || '');
      const rows = await prisma.projectMember.findMany({ where: { projectId } });
      const ids = rows.map((r: any) => r.userId);
      const users = ids.length
        ? await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, symbol: true, role: true },
        })
        : [];
      const byId = new Map<string, any>(users.map((u: any) => [u.id, u]));
      res.json({
        items: rows.map((r: any) => ({
          userId: r.userId,
          name: byId.get(r.userId)?.name || 'Сотрудник',
          symbol: byId.get(r.userId)?.symbol || '',
          role: byId.get(r.userId)?.role || '',
          addedAt: r.addedAt,
        })),
        // Пока список пуст, проект виден всем: об этом надо сказать вслух, а не
        // оставлять человека гадать, почему ограничение не работает
        open: rows.length === 0,
      });
    } catch (err: any) { sendError(res, err); }
  });

  /** Позвать в проект (или заменить состав целиком) */
  app.post('/api/projects/:projectId/members', async (req: Request, res: Response) => {
    try {
      await ensureTables();
      const prisma = getPrisma();
      const me = meOf(req);
      const projectId = String(req.params.projectId || '');
      const ids: string[] = Array.isArray(req.body?.userIds)
        ? req.body.userIds.map((x: any) => String(x)).filter(Boolean)
        : [];

      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
      const before = await prisma.projectMember.findMany({ where: { projectId } });
      const had = new Set(before.map((r: any) => r.userId));

      await prisma.projectMember.deleteMany({
        where: { projectId, userId: { notIn: ids.length ? ids : ['-'] } },
      });
      for (const userId of ids) {
        if (had.has(userId)) continue;
        await prisma.projectMember.create({ data: { projectId, userId, addedBy: me?.id || '' } });
        // Позвали — сказали. Молча выданный доступ человек не заметит
        if (userId !== me?.id) {
          await notifyUser(
            userId, 'ПРОЕКТЫ', `Вас добавили в проект «${project?.name || ''}»`,
            `${me?.name || 'Коллега'} открыл вам доступ`, '/projects',
          );
        }
      }
      res.json({ ok: true, count: ids.length });
    } catch (err: any) { sendError(res, err); }
  });

  /**
   * Запросить доступ.
   *
   * Тупик без выхода — не отказ, а издевательство: человек нажал ссылку,
   * увидел «нет доступа» и остался ни с чем. Запрос уходит уведомлением тем,
   * кто уже в проекте, — им и решать.
   */
  app.post('/api/projects/:projectId/access-request', async (req: Request, res: Response) => {
    try {
      await ensureTables();
      const prisma = getPrisma();
      const me = meOf(req);
      const projectId = String(req.params.projectId || '');
      if (!me?.id) return res.status(401).json({ error: 'Требуется вход' });

      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
      const members = await prisma.projectMember.findMany({ where: { projectId }, take: 20 });
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true }, take: 5 });
      const targets = new Set<string>([...members.map((m: any) => m.userId), ...admins.map((a: any) => a.id)]);
      targets.delete(me.id);

      for (const userId of targets) {
        await notifyUser(
          userId, 'ДОСТУП', `Просят доступ к проекту «${project?.name || ''}»`,
          `${me.name || 'Сотрудник'} — добавьте его в состав, если он в деле`, '/projects',
        );
      }
      res.json({ ok: true, asked: targets.size });
    } catch (err: any) { sendError(res, err); }
  });
}
