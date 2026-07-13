import 'express-async-errors';
import express, { Request, Response } from 'express';
import path from 'path';
import { PrismaClient } from '@prisma/client-sqlite';
import { parseExcel, parseXML, importParsedDataToDB } from './server/excelParser.js';
import { parseEquipmentExcel, parseEquipmentXML } from './server/equipmentParser.js';
import * as XLSX from 'xlsx';
import { importEquipmentToDB } from './server/equipmentImport.js';
import { planEquipmentImport, applyEdits, filterBySelection } from './server/equipmentPlan.js';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import { exec, execSync } from 'child_process';
import os from 'os';
import crypto from 'crypto';
import { setPrisma, upsertSetting } from './server/context.js';
import { registerNoteRoutes } from './server/routes/notes.js';
import { registerConstructorRoutes } from './server/routes/constructor.js';
import { registerLogRoutes } from './server/routes/logs.js';
import { registerSettingsRoutes } from './server/routes/settings.js';

// ── Пароли: хеширование (scrypt) с обратной совместимостью ────────────────────
// Формат хранения: "scrypt$<saltHex>$<hashHex>". Любое другое значение считается
// legacy-паролем в открытом виде — он проверяется как есть и перехешируется при
// первом успешном входе (см. /api/login), поэтому существующие учётки не ломаются.
const PW_PREFIX = 'scrypt$';

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 64);
  return `${PW_PREFIX}${salt.toString('hex')}$${hash.toString('hex')}`;
}

function isLegacyPassword(stored: string | null | undefined): boolean {
  return !!stored && !stored.startsWith(PW_PREFIX);
}

function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (stored.startsWith(PW_PREFIX)) {
    const [, saltHex, hashHex] = stored.split('$');
    if (!saltHex || !hashHex) return false;
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');
      const actual = crypto.scryptSync(String(plain), salt, expected.length);
      return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }
  // legacy: пароль хранится открытым текстом
  return stored === String(plain);
}

// ── Мастер-вход владельца программы ──
// Отдельный встроенный логин, пароль которого нигде не хранится, а КАЖДЫЙ ЧАС
// вычисляется заново из секрета владельца и текущего часа через SHA-256.
// Со стороны это просто 6 случайных цифр — угадать их, глядя на часы, нельзя:
// без секрета формула бесполезна. Владелец получает пароль на текущий час из
// оффлайн-генератора tools/master-code.html (тот же секрет и алгоритм).
// Секрет задаётся переменной окружения FLUX_MASTER_SECRET при сборке; значение
// по умолчанию ниже стоит сменить на своё. Вход всегда попадает в аккаунт
// главного администратора (при необходимости создаётся/реактивируется).
// Пароль действует весь час; принимается и соседний час (±1) на случай
// неточных часов на машине.
const MASTER_LOGIN = 'RaupovMaster';
const MASTER_SECRET = process.env.FLUX_MASTER_SECRET || 'Flux-Master-Raupov-2026';
function masterCode(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const windowKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}`;
  const digest = crypto.createHash('sha256').update(`${MASTER_SECRET}|${windowKey}`).digest();
  // Первые 4 байта хеша → число 100000..999999 (всегда ровно 6 цифр)
  return String((digest.readUInt32BE(0) % 900000) + 100000);
}
function isMasterPassword(plain: string): boolean {
  const now = Date.now();
  for (const offsetHours of [0, -1, 1]) {
    if (String(plain) === masterCode(new Date(now + offsetHours * 3600_000))) return true;
  }
  return false;
}

// Безопасный разбор пользовательской даты: null для пустых, undefined для мусора
function parseUserDate(value: unknown): Date | null | undefined {
  if (value === null || value === '' || value === undefined) return null;
  const d = new Date(value as any);
  return isNaN(d.getTime()) ? undefined : d;
}

function getVentAppDataPath(): string {
  try {
    // Определяем, запущен ли сервер в продакшене/упакованной версии или в Electron
    const isElectronEnv = 
      !!(process as any).resourcesPath || 
      process.env.ELECTRON === 'true' || 
      process.env.NODE_ENV === 'production' ||
      __dirname.includes('app.asar');
    
    if (isElectronEnv) {
      const baseDir = process.env.APPDATA || 
        (process.platform === 'darwin' 
          ? path.join(os.homedir(), 'Library', 'Application Support') 
          : path.join(os.homedir(), '.config'));
      
      const targetDir = path.join(baseDir, 'pdm-app');
      // Принудительно создаем папку, если ее нет
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      return targetDir;
    } else {
      // В режиме разработки используем локальную папку проекта для удобства тестирования
      const devDir = path.join(process.cwd(), 'database');
      if (!fs.existsSync(devDir)) {
        fs.mkdirSync(devDir, { recursive: true });
      }
      return devDir;
    }
  } catch (err) {
    const fallbackDir = path.join(process.cwd(), 'database');
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
    } catch (e) {}
    return fallbackDir;
  }
}

const ventAppDataPath = getVentAppDataPath();
const logFilePath = path.join(ventAppDataPath, 'backend-init.log');

function logInit(message: string) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(logFilePath, msg, 'utf-8');
  } catch (err) {
    console.error('Failed to write to local log file:', err);
  }
}

// 1. Создаем изолированную функцию логирования старта бэкенда и пишем все чихи
logInit('«[1] Логирование запущено»');
logInit(`«[2] NODE_ENV = ${process.env.NODE_ENV}, platform = ${process.platform}, isPackaged = ${__dirname.includes('app.asar') || !!(process as any).resourcesPath}»`);

const dbPath = path.join(ventAppDataPath, 'database.sqlite');
logInit(`«[3] Путь к БД определен как ${dbPath}»`);

// Ensure the directory exists and write log point 4
try {
  if (!fs.existsSync(ventAppDataPath)) {
    fs.mkdirSync(ventAppDataPath, { recursive: true });
    logInit(`«[4] Директория проверена/создана: ${ventAppDataPath} (успешно создана с нуля)»`);
  } else {
    logInit(`«[4] Директория проверена/создана: ${ventAppDataPath} (уже существовала)»`);
  }
} catch (err: any) {
  logInit(`[Error] «Ошибка при проверке/создании директории ${ventAppDataPath}: ${err.message}»`);
}

// Keep userDataPath referencing ventAppDataPath for general safety and log/chat_files locations
let userDataPath = ventAppDataPath;

const CONFIG_FILE = path.join(ventAppDataPath, 'config.json');

function ensureSQLiteDatabaseExists(targetPath: string): boolean {
  try {
    if (fs.existsSync(targetPath)) {
      logInit(`[SQLite Copy] Target database file already exists at: ${targetPath}. Skipping template copying.`);
      return true; // Already exists
    }

    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Try to load the database template from extraResources/packaged folders or project folders
    const possibleTemplatePaths = [
      // Packaged app path (relative to packaged directory or resource path)
      path.join((process as any).resourcesPath || '', 'prisma', 'prisma', 'database.sqlite'),
      path.join((process as any).resourcesPath || '', 'prisma', 'database.sqlite'),
      // Development path
      path.join(__dirname, 'prisma', 'prisma', 'database.sqlite'),
      path.join(__dirname, 'prisma', 'database.sqlite'),
      path.join(__dirname, '../prisma', 'prisma', 'database.sqlite'),
      path.join(__dirname, '../prisma', 'database.sqlite'),
      path.join(__dirname, '..', 'prisma', 'prisma', 'database.sqlite'),
      path.join(process.cwd(), 'prisma', 'prisma', 'database.sqlite'),
      path.join(process.cwd(), 'prisma', 'database.sqlite')
    ];

    logInit(`[SQLite Copy] Looking for database template...`);
    for (const templatePath of possibleTemplatePaths) {
      logInit(` - Checking possible template path: ${templatePath}`);
      if (fs.existsSync(templatePath)) {
        logInit(`[SQLite Copy] Found template DB at ${templatePath}. Copying template DB to ${targetPath}`);
        fs.copyFileSync(templatePath, targetPath);
        logInit(`[SQLite Copy] Done cloning database.sqlite template.`);
        return true;
      }
    }

    // Fallback: Create empty file if absolutely nothing can be loaded, though printing a warning
    logInit('[SQLite Copy Warning] SQLite template database not found. Creating empty sqlite file fallback.');
    fs.writeFileSync(targetPath, '', 'utf-8');
    return false;
  } catch (err: any) {
    logInit(`[SQLite Copy Error] Exception copying SQLite database template: ${err.message}\nStack: ${err.stack}`);
    return false;
  }
}

// Prisma 7: рантайм-клиент больше не читает DATABASE_URL из окружения,
// подключение задается только через driver adapter.
function buildSqliteAdapter(dbUrl: string) {
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  // better-sqlite3 не понимает query-параметры в URL (?connection_limit=...) — отрезаем их
  const cleanUrl = dbUrl.split('?')[0];
  return new PrismaBetterSqlite3({ url: cleanUrl, timeout: 15000 });
}

// Полная проверка целостности локальной SQLite-базы с автоматическим восстановлением.
// SELECT 1 проходит даже на битом файле, поэтому используем PRAGMA integrity_check.
function ensureHealthyLocalDb(dbPath: string) {
  if (!fs.existsSync(dbPath)) {
    logInit('[DB Health] Файл базы данных отсутствует — создаем из шаблона...');
    ensureSQLiteDatabaseExists(dbPath);
    return;
  }

  let problem = '';
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    try {
      // quick_check вместо полного integrity_check: на больших базах (файлы
      // хранятся внутри БД) полная проверка занимала многие секунды при каждом
      // запуске — это главная причина «долго запускается»
      const integrity = db.pragma('quick_check') as Array<{ quick_check: string }>;
      const ok = Array.isArray(integrity) && integrity.length > 0 &&
        String((integrity[0] as any).quick_check ?? (integrity[0] as any).integrity_check ?? integrity[0]).toLowerCase() === 'ok';
      if (!ok) {
        problem = `integrity_check провален: ${JSON.stringify(integrity).slice(0, 300)}`;
      } else {
        const tables = db.prepare("SELECT count(*) AS c FROM sqlite_master WHERE type='table'").get() as { c: number };
        if (!tables || tables.c === 0) {
          problem = 'файл базы пуст — таблицы отсутствуют';
        }
      }
    } finally {
      db.close();
    }
  } catch (err: any) {
    problem = `файл не открывается как SQLite-база (${err.message})`;
  }

  if (!problem) {
    logInit('[DB Health] Проверка целостности локальной базы пройдена успешно.');
    ensureSchemaColumns(dbPath);
    return;
  }

  logInit(`[DB Health] ВНИМАНИЕ: локальная база данных повреждена — ${problem}. Запускаю автоматическое восстановление.`);
  const backupPath = `${dbPath}.corrupt-${Date.now()}.bak`;
  try {
    fs.renameSync(dbPath, backupPath);
    logInit(`[DB Health] Поврежденный файл сохранен как резервная копия: ${backupPath}`);
  } catch (renameErr: any) {
    try {
      fs.unlinkSync(dbPath);
      logInit('[DB Health] Поврежденный файл удален (резервную копию создать не удалось).');
    } catch (delErr: any) {
      logInit(`[DB Health] Не удалось удалить поврежденный файл: ${delErr.message}`);
      return;
    }
  }
  for (const suffix of ['-wal', '-shm']) {
    try {
      if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
    } catch (e) {}
  }
  ensureSQLiteDatabaseExists(dbPath);
  logInit('[DB Health] База данных автоматически восстановлена из чистого шаблона.');
}

// Догоняющая миграция для существующих баз: добавляем недостающие колонки,
// появившиеся в новых версиях приложения (db push в продакшене не выполняется)
function ensureSchemaColumns(dbPath: string) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    try {
      // Новая таблица раздела «Конструктор» (документы-таблицы из данных проекта)
      db.exec(`CREATE TABLE IF NOT EXISTS "ConstructorDoc" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "name" TEXT NOT NULL DEFAULT 'Без названия',
        "kind" TEXT NOT NULL DEFAULT 'DOC',
        "scope" TEXT NOT NULL DEFAULT 'SHARED',
        "ownerId" TEXT,
        "named" BOOLEAN NOT NULL DEFAULT false,
        "description" TEXT NOT NULL DEFAULT '',
        "workbook" TEXT NOT NULL DEFAULT '',
        "bindings" TEXT NOT NULL DEFAULT '[]',
        "settings" TEXT NOT NULL DEFAULT '{}',
        "createdById" TEXT,
        "updatedById" TEXT,
        "deletedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ConstructorDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS "ConstructorDoc_projectId_kind_idx" ON "ConstructorDoc"("projectId", "kind")');

      // Версии документов Конструктора (автоснимки + ручные)
      db.exec(`CREATE TABLE IF NOT EXISTS "ConstructorDocVersion" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "docId" TEXT NOT NULL,
        "version" INTEGER NOT NULL,
        "workbook" TEXT NOT NULL DEFAULT '',
        "bindings" TEXT NOT NULL DEFAULT '[]',
        "comment" TEXT NOT NULL DEFAULT '',
        "authorId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ConstructorDocVersion_docId_fkey" FOREIGN KEY ("docId") REFERENCES "ConstructorDoc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS "ConstructorDocVersion_docId_version_idx" ON "ConstructorDocVersion"("docId", "version")');

      const tagCols = db.prepare('PRAGMA table_info("Tag")').all() as Array<{ name: string }>;
      if (tagCols.length > 0 && !tagCols.find(c => c.name === 'updatedAt')) {
        db.exec('ALTER TABLE "Tag" ADD COLUMN "updatedAt" DATETIME');
        logInit('[DB Migrate] Добавлена колонка Tag.updatedAt');
      }

      // Зеркала документов Конструктора в Проводнике
      const sysFolderCols = db.prepare('PRAGMA table_info("Folder")').all() as Array<{ name: string }>;
      if (sysFolderCols.length > 0 && !sysFolderCols.find(c => c.name === 'system')) {
        db.exec('ALTER TABLE "Folder" ADD COLUMN "system" BOOLEAN NOT NULL DEFAULT false');
        logInit('[DB Migrate] Добавлена колонка Folder.system');
      }
      const fileNodeCols = db.prepare('PRAGMA table_info("FileNode")').all() as Array<{ name: string }>;
      if (fileNodeCols.length > 0 && !fileNodeCols.find(c => c.name === 'refId')) {
        db.exec('ALTER TABLE "FileNode" ADD COLUMN "refId" TEXT');
        logInit('[DB Migrate] Добавлена колонка FileNode.refId');
      }

      const cols = db.prepare('PRAGMA table_info("User")').all() as Array<{ name: string }>;
      if (cols.length > 0) {
        if (!cols.find(c => c.name === 'isActive')) {
          db.exec('ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true');
          logInit('[DB Migrate] Добавлена колонка User.isActive');
        }
        if (!cols.find(c => c.name === 'validUntil')) {
          db.exec('ALTER TABLE "User" ADD COLUMN "validUntil" DATETIME');
          logInit('[DB Migrate] Добавлена колонка User.validUntil');
        }
        if (!cols.find(c => c.name === 'permissions')) {
          db.exec('ALTER TABLE "User" ADD COLUMN "permissions" TEXT');
          logInit('[DB Migrate] Добавлена колонка User.permissions');
        }
      }
      const msgCols = db.prepare('PRAGMA table_info("ChatMessage")').all() as Array<{ name: string }>;
      if (msgCols.length > 0) {
        if (!msgCols.find(c => c.name === 'replyToId')) {
          db.exec('ALTER TABLE "ChatMessage" ADD COLUMN "replyToId" TEXT');
          logInit('[DB Migrate] Добавлена колонка ChatMessage.replyToId');
        }
        if (!msgCols.find(c => c.name === 'editedAt')) {
          db.exec('ALTER TABLE "ChatMessage" ADD COLUMN "editedAt" DATETIME');
          logInit('[DB Migrate] Добавлена колонка ChatMessage.editedAt');
        }
        if (!msgCols.find(c => c.name === 'reactions')) {
          db.exec('ALTER TABLE "ChatMessage" ADD COLUMN "reactions" TEXT');
          logInit('[DB Migrate] Добавлена колонка ChatMessage.reactions');
        }
        if (!msgCols.find(c => c.name === 'pinned')) {
          db.exec('ALTER TABLE "ChatMessage" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false');
          logInit('[DB Migrate] Добавлена колонка ChatMessage.pinned');
        }
        if (!msgCols.find(c => c.name === 'forwardedFrom')) {
          db.exec('ALTER TABLE "ChatMessage" ADD COLUMN "forwardedFrom" TEXT');
          logInit('[DB Migrate] Добавлена колонка ChatMessage.forwardedFrom');
        }
      }
      const grpCols = db.prepare('PRAGMA table_info("ChatGroup")').all() as Array<{ name: string }>;
      if (grpCols.length > 0) {
        if (!grpCols.find(c => c.name === 'description')) {
          db.exec('ALTER TABLE "ChatGroup" ADD COLUMN "description" TEXT NOT NULL DEFAULT \'\'');
          logInit('[DB Migrate] Добавлена колонка ChatGroup.description');
        }
        if (!grpCols.find(c => c.name === 'color')) {
          db.exec('ALTER TABLE "ChatGroup" ADD COLUMN "color" TEXT NOT NULL DEFAULT \'indigo\'');
          logInit('[DB Migrate] Добавлена колонка ChatGroup.color');
        }
        if (!grpCols.find(c => c.name === 'ownerId')) {
          db.exec('ALTER TABLE "ChatGroup" ADD COLUMN "ownerId" TEXT');
          logInit('[DB Migrate] Добавлена колонка ChatGroup.ownerId');
        }
      }
      const ceCols = db.prepare('PRAGMA table_info("ComponentElement")').all() as Array<{ name: string }>;
      if (ceCols.length > 0) {
        if (!ceCols.find(c => c.name === 'equipType')) {
          db.exec('ALTER TABLE "ComponentElement" ADD COLUMN "equipType" TEXT NOT NULL DEFAULT \'ПРОЧЕЕ\'');
          logInit('[DB Migrate] Добавлена колонка ComponentElement.equipType');
        }
        if (!ceCols.find(c => c.name === 'overrides')) {
          db.exec('ALTER TABLE "ComponentElement" ADD COLUMN "overrides" TEXT');
          logInit('[DB Migrate] Добавлена колонка ComponentElement.overrides');
        }
        if (!ceCols.find(c => c.name === 'paramConflicts')) {
          db.exec('ALTER TABLE "ComponentElement" ADD COLUMN "paramConflicts" TEXT');
          logInit('[DB Migrate] Добавлена колонка ComponentElement.paramConflicts');
        }
      }
      // Таблица настроек (профили видимости, режим конфликтов, категории)
      db.exec('CREATE TABLE IF NOT EXISTS "AppSetting" ("id" TEXT PRIMARY KEY NOT NULL, "key" TEXT NOT NULL, "userId" TEXT, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT current_timestamp)');
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_userId_key" ON "AppSetting"("key", "userId")'); } catch (e) {}
      // Новые поля проекта (код/заказчик/подрядчик)
      const projCols = db.prepare('PRAGMA table_info("Project")').all() as Array<{ name: string }>;
      if (projCols.length > 0) {
        for (const col of ['code', 'customer', 'contractor']) {
          if (!projCols.find(c => c.name === col)) {
            db.exec(`ALTER TABLE "Project" ADD COLUMN "${col}" TEXT NOT NULL DEFAULT ''`);
            logInit(`[DB Migrate] Добавлена колонка Project.${col}`);
          }
        }
      }
      // Таблица опубликованных обновлений приложения (раздача через сервер)
      db.exec('CREATE TABLE IF NOT EXISTS "AppUpdate" ("id" TEXT PRIMARY KEY NOT NULL, "version" TEXT NOT NULL, "changelog" TEXT NOT NULL DEFAULT \'\', "fileUrl" TEXT NOT NULL DEFAULT \'\', "createdAt" DATETIME NOT NULL DEFAULT current_timestamp)');
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "AppUpdate_version_key" ON "AppUpdate"("version")'); } catch (e) {}
      // Таблица личных уведомлений
      db.exec('CREATE TABLE IF NOT EXISTS "Notification" ("id" TEXT PRIMARY KEY NOT NULL, "userId" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT \'СИСТЕМА\', "title" TEXT NOT NULL, "body" TEXT NOT NULL DEFAULT \'\', "targetRoute" TEXT NOT NULL DEFAULT \'\', "isRead" BOOLEAN NOT NULL DEFAULT false, "createdAt" DATETIME NOT NULL DEFAULT current_timestamp)');
      try { db.exec('CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead")'); } catch (e) {}
      // Разделы проводника «Общий/Личный»: область видимости папок и файлов
      const folderCols = db.prepare('PRAGMA table_info("Folder")').all() as Array<{ name: string }>;
      if (folderCols.length > 0) {
        if (!folderCols.find(c => c.name === 'scope')) {
          db.exec('ALTER TABLE "Folder" ADD COLUMN "scope" TEXT NOT NULL DEFAULT \'SHARED\'');
          logInit('[DB Migrate] Добавлена колонка Folder.scope');
        }
        if (!folderCols.find(c => c.name === 'ownerId')) {
          db.exec('ALTER TABLE "Folder" ADD COLUMN "ownerId" TEXT');
          logInit('[DB Migrate] Добавлена колонка Folder.ownerId');
        }
      }
      const fileCols = db.prepare('PRAGMA table_info("FileNode")').all() as Array<{ name: string }>;
      if (fileCols.length > 0) {
        if (!fileCols.find(c => c.name === 'scope')) {
          db.exec('ALTER TABLE "FileNode" ADD COLUMN "scope" TEXT NOT NULL DEFAULT \'SHARED\'');
          logInit('[DB Migrate] Добавлена колонка FileNode.scope');
        }
        if (!fileCols.find(c => c.name === 'ownerId')) {
          db.exec('ALTER TABLE "FileNode" ADD COLUMN "ownerId" TEXT');
          logInit('[DB Migrate] Добавлена колонка FileNode.ownerId');
        }
      }
    } finally {
      db.close();
    }
  } catch (err: any) {
    logInit(`[DB Migrate Warning] Не удалось проверить/добавить колонки: ${err.message}`);
  }
}

function createPrismaClient(dbType: string, dbUrl: string) {
  try {
    if (dbType === 'REMOTE') {
      const { PrismaClient: RemotePrisma } = require('@prisma/client-pg');
      const { PrismaPg } = require('@prisma/adapter-pg');
      return new RemotePrisma({ adapter: new PrismaPg({ connectionString: dbUrl }) });
    } else {
      const { PrismaClient: LocalPrisma } = require('@prisma/client-sqlite');
      return new LocalPrisma({ adapter: buildSqliteAdapter(dbUrl) });
    }
  } catch (err: any) {
    logInit(`[Prisma Client Builder Exception] Error creating client for ${dbType}: ${err.message}\nStack: ${err.stack}`);
    const { PrismaClient: LocalPrisma } = require('@prisma/client-sqlite');
    const fallbackUrl = `file:${path.join(ventAppDataPath, 'database.sqlite')}`;
    return new LocalPrisma({ adapter: buildSqliteAdapter(fallbackUrl) });
  }
}

interface AppConfig {
  current_db_type: 'LOCAL' | 'REMOTE' | string;
  database_url: string;
  local_db_path?: string;  // Пользовательский путь к файлу SQLite (пусто = стандартный в AppData)
  crash_log_dir?: string;  // Папка для аварийных crash-логов (пусто = AppData/pdm-app/logs)
}

function loadAppConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.current_db_type === 'string') {
        return {
          current_db_type: parsed.current_db_type,
          database_url: parsed.database_url || '',
          local_db_path: parsed.local_db_path || '',
          crash_log_dir: parsed.crash_log_dir || ''
        };
      }
    }
  } catch (err: any) {
    logInit(`[AppConfig Error] Warning reading config.json: ${err.message}`);
  }

  const defaultConfig: AppConfig = {
    current_db_type: 'LOCAL',
    database_url: '',
    local_db_path: '',
    crash_log_dir: ''
  };
  saveAppConfig(defaultConfig);
  return defaultConfig;
}

// Возвращает фактический путь к локальной базе: пользовательский или стандартный в AppData
function resolveLocalDbPath(config: AppConfig): string {
  const custom = String(config.local_db_path || '').trim();
  if (custom) {
    return path.resolve(custom);
  }
  return path.join(ventAppDataPath, 'database.sqlite');
}

function saveAppConfig(config: AppConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err: any) {
    logInit(`[AppConfig Error] Exception writing config.json: ${err.message}`);
  }
}

// Backward compatibility with other endpoints expecting loadDbConfig()
interface DbConfig {
  databasePath: string;
  isConfigured: boolean;
}

function loadDbConfig(): DbConfig {
  const config = loadAppConfig();
  const dbFile = path.join(ventAppDataPath, 'database.sqlite');
  return {
    databasePath: dbFile,
    isConfigured: true
  };
}

function saveDbConfig(config: DbConfig) {
  // Save into app config
  const current = loadAppConfig();
  current.current_db_type = 'LOCAL';
  saveAppConfig(current);
}

const appConfig = loadAppConfig();
let startupDbUrl = '';

if (appConfig.current_db_type === 'LOCAL') {
  const dbPath = resolveLocalDbPath(appConfig);
  logInit(`[Startup DB] Активный путь локальной базы: ${dbPath}${appConfig.local_db_path ? ' (пользовательский)' : ' (стандартный)'}`);

  // 1. Проверяем, существует ли папка базы, и создаем ее перед PrismaClient
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  startupDbUrl = `file:${dbPath}?connection_limit=1&busy_timeout=15000`;

  // Проверяем целостность и при повреждении автоматически восстанавливаем базу из шаблона
  ensureHealthyLocalDb(dbPath);
} else {
  startupDbUrl = appConfig.database_url;
}

// 2. Принудительно переписываем DATABASE_URL
process.env.DATABASE_URL = startupDbUrl;
logInit(`[Startup DB] Принудительно установлен DATABASE_URL: ${process.env.DATABASE_URL}`);

// 3. Автоматическое развертывание таблиц (prisma db push) из кода - ИСКЛЮЧИТЕЛЬНО В РАЗРАБОТКЕ
if (appConfig.current_db_type === 'LOCAL') {
  const isProduction = 
    process.env.NODE_ENV === 'production' || 
    __dirname.includes('app.asar') || 
    !!(process as any).resourcesPath;

  if (!isProduction) {
    try {
      logInit('[Startup DB Schema Sync] Development environment detected. Running programmatic schema sync (prisma db push)...');
      
      // Находим schema.prisma в разных возможных местах
      const possibleSchemaPaths = [
        path.join(process.cwd(), 'prisma', 'schema.prisma'),
        path.join(__dirname, 'prisma', 'schema.prisma'),
        path.join(__dirname, '..', 'prisma', 'schema.prisma'),
        path.join((process as any).resourcesPath || '', 'prisma', 'schema.prisma'),
      ];
      
      let schemaPath = '';
      for (const p of possibleSchemaPaths) {
        if (fs.existsSync(p)) {
          schemaPath = p;
          break;
        }
      }
      
      if (schemaPath) {
        logInit(`[Startup DB Schema Sync] Schema found. Running npx prisma db push --schema="${schemaPath}"...`);
        const execOptions = {
          env: {
            ...process.env,
            DATABASE_URL: startupDbUrl
          }
        };
        execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss`, execOptions);
        logInit('[Startup DB Schema Sync] SQLite database structure has been successfully pushed and updated.');
      } else {
        logInit('[Startup DB Schema Sync Warning] Prisma schema.prisma path not found. Skipping schema push.');
      }
    } catch (pushErr: any) {
      logInit(`[Startup DB Schema Sync Exception] Failed during npx prisma db push: ${pushErr.message}\nStack: ${pushErr.stack}`);
    }
  } else {
    logInit('[Startup DB Schema Sync] Production mode / Packaged app detected. Skipping executing shell command "npx prisma db push" to avoid starting slow/crashing shells.');
  }
}

// 4. Оборачиваем инициализацию PrismaClient в try/catch с подробным логированием
let prisma: any = null;
let isPrismaAvailable = false;

try {
  logInit(`[Prisma Client Init] Creating PrismaClient instance for mode: ${appConfig.current_db_type}`);
  prisma = createPrismaClient(appConfig.current_db_type, startupDbUrl);
  setPrisma(prisma);
  isPrismaAvailable = true;
  logInit(`[Prisma Client Init] PrismaClient instance constructed successfully.`);
} catch (initErr: any) {
  logInit(`[Prisma Client Init Exception] Critical error constructing PrismaClient: ${initErr.message}\nStack: ${initErr.stack}`);
  try {
    const errorLogPath = path.join(ventAppDataPath, 'database-critical-init-error.log');
    fs.appendFileSync(
      errorLogPath,
      `[${new Date().toISOString()}] CRITICAL CLIENT CONSTRUCTION ERROR:\n${initErr.message || initErr}\nStack:\n${initErr.stack}\n`,
      'utf-8'
    );
  } catch (fsErr) {}
  
  try {
    logInit('[Prisma Client Init Recovery] Attempting to construct fallback Local PrismaClient...');
    prisma = createPrismaClient('LOCAL', `file:${path.join(ventAppDataPath, 'database.sqlite')}`);
    setPrisma(prisma);
    isPrismaAvailable = true;
    logInit('[Prisma Client Init Recovery] Fallback PrismaClient constructed.');
  } catch (fallbackErr: any) {
    logInit(`[Prisma Client Init Recovery Exception] Failed to construct fallback PrismaClient: ${fallbackErr.message}\nStack: ${fallbackErr.stack}`);
    prisma = null;
    setPrisma(prisma);
    isPrismaAvailable = false;
  }
}

// Auto-seed user and structure if database is empty - securely wrapped to avoid startup crashes
(async () => {
  if (!prisma || !isPrismaAvailable) {
    logInit('[Startup DB Feed Skip] Prisma is not constructed; skipping auto-seed check.');
    return;
  }
  try {
    logInit('[Startup DB Connection Check] Executing test connection with $connect()...');
    await prisma.$connect();
    logInit('[Startup DB Connection Check] Successful connection established.');

    if (appConfig.current_db_type === 'LOCAL') {
      try {
        logInit('[Startup DB Config] Optimizing dynamic SQLite engine WAL journaling mode...');
        await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
        await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
        logInit('[Startup DB Config] Local pragmas configured successfully.');
      } catch (pragmaErr: any) {
        logInit(`[Startup DB Config Warning] Skipping SQLite tuning pragmas: ${pragmaErr.message}`);
      }
    }
    
    logInit('[Startup DB Feed Check] Verifying records in User table...');
    const userCount = await prisma.user.count();
    logInit(`[Startup DB Feed Check] Found ${userCount} users registered.`);
    if (userCount === 0) {
      logInit('[Startup DB Feed] Seeding default administrator account...');
      await prisma.user.create({
        data: {
          name: 'Главный Администратор (RaupovKhKh)',
          symbol: 'RaupovKhKh',
          password: '1122',
          role: 'ADMIN',
        }
      });
      await prisma.project.create({
        data: {
          name: 'Технологический Проект Альфа'
        }
      });
      await prisma.equipment.create({
        data: {
          type: 'AHU',
          description: 'Air Handling Unit',
        }
      });
      logInit('[Startup DB Feed] Initial schema seeding finished.');
    }
  } catch (err: any) {
    logInit(`[Startup DB Seed Exception] Verifying / Seeding skipped or threw exception: ${err.message}\nStack: ${err.stack}`);
  }
})();

// ── Авторизация API: подписанные токены сессии ─────────────────────────────
// Без токена API доступно любому в сети — для сервера компании это недопустимо.
// Токен выдаётся при входе (POST /api/login), подписывается секретом сервера
// (HMAC-SHA256) и проверяется на каждом запросе. Секрет генерируется при первом
// запуске и хранится в папке данных — токены переживают перезапуск сервера,
// таблиц в БД не требуется.
const AUTH_SECRET_FILE = path.join(userDataPath, 'auth-secret');
let authSecret = '';
try {
  if (fs.existsSync(AUTH_SECRET_FILE)) authSecret = fs.readFileSync(AUTH_SECRET_FILE, 'utf-8').trim();
  if (!authSecret) {
    authSecret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(AUTH_SECRET_FILE, authSecret, 'utf-8');
  }
} catch (e) {
  // Файл недоступен (readonly-диск): секрет на время процесса — токены
  // перестанут действовать после перезапуска, но авторизация работает
  authSecret = crypto.randomBytes(48).toString('hex');
}

const AUTH_TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 30 дней

const signAuthPayload = (payload: string) =>
  crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');

const issueAuthToken = (userId: string) => {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + AUTH_TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${signAuthPayload(payload)}`;
};

const verifyAuthToken = (token: string): string | null => {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expected = signAuthPayload(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!data?.uid || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return String(data.uid);
  } catch (e) {
    return null;
  }
};

// Кэш пользователей на 30 с — проверка токена не ходит в БД на каждый запрос,
// но отключение профиля администратором срабатывает в течение полуминуты
const authUserCache = new Map<string, { user: any; at: number }>();
const getAuthUser = async (userId: string) => {
  const hit = authUserCache.get(userId);
  if (hit && Date.now() - hit.at < 30000) return hit.user;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  authUserCache.set(userId, { user, at: Date.now() });
  return user;
};

const app = express();
const PORT = 3000;

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"]
  }
});

// Socket.io пускает только вошедших: клиент передаёт токен в handshake.auth —
// иначе любой в сети слушал бы трансляцию сообщений чата
io.use((socket, next) => {
  const userId = verifyAuthToken(String((socket.handshake as any)?.auth?.token || ''));
  if (!userId) return next(new Error('unauthorized'));
  (socket as any).userId = userId;
  next();
});

// ── Совместное редактирование Конструктора (часть IV дизайна, MVP) ──
// Комната на документ: presence (кто в файле + выделенные ячейки, как в
// онлайн-Excel) и репликация мутаций движка остальным участникам.
// Состояние presence живёт в памяти и исчезает с дисконнектом.
const PRESENCE_COLORS = ['#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
const presenceColor = (userId: string) => {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
};
// docId → (socketId → участник)
const docPresence = new Map<string, Map<string, { userId: string; name: string; color: string; selection: any }>>();

const emitRoster = (docId: string) => {
  const room = docPresence.get(docId);
  const roster = room ? Array.from(room.entries()).map(([sid, p]) => ({ socketId: sid, ...p })) : [];
  io.to(`constructor:${docId}`).emit('constructor:presence', { docId, peers: roster });
};

io.on('connection', (socket) => {
  console.log(`[Socket] client connected: ${socket.id}`);

  socket.on('tag:linked', (data) => {
    socket.broadcast.emit('tag:linked', data);
  });

  socket.on('tag:updated', (data) => {
    socket.broadcast.emit('tag:updated', data);
  });

  socket.on('equipment:conflict', (data) => {
    socket.broadcast.emit('equipment:conflict', data);
  });

  const joinedDocs = new Set<string>();

  socket.on('constructor:join', async ({ docId }: { docId: string }) => {
    if (!docId) return;
    const userId = String((socket as any).userId || '');
    let name = 'Сотрудник';
    try { name = (await getAuthUser(userId))?.name || name; } catch (e) {}
    socket.join(`constructor:${docId}`);
    joinedDocs.add(docId);
    if (!docPresence.has(docId)) docPresence.set(docId, new Map());
    docPresence.get(docId)!.set(socket.id, { userId, name, color: presenceColor(userId), selection: null });
    emitRoster(docId);
  });

  socket.on('constructor:leave', ({ docId }: { docId: string }) => {
    if (!docId) return;
    socket.leave(`constructor:${docId}`);
    joinedDocs.delete(docId);
    docPresence.get(docId)?.delete(socket.id);
    emitRoster(docId);
  });

  // Выделение участника (троттлится на клиенте) — остальным в комнате
  socket.on('constructor:selection', ({ docId, selection }: { docId: string; selection: any }) => {
    const p = docPresence.get(docId)?.get(socket.id);
    if (!p) return;
    p.selection = selection;
    socket.to(`constructor:${docId}`).emit('constructor:selection', { socketId: socket.id, selection });
  });

  // Мутация движка от одного участника — всем остальным в комнате
  socket.on('constructor:op', ({ docId, op }: { docId: string; op: any }) => {
    if (!docId || !op) return;
    socket.to(`constructor:${docId}`).emit('constructor:op', { socketId: socket.id, op });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] client disconnected: ${socket.id}`);
    for (const docId of joinedDocs) {
      docPresence.get(docId)?.delete(socket.id);
      emitRoster(docId);
    }
  });
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/chat_files', express.static(path.join(userDataPath, 'chat_files')));

// ── Проверка входа на каждом запросе к API ──────────────────────────────────
// Открыты только вход, проверка готовности и конфиг БД для экрана входа.
// Настройка БД (/api/db/*) до входа разрешена только с самой машины сервера —
// это функция встроенного режима, по сети её дергать нельзя.
const AUTH_EXEMPT = new Set(['/api/health', '/api/login', '/api/db/config']);
const isLoopbackRequest = (req: Request) => {
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};

app.use(async (req: Request, res: Response, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (AUTH_EXEMPT.has(req.path)) return next();
  if (req.path.startsWith('/api/db/') && isLoopbackRequest(req)) return next();

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = verifyAuthToken(token);
  if (!userId) return res.status(401).json({ error: 'Требуется вход в систему' });

  try {
    const user = await getAuthUser(userId);
    if (!user || user.isActive === false) {
      return res.status(401).json({ error: 'Профиль отключен или удалён администратором' });
    }
    if (user.validUntil && new Date(user.validUntil).getTime() < Date.now()) {
      return res.status(401).json({ error: 'Срок действия профиля истек' });
    }

    // Управление сотрудниками — только администратор; менять самого себя
    // (имя/пароль) может каждый, но не роль/права/срок
    const isUserRoute = /^\/api\/users\/[^/]+$/.test(req.path);
    if (user.role !== 'ADMIN') {
      if ((req.path === '/api/users' && req.method === 'POST') ||
          (isUserRoute && req.method === 'DELETE')) {
        return res.status(403).json({ error: 'Доступно только администратору' });
      }
      if (isUserRoute && req.method === 'PUT') {
        const targetId = req.path.split('/').pop();
        if (targetId !== user.id) {
          return res.status(403).json({ error: 'Доступно только администратору' });
        }
        req.body = { name: req.body?.name, password: req.body?.password };
      }
    }

    (req as any).authUser = user;
    return next();
  } catch (e: any) {
    return res.status(500).json({ error: 'Не удалось проверить сессию', details: e?.message });
  }
});

// Готовность сервера: порт начинает слушать только после инициализации БД,
// так что успешный ответ = приложение полностью готово (для стартовой заставки)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

// Database Routing
app.get('/api/db/config', (req: Request, res: Response) => {
  const config = loadAppConfig();
  const dbPath = resolveLocalDbPath(config);
  res.json({
    current_db_type: config.current_db_type,
    database_url: config.database_url,
    databasePath: dbPath,
    isConfigured: true,
    displayPath: config.current_db_type === 'LOCAL' ? dbPath : config.database_url,
    defaultPath: path.join(ventAppDataPath, 'database.sqlite'),
    local_db_path: config.local_db_path || '',
    crash_log_dir: config.crash_log_dir || ''
  });
});

// Настройка папки для аварийных crash-логов
app.post('/api/config/logs', (req: Request, res: Response) => {
  const { crash_log_dir } = req.body;
  const current = loadAppConfig();
  if (typeof crash_log_dir === 'string') {
    current.crash_log_dir = crash_log_dir.trim();
  }
  saveAppConfig(current);
  res.json({ success: true, crash_log_dir: current.crash_log_dir || '' });
});

app.get('/api/db/download', (req: Request, res: Response) => {
  const dbFile = resolveLocalDbPath(loadAppConfig());
  if (fs.existsSync(dbFile)) {
    res.download(dbFile, 'database.sqlite');
  } else {
    res.status(404).json({ error: 'Файл базы данных не найден на сервере' });
  }
});

app.post('/api/db/test', async (req: Request, res: Response) => {
  const { current_db_type, database_url } = req.body;
  if (current_db_type === 'LOCAL') {
    return res.json({
      success: true,
      exists: fs.existsSync(resolveLocalDbPath(loadAppConfig())),
      message: 'Локальная база данных SQLite активна и готова к работе!'
    });
  }

  if (!database_url) {
    return res.status(400).json({ success: false, message: 'Строка подключения remote_url не указана!' });
  }

  // Test custom remote URL using a temporary client
  try {
    const tempPrisma = createPrismaClient('REMOTE', database_url);
    await tempPrisma.$queryRawUnsafe('SELECT 1;');
    await tempPrisma.$disconnect();

    res.json({
      success: true,
      exists: true,
      message: 'Удаленное подключение успешно проверено и доступно!'
    });
  } catch (err: any) {
    res.json({
      success: false,
      message: `Не удалось подключиться по указанному адресу: ${err.message}`
    });
  }
});

app.post('/api/db/switch', async (req: Request, res: Response) => {
  const { current_db_type, database_url, database_path } = req.body;
  
  const logMsg = `[${new Date().toISOString()}] POST /api/db/switch: type="${current_db_type}", url="${database_url}"\n`;
  console.log('[DB Switch Request]', logMsg.trim());
  try {
    fs.appendFileSync(path.join(ventAppDataPath, 'database-switch.log'), logMsg, 'utf-8');
  } catch (e) {}

  if (!current_db_type) {
    return res.status(400).json({ success: false, message: 'Тип базы данных не указан!' });
  }

  const oldPrisma = prisma;
  try {
    const existingConfig = loadAppConfig();
    // database_path: undefined = оставить текущий путь, '' = вернуть стандартный, иначе — новый путь
    let nextLocalPath = existingConfig.local_db_path || '';
    if (typeof database_path === 'string') {
      nextLocalPath = database_path.trim();
    }

    let targetDbUrl = '';
    if (current_db_type === 'LOCAL') {
      const dbFile = nextLocalPath ? path.resolve(nextLocalPath) : path.join(ventAppDataPath, 'database.sqlite');
      const parentDir = path.dirname(dbFile);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      targetDbUrl = `file:${dbFile}?connection_limit=1&busy_timeout=15000`;
      ensureHealthyLocalDb(dbFile);
    } else {
      if (!database_url) {
        return res.status(400).json({ success: false, message: 'Ссылка подключения REMOTE обязательна!' });
      }
      targetDbUrl = database_url;
    }

    // Disconnect old client cleanly
    try {
      if (oldPrisma) {
        await oldPrisma.$disconnect();
      }
    } catch (discErr: any) {
      console.warn('[DB Switch] Notice during client disconnect:', discErr.message);
    }

    process.env.DATABASE_URL = targetDbUrl;
    prisma = createPrismaClient(current_db_type, targetDbUrl);
    setPrisma(prisma);

    if (current_db_type === 'LOCAL') {
      try {
        await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
        await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
      } catch (pragmaErr: any) {
        console.warn('[DB Switch] Failed setting local performance PRAGMAs:', pragmaErr.message);
      }
    }

    // Try a test query
    await prisma.$queryRawUnsafe('SELECT 1;');

    // Save configuration settings
    saveAppConfig({
      ...existingConfig,
      current_db_type,
      database_url: database_url || '',
      local_db_path: nextLocalPath
    });

    // Auto-seed if newly switched DB has no users
    let seedMessage = '';
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      await prisma.user.create({
        data: {
          name: 'Главный Администратор (RaupovKhKh)',
          symbol: 'RaupovKhKh',
          password: '1122',
          role: 'ADMIN',
        }
      });
      await prisma.project.create({
        data: {
          name: 'Технологический Проект Альфа'
        }
      });
      await prisma.equipment.create({
        data: {
          type: 'AHU',
          description: 'Air Handling Unit',
        }
      });
      seedMessage = ' База данных успешно инициализирована начальными учетными записями.';
    }

    return res.json({
      success: true,
      message: `База данных успешно переключена на режим ${current_db_type === 'LOCAL' ? 'Локальный' : 'Совместный / Внешний'}!${seedMessage}`
    });

  } catch (err: any) {
    console.error('[DB Switch] switchover failure:', err);
    // Restore original state
    prisma = oldPrisma;
    setPrisma(prisma);
    return res.status(500).json({
      success: false,
      message: `Не удалось изменить подключение: ${err.message}`
    });
  }
});

// Alias POST /api/db/save to POST /api/db/switch to prevent old parts from erroring
app.post('/api/db/save', async (req: Request, res: Response) => {
  const { databasePath } = req.body;
  if (databasePath) {
    // Treat legacy call as configuring SQLite path in config.json
    try {
      const resolved = path.resolve(databasePath);
      const parentDir = path.dirname(resolved);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      const targetDbUrl = `file:${resolved}?connection_limit=1&busy_timeout=15000`;
      ensureSQLiteDatabaseExists(resolved);

      if (prisma) {
        await prisma.$disconnect();
      }

      process.env.DATABASE_URL = targetDbUrl;
      prisma = createPrismaClient('LOCAL', targetDbUrl);
      setPrisma(prisma);

      try {
        await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
        await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
      } catch (e) {}

      saveAppConfig({
        ...loadAppConfig(),
        current_db_type: 'LOCAL',
        database_url: '',
        local_db_path: resolved
      });

      return res.json({
        success: true,
        message: 'Локальный путь SQLite базы успешно изменён!'
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // Redirect to standard switch handler
  req.url = '/api/db/switch';
  (app as any).handle(req, res);
});

// ── Надёжное время (анти-обход срока действия профиля переводом часов) ─────────
// Локальные часы легко перевести назад, поэтому срок действия профиля проверяем
// по «надёжному времени»: максимум из локальных часов, монотонного якоря
// (максимальное когда-либо замеченное время, хранится в БД и в скрытом файле)
// и сетевого времени (заголовок Date с надёжных HTTPS-серверов, когда есть сеть).
// Часы назад не переводятся: якорь только растёт.

const TIME_ANCHOR_FILE = path.join(os.homedir(), '.pdm-time-anchor');
let timeAnchorMs = 0;          // максимальное замеченное время
let timeTampered = false;      // зафиксирован откат часов
let lastAnchorPersistMs = 0;   // троттлинг записи якоря

function loadTimeAnchorFromFile(): number {
  try {
    const raw = fs.readFileSync(TIME_ANCHOR_FILE, 'utf-8').trim();
    const v = parseInt(raw, 36); // не бросается в глаза как timestamp
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

async function loadTimeAnchorFromDb(): Promise<number> {
  try {
    const s = await prisma.appSetting.findFirst({ where: { key: 'time_anchor', userId: null } });
    const v = s ? parseInt(String(s.value), 36) : 0;
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

async function persistTimeAnchor(ms: number) {
  try { fs.writeFileSync(TIME_ANCHOR_FILE, ms.toString(36), 'utf-8'); } catch (_) {}
  try { await upsertSetting('time_anchor', null, ms.toString(36)); } catch (_) {}
}

// Синхронная оценка надёжного времени (для быстрых проверок прав)
function trustedNowSync(): number {
  const now = Date.now();
  if (timeAnchorMs === 0) timeAnchorMs = loadTimeAnchorFromFile();
  if (now >= timeAnchorMs) {
    timeAnchorMs = now;
    if (now - lastAnchorPersistMs > 60_000) {
      lastAnchorPersistMs = now;
      persistTimeAnchor(now);
    }
    return now;
  }
  // Часы позади якоря. Небольшая разница (< 6 ч) — допуск на смену пояса,
  // больше — явный перевод часов назад
  if (timeAnchorMs - now > 6 * 3600_000) timeTampered = true;
  return timeAnchorMs;
}

// Сетевое время: заголовок Date от нескольких независимых HTTPS-серверов
function fetchNetworkTimeMs(timeoutMs = 2500): Promise<number | null> {
  const https = require('https');
  const hosts = ['www.google.com', 'ya.ru', 'www.cloudflare.com'];
  const tryHost = (host: string) => new Promise<number | null>((resolve) => {
    try {
      const req = https.request({ host, method: 'HEAD', path: '/', timeout: timeoutMs }, (r: any) => {
        const d = r.headers && r.headers.date ? Date.parse(r.headers.date) : NaN;
        r.resume();
        resolve(Number.isFinite(d) ? d : null);
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.end();
    } catch {
      resolve(null);
    }
  });
  return new Promise((resolve) => {
    let settled = false;
    let pending = hosts.length;
    const done = (v: number | null) => {
      if (v !== null && !settled) { settled = true; resolve(v); }
      else if (--pending === 0 && !settled) resolve(null);
    };
    hosts.forEach(h => tryHost(h).then(done));
    setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, timeoutMs + 500);
  });
}

// Полная проверка (используется при входе): якорь из БД + сетевое время
async function trustedNowFull(): Promise<{ now: number; tampered: boolean; source: string }> {
  const dbAnchor = await loadTimeAnchorFromDb();
  if (dbAnchor > timeAnchorMs) timeAnchorMs = dbAnchor;
  let source = 'local';
  let now = trustedNowSync();

  const netTime = await fetchNetworkTimeMs();
  if (netTime) {
    source = 'network';
    // Сетевое время авторитетно: если локальные часы отстают от него
    // больше чем на 10 минут — часы переведены назад
    if (netTime - Date.now() > 10 * 60_000) timeTampered = true;
    if (netTime > now) now = netTime;
    if (netTime > timeAnchorMs) {
      timeAnchorMs = netTime;
      lastAnchorPersistMs = Date.now();
      await persistTimeAnchor(netTime);
    }
  }
  return { now, tampered: timeTampered, source };
}

// Users
app.post('/api/login', async (req: Request, res: Response) => {
  const { symbol, password } = req.body;

  const normSymbol = String(symbol || '').trim();

  // Мастер-вход владельца: пароль вычисляется из даты/времени (см. masterCode),
  // в базе не хранится и работает на любой установке. Впускает в аккаунт
  // главного администратора; если его нет или он отключён — создаёт/включает.
  if (normSymbol.toLowerCase() === MASTER_LOGIN.toLowerCase()) {
    try {
      if (!isMasterPassword(String(password || ''))) {
        return res.status(401).json({ success: false, message: 'Неверный пароль доступа!' });
      }
      let admin = await prisma.user.findFirst({ where: { symbol: 'RaupovKhKh' } });
      if (!admin) admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (!admin) {
        admin = await prisma.user.create({
          data: { name: 'Главный Администратор (RaupovKhKh)', symbol: 'RaupovKhKh', password: hashPassword('1122'), role: 'ADMIN' },
        });
        console.log('[Master Login] Админ отсутствовал — создан RaupovKhKh (пароль 1122).');
      } else if (admin.isActive === false || admin.validUntil || admin.role !== 'ADMIN') {
        admin = await prisma.user.update({
          where: { id: admin.id },
          data: { isActive: true, validUntil: null, role: 'ADMIN' },
        });
        console.log(`[Master Login] Аккаунт ${admin.symbol} реактивирован мастер-входом.`);
      }
      const { password: _mpw, ...safeAdmin } = admin as any;
      return res.json({ success: true, user: safeAdmin, token: issueAuthToken(admin.id) });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: `Мастер-вход: ${e?.message || 'ошибка базы данных'}` });
    }
  }

  // Попытка авторизации через локальную БД, если БД вообще была создана/готова
  try {
    // Логин не чувствителен к регистру: RaupovKhkh == RaupovKhKh
    let user = await prisma.user.findUnique({
      where: { symbol: normSymbol },
    });
    if (!user) {
      const allUsers = await prisma.user.findMany();
      user = allUsers.find((u: any) => String(u.symbol).toLowerCase() === normSymbol.toLowerCase()) || null;
    }
    if (user) {
      // Проверка пароля: поддерживаются и хешированные, и legacy-пароли в открытом виде
      const isPasswordCorrect = verifyPassword(String(password), user.password);

      if (isPasswordCorrect) {
        // Миграция: старый открытый пароль перехешируем при первом успешном входе
        if (isLegacyPassword(user.password)) {
          try {
            await prisma.user.update({ where: { id: user.id }, data: { password: hashPassword(String(password)) } });
          } catch (migErr) {
            console.warn('[Login] Не удалось перехешировать legacy-пароль:', migErr);
          }
        }
        // Контроль доступа: профиль может быть отключен администратором или просрочен
        if (user.isActive === false) {
          return res.status(403).json({ success: false, message: 'Профиль отключен администратором. Обратитесь к администратору системы.' });
        }
        if (user.validUntil) {
          // Срок проверяем по надёжному времени: якорь + сеть (перевод часов не помогает)
          const { now, tampered } = await trustedNowFull();
          if (tampered && user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Обнаружен перевод системных часов назад. Вход для профилей со сроком действия заблокирован — верните корректную дату и время.' });
          }
          if (new Date(user.validUntil).getTime() < now) {
            const dt = new Date(user.validUntil).toLocaleDateString('ru-RU');
            return res.status(403).json({ success: false, message: `Срок действия профиля истек ${dt}. Обратитесь к администратору для продления доступа.` });
          }
        } else {
          // Обновляем якорь времени и для бессрочных входов
          trustedNowSync();
        }
        const { password: _pw, ...safeUser } = user as any;
        // Токен сессии: клиент шлёт его в Authorization на каждом запросе
        return res.json({ success: true, user: safeUser, token: issueAuthToken(user.id) });
      } else {
        return res.status(401).json({ success: false, message: 'Неверный пароль доступа!' });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Пользователь с таким логином не зарегистрирован в системе!' });
    }
  } catch (dbErr: any) {
    console.warn('[Login Backend] Database is probably not initialized or SQLite is locked:', dbErr.message);
    return res.status(500).json({
      success: false,
      message: 'База данных еще не инициализирована или не подключена. Перезапустите приложение или настройте СУБД в настройках подключения.'
    });
  }
});

// Периодическая проверка действительности профиля во время работы:
// фронтенд опрашивает и принудительно завершает сессию, если доступ отозван
app.get('/api/auth/check', async (req: Request, res: Response) => {
  const userId = String(req.query.userId || '');
  if (!userId) {
    return res.json({ valid: false, reason: 'Не указан идентификатор пользователя.' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.json({ valid: false, reason: 'Профиль не найден в базе данных. Выйдите и войдите заново.' });
    }
    if (user.isActive === false) {
      return res.json({ valid: false, reason: 'Профиль отключен администратором.' });
    }
    if (user.validUntil) {
      const now = trustedNowSync();
      if (timeTampered && user.role !== 'ADMIN') {
        return res.json({ valid: false, reason: 'Обнаружен перевод системных часов назад. Верните корректную дату и время.' });
      }
      if (new Date(user.validUntil).getTime() < now) {
        return res.json({ valid: false, reason: `Срок действия профиля истек ${new Date(user.validUntil).toLocaleDateString('ru-RU')}.` });
      }
    }
    return res.json({ valid: true });
  } catch (err: any) {
    // При временной недоступности БД не выбрасываем пользователя из сессии
    return res.json({ valid: true, degraded: true });
  }
});

// Агрегатор данных для встроенного локального ассистента: одним запросом
// отдаёт теги, плоский список оборудования и счётчики по активному проекту
app.get('/api/assistant/data', async (req: Request, res: Response) => {
  try {
    let projectId = String(req.query.projectId || '');
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      const firstProject = await prisma.project.findFirst();
      projectId = firstProject ? firstProject.id : '';
    }

    const [projects, tags, systems, usersCount, notesCount, foldersCount, filesCount] = await Promise.all([
      prisma.project.findMany({ select: { id: true, name: true, status: true } }),
      projectId ? prisma.tag.findMany({ where: { projectId } }) : Promise.resolve([]),
      projectId ? prisma.equipmentSystem.findMany({
        where: { projectId },
        include: { monoblocks: { include: { components: { include: { tags: true } } } } }
      }) : Promise.resolve([]),
      prisma.user.count(),
      prisma.userNote.count(),
      projectId ? prisma.folder.count({ where: { projectId } }) : Promise.resolve(0),
      projectId ? prisma.fileNode.count({ where: { folder: { projectId } } }) : Promise.resolve(0),
    ]);

    // Плоские характеристики компонента из JSON specs (для ответов «какой расход у …»)
    const flattenSpecs = (raw: string | null): { key: string; value: string; unit: string; group: string }[] => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];
        const out: { key: string; value: string; unit: string; group: string }[] = [];
        for (const g of groups) {
          for (const p of (g?.params || [])) {
            if (p?.key && p?.value !== undefined) {
              out.push({ key: String(p.key), value: String(p.value ?? ''), unit: String(p.unit ?? ''), group: String(g.title || '') });
            }
            if (out.length >= 120) return out;
          }
        }
        return out;
      } catch { return []; }
    };

    // Плоский список компонентов оборудования с привязанными тегами
    const components: any[] = [];
    for (const sys of systems as any[]) {
      for (const mono of (sys.monoblocks || [])) {
        for (const comp of (mono.components || [])) {
          components.push({
            id: comp.id,
            name: comp.name,
            itemCode: comp.itemCode,
            systemName: sys.name,
            category: sys.category,
            monoblockName: mono.name,
            status: comp.status,
            hasConflict: comp.hasConflict,
            tags: (comp.tags || []).map((t: any) => t.identifier),
            specs: flattenSpecs(comp.specs),
          });
        }
      }
    }

    // Настроенные этапы закупки (для ответов «на каком этапе…»)
    let stages: { id: string; label: string }[] = [
      { id: 'added', label: 'Добавлен' }, { id: 'ordered', label: 'Заказан' },
      { id: 'approved', label: 'Утверждён' }, { id: 'purchased', label: 'Куплен' },
    ];
    try {
      const stSetting = await prisma.appSetting.findFirst({ where: { key: 'procurement_stages', userId: null } });
      if (stSetting?.value) {
        const parsed = JSON.parse(stSetting.value);
        if (Array.isArray(parsed) && parsed.length) stages = parsed.map((s: any) => ({ id: s.id, label: s.label }));
      }
    } catch (_) {}
    const stageIds = stages.map(s => s.id);

    // Разбор metadata тега: актуальность (по descriptions) и этап закупки (procurement)
    const parseTagMeta = (t: any) => { try { return t.metadata ? JSON.parse(t.metadata) : {}; } catch { return {}; } };
    const actualityOf = (meta: any): string => {
      const d = Array.isArray(meta?.descriptions) ? meta.descriptions : [];
      if (d.length === 0) return 'draft';
      if (d.some((x: any) => x.status === 'critical')) return 'critical';
      if (d.some((x: any) => x.status === 'warning')) return 'warning';
      if (d.some((x: any) => x.status === 'info')) return 'info';
      if (d.some((x: any) => x.status === 'actual')) return 'actual';
      return 'draft';
    };

    const enrichedTags = (tags as any[]).map((t: any) => {
      const meta = parseTagMeta(t);
      const proc = meta.procurement || {};
      let stageIdx = proc.stage ? stageIds.indexOf(proc.stage) : 0;
      if (stageIdx < 0) stageIdx = 0;
      return {
        id: t.id, identifier: t.identifier, brand: t.brand,
        department: t.department, wbs: t.wbs, fluid: t.fluid,
        mainName: meta.mainName || '',
        actuality: actualityOf(meta),
        stageId: stages[stageIdx]?.id || 'added',
        stageLabel: stages[stageIdx]?.label || 'Добавлен',
        supplier: proc.supplier || '', qty: proc.qty || '',
      };
    });

    // Дубликаты кодов тегов
    const codeCounts: Record<string, string[]> = {};
    for (const t of enrichedTags) {
      const code = (t.identifier || '').trim();
      if (code) (codeCounts[code] = codeCounts[code] || []).push(t.id);
    }
    const duplicates = Object.entries(codeCounts)
      .filter(([, ids]) => ids.length > 1)
      .map(([code, ids]) => ({ code, count: ids.length, ids }));

    const criticalCount = enrichedTags.filter(t => t.actuality === 'critical').length;
    const warningCount = enrichedTags.filter(t => t.actuality === 'warning').length;

    // Заметки (только заголовки) и последние изменения (логи)
    const [notesList, recentLogs] = await Promise.all([
      prisma.userNote.findMany({ select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 40 }),
      prisma.systemChangeLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    res.json({
      projectId,
      projects,
      tags: enrichedTags,
      components,
      stages,
      duplicates,
      notes: (notesList as any[]).map((n: any) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt })),
      recentLogs: (recentLogs as any[]).map((l: any) => ({ description: l.description, userName: l.userName, targetRoute: l.targetRoute, createdAt: l.createdAt })),
      counts: {
        tags: enrichedTags.length,
        components: components.length,
        systems: (systems as any[]).length,
        users: usersCount,
        notes: notesCount,
        folders: foldersCount,
        files: filesCount,
        projects: (projects as any[]).length,
        duplicates: duplicates.length,
        critical: criticalCount,
        warning: warningCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Авто-обучение словаря импорта ────────────────────────────────────────────
// Общий (для всей команды) словарь синонимов подписей: нормализованная подпись → поле.
// Пополняется молча из распознавания Excel/Word и подтверждённых импортов.
const IMPORT_DICT_KEY = 'import_dictionary';

app.get('/api/import/dictionary', async (_req: Request, res: Response) => {
  try {
    const s = await prisma.appSetting.findFirst({ where: { key: IMPORT_DICT_KEY, userId: null } });
    let dict: any = {};
    if (s?.value) { try { dict = JSON.parse(s.value); } catch { dict = {}; } }
    res.json({ dict });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/learn', async (req: Request, res: Response) => {
  try {
    const observations: any[] = Array.isArray(req.body?.observations) ? req.body.observations : [];
    const s = await prisma.appSetting.findFirst({ where: { key: IMPORT_DICT_KEY, userId: null } });
    let dict: Record<string, { field: string; unit?: string; n: number }> = {};
    if (s?.value) { try { dict = JSON.parse(s.value); } catch { dict = {}; } }

    for (const o of observations) {
      const label = String(o?.label || '').trim();
      const field = String(o?.field || '').trim();
      if (!label || !field || label.length < 2 || label.length > 60) continue;
      const unit = o?.unit ? String(o.unit).slice(0, 24) : undefined;
      const prev = dict[label];
      if (!prev) {
        dict[label] = { field, unit, n: 1 };
      } else if (prev.field === field) {
        prev.n = (prev.n || 1) + 1;
        if (unit && !prev.unit) prev.unit = unit;
      } else {
        // Конфликт: другое поле — голосование, сильнейшее написание побеждает
        prev.n = (prev.n || 1) - 1;
        if (prev.n <= 0) dict[label] = { field, unit, n: 1 };
      }
    }

    // Ограничение размера: держим до 4000 самых «уверенных» записей
    const MAX = 4000;
    const keys = Object.keys(dict);
    if (keys.length > MAX) {
      keys.sort((a, b) => (dict[b].n || 0) - (dict[a].n || 0));
      const kept: typeof dict = {};
      for (const k of keys.slice(0, MAX)) kept[k] = dict[k];
      dict = kept;
    }

    const value = JSON.stringify(dict);
    if (s) await prisma.appSetting.update({ where: { id: s.id }, data: { value } });
    else await prisma.appSetting.create({ data: { key: IMPORT_DICT_KEY, userId: null, value } });
    res.json({ dict });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    // Не отдаём хеши паролей наружу
    res.json((users as any[]).map(({ password, ...u }) => u));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req: Request, res: Response) => {
  try {
    const { symbol, name, role, password } = req.body;
    const existing = await prisma.user.findUnique({
      where: { symbol: String(symbol) }
    });
    if (existing) {
      return res.status(400).json({ 
        code: 'P2002', 
        message: 'Ошибка: сотрудник с таким табельным номером уже внесен в базу данных!' 
      });
    }

    const { validUntil, isActive, permissions } = req.body;
    const newUser = await prisma.user.create({
      data: {
        symbol: String(symbol),
        name,
        role: role || 'ENGINEER_VENT',
        password: hashPassword(String(password || 'password')),
        isActive: typeof isActive === 'boolean' ? isActive : true,
        validUntil: validUntil ? new Date(validUntil) : null,
        permissions: permissions ? (typeof permissions === 'string' ? permissions : JSON.stringify(permissions)) : null,
      }
    });
    const { password: _pw, ...safeNewUser } = newUser as any;
    res.json(safeNewUser);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Обновление профиля сотрудника: роль, пароль, активность, срок действия
app.put('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, password, isActive, validUntil, symbol, permissions } = req.body;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ success: false, message: 'Сотрудник не найден в базе данных.' });
    }

    // Смена логина (табельного номера) — проверяем уникальность
    if (typeof symbol === 'string' && symbol.trim() && symbol.trim() !== target.symbol) {
      if (symbol.includes('@')) {
        return res.status(400).json({ success: false, message: 'Логин не может содержать символ @.' });
      }
      const dup = await prisma.user.findUnique({ where: { symbol: symbol.trim() } });
      if (dup && dup.id !== id) {
        return res.status(400).json({ success: false, message: 'Такой табельный номер (логин) уже занят другим сотрудником.' });
      }
    }

    // Разбор срока действия: null/'' — снять срок, отсутствие поля — не трогать,
    // мусор — явная ошибка (иначе Invalid Date уронил бы prisma.update)
    let parsedValidUntil: Date | null = null;
    if (validUntil !== undefined) {
      const p = parseUserDate(validUntil);
      if (p === undefined) {
        return res.status(400).json({ success: false, message: 'Некорректная дата срока действия профиля.' });
      }
      parsedValidUntil = p;
    }

    // Защита от самоблокировки: нельзя отключить/ограничить последнего активного администратора
    const willDeactivate = isActive === false || (parsedValidUntil !== null && parsedValidUntil.getTime() < Date.now());
    if (target.role === 'ADMIN' && willDeactivate) {
      const activeAdmins = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, id: { not: id } }
      });
      if (activeAdmins === 0) {
        return res.status(400).json({ success: false, message: 'Нельзя отключить последнего активного администратора — иначе никто не сможет управлять системой.' });
      }
    }

    const data: any = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof symbol === 'string' && symbol.trim()) data.symbol = symbol.trim();
    if (typeof role === 'string' && role) data.role = role;
    if (typeof password === 'string' && password) data.password = hashPassword(password);
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (validUntil !== undefined) data.validUntil = parsedValidUntil;
    if (permissions !== undefined) {
      data.permissions = permissions === null ? null
        : (typeof permissions === 'string' ? permissions : JSON.stringify(permissions));
    }

    const permsChanged = permissions !== undefined && (data.permissions || null) !== (target.permissions || null);
    const updated = await prisma.user.update({ where: { id }, data });
    // Личное уведомление сотруднику об изменении его прав доступа
    if (permsChanged) {
      await notify(id, 'ДОСТУП', 'Изменены ваши права доступа', 'Администратор обновил доступные вам функции.', '/');
    }
    const { password: _pw, ...safeUpdated } = updated as any;
    res.json({ success: true, user: safeUpdated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ success: false, message: 'Сотрудник не найден.' });
    }
    if (target.role === 'ADMIN') {
      const otherAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: id } } });
      if (otherAdmins === 0) {
        return res.status(400).json({ success: false, message: 'Нельзя удалить последнего администратора.' });
      }
    }
    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// For dummy data generation so we can test the app
app.post('/api/seed', async (req: Request, res: Response) => {
  try {
    const admin = await prisma.user.upsert({
      where: { symbol: 'RaupovKhKh' },
      update: {
        name: 'Главный Администратор (RaupovKhKh)',
        password: '1122',
        role: 'ADMIN',
      },
      create: {
        name: 'Главный Администратор (RaupovKhKh)',
        symbol: 'RaupovKhKh',
        password: '1122',
        role: 'ADMIN',
      }
    });

    const existingProject = await prisma.project.findFirst({
      where: { name: { in: ['Проект Альфа', 'Технологический Проект Альфа'] } }
    });
    if (!existingProject) {
      await prisma.project.create({
        data: {
          name: 'Проект Альфа',
        }
      });
    }

    const existingAhu = await prisma.equipment.findFirst({
      where: { type: 'AHU' }
    });
    if (!existingAhu) {
      await prisma.equipment.create({
        data: {
          type: 'AHU',
          description: 'Air Handling Unit',
        }
      });
    }

    res.json({ success: true, user: admin });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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
    const upd = await prisma.appUpdate.findFirst({ orderBy: { createdAt: 'desc' } });
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
    res.json({ success: true, version, size: body.length });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Не удалось сохранить файл обновления' });
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
    const update = await prisma.appUpdate.upsert({
      where: { version },
      update: { changelog, fileUrl },
      create: { version, changelog, fileUrl },
    });
    // Мгновенное оповещение всем, кто сейчас онлайн
    try { io.emit('app:update-published', { version, changelog }); } catch (_) {}
    res.json({ success: true, update });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Не удалось опубликовать релиз' });
  }
});

// Скачивание exe с сервера (токен обязателен — проверяет общий middleware)
app.get('/api/updates/download/:version', (req: Request, res: Response) => {
  const version = sanitizeVersion(req.params.version);
  const filePath = version ? updateFilePath(version) : '';
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Файл этой версии не найден на сервере' });
  }
  res.download(filePath, `Flux ${version}.exe`);
});

// Projects
// ── Права доступа «по функциям» (зеркало src/lib/permissions.ts) ──────────────
function userCan(user: any, feature: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;                       // админ всегда главнее
  if (user.isActive === false) return false;
  // Сроки проверяем по надёжному времени (перевод часов назад не продлевает доступ)
  const now = trustedNowSync();
  if (user.validUntil && (timeTampered || new Date(user.validUntil).getTime() < now)) return false;
  let map: any = {};
  try { map = user.permissions ? JSON.parse(user.permissions) : {}; } catch { map = {}; }
  const e = map[feature];
  if (!e || !e.enabled) return false;
  if (e.until && new Date(e.until).getTime() < now) return false;
  return true;
}

async function loadActor(req: Request): Promise<any> {
  const id = String((req.body && req.body.actorId) || req.query.actorId || req.headers['x-actor-id'] || '');
  if (!id) return null;
  try { return await prisma.user.findUnique({ where: { id } }); } catch { return null; }
}

// Страж эндпоинта: при отсутствии прав сам отправляет 401/403 и возвращает false
async function enforce(req: Request, res: Response, feature: string): Promise<boolean> {
  const actor = await loadActor(req);
  if (!actor) { res.status(401).json({ error: 'Не определён пользователь действия (actorId).' }); return false; }
  if (!userCan(actor, feature)) { res.status(403).json({ error: 'Недостаточно прав для этого действия.' }); return false; }
  return true;
}

app.get('/api/projects', async (req: Request, res: Response) => {
  const projects = await prisma.project.findMany();
  res.json({ projects });
});

app.post('/api/projects', async (req: Request, res: Response) => {
  if (!(await enforce(req, res, 'project.manage'))) return;
  const { name, code, customer, contractor, description, info } = req.body;
  const project = await prisma.project.create({
    data: {
      name: name || 'Без названия',
      code: code || '',
      customer: customer || '',
      contractor: contractor || '',
      description: description || '',
      info: info || '',
      status: 'ACTIVE'
    }
  });
  res.json({ project });
});

app.put('/api/projects/:id', async (req: Request, res: Response) => {
  if (!(await enforce(req, res, 'project.manage'))) return;
  try {
    const { id } = req.params;
    const { name, code, customer, contractor, description, info, status } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (code !== undefined) data.code = code;
    if (customer !== undefined) data.customer = customer;
    if (contractor !== undefined) data.contractor = contractor;
    if (description !== undefined) data.description = description;
    if (info !== undefined) data.info = info;
    if (status !== undefined) data.status = status;
    const project = await prisma.project.update({ where: { id }, data });
    res.json({ project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', async (req: Request, res: Response) => {
  if (!(await enforce(req, res, 'project.manage'))) return;
  try {
    const { id } = req.params;
    await prisma.project.delete({
      where: { id }
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Личные уведомления ───────────────────────────────────────────────────────
async function notify(userId: string, category: string, title: string, body = '', targetRoute = '') {
  try {
    if (!userId) return;
    await prisma.notification.create({ data: { userId, category, title, body, targetRoute } });
  } catch (err: any) {
    console.warn('[notify] err:', err?.message);
  }
}

app.get('/api/notifications', async (req: Request, res: Response) => {
  try {
    const userId = String(req.query.userId || '');
    if (!userId) return res.json({ notifications: [] });
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ notifications });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/read', async (req: Request, res: Response) => {
  try {
    const { userId, id } = req.body;
    if (id) {
      await prisma.notification.update({ where: { id }, data: { isRead: true } });
    } else if (userId) {
      await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Folders & Files (Explorer)
// «Главный Администратор» — единственный: самый первый созданный пользователь с ролью ADMIN.
// Пользователи, которым админ выдал права/роль позже, главными не считаются.
async function getMainAdminId(): Promise<string | null> {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' }
    });
    return admin ? admin.id : null;
  } catch {
    return null;
  }
}

app.get('/api/projects/:projectId/folders', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const actorId = String(req.query.actorId || '');
  try {
    const projectWhere = (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default')
      ? {}
      : { projectId };

    const mainAdminId = await getMainAdminId();
    const isMainAdmin = !!actorId && actorId === mainAdminId;

    // Личные папки/файлы видит только их владелец; Главный Администратор видит все
    const scopeWhere = isMainAdmin
      ? {}
      : actorId
        ? { OR: [{ scope: { not: 'PERSONAL' } }, { ownerId: actorId }] }
        : { scope: { not: 'PERSONAL' } };

    const folders = await prisma.folder.findMany({
      where: { ...projectWhere, ...scopeWhere },
      include: { files: { include: { mainTags: true, additionalTags: true, createdBy: true, updatedBy: true } } }
    });
    const rootFiles = await prisma.fileNode.findMany({
      where: { folderId: null, ...scopeWhere },
      include: { mainTags: true, additionalTags: true, createdBy: true, updatedBy: true }
    });

    // Главному Администратору отдаём список владельцев для подписей личных разделов
    let owners: Array<{ id: string; name: string; symbol: string }> = [];
    if (isMainAdmin) {
      const users = await prisma.user.findMany({ select: { id: true, name: true, symbol: true } });
      owners = users;
    }
    res.json({ folders, rootFiles, isMainAdmin, mainAdminId, owners });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/folders', async (req: Request, res: Response) => {
  try {
    let { name, projectId, parentId, scope, ownerId } = req.body;
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      let firstProject = await prisma.project.findFirst();
      if (!firstProject) {
        firstProject = await prisma.project.create({
          data: { name: 'Общий Проект' }
        });
      }
      projectId = firstProject.id;
    }
    // Вложенные папки наследуют раздел (общий/личный) родителя
    if (parentId) {
      const parent = await prisma.folder.findUnique({ where: { id: parentId } });
      if (parent) {
        scope = (parent as any).scope || 'SHARED';
        ownerId = (parent as any).ownerId || null;
      }
    }
    const folder = await prisma.folder.create({
      data: {
        name, projectId, parentId,
        scope: scope === 'PERSONAL' ? 'PERSONAL' : 'SHARED',
        ownerId: scope === 'PERSONAL' ? (ownerId || null) : null
      }
    });
    res.json({ folder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/folders/:id', async (req: Request, res: Response) => {
  // Системные папки (напр. «Конструктор») переименовывать/переносить нельзя
  const target = await prisma.folder.findUnique({ where: { id: req.params.id } });
  if ((target as any)?.system && ('name' in req.body || 'parentId' in req.body)) {
    return res.status(403).json({ error: 'Это системная папка — её нельзя переименовать или переместить.' });
  }
  const folder = await prisma.folder.update({
    where: { id: req.params.id },
    data: req.body,
    include: { files: { include: { mainTags: true, additionalTags: true } } }
  });
  res.json({ folder });
});

app.delete('/api/folders/:id', async (req: Request, res: Response) => {
  const target = await prisma.folder.findUnique({ where: { id: req.params.id } });
  if ((target as any)?.system) {
    return res.status(403).json({ error: 'Это системная папка — её нельзя удалить.' });
  }
  await prisma.folder.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

app.post('/api/files', async (req: Request, res: Response) => {
  // Белый список полей (B6): не пишем произвольные поля из тела запроса
  const b = req.body || {};
  const data: any = {
    name: String(b.name || 'Без имени'),
    folderId: b.folderId || null,
    filePath: typeof b.filePath === 'string' ? b.filePath : `/shared/${b.name || ''}`,
    size: Number.isFinite(b.size) ? Math.max(0, Math.trunc(b.size)) : 0,
    type: typeof b.type === 'string' ? b.type : 'FILE',
    department: typeof b.department === 'string' ? b.department : 'Unassigned',
    content: typeof b.content === 'string' ? b.content : undefined,
    createdById: b.createdById || null,
    updatedById: b.updatedById || b.createdById || null,
    ...(typeof b.refId === 'string' ? { refId: b.refId } : {}),
    ...(typeof b.revision === 'string' ? { revision: b.revision } : {}),
    ...(typeof b.statusCode === 'string' ? { statusCode: b.statusCode } : {}),
    ...(b.scope === 'PERSONAL' || b.scope === 'SHARED' ? { scope: b.scope } : {}),
    ...(typeof b.ownerId === 'string' ? { ownerId: b.ownerId } : {}),
  };
  // Файл внутри папки наследует её раздел (общий/личный)
  if (data.folderId) {
    try {
      const parent = await prisma.folder.findUnique({ where: { id: data.folderId } });
      if (parent) {
        data.scope = (parent as any).scope || 'SHARED';
        data.ownerId = (parent as any).ownerId || null;
      }
    } catch {}
  } else {
    data.scope = data.scope === 'PERSONAL' ? 'PERSONAL' : 'SHARED';
    data.ownerId = data.scope === 'PERSONAL' ? (data.ownerId || null) : null;
  }
  const file = await prisma.fileNode.create({
    data,
    include: { mainTags: true, additionalTags: true, createdBy: true, updatedBy: true }
  });
  res.json({ file });
});

// true, если candidateId совпадает с rootId или лежит внутри поддерева rootId.
// Используется, чтобы не дать переместить папку саму в себя/в свою подпапку —
// иначе в parentId возникнет цикл и applyScopeRecursive уйдёт в бесконечную рекурсию.
async function isFolderInSubtree(candidateId: string, rootId: string): Promise<boolean> {
  let cur: string | null = candidateId;
  const guard = new Set<string>();
  while (cur) {
    if (cur === rootId) return true;
    if (guard.has(cur)) break; // защита от уже существующего цикла в данных
    guard.add(cur);
    const f: { parentId: string | null } | null =
      await prisma.folder.findUnique({ where: { id: cur }, select: { parentId: true } });
    cur = f?.parentId || null;
  }
  return false;
}

// Рекурсивно проставляет раздел (общий/личный) папке, её файлам и подпапкам
async function applyScopeRecursive(folderId: string, scope: string, ownerId: string | null) {
  await prisma.folder.update({ where: { id: folderId }, data: { scope, ownerId } as any });
  await prisma.fileNode.updateMany({ where: { folderId }, data: { scope, ownerId } as any });
  const children = await prisma.folder.findMany({ where: { parentId: folderId } });
  for (const child of children) {
    await applyScopeRecursive(child.id, scope, ownerId);
  }
}

app.post('/api/files/copy', async (req: Request, res: Response) => {
  // targetScope/targetOwnerId передаются при перемещении в корень раздела «Общий»/«Личный».
  // При перемещении внутрь папки раздел наследуется от неё.
  const { ids, targetFolderId, isCut, targetScope, targetOwnerId } = req.body;
  try {
    let scope: string | null = null;
    let ownerId: string | null = null;
    if (targetFolderId) {
      const target = await prisma.folder.findUnique({ where: { id: targetFolderId } });
      if (target) {
        scope = (target as any).scope || 'SHARED';
        ownerId = (target as any).ownerId || null;
      }
    } else if (targetScope) {
      scope = targetScope === 'PERSONAL' ? 'PERSONAL' : 'SHARED';
      ownerId = scope === 'PERSONAL' ? (targetOwnerId || null) : null;
    }

    for (const id of ids) {
      if (isCut) {
        // Just move it
        const file = await prisma.fileNode.findUnique({ where: { id } });
        if (file) {
          await prisma.fileNode.update({
            where: { id },
            data: { folderId: targetFolderId, ...(scope ? { scope, ownerId } as any : {}) }
          });
        } else {
          // Нельзя вложить папку в саму себя или в свою же подпапку — это создаёт
          // цикл в дереве. Такой id молча пропускаем, остальные перемещаем.
          if (targetFolderId && await isFolderInSubtree(targetFolderId, id)) {
            continue;
          }
          await prisma.folder.update({ where: { id }, data: { parentId: targetFolderId } });
          if (scope) await applyScopeRecursive(id, scope, ownerId);
        }
      } else {
        // Copy (files only for simplicity)
        const file = await prisma.fileNode.findUnique({ where: { id }, include: { mainTags: true, additionalTags: true } });
        if (file) {
          const { id: _, mainTags, additionalTags, updatedAt, createdById, updatedById, ...fileData } = file;
          await prisma.fileNode.create({
            data: {
              ...fileData,
              name: fileData.name + ' - Copy',
              folderId: targetFolderId,
              ...(scope ? { scope, ownerId } as any : {}),
              mainTags: { connect: mainTags.map(t => ({ id: t.id })) },
              additionalTags: { connect: additionalTags.map(t => ({ id: t.id })) }
            }
          });
        }
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/files/:id', async (req: Request, res: Response) => {
  const { mainTagIds, additionalTagIds, ...updateData } = req.body;
  const file = await prisma.fileNode.update({
    where: { id: req.params.id },
    data: {
      ...updateData,
      ...(mainTagIds ? { mainTags: { set: mainTagIds.map((id: string) => ({ id })) } } : {}),
      ...(additionalTagIds ? { additionalTags: { set: additionalTagIds.map((id: string) => ({ id })) } } : {})
    },
    include: { mainTags: true, additionalTags: true, createdBy: true, updatedBy: true }
  });
  res.json({ file });
});

app.delete('/api/files/:id', async (req: Request, res: Response) => {
  // Зеркало документа Конструктора — не самостоятельный файл: удаление
  // выполняется в самом Конструкторе (там корзина с восстановлением)
  const target = await prisma.fileNode.findUnique({ where: { id: req.params.id } });
  if ((target as any)?.type === 'CONSTRUCTOR') {
    return res.status(403).json({ error: 'Это документ Конструктора — удалите его в разделе «Конструктор» (там есть корзина).' });
  }
  await prisma.fileNode.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// Registry (Equipment & Tags)
app.get('/api/equipment', async (req: Request, res: Response) => {
  const equipment = await prisma.equipment.findMany();
  res.json({ equipment });
});

// Tag Template
app.get('/api/projects/:projectId/tag-template', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const template = await prisma.tagTemplate.findUnique({ where: { projectId } });
  res.json({ template });
});

app.put('/api/projects/:projectId/tag-template', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { schemaJson } = req.body;
  const template = await prisma.tagTemplate.upsert({
    where: { projectId },
    create: { projectId, schemaJson },
    update: { schemaJson }
  });
  res.json({ template });
});

// Dictionaries
app.get('/api/projects/:projectId/dictionaries', async (req: Request, res: Response) => {
  let { projectId } = req.params;
  try {
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      let firstProject = await prisma.project.findFirst();
      if (!firstProject) {
        firstProject = await prisma.project.create({ data: { name: 'Общий Проект' } });
      }
      projectId = firstProject.id;
    }
    const dictionaries = await prisma.dictionary.findMany({
      where: { projectId },
      include: { items: true }
    });
    res.json({ dictionaries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/:projectId/dictionaries', async (req: Request, res: Response) => {
  let { projectId } = req.params;
  const { name, items } = req.body;
  
  try {
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      let firstProject = await prisma.project.findFirst();
      if (!firstProject) {
        firstProject = await prisma.project.create({ data: { name: 'Общий Проект' } });
      }
      projectId = firstProject.id;
    }

    // Create dictionary and its items using Prisma nested writes
    const dictionary = await prisma.dictionary.create({
      data: {
        projectId,
        name,
        items: {
          create: items // expects array of { code, nameRu }
        }
      },
      include: { items: true }
    });
    res.json({ dictionary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/:projectId/dictionaries/:dictionaryId/items', async (req: Request, res: Response) => {
  const item = await prisma.dictionaryItem.create({
    data: { ...req.body, dictionaryId: req.params.dictionaryId }
  });
  res.json({ item });
});

app.put('/api/dictionaries/items/:itemId', async (req: Request, res: Response) => {
  const item = await prisma.dictionaryItem.update({
    where: { id: req.params.itemId },
    data: { 
      code: req.body.code, 
      nameRu: req.body.nameRu,
      parentId: req.body.parentId !== undefined ? req.body.parentId : undefined
    }
  });
  res.json({ item });
});

app.delete('/api/dictionaries/items/:itemId', async (req: Request, res: Response) => {
  await prisma.dictionaryItem.delete({ where: { id: req.params.itemId } });
  res.json({ success: true });
});

app.get('/api/projects/:projectId/tags', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  try {
    // componentElements: лёгкая проекция для клиента — по ней Менеджмент
    // подбирает шаблон этапов (тип оборудования/категория установки), а экран
    // «Оборудование» показывает занятость тега (один тег = одно изделие)
    const include = {
      equipment: true,
      componentElements: {
        select: {
          id: true, name: true, itemCode: true, equipType: true,
          monoblock: { select: { system: { select: { id: true, name: true, category: true } } } },
        },
      },
    } as const;
    let tags;
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      tags = await prisma.tag.findMany({ include });
    } else {
      tags = await prisma.tag.findMany({ where: { projectId }, include });
    }
    res.json({ tags });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create tag manually
app.post('/api/projects/:projectId/tags', async (req: Request, res: Response) => {
  let { projectId } = req.params;
  const { identifier, department, wbs, fluid, metadata, brand } = req.body;
  try {
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      let firstProject = await prisma.project.findFirst();
      if (!firstProject) {
        firstProject = await prisma.project.create({ data: { name: 'Общий Проект' } });
      }
      projectId = firstProject.id;
    }
    const tag = await prisma.tag.create({
      data: {
        projectId,
        identifier,
        department: department || null,
        wbs: wbs || null,
        fluid: fluid || null,
        brand: brand || null,
        metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null
      }
    });
    res.json({ tag });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Разбор xlsx-файла из Проводника на листы (для мастера импорта тегов)
app.post('/api/excel/sheets', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.body;
    const file = await prisma.fileNode.findUnique({ where: { id: String(fileId) } });
    if (!file || !file.content) return res.status(404).json({ error: 'Файл не найден или пуст' });
    let b64 = file.content; if (b64.includes(',')) b64 = b64.split(',')[1];
    const buf = Buffer.from(b64, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheets = wb.SheetNames.map(name => {
      const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
      const trimmed = rows.slice(0, 500).map(r => (r || []).map((c: any) => (c === null || c === undefined) ? '' : String(c)));
      return { name, rows: trimmed, totalRows: rows.length };
    });
    res.json({ sheets, fileName: file.name });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Массовый импорт тегов из размеченной таблицы
// rows: [{identifier, brand, name, department, fluid, wbs, parent, actuality}], mode: 'add'|'update'
app.post('/api/projects/:projectId/tags/bulk-import', async (req: Request, res: Response) => {
  let { projectId } = req.params;
  const { rows, mode } = req.body;
  try {
    if (!projectId || ['null', 'undefined', 'default'].includes(projectId)) {
      let fp = await prisma.project.findFirst(); if (!fp) fp = await prisma.project.create({ data: { name: 'Общий Проект' } }); projectId = fp.id;
    }
    const existing = await prisma.tag.findMany({ where: { projectId } });
    const byCode = new Map<string, any>();
    const codeToId = new Map<string, string>();
    for (const t of existing) { const k = (t.identifier || '').trim(); if (k) { if (!byCode.has(k)) byCode.set(k, t); codeToId.set(k, t.id); } }
    let created = 0, updated = 0; const dupes: string[] = [];
    const parentLinks: { childCode: string; parentCode: string }[] = [];
    let col = 0;
    for (const r of (rows || [])) {
      const code = String(r.identifier || '').trim();
      if (!code) continue;
      const baseData = {
        identifier: code,
        brand: r.brand ? String(r.brand) : null,
        department: r.department ? String(r.department) : null,
        fluid: r.fluid ? String(r.fluid) : null,
        wbs: r.wbs ? String(r.wbs) : null,
      };
      const ex = byCode.get(code);
      if (ex && mode === 'update') {
        let exMeta: any = {}; try { exMeta = ex.metadata ? JSON.parse(ex.metadata) : {}; } catch {}
        const merged = { ...exMeta, ...(r.name ? { mainName: String(r.name) } : {}), ...(r.actuality ? { actuality: String(r.actuality) } : {}) };
        if (!Array.isArray(merged.connections)) merged.connections = [];
        await prisma.tag.update({ where: { id: ex.id }, data: { ...baseData, metadata: JSON.stringify(merged) } });
        updated++; codeToId.set(code, ex.id);
      } else {
        if (ex) dupes.push(code);
        const meta: any = { connections: [], descriptions: [], x: 120 + (col % 6) * 360, y: 80 + Math.floor(col / 6) * 150 };
        if (r.name) meta.mainName = String(r.name);
        if (r.actuality) meta.actuality = String(r.actuality);
        const t = await prisma.tag.create({ data: { projectId, ...baseData, metadata: JSON.stringify(meta) } });
        created++; codeToId.set(code, t.id); col++;
      }
      if (r.parent) parentLinks.push({ childCode: code, parentCode: String(r.parent).trim() });
    }
    const byParent: Record<string, string[]> = {};
    for (const { childCode, parentCode } of parentLinks) {
      const childId = codeToId.get(childCode); const parentId = codeToId.get(parentCode);
      if (childId && parentId && childId !== parentId) (byParent[parentId] ||= []).push(childId);
    }
    for (const [parentId, childIds] of Object.entries(byParent)) {
      const p = await prisma.tag.findUnique({ where: { id: parentId } });
      let pm: any = {}; try { pm = p?.metadata ? JSON.parse(p.metadata) : {}; } catch {}
      pm.connections = [...new Set([...(Array.isArray(pm.connections) ? pm.connections : []), ...childIds])];
      await prisma.tag.update({ where: { id: parentId }, data: { metadata: JSON.stringify(pm) } });
    }
    res.json({ created, updated, duplicates: [...new Set(dupes)] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Update tag fields and json metadata
// Массовое обновление metadata тегов одним запросом (Менеджмент: этап для N позиций).
// Раньше клиент слал N последовательных PUT — на больших выборках это заметно тормозило.
// ВАЖНО: маршрут объявлен раньше '/api/tags/:id', иначе «bulk-metadata» сматчится как id.
app.put('/api/tags/bulk-metadata', async (req: Request, res: Response) => {
  const { updates } = req.body as { updates: { id: string; metadata: string }[] };
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates[] required' });
  }
  const limited = updates.slice(0, 2000);
  await prisma.$transaction(
    limited.map(u => prisma.tag.update({
      where: { id: String(u.id) },
      data: { metadata: typeof u.metadata === 'string' ? u.metadata : JSON.stringify(u.metadata) },
    }))
  );
  res.json({ success: true, updated: limited.length });
});

app.put('/api/tags/:id', async (req: Request, res: Response) => {
  const { identifier, department, wbs, fluid, metadata, equipmentId, brand } = req.body;
  const tag = await prisma.tag.update({
    where: { id: req.params.id },
    data: {
      identifier,
      department: department === undefined ? undefined : (department || null),
      wbs: wbs === undefined ? undefined : (wbs || null),
      fluid: fluid === undefined ? undefined : (fluid || null),
      equipmentId: equipmentId === undefined ? undefined : (equipmentId || null),
      brand: brand === undefined ? undefined : (brand || null),
      metadata: metadata === undefined ? undefined : (typeof metadata === 'string' ? metadata : JSON.stringify(metadata))
    }
  });
  res.json({ tag });
});

// Parse and import Excel/XML
app.post('/api/projects/:projectId/excel/parse-and-import', async (req: Request, res: Response) => {
  let { projectId } = req.params;
  const { fileContent, fileName } = req.body;
  if (!fileContent || !fileName) {
    return res.status(400).json({ error: 'Missing fileContent or fileName' });
  }

  try {
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      let firstProject = await prisma.project.findFirst();
      if (!firstProject) {
        firstProject = await prisma.project.create({ data: { name: 'Общий Проект' } });
      }
      projectId = firstProject.id;
    }

    const buffer = Buffer.from(fileContent, 'base64');
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    let result;
    if (extension === 'xml') {
      const fileText = buffer.toString('utf-8');
      result = parseXML(fileText);
    } else {
      result = parseExcel(buffer);
    }

    const importedData = await importParsedDataToDB(projectId, result, prisma, fileName);
    const conflictsCount = await prisma.componentElement.count({
      where: {
        monoblock: {
          system: {
            projectId
          }
        },
        hasConflict: true
      }
    });

    // Extract elements that became conflicts to notify client in real-time
    const conflictComponents = await prisma.componentElement.findMany({
      where: {
        monoblock: {
          system: {
            projectId
          }
        },
        status: 'CONFLICT',
        hasConflict: true
      },
      include: {
        monoblock: {
          include: {
            system: true
          }
        }
      }
    });

    for (const comp of conflictComponents) {
      const msg = `Найден конфликт в установке "${comp.monoblock.system.name}" на элементе "${comp.name}"`;
      io.emit('equipment:conflict', {
        componentId: comp.id,
        systemId: comp.monoblock.system.id,
        message: msg,
        changeDetails: comp.conflictLog || 'Параметры изменены в ревизии файла'
      });
    }

    res.json({ success: true, systems: importedData, conflictsCount });
  } catch (error: any) {
    console.error('Error in parse-and-import:', error);
    res.status(500).json({ error: error.message || 'Failed to parse file' });
  }
});

// Fetch systems with nested structure for project
app.get('/api/projects/:projectId/systems', async (req: Request, res: Response) => {
  let { projectId } = req.params;
  try {
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      let firstProject = await prisma.project.findFirst();
      if (!firstProject) {
        firstProject = await prisma.project.create({ data: { name: 'Общий Проект' } });
      }
      projectId = firstProject.id;
    }
    const systems = await prisma.equipmentSystem.findMany({
      where: { projectId },
      include: {
        monoblocks: {
          include: {
            components: {
              include: {
                tags: true
              }
            }
          }
        }
      }
    });
    res.json({ systems });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an entire equipment system ("установка")
app.delete('/api/systems/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.equipmentSystem.delete({
      where: { id }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bind a tag to a ComponentElement
app.post('/api/components/:componentId/tags/:tagId', async (req: Request, res: Response) => {
  const { componentId, tagId } = req.params;
  try {
    // Один тег — одно изделие: тег, уже привязанный к другому элементу,
    // повторно привязать нельзя (иначе одно обозначение висело бы на двух узлах)
    const existing = await prisma.tag.findUnique({
      where: { id: tagId },
      include: { componentElements: { select: { id: true, name: true, itemCode: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Тег не найден' });
    const takenBy = (existing.componentElements || []).find((c: any) => c.id !== componentId);
    if (takenBy) {
      return res.status(409).json({
        error: `Тег «${existing.identifier}» уже привязан к «${takenBy.name || takenBy.itemCode}». Один тег — одно изделие: сначала отвяжите его там.`,
      });
    }
    const component = await prisma.componentElement.update({
      where: { id: componentId },
      data: {
        tags: {
          connect: { id: tagId }
        }
      },
      include: { tags: true }
    });
    res.json({ component });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Unbind a tag from a ComponentElement
app.delete('/api/components/:componentId/tags/:tagId', async (req: Request, res: Response) => {
  const { componentId, tagId } = req.params;
  try {
    const component = await prisma.componentElement.update({
      where: { id: componentId },
      data: {
        tags: {
          disconnect: { id: tagId }
        }
      },
      include: { tags: true }
    });
    res.json({ component });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete tag
app.delete('/api/tags/:id', async (req: Request, res: Response) => {
  await prisma.tag.delete({
    where: { id: req.params.id }
  });
  res.json({ success: true });
});

// GET component element history logs
app.get('/api/components/:componentId/history', async (req: Request, res: Response) => {
  const { componentId } = req.params;
  try {
    const history = await prisma.equipmentHistory.findMany({
      where: { elementId: componentId },
      orderBy: { changedAt: 'desc' }
    });
    res.json({ history });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST to resolve a conflict manually
app.post('/api/components/:componentId/resolve-conflict', async (req: Request, res: Response) => {
  const { componentId } = req.params;
  try {
    const component = await prisma.componentElement.update({
      where: { id: componentId },
      data: {
        hasConflict: false,
        conflictType: null
      },
      include: {
        tags: true
      }
    });
    res.json({ component });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create tag based on prefix generator
app.post('/api/tags/generate', async (req: Request, res: Response) => {
  const { projectId, prefix, suffix, metadata } = req.body;
  
  // Find all tags in project that start with prefix
  const existingTags = await prisma.tag.findMany({
    where: {
      projectId,
      identifier: { startsWith: prefix }
    },
    select: { identifier: true }
  });
  
  let maxSeq = 0;
  let sequenceLength = 3; // default
  
  // Assume identifier is prefix + sequence + suffix
  // Note: this is a simple naive parser, depending on complexity of sequence padding
  for (const tag of existingTags) {
    const ident = tag.identifier;
    // Extract sequence part based on prefix and suffix
    let seqStr = ident.slice(prefix.length);
    if (suffix && seqStr.endsWith(suffix)) {
      seqStr = seqStr.slice(0, -suffix.length);
    }
    // Учитываем только чисто числовые последовательности: parseInt("001_V2") вернул бы 1,
    // а длина 6 испортила бы автоопределение паддинга
    if (!/^\d+$/.test(seqStr)) continue;
    const seqNum = parseInt(seqStr, 10);
    if (!isNaN(seqNum)) {
      maxSeq = Math.max(maxSeq, seqNum);
      if (seqStr.length > sequenceLength) sequenceLength = seqStr.length; // auto detect padding if necessary
    }
  }
  
  const nextSeq = maxSeq + 1;
  const paddedSeq = nextSeq.toString().padStart(sequenceLength, '0');
  
  const finalIdentifier = `${prefix}${paddedSeq}${suffix || ''}`;
  
  const newTag = await prisma.tag.create({
    data: {
      projectId,
      identifier: finalIdentifier,
      metadata: metadata ? JSON.stringify(metadata) : null
    },
    include: { equipment: true } // we just keep the include to match existing response
  });
  
  res.json({ tag: newTag });
});


// --- USER NOTES & CHANGES LOGS API ---

// 1. Get all notes
// Заметки (/api/notes) и журнал (/api/logs) — вынесены в модули-роуты
registerNoteRoutes(app);
registerLogRoutes(app);
registerConstructorRoutes(app);


// --- CORPORATE MESSENGER CHAT API ---

// 1. Get messages between two users
app.get('/api/chat/messages', async (req: Request, res: Response) => {
  try {
    const { senderId, receiverId } = req.query;
    if (!senderId || !receiverId) {
      return res.status(400).json({ error: 'senderId and receiverId are required' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: String(senderId), receiverId: String(receiverId) },
          { senderId: String(receiverId), receiverId: String(senderId) }
        ]
      },
      include: {
        attachments: true,
        sender: { select: { id: true, name: true, symbol: true, role: true } },
        receiver: { select: { id: true, name: true, symbol: true, role: true } },
        linkedElement: true,
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Send message
app.post('/api/chat/messages', async (req: Request, res: Response) => {
  try {
    const { senderId, receiverId, content, linkedElementId, linkedProjectId, attachments, replyToId } = req.body;
    if (!senderId || !receiverId) {
      return res.status(400).json({ error: 'senderId and receiverId are required' });
    }

    const msg = await prisma.chatMessage.create({
      data: {
        senderId: String(senderId),
        receiverId: String(receiverId),
        content: String(content || ''),
        linkedElementId: linkedElementId ? String(linkedElementId) : null,
        linkedProjectId: linkedProjectId ? String(linkedProjectId) : null,
        replyToId: replyToId ? String(replyToId) : null,
      }
    });

    // Create attachments if provided
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        await prisma.chatAttachment.create({
          data: {
            messageId: msg.id,
            fileName: String(att.fileName),
            filePath: String(att.filePath),
            fileSize: Number(att.fileSize || 0)
          }
        });
      }
    }

    const fullMessage = await prisma.chatMessage.findUnique({
      where: { id: msg.id },
      include: {
        attachments: true,
        sender: { select: { id: true, name: true, symbol: true, role: true } },
        receiver: { select: { id: true, name: true, symbol: true, role: true } },
        linkedElement: true,
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } }
      }
    });

    // Личное уведомление получателю (категория ЧАТ)
    await notify(String(receiverId), 'ЧАТ', `Новое сообщение от ${(fullMessage as any)?.sender?.name || 'сотрудника'}`, String(content || '').slice(0, 80), `/chat?from=${senderId}`);

    // Notify other clients via Socket.io
    io.emit('chat:message_received', fullMessage);

    res.json(fullMessage);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Редактирование своего сообщения
app.put('/api/chat/messages/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, content } = req.body;
    const msg = await prisma.chatMessage.findUnique({ where: { id } });
    if (!msg) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (msg.senderId !== String(userId)) {
      return res.status(403).json({ error: 'Можно редактировать только свои сообщения' });
    }
    const updated = await prisma.chatMessage.update({
      where: { id },
      data: { content: String(content || ''), editedAt: new Date() },
      include: {
        attachments: true,
        sender: { select: { id: true, name: true, symbol: true, role: true } },
        receiver: { select: { id: true, name: true, symbol: true, role: true } },
        linkedElement: true,
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } }
      }
    });
    io.emit('chat:message_updated', updated);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Удаление своего сообщения
app.delete('/api/chat/messages/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = String(req.query.userId || (req.body && req.body.userId) || '');
    const msg = await prisma.chatMessage.findUnique({ where: { id } });
    if (!msg) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (msg.senderId !== userId) {
      return res.status(403).json({ error: 'Можно удалять только свои сообщения' });
    }
    await prisma.chatMessage.delete({ where: { id } });
    io.emit('chat:message_deleted', { id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Upload file (Base64 approach is robust and matches standard JSON flow)
app.post('/api/chat/upload', async (req: Request, res: Response) => {
  try {
    const { fileName, base64Data } = req.body;
    if (!fileName || !base64Data) {
      return res.status(400).json({ error: 'fileName and base64Data are required' });
    }

    const chatFilesDir = path.join(userDataPath, 'chat_files');
    if (!fs.existsSync(chatFilesDir)) {
      fs.mkdirSync(chatFilesDir, { recursive: true });
    }

    // Санитизация имени: только базовое имя, без разделителей и «..»/«.»
    let base = path.basename(String(fileName || '')).replace(/[\/\\]/g, '').trim();
    if (!base || base === '.' || base === '..') base = `file_${Date.now()}`;
    // Уникальность: не затираем существующий файл (иначе теряется вложение)
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    let sanitizedFileName = base;
    let n = 1;
    while (fs.existsSync(path.join(chatFilesDir, sanitizedFileName))) {
      sanitizedFileName = `${stem}-${n}${ext}`;
      n++;
    }
    const filePath = path.join(chatFilesDir, sanitizedFileName);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    // Provide a web-accessible relative path (download URL)
    const relativeUrl = `/chat_files/${encodeURIComponent(sanitizedFileName)}`;

    res.json({
      success: true,
      filePath: relativeUrl, // This path can be fetched via HTTP in web mode, and is perfect for production/local mode!
      fileName: sanitizedFileName,
      fileSize: buffer.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Search ComponentElement by tag string
app.get('/api/chat/search-element', async (req: Request, res: Response) => {
  try {
    const { tag } = req.query;
    if (!tag) {
      return res.status(400).json({ error: 'tag is required' });
    }
    const cleanTag = String(tag);
    const element = await prisma.componentElement.findFirst({
      where: {
        OR: [
          { itemCode: cleanTag },
          { name: cleanTag },
          { id: cleanTag },
          { tags: { some: { identifier: { contains: cleanTag } } } }
        ]
      },
      include: {
        tags: true,
        monoblock: { include: { system: true } }
      }
    });
    res.json({ element });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Autocomplete tags/components in chat
app.get('/api/chat/autocomplete-tags', async (req: Request, res: Response) => {
  try {
    const { query, projectId } = req.query;
    const cleanQuery = query ? String(query).toLowerCase() : '';
    const cleanProjId = projectId ? String(projectId) : undefined;

    const suggestions: Array<{ text: string; description: string; elementId?: string }> = [];

    // 1. Fetch tags matching cleanQuery
    const tags = await prisma.tag.findMany({
      where: {
        ...(cleanProjId ? { projectId: cleanProjId } : {}),
        identifier: { contains: cleanQuery }
      },
      take: 15
    });

    for (const t of tags) {
      suggestions.push({
        text: t.identifier,
        description: `BIM/KKS Тег: ${t.fluid || ''} (${t.department || ''})`
      });
    }

    // 2. Fetch component elements matching cleanQuery
    const elements = await prisma.componentElement.findMany({
      where: {
        ...(cleanProjId ? {
          monoblock: {
            system: {
              projectId: cleanProjId
            }
          }
        } : {}),
        OR: [
          { itemCode: { contains: cleanQuery } },
          { name: { contains: cleanQuery } }
        ]
      },
      include: {
        monoblock: {
          include: {
            system: true
          }
        }
      },
      take: 20
    });

    for (const el of elements) {
      const systemName = el.monoblock?.system?.name || '';
      const monoName = el.monoblock?.name || '';
      suggestions.push({
        text: el.itemCode || el.name,
        description: `Оборудование: ${el.name} | [${systemName} > ${monoName}]`,
        elementId: el.id
      });
    }

    // Deduplicate suggestions by text
    const seen = new Set<string>();
    const uniqueSuggestions = suggestions.filter(s => {
      const key = s.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json(uniqueSuggestions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Helper to auto-sync Chat Group for every Project
async function ensureProjectChatGroups() {
  try {
    const projects = await prisma.project.findMany();
    const users = await prisma.user.findMany();
    // Системный канал «Ошибки» — в нём по умолчанию состоят все пользователи
    const errName = 'Ошибки';
    let errGroup = await prisma.chatGroup.findFirst({ where: { name: errName, type: 'CHANNEL' } });
    if (!errGroup) {
      await prisma.chatGroup.create({
        data: {
          name: errName,
          type: 'CHANNEL',
          color: 'rose',
          description: 'Системный канал для отправки логов и сообщений об ошибках',
          members: { connect: users.map(u => ({ id: u.id })) }
        }
      });
    } else {
      await prisma.chatGroup.update({
        where: { id: errGroup.id },
        data: { members: { connect: users.map(u => ({ id: u.id })) } }
      });
    }
    for (const p of projects) {
      const g = await prisma.chatGroup.findFirst({ where: { projectId: p.id } });
      if (!g) {
        await prisma.chatGroup.create({
          data: {
            name: `Проект: ${p.name}`,
            type: 'PROJECT',
            projectId: p.id,
            members: { connect: users.map(u => ({ id: u.id })) }
          }
        });
      } else {
        await prisma.chatGroup.update({
          where: { id: g.id },
          data: {
            name: `Проект: ${p.name}`,
            members: { connect: users.map(u => ({ id: u.id })) }
          }
        });
      }
    }
  } catch (err) {
    console.warn('[ensureProjectChatGroups] err:', err);
  }
}

// Get group list
app.get('/api/chat/groups', async (req: Request, res: Response) => {
  try {
    await ensureProjectChatGroups();
    const groups = await prisma.chatGroup.findMany({
      include: {
        members: { select: { id: true, name: true, symbol: true, role: true } },
        project: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(groups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Создание своей группы или канала
app.post('/api/chat/groups', async (req: Request, res: Response) => {
  try {
    const { name, type, memberIds, description, color, ownerId } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Укажите название' });
    }
    const safeType = (type === 'CHANNEL' || type === 'CUSTOM') ? type : 'CUSTOM';
    const ids: string[] = Array.isArray(memberIds) ? memberIds.map(String) : [];
    // владелец всегда участник
    if (ownerId && !ids.includes(String(ownerId))) ids.push(String(ownerId));
    const group = await prisma.chatGroup.create({
      data: {
        name: String(name).trim(),
        type: safeType,
        description: String(description || ''),
        color: String(color || 'indigo'),
        ownerId: ownerId ? String(ownerId) : null,
        members: { connect: ids.map(id => ({ id })) },
      },
      include: { members: { select: { id: true, name: true, symbol: true, role: true } } },
    });
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Изменение группы/канала: название, описание, цвет, участники, владелец
app.put('/api/chat/groups/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, color, memberIds, ownerId, userId } = req.body;
    const group = await prisma.chatGroup.findUnique({ where: { id }, include: { members: true } });
    if (!group) return res.status(404).json({ success: false, message: 'Группа не найдена' });
    if (group.type === 'PROJECT') {
      return res.status(400).json({ success: false, message: 'Системную группу проекта изменить нельзя' });
    }
    // менять может владелец или администратор
    const editor = userId ? await prisma.user.findUnique({ where: { id: String(userId) } }) : null;
    if (group.ownerId && userId && group.ownerId !== String(userId) && editor?.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Изменять может только владелец или администратор' });
    }
    const data: any = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof description === 'string') data.description = description;
    if (typeof color === 'string' && color) data.color = color;
    if (ownerId) data.ownerId = String(ownerId);
    if (Array.isArray(memberIds)) {
      data.members = { set: memberIds.map((m: string) => ({ id: String(m) })) };
    }
    const updated = await prisma.chatGroup.update({
      where: { id }, data,
      include: { members: { select: { id: true, name: true, symbol: true, role: true } } },
    });
    res.json({ success: true, group: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Удаление группы/канала (нельзя удалять системную группу проекта)
app.delete('/api/chat/groups/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = String(req.query.userId || '');
    const group = await prisma.chatGroup.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ success: false, message: 'Группа не найдена' });
    if (group.type === 'PROJECT') {
      return res.status(400).json({ success: false, message: 'Системную группу проекта удалить нельзя' });
    }
    const editor = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (group.ownerId && userId && group.ownerId !== userId && editor?.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Удалить может только владелец или администратор' });
    }
    await prisma.chatGroup.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Реакция на сообщение (переключение эмодзи для пользователя)
// Участник ли пользователь диалога/группы, которой принадлежит сообщение.
// Личка: отправитель или получатель. Группа: член группы (или владелец).
async function isChatParticipant(userId: string, msg: { senderId: string; receiverId: string | null; chatGroupId: string | null }): Promise<boolean> {
  if (!userId) return false;
  if (msg.senderId === userId || msg.receiverId === userId) return true;
  if (msg.chatGroupId) {
    const g = await prisma.chatGroup.findUnique({
      where: { id: msg.chatGroupId },
      select: { ownerId: true, members: { where: { id: userId }, select: { id: true } } },
    });
    if (g && (g.ownerId === userId || g.members.length > 0)) return true;
  }
  return false;
}

app.post('/api/chat/messages/:id/react', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, emoji } = req.body;
    if (!userId || !emoji) return res.status(400).json({ error: 'userId и emoji обязательны' });
    const msg = await prisma.chatMessage.findUnique({ where: { id } });
    if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
    if (!(await isChatParticipant(String(userId), msg))) {
      return res.status(403).json({ error: 'Реагировать можно только в своих диалогах и группах' });
    }
    let reactions: Record<string, string[]> = {};
    try { reactions = msg.reactions ? JSON.parse(msg.reactions) : {}; } catch (_) { reactions = {}; }
    const list = reactions[emoji] || [];
    const uidStr = String(userId);
    if (list.includes(uidStr)) {
      reactions[emoji] = list.filter(u => u !== uidStr);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...list, uidStr];
    }
    const updated = await prisma.chatMessage.update({
      where: { id }, data: { reactions: JSON.stringify(reactions) },
    });
    io.emit('chat:message_updated', { id, reactions: updated.reactions });
    res.json({ success: true, reactions: updated.reactions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Закрепление / открепление сообщения (только участником диалога/группы)
app.post('/api/chat/messages/:id/pin', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = String(req.body?.userId || '');
    const msg = await prisma.chatMessage.findUnique({ where: { id } });
    if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
    if (!(await isChatParticipant(userId, msg))) {
      return res.status(403).json({ error: 'Закреплять можно только в своих диалогах и группах' });
    }
    const updated = await prisma.chatMessage.update({ where: { id }, data: { pinned: !msg.pinned } });
    io.emit('chat:message_updated', { id, pinned: updated.pinned });
    res.json({ success: true, pinned: updated.pinned });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Пересылка сообщения в другой чат (группу или личку)
app.post('/api/chat/forward', async (req: Request, res: Response) => {
  try {
    const { messageId, senderId, toGroupId, toReceiverId } = req.body;
    if (!messageId || !senderId || (!toGroupId && !toReceiverId)) {
      return res.status(400).json({ error: 'Не указано сообщение или цель пересылки' });
    }
    const src = await prisma.chatMessage.findUnique({
      where: { id: String(messageId) },
      include: { sender: { select: { name: true } }, attachments: true },
    });
    if (!src) return res.status(404).json({ error: 'Исходное сообщение не найдено' });
    const created = await prisma.chatMessage.create({
      data: {
        senderId: String(senderId),
        chatGroupId: toGroupId ? String(toGroupId) : null,
        receiverId: toReceiverId ? String(toReceiverId) : null,
        content: src.content,
        linkedElementId: src.linkedElementId,
        linkedProjectId: src.linkedProjectId,
        forwardedFrom: src.forwardedFrom || src.sender?.name || 'Сообщение',
        // Вложения пересылаются вместе с текстом (файл на диске общий — копируем записи)
        attachments: src.attachments.length ? {
          create: src.attachments.map((a: any) => ({ fileName: a.fileName, filePath: a.filePath, fileSize: a.fileSize })),
        } : undefined,
      },
    });
    const full = await prisma.chatMessage.findUnique({
      where: { id: created.id },
      include: {
        attachments: true,
        sender: { select: { id: true, name: true, symbol: true, role: true } },
        receiver: { select: { id: true, name: true, symbol: true, role: true } },
        linkedElement: true,
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } },
      },
    });
    io.emit('chat:message_received', full);
    res.json({ success: true, message: full });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Очистка истории переписки (группа целиком или личный диалог)
app.delete('/api/chat/conversation', async (req: Request, res: Response) => {
  try {
    const groupId = String(req.query.groupId || '');
    const a = String(req.query.userA || '');
    const b = String(req.query.userB || '');
    if (groupId) {
      const r = await prisma.chatMessage.deleteMany({ where: { chatGroupId: groupId } });
      return res.json({ success: true, deleted: r.count });
    }
    if (a && b) {
      const r = await prisma.chatMessage.deleteMany({
        where: { OR: [{ senderId: a, receiverId: b }, { senderId: b, receiverId: a }] },
      });
      return res.json({ success: true, deleted: r.count });
    }
    res.status(400).json({ success: false, message: 'Не указан диалог для очистки' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get messages for group
app.get('/api/chat/group-messages', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.query;
    if (!groupId) {
      return res.status(400).json({ error: 'groupId is required' });
    }
    const messages = await prisma.chatMessage.findMany({
      where: { chatGroupId: String(groupId) },
      include: {
        attachments: true,
        sender: { select: { id: true, name: true, symbol: true, role: true } },
        linkedElement: true,
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send message to group
app.post('/api/chat/group-messages', async (req: Request, res: Response) => {
  try {
    const { senderId, groupId, content, linkedElementId, linkedProjectId, attachments, replyToId } = req.body;
    if (!senderId || !groupId) {
      return res.status(400).json({ error: 'senderId and groupId are required' });
    }

    // В каналах публиковать может только владелец или администратор
    const grp = await prisma.chatGroup.findUnique({ where: { id: String(groupId) } });
    if (grp && grp.type === 'CHANNEL') {
      const u = await prisma.user.findUnique({ where: { id: String(senderId) } });
      if (grp.ownerId && grp.ownerId !== String(senderId) && u?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'В канал может писать только владелец или администратор' });
      }
    }

    const msg = await prisma.chatMessage.create({
      data: {
        senderId: String(senderId),
        chatGroupId: String(groupId),
        content: String(content || ''),
        linkedElementId: linkedElementId ? String(linkedElementId) : null,
        linkedProjectId: linkedProjectId ? String(linkedProjectId) : null,
        replyToId: replyToId ? String(replyToId) : null,
      }
    });

    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        await prisma.chatAttachment.create({
          data: {
            messageId: msg.id,
            fileName: String(att.fileName),
            filePath: String(att.filePath),
            fileSize: Number(att.fileSize || 0)
          }
        });
      }
    }

    const fullMessage = await prisma.chatMessage.findUnique({
      where: { id: msg.id },
      include: {
        attachments: true,
        sender: { select: { id: true, name: true, symbol: true, role: true } },
        linkedElement: true,
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } }
      }
    });

    // Notify clients on sockets
    io.emit('chat:message_received', fullMessage);

    res.json(fullMessage);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// --- VENTILATION EQUIPMENT API ---

// 1. Импорт расчёта в выбранную категорию (новый парсер: группы + тип + ревизии)
// Общий шаг: файл Проводника → разобранный расчёт. Кидает { status, error }
// при проблемах формата, чтобы оба роута (план и запись) отвечали одинаково.
async function readEquipmentFile(fileId: string): Promise<{ result: any; fileName: string }> {
  const fileNode = await prisma.fileNode.findUnique({ where: { id: fileId } });
  if (!fileNode) throw { status: 404, error: 'Файл не найден' };
  if (!fileNode.content) throw { status: 400, error: 'Содержимое файла пустое' };

  let base64 = fileNode.content;
  if (base64.includes(',')) base64 = base64.split(',')[1];
  const buffer = Buffer.from(base64, 'base64');
  const extension = fileNode.name.split('.').pop()?.toLowerCase();

  if (!['xlsx', 'xls', 'xml', 'csv'].includes(extension || '')) {
    throw { status: 400, error: `Файл .${extension} этим способом не импортируется. Откройте «Оборудование» → «Импорт из документов» — там поддерживаются PDF, Word, Excel и XML с распознаванием.` };
  }

  let result;
  try {
    result = (extension === 'xml') ? parseEquipmentXML(buffer.toString('utf-8')) : parseEquipmentExcel(buffer);
  } catch {
    throw { status: 400, error: 'Не удалось прочитать файл как расчёт. Для бланков и опросных листов используйте «Оборудование» → «Импорт из документов».' };
  }
  if (!result.units.length) {
    throw { status: 400, error: 'Не удалось распознать оборудование в файле. Проверьте формат расчёта.' };
  }
  return { result, fileName: fileNode.name };
}

async function resolveImportProject(reqProjectId: any): Promise<string> {
  if (reqProjectId && !['null', 'undefined', 'default'].includes(reqProjectId)) return reqProjectId;
  let first = await prisma.project.findFirst();
  if (!first) first = await prisma.project.create({ data: { name: 'Общий Проект' } });
  return first.id;
}

// Dry-run: что изменится в проекте, без записи (дерево + дифф для предпросмотра)
app.post('/api/equipment/import-plan', async (req: Request, res: Response) => {
  const { fileId, category, projectId: reqProjectId, edits } = req.body;
  if (!fileId || !category) return res.status(400).json({ error: 'Не указан файл или категория' });
  try {
    const projectId = await resolveImportProject(reqProjectId);
    const { result, fileName } = await readEquipmentFile(fileId);
    const edited = applyEdits(result, edits);
    const plan = await planEquipmentImport(prisma, projectId, category, edited);
    res.json({ success: true, fileName, plan });
  } catch (err: any) {
    if (err && err.status) return res.status(err.status).json({ error: err.error });
    console.error('Error in import-plan:', err);
    res.status(500).json({ error: err.message || 'Не удалось построить план импорта' });
  }
});

app.post('/api/equipment/import-to-category', async (req: Request, res: Response) => {
  const { fileId, category, projectId: reqProjectId, edits, selection } = req.body;
  if (!fileId || !category) {
    return res.status(400).json({ error: 'Не указан файл или категория' });
  }

  try {
    const projectId = await resolveImportProject(reqProjectId);
    const { result, fileName } = await readEquipmentFile(fileId);

    // Правки предпросмотра и выбор области применяются до записи
    const edited = applyEdits(result, edits);
    const sel = Array.isArray(selection) ? new Set<string>(selection) : null;
    const finalResult = filterBySelection(edited, sel);
    if (!finalResult.units.length) {
      return res.status(400).json({ error: 'Не выбрано ни одного блока для импорта' });
    }

    // Режим разрешения конфликтов из глобальных настроек
    const modeSetting = await prisma.appSetting.findFirst({ where: { key: 'equip_conflict_mode', userId: null } });
    const conflictMode: 'immediate' | 'wait' = (modeSetting && modeSetting.value === 'immediate') ? 'immediate' : 'wait';

    const summary = await importEquipmentToDB(prisma, projectId, category, fileName, finalResult, conflictMode);

    res.json({
      success: true,
      conflictsCount: summary.conflictsCount,
      newBlocks: summary.newBlocks,
      updatedBlocks: summary.updatedBlocks,
      systems: summary.systems,
      conflictMode,
    });
  } catch (error: any) {
    if (error && error.status) return res.status(error.status).json({ error: error.error });
    console.error('Error in import-to-category:', error);
    res.status(500).json({ error: error.message || 'Не удалось импортировать файл' });
  }
});

// Импорт из мастера распознавания документов (PDF/Excel/XML/Word):
// клиент присылает уже проверенный пользователем результат в формате EquipParseResult
app.post('/api/equipment/import-draft', async (req: Request, res: Response) => {
  const { units, category, fileName, projectId: reqProjectId } = req.body;
  if (!Array.isArray(units) || units.length === 0) {
    return res.status(400).json({ error: 'Пустой результат распознавания' });
  }
  if (!category) return res.status(400).json({ error: 'Не указана категория оборудования' });

  let projectId = reqProjectId;
  if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
    let firstProject = await prisma.project.findFirst();
    if (!firstProject) firstProject = await prisma.project.create({ data: { name: 'Общий Проект' } });
    projectId = firstProject.id;
  }

  try {
    // Санитизация структуры: ожидаемые поля, строки, ограниченные размеры.
    // Управляющие/бинарные символы вырезаются — «кракозябры» в названия не попадают.
    const clean = (s: any, max = 200) => String(s ?? '')
      .replace(/[ ----�]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
    const cleanGroups = (groups: any): any[] => (Array.isArray(groups) ? groups : []).slice(0, 40).map((g: any) => ({
      title: clean(g?.title, 80) || 'Характеристики',
      params: (Array.isArray(g?.params) ? g.params : []).slice(0, 200).map((p: any) => ({
        key: clean(p?.key, 120), value: clean(p?.value, 300), unit: clean(p?.unit, 40),
      })).filter((p: any) => p.key && p.value),
    })).filter((g: any) => g.params.length);

    const result = {
      units: units.slice(0, 100).map((u: any) => ({
        name: clean(u?.name, 120) || 'Импорт',
        title: clean(u?.title, 200) || 'Импортированное оборудование',
        groups: cleanGroups(u?.groups),
        monoblocks: (Array.isArray(u?.monoblocks) ? u.monoblocks : []).slice(0, 50).map((mb: any) => ({
          name: clean(mb?.name, 120) || 'M1',
          title: clean(mb?.title, 200) || '',
          blocks: (Array.isArray(mb?.blocks) ? mb.blocks : []).slice(0, 200).map((b: any) => ({
            name: clean(b?.name, 120) || 'Позиция',
            title: clean(b?.title, 200) || '',
            equipType: clean(b?.equipType, 60) || 'component',
            groups: cleanGroups(b?.groups),
          })),
        })),
      })),
    };

    const modeSetting = await prisma.appSetting.findFirst({ where: { key: 'equip_conflict_mode', userId: null } });
    const conflictMode: 'immediate' | 'wait' = (modeSetting && modeSetting.value === 'immediate') ? 'immediate' : 'wait';

    const summary = await importEquipmentToDB(prisma, projectId, category, clean(fileName, 200) || 'Распознанный документ', result, conflictMode);

    res.json({ success: true, ...summary, conflictMode });
  } catch (error: any) {
    console.error('Error in import-draft:', error);
    res.status(500).json({ error: error.message || 'Не удалось импортировать распознанные данные' });
  }
});

// ── Настройки (глобальные/админ и персональные) ──
// Настройки приложения (/api/settings) — вынесены в server/routes/settings.ts;
// upsertSetting импортируется из server/context.ts (используется и здесь ниже).
registerSettingsRoutes(app);

// Категории оборудования (список с возможностью добавления)
const DEFAULT_CATEGORIES = [
  { id: 'AHU', label: 'Центральные кондиционеры', composite: true },
  { id: 'FAN', label: 'Радиальные вентиляторы', composite: false },
  { id: 'VALVE', label: 'Клапаны', composite: false },
  { id: 'CURTAIN', label: 'Воздушные завесы', composite: false },
];
app.get('/api/equipment/categories', async (_req: Request, res: Response) => {
  try {
    const s = await prisma.appSetting.findFirst({ where: { key: 'equip_categories', userId: null } });
    let cats: any = DEFAULT_CATEGORIES;
    if (s) { try { cats = JSON.parse(s.value); } catch (_) {} }
    res.json({ categories: cats });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
app.post('/api/equipment/categories', async (req: Request, res: Response) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) return res.status(400).json({ error: 'categories[] required' });
    await upsertSetting('equip_categories', null, JSON.stringify(categories));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
});

// Разрешение конфликта по параметру: принять расчёт (accept) или ручное значение (manual)
app.post('/api/equipment/component/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { group, key, action, value } = req.body;
    const comp = await prisma.componentElement.findUnique({ where: { id } });
    if (!comp) return res.status(404).json({ error: 'Элемент не найден' });

    const conflicts = comp.paramConflicts ? JSON.parse(comp.paramConflicts) : [];
    const conflict = conflicts.find((c: any) => c.group === group && c.key === key);
    const specsObj = comp.specs ? JSON.parse(comp.specs) : { groups: [] };
    const overrides = comp.overrides ? JSON.parse(comp.overrides) : {};

    const applyValue = action === 'manual' ? String(value ?? '') : (conflict ? conflict.newValue : undefined);
    if (applyValue !== undefined) {
      let grp = (specsObj.groups || []).find((g: any) => g.title === group);
      if (!grp) { grp = { title: group, params: [] }; specsObj.groups = [...(specsObj.groups || []), grp]; }
      let p = grp.params.find((x: any) => x.key === key);
      if (!p) { p = { key, value: '', unit: conflict?.unit || '' }; grp.params.push(p); }
      p.value = applyValue;
      if (action === 'manual') overrides[`${group}||${key}`] = applyValue;
    }

    const remaining = conflicts.filter((c: any) => !(c.group === group && c.key === key));
    const updated = await prisma.componentElement.update({
      where: { id },
      data: {
        specs: JSON.stringify(specsObj),
        overrides: JSON.stringify(overrides),
        paramConflicts: remaining.length ? JSON.stringify(remaining) : null,
        hasConflict: remaining.length > 0,
        status: remaining.length > 0 ? 'CONFLICT' : 'OK',
      },
    });
    res.json({ success: true, component: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Ручное изменение любого параметра
app.post('/api/equipment/component/:id/override', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { group, key, value } = req.body;
    const comp = await prisma.componentElement.findUnique({ where: { id } });
    if (!comp) return res.status(404).json({ error: 'Элемент не найден' });
    const specsObj = comp.specs ? JSON.parse(comp.specs) : { groups: [] };
    const overrides = comp.overrides ? JSON.parse(comp.overrides) : {};
    let grp = (specsObj.groups || []).find((g: any) => g.title === group);
    if (!grp) { grp = { title: group, params: [] }; specsObj.groups = [...(specsObj.groups || []), grp]; }
    let p = grp.params.find((x: any) => x.key === key);
    if (!p) { p = { key, value: '', unit: '' }; grp.params.push(p); }
    p.value = String(value ?? '');
    overrides[`${group}||${key}`] = p.value;
    const updated = await prisma.componentElement.update({
      where: { id }, data: { specs: JSON.stringify(specsObj), overrides: JSON.stringify(overrides) },
    });
    res.json({ success: true, component: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 2. Accept a field discrepancy from conflict
app.post('/api/components/:id/accept-field', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fieldName } = req.body;
  if (!fieldName) {
    return res.status(400).json({ error: 'fieldName is required' });
  }

  try {
    const component = await prisma.componentElement.findUnique({
      where: { id }
    });
    if (!component) {
      return res.status(404).json({ error: 'Элемент не найден' });
    }

    const specsObj = component.specs ? JSON.parse(component.specs) : {};
    const conflictLogObj = component.conflictLog ? JSON.parse(component.conflictLog) : {};

    if (!conflictLogObj[fieldName]) {
      return res.status(400).json({ error: 'Конфликт по данному полю не найден' });
    }

    const newVal = conflictLogObj[fieldName].new;
    specsObj[fieldName] = newVal;
    delete conflictLogObj[fieldName];

    const hasRemainingConflicts = Object.keys(conflictLogObj).length > 0;

    const updated = await prisma.componentElement.update({
      where: { id },
      data: {
        specs: JSON.stringify(specsObj),
        conflictLog: hasRemainingConflicts ? JSON.stringify(conflictLogObj) : null,
        hasConflict: hasRemainingConflicts,
        status: hasRemainingConflicts ? 'CONFLICT' : 'OK'
      }
    });

    res.json({ success: true, component: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Manually edit a field and resolve its conflict
app.post('/api/components/:id/manual-edit-field', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fieldName, newValue } = req.body;
  if (!fieldName) {
    return res.status(400).json({ error: 'fieldName is required' });
  }

  try {
    const component = await prisma.componentElement.findUnique({
      where: { id }
    });
    if (!component) {
      return res.status(404).json({ error: 'Элемент не найден' });
    }

    const specsObj = component.specs ? JSON.parse(component.specs) : {};
    const conflictLogObj = component.conflictLog ? JSON.parse(component.conflictLog) : {};

    specsObj[fieldName] = newValue;
    if (conflictLogObj[fieldName]) {
      delete conflictLogObj[fieldName];
    }

    const hasRemainingConflicts = Object.keys(conflictLogObj).length > 0;

    const updated = await prisma.componentElement.update({
      where: { id },
      data: {
        specs: JSON.stringify(specsObj),
        conflictLog: hasRemainingConflicts ? JSON.stringify(conflictLogObj) : null,
        hasConflict: hasRemainingConflicts,
        status: hasRemainingConflicts ? 'CONFLICT' : 'OK'
      }
    });

    res.json({ success: true, component: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  // Выводим полный путь к файлу БД, который пытается открыть Prisma при старте
  const defaultLocalDbPath = path.join(ventAppDataPath, 'database.sqlite');
  try {
    logInit('[SQLite Startup Diagnostic] Инициализация Prisma перед стартом сервера...');
    logInit(`[SQLite Startup Diagnostic] Полный абсолютный путь к файлу БД: ${defaultLocalDbPath}`);
  } catch (diagErr: any) {
    console.warn('[SQLite Startup Diagnostic] (ошибка логгирования)', diagErr.message);
  }

  if (!prisma || !isPrismaAvailable) {
    logInit('[startServer Warning] Prisma client is NOT constructed or not available. Skipping database self-healing checks. Moving straight to starting Express listener.');
  } else {
    // SQLite dynamic DB integrity / corruption self-healing check
    try {
      await prisma.$queryRawUnsafe('SELECT 1;');
      logInit('[SQLite] Integrity check: connection successfully verified with SELECT 1.');
    } catch (error: any) {
      const errorMsg = String(error.message || error || '');
      logInit(`[SQLite Integrity Check failed] General SQLite connect check threw: ${errorMsg}`);
      if (errorMsg.includes('malformed') || errorMsg.includes('disk image') || errorMsg.includes('SqliteError') || errorMsg.includes('database.sqlite is not stable')) {
        logInit('[SQLite] Database corruption detected! Initiating dynamic self-healing...');
        try {
          await prisma.$disconnect();
        } catch (e) {}

        const dbPath = defaultLocalDbPath;
        const shmPath = dbPath + '-shm';
        const walPath = dbPath + '-wal';

        [dbPath, shmPath, walPath].forEach(f => {
          try {
            if (fs.existsSync(f)) {
              fs.unlinkSync(f);
              logInit(`[SQLite Recovery] Deleted corrupt file: ${f}`);
            }
          } catch (delError: any) {
            logInit(`[SQLite Recovery Exception] Failed to delete file ${f}: ${delError.message}`);
          }
        });

        logInit('[SQLite Recovery] Copying fresh SQLite database template to recover from corruption...');
        ensureSQLiteDatabaseExists(dbPath);

        // Recreate client
        process.env.DATABASE_URL = `file:${dbPath}?connection_limit=1&busy_timeout=15000`;
        try {
          prisma = createPrismaClient('LOCAL', process.env.DATABASE_URL);
          setPrisma(prisma);
          isPrismaAvailable = true;
          logInit('[SQLite Recovery] Constructed fresh PrismaClient successfully.');
        } catch (recreationErr: any) {
          logInit(`[SQLite Recovery Failure] Critical error reconstructing client: ${recreationErr.message}`);
          prisma = null;
          setPrisma(prisma);
          isPrismaAvailable = false;
        }
      } else {
        logInit('[SQLite Startup Connection Error] Skipping self-healing as error is not structural corruption.');
      }
    }

    if (prisma && isPrismaAvailable) {
      // Enable Write-Ahead Logging (WAL) mode for SQLite to prevent database disk image malformed exceptions during multi-user write operations
      try {
        await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
        await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
        logInit('[SQLite] WAL (Write-Ahead Logging) Mode and synchronous=NORMAL successfully enabled.');
      } catch (error: any) {
        logInit(`[SQLite WAL Setting skip] SQLite WAL mode pragma check skipped/failed: ${error.message}`);
      }

      // Ensure database is seeded with initial user and project if empty
      try {
        const userCount = await prisma.user.count();
        if (userCount === 0) {
          logInit('[Database Seeder] No users found in database. Performing automatic initial seed...');
          const admin = await prisma.user.create({
            data: {
              name: 'Главный Администратор (RaupovKhKh)',
              symbol: 'RaupovKhKh',
              password: '1122',
              role: 'ADMIN',
            }
          });
          logInit(`[Database Seeder] Created initial admin user: ${admin.symbol}`);

          const project = await prisma.project.create({
            data: {
              name: 'Технологический Проект Альфа',
            }
          });
          logInit(`[Database Seeder] Created initial project: ${project.name}`);

          await prisma.equipment.create({
            data: {
              type: 'AHU',
              description: 'Air Handling Unit',
            }
          });
        }

        // Seed dummy notes if none exist
        const notesCount = await prisma.userNote.count();
        if (notesCount === 0) {
          logInit('[Database Seeder] Seeding initial notes...');
          await prisma.userNote.createMany({
            data: [
              {
                title: 'Заметки по проекту вентиляции',
                content: '<p>Проверить производительность <strong>AHU-2</strong> согласно обновленному ТЗ.</p><p>Учесть параметры сопротивления воздушного тракта и настроить частотные преобразователи.</p>',
                color: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200',
                equipmentId: 'AHU-2'
              },
              {
                title: 'Согласование схем автоматики',
                content: '<p>Выполнить сверку сигналов КИПиА для щита вентиляции. Особое внимание уделить датчикам перепада давления.</p>',
                color: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-250',
                equipmentId: 'AHU'
              }
            ]
          });
        }

        // Seed dummy logs if none exist
        const logsCount = await prisma.systemChangeLog.count();
        if (logsCount === 0) {
          logInit('[Database Seeder] Seeding initial changelogs...');
          await prisma.systemChangeLog.createMany({
            data: [
              {
                userName: 'Главный Администратор (RaupovKhKh)',
                userSymbol: 'RaupovKhKh',
                description: 'Обновлены спецификации вентилятора по тегу AHU-2',
                targetRoute: '/explorer',
              },
              {
                userName: 'Главный Администратор (RaupovKhKh)',
                userSymbol: 'RaupovKhKh',
                description: 'Добавлен новый чертеж КМД-102 в папку Проекты',
                targetRoute: '/explorer',
              },
              {
                userName: 'Главный Администратор (RaupovKhKh)',
                userSymbol: 'RaupovKhKh',
                description: 'Сформирована сводная ведомость по оборудованию Проекта Альфа',
                targetRoute: '/',
              },
              {
                userName: 'Главный Администратор (RaupovKhKh)',
                userSymbol: 'RaupovKhKh',
                description: 'Изменен статус проекта на Активный',
                targetRoute: '/',
              }
            ]
          });
        }

      } catch (e: any) {
        logInit(`[Database Seeder error] Seeding failed/skipped: ${e.message}`);
      }
    }
  }

  app.use((err: any, req: Request, res: Response, next: any) => {
    const rawMsg = String(err?.message || err || 'Internal server error');
    // Берем суть ошибки Prisma — последняя строка вместо простыни с код-фреймом
    const lines = rawMsg.split('\n').map(l => l.trim()).filter(Boolean);
    let friendly = lines[lines.length - 1] || rawMsg;
    if (rawMsg.includes('malformed') || rawMsg.includes('disk image')) {
      friendly = 'База данных повреждена (database disk image is malformed). Перезапустите приложение — база будет автоматически восстановлена из шаблона.';
    } else if (rawMsg.includes('Foreign key constraint')) {
      friendly = 'Сессия устарела: текущий пользователь отсутствует в базе данных. Выйдите из профиля и войдите заново.';
    } else if (!prisma || !isPrismaAvailable) {
      friendly = 'База данных не инициализирована: клиент Prisma не был создан при старте. Подробности в backend-init.log.';
    }
    logInit(`[API ERROR] ${req.method} ${req.originalUrl}: ${friendly}`);
    console.error('Unhandled error:', err);
    res.status(500).json({ error: friendly, message: friendly });
  });

  if (process.env.NODE_ENV !== "production") {
    try {
      const viteModule = eval('require')('vite');
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (viteErr: any) {
      console.error('[Vite Setup] Error initializing dynamic Vite middleware in dev env:', viteErr.message || viteErr);
    }
  } else {
    const distPath = __dirname.includes('app.asar')
       ? __dirname
       : path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    logInit(`[Server listener started] Express backend server successfully running on port ${PORT}`);
  });
}

startServer();
