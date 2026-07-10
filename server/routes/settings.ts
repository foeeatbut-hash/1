import type { Express, Request, Response } from 'express';
import { getPrisma, upsertSetting } from '../context.js';

// Настройки приложения: глобальные (userId=null) и персональные.
export function registerSettingsRoutes(app: Express): void {
  // Чтение: возвращает глобальное значение и (опционально) значение пользователя
  app.get('/api/settings/:key', async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const userId = String(req.query.userId || '');
      const global = await getPrisma().appSetting.findFirst({ where: { key, userId: null } });
      const user = userId ? await getPrisma().appSetting.findFirst({ where: { key, userId } }) : null;
      res.json({ global: global ? global.value : null, user: user ? user.value : null });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Запись: глобальная или персональная (userId в теле)
  app.post('/api/settings/:key', async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { userId, value } = req.body;
      const setting = await upsertSetting(key, userId || null, typeof value === 'string' ? value : JSON.stringify(value));
      res.json({ success: true, setting });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
  });
}
