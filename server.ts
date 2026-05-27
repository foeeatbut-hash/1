import 'express-async-errors';
import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PrismaClient } from '@prisma/client';
import { parseExcel, parseXML, importParsedDataToDB } from './server/excelParser.js';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import { exec, execSync } from 'child_process';
import os from 'os';

function getVentAppDataPath(): string {
  try {
    const home = os.homedir();
    const desktop = path.join(home, 'Desktop');
    const onedriveDesktop = path.join(home, 'OneDrive', 'Desktop');
    const onedriveRuDesktop = path.join(home, 'OneDrive', 'Рабочий стол');
    const ruDesktop = path.join(home, 'Рабочий стол');
    
    let desktopPath = desktop;
    if (fs.existsSync(desktop)) {
      desktopPath = desktop;
    } else if (fs.existsSync(onedriveDesktop)) {
      desktopPath = onedriveDesktop;
    } else if (fs.existsSync(ruDesktop)) {
      desktopPath = ruDesktop;
    } else if (fs.existsSync(onedriveRuDesktop)) {
      desktopPath = onedriveRuDesktop;
    }
    return path.join(desktopPath, 'VentApp-Data');
  } catch (err) {
    return path.join(process.cwd(), 'database');
  }
}

const ventAppDataPath = getVentAppDataPath();

// Ensure the directory exists
try {
  if (!fs.existsSync(ventAppDataPath)) {
    fs.mkdirSync(ventAppDataPath, { recursive: true });
  }
} catch (err) {
  console.warn('[Server Setup] Error creating database directory on Desktop:', err);
}

// Keep userDataPath referencing ventAppDataPath for general safety and log/chat_files locations
let userDataPath = ventAppDataPath;

const CONFIG_FILE = path.join(ventAppDataPath, 'config.json');

function ensureSQLiteDatabaseExists(targetPath: string): boolean {
  try {
    if (fs.existsSync(targetPath)) {
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

    for (const templatePath of possibleTemplatePaths) {
      if (fs.existsSync(templatePath)) {
        console.log(`[SQLite Sync] Copying template DB from ${templatePath} to ${targetPath}`);
        fs.copyFileSync(templatePath, targetPath);
        return true;
      }
    }

    // Fallback: Create empty file if absolutely nothing can be loaded, though printing a warning
    console.warn('[SQLite Sync] SQLite template database not found. Creating empty file.');
    fs.writeFileSync(targetPath, '', 'utf-8');
    return false;
  } catch (err: any) {
    console.error('[SQLite Sync] Error copy/init SQLite database template:', err.message);
    return false;
  }
}

function createPrismaClient(dbType: string) {
  try {
    if (dbType === 'REMOTE') {
      const { PrismaClient: RemotePrisma } = require('@prisma/client-pg');
      return new RemotePrisma();
    } else {
      const { PrismaClient: LocalPrisma } = require('@prisma/client');
      return new LocalPrisma();
    }
  } catch (err: any) {
    console.error(`[Prisma Init] Error creating client for ${dbType}:`, err.message);
    const { PrismaClient: LocalPrisma } = require('@prisma/client');
    return new LocalPrisma();
  }
}

interface AppConfig {
  current_db_type: 'LOCAL' | 'REMOTE' | string;
  database_url: string;
}

function loadAppConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.current_db_type === 'string') {
        return {
          current_db_type: parsed.current_db_type,
          database_url: parsed.database_url || ''
        };
      }
    }
  } catch (err) {
    console.warn('[Config] Error reading config.json:', err);
  }
  
  const defaultConfig: AppConfig = {
    current_db_type: 'LOCAL',
    database_url: ''
  };
  saveAppConfig(defaultConfig);
  return defaultConfig;
}

function saveAppConfig(config: AppConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Config] Error writing config.json:', err);
  }
}

// Backward compatibility with other endpoints expecting loadDbConfig()
interface DbConfig {
  databasePath: string;
  isConfigured: boolean;
}

function loadDbConfig(): DbConfig {
  const config = loadAppConfig();
  const dbFile = path.join(ventAppDataPath, 'production.sqlite');
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
  const localDbFile = path.join(ventAppDataPath, 'production.sqlite');
  startupDbUrl = `file:${localDbFile}?connection_limit=1&busy_timeout=15000`;
  
  const isDbMissing = !fs.existsSync(localDbFile);
  if (isDbMissing) {
    console.log('[Startup DB] production.sqlite does not exist. Initializing copy of database template...');
    ensureSQLiteDatabaseExists(localDbFile);
  }
} else {
  startupDbUrl = appConfig.database_url;
}

process.env.DATABASE_URL = startupDbUrl;
let prisma = createPrismaClient(appConfig.current_db_type);

// Auto-seed user and structure if database is empty
(async () => {
  try {
    if (appConfig.current_db_type === 'LOCAL') {
      try {
        await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
        await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
      } catch (e) {}
    }
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('[Startup DB] Initializing empty database. Creating default Admin interface.');
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
    }
  } catch (err: any) {
    console.warn('[Startup DB Seed] Check/Auto-seed skipped or failed:', err.message);
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
  const dbPath = path.join(ventAppDataPath, 'production.sqlite');
  res.json({
    current_db_type: config.current_db_type,
    database_url: config.database_url,
    databasePath: dbPath,
    isConfigured: true,
    displayPath: config.current_db_type === 'LOCAL' ? './production.sqlite' : config.database_url,
    defaultPath: dbPath
  });
});

app.get('/api/db/download', (req: Request, res: Response) => {
  const dbFile = path.join(ventAppDataPath, 'production.sqlite');
  if (fs.existsSync(dbFile)) {
    res.download(dbFile, 'production.sqlite');
  } else {
    res.status(404).json({ error: 'Файл базы данных не найден на сервере' });
  }
});

app.post('/api/db/test', async (req: Request, res: Response) => {
  const { current_db_type, database_url } = req.body;
  if (current_db_type === 'LOCAL') {
    return res.json({
      success: true,
      exists: fs.existsSync(path.join(ventAppDataPath, 'production.sqlite')),
      message: 'Локальная база данных SQLite активна и готова к работе!'
    });
  }

  if (!database_url) {
    return res.status(400).json({ success: false, message: 'Строка подключения remote_url не указана!' });
  }

  // Test custom remote URL using a temporary client
  try {
    const tempUrl = database_url;
    const { PrismaClient: TempClient } = require('@prisma/client-pg');
    process.env.DATABASE_URL = tempUrl;
    const tempPrisma = new TempClient();
    await tempPrisma.$queryRawUnsafe('SELECT 1;');
    await tempPrisma.$disconnect();
    
    // Restore primary env context
    const current = loadAppConfig();
    if (current.current_db_type === 'LOCAL') {
      const localDb = path.join(ventAppDataPath, 'production.sqlite');
      process.env.DATABASE_URL = `file:${localDb}?connection_limit=1&busy_timeout=15000`;
    } else {
      process.env.DATABASE_URL = current.database_url;
    }

    res.json({
      success: true,
      exists: true,
      message: 'Удаленное подключение успешно проверено и доступно!'
    });
  } catch (err: any) {
    // Restore primary env context
    const current = loadAppConfig();
    if (current.current_db_type === 'LOCAL') {
      const localDb = path.join(ventAppDataPath, 'production.sqlite');
      process.env.DATABASE_URL = `file:${localDb}?connection_limit=1&busy_timeout=15000`;
    } else {
      process.env.DATABASE_URL = current.database_url;
    }

    res.json({
      success: false,
      message: `Не удалось подключиться по указанному адресу: ${err.message}`
    });
  }
});

app.post('/api/db/switch', async (req: Request, res: Response) => {
  const { current_db_type, database_url } = req.body;
  
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
    let targetDbUrl = '';
    if (current_db_type === 'LOCAL') {
      const dbFile = path.join(ventAppDataPath, 'production.sqlite');
      targetDbUrl = `file:${dbFile}?connection_limit=1&busy_timeout=15000`;
      
      const isDbMissing = !fs.existsSync(dbFile);
      if (isDbMissing) {
        console.log('[DB Switch] Path production.sqlite missing. Initializing copy of database template...');
        ensureSQLiteDatabaseExists(dbFile);
      }
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
    prisma = createPrismaClient(current_db_type);

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
      current_db_type,
      database_url: database_url || ''
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
      prisma = createPrismaClient('LOCAL');
      
      try {
        await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
        await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
      } catch (e) {}

      saveAppConfig({
        current_db_type: 'LOCAL',
        database_url: targetDbUrl
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
  const normPassword = String(password || '');

  // 1. Зашитые профили пользователей (Hardcoded Fallback Credentials - Исправлен регистр ролей на ADMIN и USER)
  if (normSymbol === 'KhKh' && normPassword === '121212') {
    return res.json({
      success: true,
      user: {
        id: 'fallback-admin',
        name: 'Главный Администратор (KhKh)',
        symbol: 'KhKh',
        role: 'ADMIN' // Полный доступ (исправлено на верхний регистр)
      }
    });
  }

  if (normSymbol === 'qwerty' && normPassword === '12') {
    return res.json({
      success: true,
      user: {
        id: 'fallback-user',
        name: 'Инженер (qwerty)',
        symbol: 'qwerty',
        role: 'USER' // Ограниченный доступ (исправлено на верхний регистр)
      }
    });
  }

  // Попытка авторизации через локальную БД, если БД вообще была создана/готова
  try {
    const user = await prisma.user.findUnique({
      where: { symbol: String(symbol) },
    });
    if (user) {
      // Check password. We also support both variations of RU-keyboard "gfhjkm" (пароль), "12121212Qw.", and "1122" for RaupovKhKh to prevent lock-outs
      const isPasswordCorrect = user.password === String(password) ||
        (user.symbol === 'RaupovKhKh' && (
          String(password) === 'gfhjkm 12121212Qw.' || 
          String(password) === '12121212Qw.' || 
          String(password) === '1122'
        ));

      if (isPasswordCorrect) {
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
      message: 'База данных еще не инициализирована или не подключена. Пожалуйста, войдите под зашитыми профилями (KhKh / qwerty) или настройте СУБД.' 
    });
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

    const newUser = await prisma.user.create({
      data: {
        symbol: String(symbol),
        name,
        role: role || 'ENGINEER_VENT',
        password: password || 'password',
      }
    });
    res.json(newUser);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
        linkedElement: true
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
    const { senderId, receiverId, content, linkedElementId, linkedProjectId, attachments } = req.body;
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
        linkedElement: true
      }
    });

    // Notify other clients via Socket.io
    io.emit('chat:message_received', fullMessage);

    res.json(fullMessage);
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
        linkedElement: true
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
    const { senderId, groupId, content, linkedElementId, linkedProjectId, attachments } = req.body;
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
        linkedElement: true
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
  const defaultLocalDbPath = path.join(ventAppDataPath, 'production.sqlite');
  try {
    console.log('[SQLite Startup Diagnostic] Инициализация Prisma...');
    console.log(`[SQLite Startup Diagnostic] Полный абсолютный путь к файлу БД: ${defaultLocalDbPath}`);
  } catch (diagErr: any) {
    console.warn('[SQLite Startup Diagnostic] (ошибка логгирования)', diagErr.message);
  }

  // SQLite dynamic DB integrity / corruption self-healing check
  try {
    await prisma.$queryRawUnsafe('SELECT 1;');
    console.log('[SQLite] Integrity check: connection successfully verified');
  } catch (error: any) {
    const errorMsg = String(error.message || error || '');
    if (errorMsg.includes('malformed') || errorMsg.includes('disk image') || errorMsg.includes('SqliteError') || errorMsg.includes('database.sqlite is not stable')) {
      console.warn('[SQLite] Database corruption detected! Initiating dynamic self-healing...', errorMsg);
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
            console.log(`[SQLite Recovery] Deleted corrupt file: ${f}`);
          }
        } catch (delError) {
          console.error(`[SQLite Recovery] Failed to delete file ${f}:`, delError);
        }
      });

      console.log('[SQLite Recovery] Copying fresh SQLite database template to recover from corruption...');
      ensureSQLiteDatabaseExists(dbPath);

      // Recreate client
      process.env.DATABASE_URL = `file:${dbPath}?connection_limit=1&busy_timeout=15000`;
      prisma = createPrismaClient('LOCAL');
    } else {
      console.error('[SQLite Startup Error] General startup error (skipped self-healing):', errorMsg);
    }
  }

  // Enable Write-Ahead Logging (WAL) mode for SQLite to prevent database disk image malformed exceptions during multi-user write operations
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
    console.log('[SQLite] WAL (Write-Ahead Logging) Mode and synchronous=NORMAL successfully enabled.');
  } catch (error) {
    console.warn('[SQLite] SQLite WAL mode pragma check skipped:', error);
  }

  // Ensure database is seeded with initial user and project if empty
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('No users found in database. Performing automatic initial seed...');
      const admin = await prisma.user.create({
        data: {
          name: 'Главный Администратор (RaupovKhKh)',
          symbol: 'RaupovKhKh',
          password: '1122',
          role: 'ADMIN',
        }
      });
      console.log('Created initial admin user:', admin.symbol);

      const project = await prisma.project.create({
        data: {
          name: 'Технологический Проект Альфа',
        }
      });
      console.log('Created initial project:', project.name);

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
      console.log('Seeding initial notes...');
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
      console.log('Seeding initial changelogs...');
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

  } catch (e) {
    console.error('Database auto-seeding error:', e);
  }

  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
