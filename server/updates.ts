/**
 * Обновления программы: публикация, раздача и отзыв.
 *
 * Главное решение этого модуля — ФАЙЛ ЕДЕТ В ОБЩУЮ БАЗУ.
 *
 * В отделе, для которого программа писалась, сервера приложения нет: общая у
 * сотрудников только база, а свой встроенный сервер поднимает программа
 * каждого. Пока запись о релизе ложилась в общую базу, а сам exe оставался на
 * диске того, кто публиковал, все остальные видели «доступна новая версия» и
 * получали «файла этой версии нет». Обновиться не мог никто, кроме автора
 * публикации, — и выглядело это как поломка обновлений.
 *
 * Поэтому файл кладётся туда же, где и запись о нём: кусками по два мегабайта,
 * потому что 130 мегабайт одним запросом не проходят — у MariaDB есть предел
 * размера пакета, и он обычно меньше. Диск остаётся быстрым путём для того,
 * кто публиковал; все прочие берут файл из базы.
 */
import type { Express, Request, Response } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { ensureTables as ensureDbTables } from './ddl.js';

export interface UpdateDeps {
  /** Клиент базы берётся лениво: он пересоздаётся при переключении базы */
  getPrisma: () => any;
  /** Папка данных сервера — там же лежит быстрый диск-кэш файлов */
  dataDir: string;
  notifyAll: (category: string, title: string, body: string, route: string, by: string) => Promise<void>;
  broadcast: (event: string, payload: unknown) => void;
}

export function registerUpdateRoutes(app: Express, deps: UpdateDeps): void {
  const ventAppDataPath = deps.dataDir;
  // ── Обновления приложения: публикация и раздача через сервер ────────────────
  // Админ загружает новый exe прямо на сервер (или указывает внешнюю ссылку),
  // сотрудники проверяют и скачивают обновление с того же сервера, на котором
  // работают — никакого стороннего хостинга. Файлы лежат в папке данных сервера.
  const updatesDir = path.join(ventAppDataPath, 'updates');
  const sanitizeVersion = (v: unknown): string => String(v || '').trim().replace(/[^0-9a-zA-Z.\-]/g, '').slice(0, 40);
  const updateFilePath = (version: string) => path.join(updatesDir, `Flux-${version}.exe`);

  // Последний опубликованный релиз (для виджета «Проверить обновления»)
  app.get('/api/updates/latest', async (_req: Request, res: Response) => {
    try {
      const upd = await deps.getPrisma().appUpdate.findFirst({ orderBy: { createdAt: 'desc' } });
      if (!upd) return res.json({ version: null });
      const local = updateFilePath(upd.version);
      const size = fs.existsSync(local) ? fs.statSync(local).size : 0;
      res.json({ version: upd.version, changelog: upd.changelog, fileUrl: upd.fileUrl, size, createdAt: upd.createdAt });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Не удалось получить сведения об обновлении' });
    }
  });

  // Загрузка файла exe на сервер (только админ). Тело запроса — сырые байты файла,
  // потому что base64-через-JSON упирается в лимит парсера, а exe весит >100 МБ.
  /**
   * Загрузка exe: на диск этого сервера И В ОБЩУЮ БАЗУ.
   *
   * База — единственное, что есть общего у всех сотрудников: сервера приложения
   * у них нет, программа каждого поднимает свой встроенный. Пока запись о релизе
   * ложилась в общую базу, а сам файл — на диск того, кто публиковал, все
   * остальные видели «доступна новая версия» и получали «файла этой версии нет».
   *
   * Кусками по два мегабайта: целиком 130 МБ одним запросом не проходят — у
   * MariaDB есть предел размера пакета, и он обычно меньше.
   */
  const CHUNK_BYTES = 2 * 1024 * 1024;

  // Таблица кусков может отсутствовать в базе, созданной прежней версией
  let updateChunksReady = false;
  const ensureUpdateChunks = async (): Promise<void> => {
    if (updateChunksReady) return;
    try {
      await deps.getPrisma().appUpdateChunk.count();
      updateChunksReady = true;
    } catch (_) {
      const why = await ensureDbTables(deps.getPrisma(), [{
        table: 'AppUpdateChunk',
        cols: [
          { name: 'id', kind: 'text', pk: true },
          { name: 'version', kind: 'text', notNull: true, def: '', indexed: true },
          { name: 'idx', kind: 'int', notNull: true, def: 0 },
          { name: 'data', kind: 'blob', notNull: true },
        ],
        indexes: [{ name: 'AppUpdateChunk_version_idx_key', cols: ['version', 'idx'], unique: true }],
      }], (m) => console.error('[Обновление]', m));
      if (why) throw new Error(why);
      updateChunksReady = true;
    }
  };

  app.post('/api/updates/upload', express.raw({ type: () => true, limit: '800mb' }), async (req: Request, res: Response) => {
    const u = (req as any).authUser;
    if (!u || u.role !== 'ADMIN') return res.status(403).json({ error: 'Публикация обновлений доступна только администратору' });
    const version = sanitizeVersion(req.query.version);
    if (!version) return res.status(400).json({ error: 'Укажите версию (?version=1.2.3)' });
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 1024) return res.status(400).json({ error: 'Файл обновления пуст или не передан' });
    try {
      if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });
      fs.writeFileSync(updateFilePath(version), body);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Не удалось сохранить файл обновления' });
    }
    try {
      await ensureUpdateChunks();
      await deps.getPrisma().appUpdateChunk.deleteMany({ where: { version } });
      for (let i = 0, idx = 0; i < body.length; i += CHUNK_BYTES, idx++) {
        await deps.getPrisma().appUpdateChunk.create({
          data: { version, idx, data: body.subarray(i, Math.min(i + CHUNK_BYTES, body.length)) },
        });
      }
      // Старые версии из базы убираем: держать по 130 МБ на каждый выпуск
      // незачем, а место в общей базе — общее
      const keep = await deps.getPrisma().appUpdate.findMany({ orderBy: { createdAt: 'desc' }, take: 2, select: { version: true } });
      const keepList = [version, ...keep.map((k: any) => k.version)];
      await deps.getPrisma().appUpdateChunk.deleteMany({ where: { version: { notIn: keepList } } });
      res.json({ success: true, version, size: body.length, shared: true });
    } catch (e: any) {
      // На диске файл уже есть — этот сервер обновление раздаст, но остальные
      // сотрудники его не увидят. Молчать об этом нельзя
      console.error('[Обновление] Файл не попал в общую базу:', e?.message || e);
      res.json({
        success: true, version, size: body.length, shared: false,
        warning: 'Файл сохранён только на этой машине: в общую базу он не записался. '
          + 'Сотрудники его не скачают. Причина: ' + (e?.message || e),
      });
    }
  });

  // Публикация релиза (только админ): создаёт/обновляет запись AppUpdate.
  // Если файл этой версии уже загружен на сервер — ссылка ставится на сервер,
  // иначе используется внешняя прямая ссылка из формы.
  app.post('/api/updates', async (req: Request, res: Response) => {
    const u = (req as any).authUser;
    if (!u || u.role !== 'ADMIN') return res.status(403).json({ error: 'Публикация обновлений доступна только администратору' });
    const version = sanitizeVersion(req.body?.version);
    if (!version) return res.status(400).json({ error: 'Укажите номер версии' });
    const changelog = String(req.body?.changelog || '').slice(0, 20000);
    const hasLocalFile = fs.existsSync(updateFilePath(version));
    const fileUrl = hasLocalFile ? `/api/updates/download/${version}` : String(req.body?.fileUrl || '').trim();
    if (!fileUrl) return res.status(400).json({ error: 'Загрузите файл exe на сервер или укажите прямую ссылку' });
    try {
      const update = await deps.getPrisma().appUpdate.upsert({
        where: { version },
        update: { changelog, fileUrl },
        create: { version, changelog, fileUrl },
      });
      // Мгновенное оповещение всем, кто сейчас онлайн
      deps.broadcast('app:update-published', { version, changelog });
      // И запись в уведомления — чтобы узнал и тот, кто был не в программе
      await deps.notifyAll('СИСТЕМА', `Вышла версия ${version}`,
        String(changelog || '').split('\n')[0].slice(0, 120),
        '/settings?section=updates', String(u.id || ''));
      res.json({ success: true, update });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Не удалось опубликовать релиз' });
    }
  });

  /**
   * Отозвать опубликованный релиз (только админ).
   *
   * Опубликовать не тот файл или не ту версию — обычное дело, а до этой правки
   * отозвать публикацию было нечем: запись жила в базе навсегда, и у всех
   * сотрудников горел значок обновления, которое ставить не надо.
   */
  app.delete('/api/updates/:version', async (req: Request, res: Response) => {
    const u = (req as any).authUser;
    if (!u || u.role !== 'ADMIN') return res.status(403).json({ error: 'Отзыв релиза доступен только администратору' });
    const version = sanitizeVersion(req.params.version);
    if (!version) return res.status(400).json({ error: 'Не указана версия' });
    try {
      await deps.getPrisma().appUpdate.deleteMany({ where: { version } });
      // Файл убираем вместе с записью: раздавать его больше некому
      try { if (fs.existsSync(updateFilePath(version))) fs.unlinkSync(updateFilePath(version)); } catch (_) {}
      res.json({ success: true, version });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Не удалось отозвать релиз' });
    }
  });

  // Скачивание exe с сервера (токен обязателен — проверяет общий middleware)
  /**
   * Раздача exe: сначала с диска этого сервера, потом из общей базы.
   *
   * Диск — быстрый путь для того, кто публиковал. Все остальные берут файл из
   * общей базы: у них на диске его нет и взяться ему неоткуда.
   */
  app.get('/api/updates/download/:version', async (req: Request, res: Response) => {
    const version = sanitizeVersion(req.params.version);
    if (!version) return res.status(404).json({ error: 'Версия не указана' });

    const filePath = updateFilePath(version);
    if (fs.existsSync(filePath)) return res.download(filePath, `Flux ${version}.exe`);

    try {
      await ensureUpdateChunks();
      const parts = await deps.getPrisma().appUpdateChunk.findMany({
        where: { version }, orderBy: { idx: 'asc' }, select: { idx: true },
      });
      if (!parts.length) {
        return res.status(404).json({
          error: 'Файла этой версии нет ни на этом сервере, ни в общей базе. '
            + 'Администратору нужно опубликовать релиз заново.',
        });
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="Flux ${version}.exe"`);
      // По куску за раз: 130 МБ целиком в память сервера класть незачем
      for (const p of parts) {
        const row = await deps.getPrisma().appUpdateChunk.findFirst({
          where: { version, idx: p.idx }, select: { data: true },
        });
        if (row?.data) res.write(Buffer.from(row.data));
      }
      res.end();
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Не удалось отдать файл обновления' });
    }
  });

}
