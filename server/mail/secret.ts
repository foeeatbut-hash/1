import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Хранение пароля от чужого почтового ящика.
 *
 * Это единственное место в программе, где чужой секрет лежит в восстановимом
 * виде: пароль от почты нельзя хешировать, его надо предъявлять серверу при
 * каждом соединении. Отсюда все решения ниже.
 *
 * Шифр — AES-256-GCM: он не только скрывает пароль, но и заверяет его. Если
 * файл базы правили руками, расшифровка честно откажет, а не выдаст мусор,
 * который потом уйдёт на почтовый сервер как пароль.
 *
 * Ключ берётся в таком порядке:
 *  1. safeStorage Electron — на Windows это DPAPI, ключ привязан к учётной
 *     записи Windows. Скопированная на другую машину база не расшифруется.
 *  2. Файл рядом с настройками, права 600. Слабее, но работает и когда
 *     программа поднята без Electron — например, сервером в конторе.
 *
 * Наружу пароль не отдаётся никогда: ни в ответе маршрута, ни в журнале, ни в
 * тексте ошибки. Раздел знает только «задан» или «не задан».
 */

const ALGO = 'aes-256-gcm';
const KEY_FILE = 'mail.key';

let cachedKey: Buffer | null = null;

/** Каталог данных программы — тот же, где база и файлы Чата. */
function dataDir(): string {
  const fromEnv = process.env.VENT_APP_DATA;
  if (fromEnv) return fromEnv;
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  if (process.platform === 'win32') return path.join(process.env.APPDATA || home, 'pdm-app');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'pdm-app');
  return path.join(home, '.config', 'pdm-app');
}

/**
 * Ключ из safeStorage, если программа запущена внутри Electron.
 * Требовать electron жёстко нельзя: сервер собирается и запускается отдельно,
 * и обычный import уронил бы его на старте.
 */
function keyFromSafeStorage(): Buffer | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    const safe = electron?.safeStorage;
    if (!safe || !safe.isEncryptionAvailable()) return null;

    const file = path.join(dataDir(), 'mail.key.enc');
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file);
      const key = safe.decryptString(raw);
      if (key) return Buffer.from(key, 'base64');
    }
    // Первый запуск: заводим ключ и отдаём его на хранение системе
    const fresh = crypto.randomBytes(32).toString('base64');
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(file, safe.encryptString(fresh));
    return Buffer.from(fresh, 'base64');
  } catch (_) {
    return null;
  }
}

/** Запасной ключ: файл с правами 600. */
function keyFromFile(): Buffer {
  const dir = dataDir();
  const file = path.join(dir, KEY_FILE);
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8').trim();
      const key = Buffer.from(raw, 'base64');
      if (key.length === 32) return key;
    }
  } catch (_) { /* переписываем ниже */ }

  const fresh = crypto.randomBytes(32);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, fresh.toString('base64'), { encoding: 'utf-8', mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch (_) { /* на Windows прав нет — там работает DPAPI */ }
  return fresh;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = keyFromSafeStorage() || keyFromFile();
  return cachedKey;
}

/** Где именно лежит ключ — показываем в разделе, чтобы человек знал. */
export function keySource(): 'system' | 'file' {
  return keyFromSafeStorage() ? 'system' : 'file';
}

export interface Sealed { secret: string; nonce: string }

/** Зашифровать пароль. Пустая строка остаётся пустой — «пароль не задан». */
export function seal(plain: string): Sealed {
  if (!plain) return { secret: '', nonce: '' };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Метка подлинности хранится вместе с шифротекстом — иначе её негде взять
  return { secret: Buffer.concat([enc, tag]).toString('base64'), nonce: iv.toString('base64') };
}

/**
 * Расшифровать. Возвращает пустую строку, если пароля нет или он не сходится:
 * вызывающий обязан считать это «войти нельзя», а не «пароль пустой».
 */
export function unseal(sealed: string, nonce: string): string {
  if (!sealed || !nonce) return '';
  try {
    const raw = Buffer.from(sealed, 'base64');
    const tag = raw.subarray(raw.length - 16);
    const enc = raw.subarray(0, raw.length - 16);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(nonce, 'base64'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf-8');
  } catch (_) {
    return '';
  }
}

/**
 * Ящик в том виде, в каком его можно отдать в браузер: без пароля, но со
 * знанием, задан ли он. Через эту функцию обязан проходить каждый ответ
 * маршрута — иначе пароль однажды уедет в браузер по недосмотру.
 */
export function publicAccount(a: any) {
  if (!a) return null;
  const { secret, secretNonce, ...rest } = a;
  return { ...rest, hasSecret: Boolean(secret) };
}
