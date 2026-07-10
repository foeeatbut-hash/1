import type { Express, Request, Response } from 'express';
import { getPrisma, sendError } from '../context.js';

// Журнал системных изменений (кто что менял) — читается на «Главной» и в логах.
export function registerLogRoutes(app: Express): void {
  // Последние записи (200)
  app.get('/api/logs', async (_req: Request, res: Response) => {
    try {
      const logs = await getPrisma().systemChangeLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
      res.json({ logs });
    } catch (err: any) { sendError(res, err); }
  });

  // Добавить запись в журнал
  app.post('/api/logs', async (req: Request, res: Response) => {
    try {
      const { userName, userSymbol, description, targetRoute } = req.body;
      const log = await getPrisma().systemChangeLog.create({
        data: {
          userName: userName || 'Сотрудник',
          userSymbol: userSymbol || 'ENGINEER',
          description,
          targetRoute: targetRoute || '',
        },
      });
      res.json({ log });
    } catch (err: any) { sendError(res, err); }
  });
}
