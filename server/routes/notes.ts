import type { Express, Request, Response } from 'express';
import { getPrisma, sendError } from '../context.js';

// Инженерный блокнот: CRUD заметок (заголовок, HTML-контент, цвет, группа,
// опциональная привязка к оборудованию).
export function registerNoteRoutes(app: Express): void {
  // Список заметок (свежие сверху)
  app.get('/api/notes', async (_req: Request, res: Response) => {
    try {
      const notes = await getPrisma().userNote.findMany({ orderBy: { updatedAt: 'desc' } });
      res.json({ notes });
    } catch (err: any) { sendError(res, err); }
  });

  // Одна заметка
  app.get('/api/notes/:id', async (req: Request, res: Response) => {
    try {
      const note = await getPrisma().userNote.findUnique({ where: { id: req.params.id } });
      if (!note) return res.status(404).json({ error: 'Заметка не найдена' });
      res.json({ note });
    } catch (err: any) { sendError(res, err); }
  });

  // Создание заметки
  app.post('/api/notes', async (req: Request, res: Response) => {
    try {
      const { title, content, color, equipmentId, groupName } = req.body;
      const note = await getPrisma().userNote.create({
        data: {
          title: title || 'Новая заметка',
          content: content || '',
          color: color || 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200',
          equipmentId,
          groupName: groupName || null,
        },
      });
      res.json({ note });
    } catch (err: any) { sendError(res, err); }
  });

  // Обновление заметки (частичное)
  app.patch('/api/notes/:id', async (req: Request, res: Response) => {
    try {
      const { title, content, color, equipmentId, groupName } = req.body;
      const note = await getPrisma().userNote.update({
        where: { id: req.params.id },
        data: {
          title,
          content,
          color,
          equipmentId,
          // undefined — поле не меняем; пустая строка/null — убираем из группы
          groupName: groupName === undefined ? undefined : (groupName || null),
        },
      });
      res.json({ note });
    } catch (err: any) { sendError(res, err); }
  });

  // Удаление заметки
  app.delete('/api/notes/:id', async (req: Request, res: Response) => {
    try {
      await getPrisma().userNote.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err: any) { sendError(res, err); }
  });
}
