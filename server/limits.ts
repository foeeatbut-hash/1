/**
 * Насколько большой файл примет ЭТА база.
 *
 * Вопрос не праздный. Содержимое файла хранится строкой в записи файла, а у
 * MariaDB есть предел размера пакета (`max_allowed_packet`): строка больше него
 * не записывается, и база не отвечает ошибкой, а разрывает соединение. Программа
 * при этом видит «connection closed» — сообщение, по которому причину не
 * угадать. Ровно на это уже потрачен день при отправке файла обновления.
 *
 * Поэтому предел спрашивается у базы и объявляется окну заранее: отказ «файл
 * больше, чем принимает ваша база» человек читает ДО переноса, а не после
 * получаса ожидания.
 *
 * Base64 раздувает содержимое на треть — это учтено здесь, а не в трёх местах,
 * которые про base64 знать не обязаны.
 */
import type { Express, Request, Response } from 'express';
import { getDialect } from './ddl.js';

/** Потолок, выше которого не поднимаемся даже на просторной базе */
export const FILE_CEILING = 25 * 1024 * 1024;
/** Если спросить не удалось — столько принимала программа и раньше */
export const FILE_FALLBACK = 5 * 1024 * 1024;

/** Содержимое едет в base64: на диске 3 байта превращаются в 4 символа */
export const BASE64_GROWTH = 4 / 3;

/**
 * Из предела пакета — предел размера файла. Половина предела с запасом: в
 * пакет кроме содержимого едет и сам запрос, и остальные поля записи.
 */
export function fileLimitFor(packet: number): number {
  if (!packet) return FILE_CEILING;
  const room = Math.floor(packet / 2) - 64 * 1024;
  return Math.max(0, Math.min(FILE_CEILING, Math.floor(room / BASE64_GROWTH)));
}

export function registerLimitRoutes(app: Express, getPrisma: () => any): void {
  // Ответ не меняется, пока работает программа: спрашивать базу на каждый
  // перенос незачем
  let cached = 0;

  app.get('/api/limits', async (_req: Request, res: Response) => {
    if (cached) return res.json({ maxFileBytes: cached });
    let packet = 0;
    if (getDialect() === 'mysql') {
      try {
        const rows: any = await getPrisma().$queryRawUnsafe('SELECT @@max_allowed_packet AS n');
        packet = Number(rows?.[0]?.n || 0);
      } catch (_) { packet = 0; }
    }
    // У SQLite и PostgreSQL предела пакета нет — там держим общий потолок
    cached = getDialect() === 'mysql' ? Math.max(FILE_FALLBACK, fileLimitFor(packet)) : FILE_CEILING;
    res.json({ maxFileBytes: cached, packet });
  });
}
