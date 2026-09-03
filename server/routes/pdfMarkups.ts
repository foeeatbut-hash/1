import type { Express, Request, Response } from 'express';
import { getPrisma, sendError } from '../context.js';

// Пометки на чертежах ПДФ.
//
// Хранятся рядом с файлом, а не внутри него: присланный чертёж ценен тем, что
// он не изменён. Отсюда и правила ниже.
//
// Пометка привязана к РЕВИЗИИ чертежа. При выпуске новой ревизии старые
// пометки не переносятся и не удаляются — их видно отдельно, и по ним сразу
// понятно, что поставщик учёл, а что нет. Сквозные пометки были бы проще, но
// через полгода никто не скажет, к чему относилось замечание.
//
// Автор берётся из проверенного токена (req.authUser), а не из тела запроса:
// иначе замечание можно подписать чужим именем.

// SIGN — подпись человека: картинка берётся не отсюда, а из профиля автора
// пометки. Хранить её копию в каждой подписи значило бы, что смена подписи в
// профиле не доходит до документов, а старые остаются жить вечно
const KINDS = ['CLOUD', 'ARROW', 'RECT', 'NOTE', 'STAMP', 'PEN', 'SIGN'];
const STATES = ['OPEN', 'DONE', 'REJECTED'];

/** Доля страницы: всё вне 0..1 — ошибка вызывающего, а не «поправим молча» */
const frac = (v: any): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
};

export function registerPdfMarkupRoutes(app: Express) {
  /** Пометки файла. По умолчанию — все, ?revision= сужает до одной ревизии */
  app.get('/api/files/:id/markups', async (req: Request, res: Response) => {
    try {
      const prisma = getPrisma();
      const revision = typeof req.query.revision === 'string' ? req.query.revision : undefined;
      const markups = await prisma.pdfMarkup.findMany({
        where: { fileId: req.params.id, deletedAt: null, ...(revision ? { revision } : {}) },
        include: { createdBy: { select: { id: true, name: true, symbol: true } } },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ markups });
    } catch (e) { console.error('[ПДФ] Не удалось загрузить пометки:', e); sendError(res, e); }
  });

  app.post('/api/files/:id/markups', async (req: Request, res: Response) => {
    try {
      const prisma = getPrisma();
      const me = (req as any).authUser;
      const file = await prisma.fileNode.findUnique({ where: { id: req.params.id } });
      if (!file) return res.status(404).json({ error: 'Файл не найден' });

      const kind = KINDS.includes(String(req.body?.kind)) ? String(req.body.kind) : 'CLOUD';
      const markup = await prisma.pdfMarkup.create({
        data: {
          fileId: file.id,
          // Ревизия чертежа на момент постановки: её знает файл, а не клиент
          revision: file.revision || '1',
          page: Math.max(1, Number(req.body?.page) || 1),
          kind,
          x: frac(req.body?.x), y: frac(req.body?.y),
          w: frac(req.body?.w), h: frac(req.body?.h),
          color: String(req.body?.color || '#be123c').slice(0, 16),
          strokeWidth: Math.min(12, Math.max(1, Number(req.body?.strokeWidth) || 2)),
          text: typeof req.body?.text === 'string' ? req.body.text.slice(0, 4000) : null,
          createdById: me?.id || null,
        },
        include: { createdBy: { select: { id: true, name: true, symbol: true } } },
      });
      res.json({ markup });
    } catch (e) { console.error('[ПДФ] Не удалось поставить пометку:', e); sendError(res, e); }
  });

  /** Правка пометки: текст, цвет, состояние, положение */
  app.put('/api/pdf-markups/:id', async (req: Request, res: Response) => {
    try {
      const prisma = getPrisma();
      const data: Record<string, any> = {};
      if (typeof req.body?.text === 'string') data.text = req.body.text.slice(0, 4000);
      if (typeof req.body?.color === 'string') data.color = req.body.color.slice(0, 16);
      if (req.body?.strokeWidth !== undefined) {
        data.strokeWidth = Math.min(12, Math.max(1, Number(req.body.strokeWidth) || 2));
      }
      if (STATES.includes(String(req.body?.state))) data.state = String(req.body.state);
      for (const k of ['x', 'y', 'w', 'h']) {
        if (req.body?.[k] !== undefined) data[k] = frac(req.body[k]);
      }
      if (!Object.keys(data).length) return res.status(400).json({ error: 'Нечего менять' });
      const markup = await prisma.pdfMarkup.update({
        where: { id: req.params.id },
        data,
        include: { createdBy: { select: { id: true, name: true, symbol: true } } },
      });
      res.json({ markup });
    } catch (e) { console.error('[ПДФ] Не удалось изменить пометку:', e); sendError(res, e); }
  });

  /**
   * Снятие пометки — мягкое. Замечание к чертежу это переписка с поставщиком:
   * стёртое насовсем нечем подтвердить.
   */
  app.delete('/api/pdf-markups/:id', async (req: Request, res: Response) => {
    try {
      const prisma = getPrisma();
      await prisma.pdfMarkup.update({
        where: { id: req.params.id },
        data: { deletedAt: new Date() },
      });
      res.json({ ok: true });
    } catch (e) { console.error('[ПДФ] Не удалось снять пометку:', e); sendError(res, e); }
  });
}
