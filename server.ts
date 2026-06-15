import 'express-async-errors';
import express, { Request, Response } from 'express';
import path from 'path';
import { PrismaClient } from '@prisma/client-sqlite';
import { parseExcel, parseXML, importParsedDataToDB } from './server/excelParser.js';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import { exec, execSync } from 'child_process';
import os from 'os';

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
      const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
      const ok = Array.isArray(integrity) && integrity.length > 0 &&
        String(integrity[0].integrity_check ?? integrity[0]).toLowerCase() === 'ok';
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
    isPrismaAvailable = true;
    logInit('[Prisma Client Init Recovery] Fallback PrismaClient constructed.');
  } catch (fallbackErr: any) {
    logInit(`[Prisma Client Init Recovery Exception] Failed to construct fallback PrismaClient: ${fallbackErr.message}\nStack: ${fallbackErr.stack}`);
    prisma = null;
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

const app = express();
const PORT = 3000;

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"]
  }
});

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

  socket.on('disconnect', () => {
    console.log(`[Socket] client disconnected: ${socket.id}`);
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

// Users
app.post('/api/login', async (req: Request, res: Response) => {
  const { symbol, password } = req.body;

  const normSymbol = String(symbol || '').trim();

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
      // Check password. We also support both variations of RU-keyboard "gfhjkm" (пароль), "12121212Qw.", and "1122" for RaupovKhKh to prevent lock-outs
      const isPasswordCorrect = user.password === String(password) ||
        (user.symbol === 'RaupovKhKh' && (
          String(password) === 'gfhjkm 12121212Qw.' || 
          String(password) === '12121212Qw.' || 
          String(password) === '1122'
        ));

      if (isPasswordCorrect) {
        // Контроль доступа: профиль может быть отключен администратором или просрочен
        if (user.isActive === false) {
          return res.status(403).json({ success: false, message: 'Профиль отключен администратором. Обратитесь к администратору системы.' });
        }
        if (user.validUntil && new Date(user.validUntil).getTime() < Date.now()) {
          const dt = new Date(user.validUntil).toLocaleDateString('ru-RU');
          return res.status(403).json({ success: false, message: `Срок действия профиля истек ${dt}. Обратитесь к администратору для продления доступа.` });
        }
        return res.json({ success: true, user });
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
    if (user.validUntil && new Date(user.validUntil).getTime() < Date.now()) {
      return res.json({ valid: false, reason: `Срок действия профиля истек ${new Date(user.validUntil).toLocaleDateString('ru-RU')}.` });
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
      prisma.fileNode.count(),
    ]);

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
          });
        }
      }
    }

    res.json({
      projectId,
      projects,
      tags: (tags as any[]).map((t: any) => ({
        id: t.id, identifier: t.identifier, brand: t.brand,
        department: t.department, wbs: t.wbs, fluid: t.fluid,
      })),
      components,
      counts: {
        tags: (tags as any[]).length,
        components: components.length,
        systems: (systems as any[]).length,
        users: usersCount,
        notes: notesCount,
        folders: foldersCount,
        files: filesCount,
        projects: (projects as any[]).length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
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

    const { validUntil, isActive } = req.body;
    const newUser = await prisma.user.create({
      data: {
        symbol: String(symbol),
        name,
        role: role || 'ENGINEER_VENT',
        password: password || 'password',
        isActive: typeof isActive === 'boolean' ? isActive : true,
        validUntil: validUntil ? new Date(validUntil) : null,
      }
    });
    res.json(newUser);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Обновление профиля сотрудника: роль, пароль, активность, срок действия
app.put('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, password, isActive, validUntil } = req.body;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ success: false, message: 'Сотрудник не найден в базе данных.' });
    }

    // Защита от самоблокировки: нельзя отключить/ограничить последнего активного администратора
    const willDeactivate = isActive === false || (validUntil && new Date(validUntil).getTime() < Date.now());
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
    if (typeof role === 'string' && role) data.role = role;
    if (typeof password === 'string' && password) data.password = password;
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (validUntil === null || validUntil === '') data.validUntil = null;
    else if (validUntil) data.validUntil = new Date(validUntil);

    const updated = await prisma.user.update({ where: { id }, data });
    res.json({ success: true, user: updated });
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

// Projects
app.get('/api/projects', async (req: Request, res: Response) => {
  const projects = await prisma.project.findMany();
  res.json({ projects });
});

app.post('/api/projects', async (req: Request, res: Response) => {
  const { name, description, info } = req.body;
  const project = await prisma.project.create({
    data: {
      name,
      description: description || '',
      info: info || '',
      status: 'ACTIVE'
    }
  });
  res.json({ project });
});

app.put('/api/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, info, status } = req.body;
    const project = await prisma.project.update({
      where: { id },
      data: {
        name,
        description: description !== undefined ? description : '',
        info: info !== undefined ? info : '',
        status: status || 'ACTIVE'
      }
    });
    res.json({ project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', async (req: Request, res: Response) => {
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

// Folders & Files (Explorer)
app.get('/api/projects/:projectId/folders', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  try {
    let folders;
    let rootFiles;
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      folders = await prisma.folder.findMany({
        include: { files: { include: { mainTags: true, additionalTags: true, createdBy: true, updatedBy: true } } }
      });
      rootFiles = await prisma.fileNode.findMany({
        where: { folderId: null },
        include: { mainTags: true, additionalTags: true, createdBy: true, updatedBy: true }
      });
    } else {
      folders = await prisma.folder.findMany({
        where: { projectId },
        include: { files: { include: { mainTags: true, additionalTags: true, createdBy: true, updatedBy: true } } }
      });
      rootFiles = await prisma.fileNode.findMany({
        where: { folderId: null },
        include: { mainTags: true, additionalTags: true, createdBy: true, updatedBy: true }
      });
    }
    res.json({ folders, rootFiles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/folders', async (req: Request, res: Response) => {
  try {
    let { name, projectId, parentId } = req.body;
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      let firstProject = await prisma.project.findFirst();
      if (!firstProject) {
        firstProject = await prisma.project.create({
          data: { name: 'Общий Проект' }
        });
      }
      projectId = firstProject.id;
    }
    const folder = await prisma.folder.create({
      data: { name, projectId, parentId }
    });
    res.json({ folder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/folders/:id', async (req: Request, res: Response) => {
  const folder = await prisma.folder.update({
    where: { id: req.params.id },
    data: req.body,
    include: { files: { include: { mainTags: true, additionalTags: true } } }
  });
  res.json({ folder });
});

app.delete('/api/folders/:id', async (req: Request, res: Response) => {
  await prisma.folder.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

app.post('/api/files', async (req: Request, res: Response) => {
  const file = await prisma.fileNode.create({ 
    data: req.body,
    include: { mainTags: true, additionalTags: true, createdBy: true, updatedBy: true }
  });
  res.json({ file });
});

app.post('/api/files/copy', async (req: Request, res: Response) => {
  const { ids, targetFolderId, isCut } = req.body;
  // This is a simplified copy/move logic
  try {
    for (const id of ids) {
      if (isCut) {
        // Just move it
        const file = await prisma.fileNode.findUnique({ where: { id } });
        if (file) await prisma.fileNode.update({ where: { id }, data: { folderId: targetFolderId } });
        else await prisma.folder.update({ where: { id }, data: { parentId: targetFolderId } });
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
    let tags;
    if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
      tags = await prisma.tag.findMany({
        include: { equipment: true }
      });
    } else {
      tags = await prisma.tag.findMany({
        where: { projectId },
        include: { equipment: true }
      });
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

// Update tag fields and json metadata
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
app.get('/api/notes', async (req: Request, res: Response) => {
  try {
    const notes = await prisma.userNote.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ notes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get single note
app.get('/api/notes/:id', async (req: Request, res: Response) => {
  try {
    const note = await prisma.userNote.findUnique({
      where: { id: req.params.id }
    });
    if (!note) {
      return res.status(404).json({ error: 'Заметка не найдена' });
    }
    res.json({ note });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Create note
app.post('/api/notes', async (req: Request, res: Response) => {
  try {
    const { title, content, color, equipmentId } = req.body;
    const note = await prisma.userNote.create({
      data: {
        title: title || 'Новая заметка',
        content: content || '',
        color: color || 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200',
        equipmentId
      }
    });
    res.json({ note });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Update note
app.patch('/api/notes/:id', async (req: Request, res: Response) => {
  try {
    const { title, content, color, equipmentId } = req.body;
    const note = await prisma.userNote.update({
      where: { id: req.params.id },
      data: {
        title,
        content,
        color,
        equipmentId
      }
    });
    res.json({ note });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Delete note
app.delete('/api/notes/:id', async (req: Request, res: Response) => {
  try {
    await prisma.userNote.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Get logs
app.get('/api/logs', async (req: Request, res: Response) => {
  try {
    const logs = await prisma.systemChangeLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Write log
app.post('/api/logs', async (req: Request, res: Response) => {
  try {
    const { userName, userSymbol, description, targetRoute } = req.body;
    const log = await prisma.systemChangeLog.create({
      data: {
        userName: userName || 'Сотрудник',
        userSymbol: userSymbol || 'ENGINEER',
        description,
        targetRoute: targetRoute || ''
      }
    });
    res.json({ log });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


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

    // Sanitizing fileName to prevent Path Traversal
    const sanitizedFileName = path.basename(String(fileName)).replace(/[\/\\]/g, '');
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

// 1. Import by category with revision checking
app.post('/api/equipment/import-to-category', async (req: Request, res: Response) => {
  const { fileId, category, projectId: reqProjectId } = req.body;
  if (!fileId || !category) {
    return res.status(400).json({ error: 'Missing fileId or category' });
  }

  let projectId = reqProjectId;
  if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
    let firstProject = await prisma.project.findFirst();
    if (!firstProject) {
      firstProject = await prisma.project.create({ data: { name: 'Общий Проект' } });
    }
    projectId = firstProject.id;
  }

  try {
    const fileNode = await prisma.fileNode.findUnique({
      where: { id: fileId }
    });
    if (!fileNode) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    if (!fileNode.content) {
      return res.status(400).json({ error: 'Содержимое файла пустое' });
    }

    let base64 = fileNode.content;
    if (base64.includes(',')) {
      base64 = base64.split(',')[1];
    }

    const buffer = Buffer.from(base64, 'base64');
    const extension = fileNode.name.split('.').pop()?.toLowerCase();

    let parseResult;
    if (extension === 'xml') {
      const fileText = buffer.toString('utf-8');
      parseResult = parseXML(fileText);
    } else {
      parseResult = parseExcel(buffer);
    }

    const importedSystems = [];
    const processedComponentIds: string[] = [];
    let conflictsCount = 0;

    for (const sysData of parseResult.systems) {
      let system = await prisma.equipmentSystem.findFirst({
        where: {
          projectId,
          name: sysData.name,
          category: category
        }
      });

      const isNewSystem = !system;

      if (!system) {
        system = await prisma.equipmentSystem.create({
          data: {
            projectId,
            name: sysData.name,
            category: category,
            fileName: fileNode.name
          }
        });
      }

      const monoblocksResult = [];

      for (const mbData of sysData.monoblocks) {
        let monoblock = await prisma.monoblock.findFirst({
          where: {
            systemId: system.id,
            name: mbData.name
          }
        });
        if (!monoblock) {
          monoblock = await prisma.monoblock.create({
            data: {
              systemId: system.id,
              name: mbData.name
            }
          });
        }

        const componentsResult = [];

        for (const compData of mbData.components) {
          let component = await prisma.componentElement.findFirst({
            where: {
              monoblockId: monoblock.id,
              itemCode: compData.name
            }
          });

          const serializedSpecs = JSON.stringify(compData.specs);

          if (component && !isNewSystem) {
            const oldSpecsObj = component.specs ? JSON.parse(component.specs) : {};
            const newSpecsObj = compData.specs || {};

            const conflictMap: Record<string, { old: string; new: string }> = {};
            const allKeys = Array.from(new Set([...Object.keys(oldSpecsObj), ...Object.keys(newSpecsObj)]));
            let hasDiff = false;

            for (const key of allKeys) {
              const oldVal = oldSpecsObj[key] !== undefined ? String(oldSpecsObj[key]) : "";
              const newVal = newSpecsObj[key] !== undefined ? String(newSpecsObj[key]) : "";
              if (oldVal !== newVal) {
                hasDiff = true;
                conflictMap[key] = {
                  old: oldVal,
                  new: newVal
                };
              }
            }

            let updatedComponent;
            if (hasDiff) {
              conflictsCount++;
              updatedComponent = await prisma.componentElement.update({
                where: { id: component.id },
                data: {
                  name: compData.title || compData.name,
                  conflictLog: JSON.stringify(conflictMap),
                  hasConflict: true,
                  status: 'CONFLICT'
                }
              });

              await prisma.equipmentHistory.create({
                data: {
                  elementId: component.id,
                  version: component.version,
                  oldSpecs: component.specs,
                  newSpecs: serializedSpecs,
                  changeType: 'UPDATE'
                }
              });
            } else {
              updatedComponent = await prisma.componentElement.update({
                where: { id: component.id },
                data: {
                  name: compData.title || compData.name
                }
              });
            }

            processedComponentIds.push(updatedComponent.id);
            componentsResult.push(updatedComponent);
          } else {
            const newComponent = await prisma.componentElement.create({
              data: {
                monoblockId: monoblock.id,
                name: compData.title || compData.name,
                itemCode: compData.name,
                specs: serializedSpecs,
                version: 1,
                status: 'OK',
                hasConflict: false,
                conflictType: null
              }
            });

            await prisma.equipmentHistory.create({
              data: {
                elementId: newComponent.id,
                version: 1,
                oldSpecs: null,
                newSpecs: serializedSpecs,
                changeType: 'CREATE'
              }
            });

            processedComponentIds.push(newComponent.id);
            componentsResult.push(newComponent);
          }
        }
        monoblocksResult.push({ ...monoblock, components: componentsResult });
      }
      importedSystems.push({ ...system, monoblocks: monoblocksResult });
    }

    res.json({ success: true, systems: importedSystems, conflictsCount });
  } catch (error: any) {
    console.error('Error in import-to-category:', error);
    res.status(500).json({ error: error.message || 'Failed to import file' });
  }
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
          isPrismaAvailable = true;
          logInit('[SQLite Recovery] Constructed fresh PrismaClient successfully.');
        } catch (recreationErr: any) {
          logInit(`[SQLite Recovery Failure] Critical error reconstructing client: ${recreationErr.message}`);
          prisma = null;
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
