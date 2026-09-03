/**
 * Журналы программы: папка на рабочем столе, файл на день, уборка старого.
 *
 * Раньше запись шла в AppData под именем вида `pdm-crash-log-<время>.txt`, по
 * файлу на падение. Три беды сразу: человек не мог их найти («где эти ваши
 * логи?»), файлов накапливались сотни, и самое главное — падения раздела туда
 * вообще не доходили: их ловила граница ошибок в интерфейсе и оставляла себе.
 *
 * Теперь папка одна, лежит на рабочем столе, создаётся один раз и называется
 * так, чтобы её было видно: «Flux — журналы». Внутри по файлу на день —
 * человек может открыть сегодняшний и отдать его целиком. Старше тридцати
 * дней убираются сами: иначе через год на столе будет триста шестьдесят пять
 * файлов, и папка из помощи превратится в мусор.
 */
import { app, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';

/** Сколько дней держим журналы. Дальше они уже никому не помогут */
const KEEP_DAYS = 30;

export const LOG_FOLDER_NAME = 'Flux — журналы';

const pad = (n: number) => String(n).padStart(2, '0');

/** Папка журналов: рабочий стол, а если его нет — рядом с данными программы */
export function logsDir(): string {
  let base = '';
  try { base = app.getPath('desktop'); } catch (_) { base = ''; }
  if (!base) {
    try { base = app.getPath('userData'); } catch (_) { base = process.cwd(); }
  }
  const dir = path.join(base, LOG_FOLDER_NAME);
  try {
    // Один раз: существующую папку не пересоздаём и не трогаем
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) { /* стол защищён от записи — писать будем в память */ }
  return dir;
}

const fileFor = (d = new Date()): string =>
  path.join(logsDir(), `flux-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`);

/** Строка журнала: время, откуда и что случилось */
/**
 * Пароль в журнал не попадает.
 *
 * Журнал уходит владельцу и в переписку с поддержкой; строка подключения к
 * общей базе однажды уже уехала туда открытым текстом, вместе с паролем. Своя
 * маленькая копия правила, а не общий модуль: главный процесс не тянет код
 * окна — это граница слоёв (scripts/test-architecture.ts).
 */
const hidePasswords = (text: string): string => String(text || '')
  .replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/g, '$1$2:***@')
  .replace(/\b(password|pwd|pass)\s*=\s*[^\s;&]+/gi, '$1=***');

export function appendLog(level: string, where: string, text: string): void {
  try {
    const d = new Date();
    const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const line = `[${stamp}] ${String(level || 'INFO').toUpperCase()} · ${where || '—'} · ${hidePasswords(String(text || '')).replace(/\s+/g, ' ')}\n`;
    fs.appendFileSync(fileFor(d), line, 'utf-8');
  } catch (_) { /* не записалось — программа из-за журнала падать не должна */ }
}

/** Уборка: файлы старше тридцати дней. Раз в запуск, молча */
export function pruneLogs(): void {
  try {
    const dir = logsDir();
    const edge = Date.now() - KEEP_DAYS * 86400000;
    for (const name of fs.readdirSync(dir)) {
      if (!/^flux-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).mtimeMs < edge) fs.unlinkSync(full);
    }
  } catch (_) { /* папки нет или занята — не беда */ }
}

/** Сегодняшний журнал целиком: его прикладывают к сообщению об ошибке */
export function readToday(limit = 200_000): string {
  try {
    const text = fs.readFileSync(fileFor(), 'utf-8');
    return text.length > limit ? text.slice(text.length - limit) : text;
  } catch (_) { return ''; }
}

export function setupLogs(): void {
  pruneLogs();
  appendLog('INFO', 'Программа', `Запуск, версия ${app.getVersion()}`);

  ipcMain.handle('logs:append', (_e, p: { level?: string; where?: string; text?: string }) => {
    appendLog(String(p?.level || 'ERROR'), String(p?.where || ''), String(p?.text || ''));
    return true;
  });

  ipcMain.handle('logs:today', () => readToday());
  ipcMain.handle('logs:folder', () => logsDir());
  ipcMain.handle('logs:open-folder', async () => {
    try { await shell.openPath(logsDir()); return true; } catch (_) { return false; }
  });
}
