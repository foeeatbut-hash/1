import { app, BrowserWindow, ipcMain, Menu, utilityProcess } from 'electron';
import path from 'path';

const additionalData = { myKey: 'pdm-system' };
const gotTheLock = app.requestSingleInstanceLock(additionalData);
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;

// Prisma 7: клиент создается только через driver adapter, DATABASE_URL из env не читается
function createDbClient(dbType: string, dbUrl: string) {
  if (dbType === 'REMOTE') {
    const { PrismaClient } = require('@prisma/client-pg');
    const { PrismaPg } = require('@prisma/adapter-pg');
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  }
  const { PrismaClient } = require('@prisma/client-sqlite');
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  // better-sqlite3 не понимает query-параметры в URL — отрезаем их
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbUrl.split('?')[0], timeout: 15000 }) });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    // Показываем окно только когда страница готова к первой отрисовке —
    // тогда пользователь сразу видит стартовую заставку приложения (BootSplash),
    // а не пустой экран. Отдельного окна-заставки нет — интро одно.
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  let shown = false;
  const revealMainWindow = () => {
    if (shown || !mainWindow) return;
    shown = true;
    mainWindow.show();
  };
  mainWindow.once('ready-to-show', revealMainWindow);
  // Страховка: если ready-to-show не пришёл (страница зависла/упала) — всё равно показываем
  setTimeout(revealMainWindow, 10000);

  // Сообщаем рендереру об изменении состояния разворота окна
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized-changed', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-changed', false));
}

app.whenReady().then(() => {
  // Убираем стандартное меню File/Edit/View/Window
  Menu.setApplicationMenu(null);

  const fs = require('fs');
  const path = require('path');

  let ventAppDataPath = '';
  try {
    const baseDir = process.env.APPDATA || 
      (process.platform === 'darwin' 
        ? path.join(require('os').homedir(), 'Library', 'Application Support') 
        : path.join(require('os').homedir(), '.config'));
    
    ventAppDataPath = path.join(baseDir, 'pdm-app');
  } catch (e) {
    try {
      ventAppDataPath = app.getPath('userData');
    } catch (err) {
      ventAppDataPath = path.join(require('os').homedir(), 'pdm-app');
    }
  }

  // Ensure directory exists
  try {
    if (!fs.existsSync(ventAppDataPath)) {
      fs.mkdirSync(ventAppDataPath, { recursive: true });
    }
  } catch (e) {}

  // Главное окно покажется, когда будет готово к отрисовке — сразу со стартовой
  // заставкой из index.html. Встроенный Express-сервер поднимается ниже,
  // как только будет вычислен DATABASE_URL.
  createWindow();

  const CONFIG_FILE = path.join(ventAppDataPath, 'config.json');

  // Читает config.json: тип БД, удаленный URL, пользовательский путь SQLite и папку crash-логов
  const readAppConfig = () => {
    const result = { currentDbType: 'LOCAL', databaseUrlSetting: '', localDbPath: '', crashLogDir: '' };
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        if (parsed && typeof parsed.current_db_type === 'string') {
          result.currentDbType = parsed.current_db_type;
          result.databaseUrlSetting = parsed.database_url || '';
          result.localDbPath = parsed.local_db_path || '';
          result.crashLogDir = parsed.crash_log_dir || '';
        }
      }
    } catch (e) {}
    return result;
  };

  const resolveLocalDbPath = (localDbPathSetting: string) => {
    const custom = String(localDbPathSetting || '').trim();
    return custom ? path.resolve(custom) : path.join(ventAppDataPath, 'database.sqlite');
  };

  const startupConfig = readAppConfig();
  const currentDbType = startupConfig.currentDbType;
  const databaseUrlSetting = startupConfig.databaseUrlSetting;

  let finalDbUrl = '';
  if (currentDbType === 'LOCAL') {
    const localDbPath = resolveLocalDbPath(startupConfig.localDbPath);
    finalDbUrl = `file:${localDbPath}?connection_limit=1&busy_timeout=15000`;
  } else {
    finalDbUrl = databaseUrlSetting || "postgresql://postgres:gfhjkm1212@11.22.33.44:5432/pdm_system?schema=public";
  }

  process.env.DATABASE_URL = finalDbUrl;

  if (app.isPackaged) {
    // Встроенный Express поднимаем СРАЗУ и в ОТДЕЛЬНОМ процессе (utilityProcess):
    // - сервер грузится параллельно с отрисовкой окна — интро короче;
    // - главный процесс не блокируется на секунды (раньше синхронный require
    //   подвешивал окно: его нельзя было двигать, показ мог задержаться и
    //   пользователь видел пустой синий фон вместо заставки).
    const startupLogPath = path.join(ventAppDataPath, 'server-startup.log');
    const logStartup = (line: string) => {
      try { fs.appendFileSync(startupLogPath, `[${new Date().toISOString()}] ${line}\n`, 'utf-8'); } catch (e) {}
    };
    try {
      fs.writeFileSync(startupLogPath, `[${new Date().toISOString()}] Инициализация встроенного Express-сервера...\n`, 'utf-8');
    } catch (e) {}

    const serverPath = path.join(__dirname, '../dist/server.cjs');
    const serverStartedAt = Date.now();

    // Аварийный фоллбэк: если отдельный процесс не запустился/сразу упал —
    // поднимаем сервер в главном процессе, как раньше (пусть медленно, но работает)
    let fallbackDone = false;
    const requireServerInMain = (reason: string) => {
      if (fallbackDone) return;
      fallbackDone = true;
      logStartup(`Фоллбэк на запуск в главном процессе: ${reason}`);
      try {
        require(serverPath);
        logStartup('Модуль сервера успешно подключен через require() (fallback).');
      } catch (err: any) {
        console.error('[Electron Main] Сбой при автоматическом запуске встроенного Express-сервера:', err);
        logStartup(`СБОЙ ЗАПУСКА: ${err.message}\nStack:\n${err.stack}`);
      }
    };

    try {
      const serverProc = utilityProcess.fork(serverPath, [], {
        env: { ...process.env },
        stdio: 'pipe',
        serviceName: 'flux-embedded-server',
      });
      serverProc.stdout?.on('data', (d: any) => logStartup(`[server] ${String(d).trimEnd()}`));
      serverProc.stderr?.on('data', (d: any) => logStartup(`[server:err] ${String(d).trimEnd()}`));
      serverProc.on('spawn', () => logStartup('Серверный процесс запущен (utilityProcess).'));
      serverProc.once('exit', (code: number) => {
        logStartup(`Серверный процесс завершился с кодом ${code}.`);
        // Ненулевой выход в первые секунды = сервер не поднялся — пробуем по-старому
        if (code !== 0 && Date.now() - serverStartedAt < 20000) {
          requireServerInMain(`utilityProcess завершился с кодом ${code}`);
        }
      });
      app.on('will-quit', () => { try { serverProc.kill(); } catch (e) {} });
    } catch (err: any) {
      requireServerInMain(`utilityProcess.fork недоступен: ${err?.message || err}`);
    }
  }

  try {
    const localPrisma = createDbClient(currentDbType, finalDbUrl);
    
    // PostgreSQL database connection check & safe Auto-Seed
    (async () => {
      try {
        if (currentDbType === 'LOCAL') {
          console.log('[Electron Main] Portable SQLite mode: Startup connection check skipped in Main process.');
          return;
        }
        console.log('[Electron Main] Connecting to PostgreSQL and checking users...');
        const count = await localPrisma.user.count();
        if (count === 0) {
          await localPrisma.user.create({
            data: {
              name: 'Главный Администратор (RaupovKhKh)',
              symbol: 'RaupovKhKh',
              password: '1122',
              role: 'ADMIN',
            }
          });
          console.log('[Electron Main] Auto-seeded initial ADMIN user (RaupovKhKh).');
        } else {
          console.log('[Electron Main] Database count check complete. Seeding not required.');
        }
      } catch (err: any) {
        console.warn('[Electron Main] Connection/seeding skipped or failed:', err);
      } finally {
        try {
          await localPrisma.$disconnect();
        } catch (disErr) {}
      }
    })();
  } catch (dbErr) {
    console.warn('[Electron Main] Prisma client module loading skipped inside Electron main process context:', dbErr);
  }

  // --- DATABASE FILE DIALOG HANDLER ---
  // Управление окном (кастомный заголовок, frame:false)
  ipcMain.on('window:minimize', () => { mainWindow?.minimize(); });
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
  });
  ipcMain.on('window:close', () => { mainWindow?.close(); });
  ipcMain.handle('window:is-maximized', () => !!mainWindow?.isMaximized());

  ipcMain.handle('database:select-file', async () => {
    const { dialog } = require('electron');
    try {
      const result = await dialog.showOpenDialog({
        title: 'Укажите файл локальной базы данных SQLite',
        buttonLabel: 'Выбрать БД',
        properties: ['openFile', 'createDirectory', 'promptToCreate'],
        filters: [
          { name: 'Локальная база данных SQLite (*.sqlite; *.db)', extensions: ['sqlite', 'db'] },
          { name: 'Все файлы (*.*)', extensions: ['*'] }
        ]
      });
      if (result && !result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
    } catch (err) {
      console.error('Error opening native file dialog:', err);
    }
    return null;
  });

  // Открытие диалогового окна выбора директории
  ipcMain.handle('dialog:openDirectory', async () => {
    const { dialog } = require('electron');
    try {
      const result = await dialog.showOpenDialog({
        title: 'Выберите директорию для новой базы данных SQLite',
        buttonLabel: 'Выбрать папку',
        properties: ['openDirectory', 'createDirectory']
      });
      if (result && !result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
    } catch (err) {
      console.error('Error opening native directory dialog:', err);
    }
    return null;
  });

  // Открытие диалогового окна выбора существующего файла базы данных SQLite (.sqlite)
  ipcMain.handle('dialog:openFile', async () => {
    const { dialog } = require('electron');
    try {
      const result = await dialog.showOpenDialog({
        title: 'Выберите существующий файл базы данных SQLite',
        buttonLabel: 'Выбрать файл',
        properties: ['openFile'],
        filters: [
          { name: 'Локальная база данных SQLite (*.sqlite; *.db)', extensions: ['sqlite', 'db'] },
          { name: 'Все файлы (*.*)', extensions: ['*'] }
        ]
      });
      if (result && !result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
    } catch (err) {
      console.error('Error opening native file dialog:', err);
    }
    return null;
  });

  // --- LOGGING SYSTEM IPC HANDLERS ---
  // Метка времени для имен файлов логов: дата + часы-минуты-секунды
  const buildLogTimestamp = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  };

  ipcMain.handle('log:save-dialog', async (event, text: string) => {
    const { dialog } = require('electron');
    const fs = require('fs');
    try {
      const result = await dialog.showSaveDialog({
        title: 'Экспорт журнала логов',
        defaultPath: `pdm_action_log_${buildLogTimestamp()}.txt`,
        filters: [
          { name: 'Текстовый файл (*.txt)', extensions: ['txt'] },
          { name: 'Все файлы (*.*)', extensions: ['*'] }
        ]
      });
      if (result && !result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, text, 'utf-8');
        return { success: true, filePath: result.filePath };
      }
    } catch (err) {
      console.error('Error saving log file via electron main:', err);
      return { success: false, error: String(err) };
    }
    return { success: false };
  });

  ipcMain.on('log:emergency-save', (event, text: string) => {
    try {
      const fileName = `pdm-crash-log-${buildLogTimestamp()}.txt`;

      // Папка из настроек (config.json -> crash_log_dir); по умолчанию AppData/pdm-app/logs,
      // чтобы не засорять рабочий стол
      const cfg = readAppConfig();
      let targetDir = String(cfg.crashLogDir || '').trim();
      if (!targetDir) {
        targetDir = path.join(ventAppDataPath, 'logs');
      }
      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
      } catch (mkErr) {
        targetDir = path.join(ventAppDataPath, 'logs');
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
      }

      const targetPath = path.join(targetDir, fileName);
      fs.writeFileSync(targetPath, text, 'utf-8');
      console.log(`[Emergency Log Saved] Saved crash log to: ${targetPath}`);
    } catch (err) {
      console.error('Failed to write emergency log inside electron main:', err);
    }
  });

  // --- CHAT IPC HANDLERS ---
  try {
    let chatPrismaInstance: any = null;
    let lastLoadedDbUrl: string | null = null;

    // Обертка для IPC: вместо многострочного код-фрейма Prisma в renderer уходит суть ошибки
    const handleDb = (channel: string, fn: (...args: any[]) => Promise<any>) => {
      ipcMain.handle(channel, async (...args: any[]) => {
        try {
          return await fn(...args);
        } catch (err: any) {
          const rawMsg = String(err?.message || err);
          let friendly: string;
          if (rawMsg.includes('malformed') || rawMsg.includes('disk image')) {
            friendly = 'База данных повреждена. Перезапустите приложение — она будет автоматически восстановлена из шаблона.';
          } else if (rawMsg.includes('Foreign key constraint')) {
            friendly = 'Сессия устарела: текущий пользователь отсутствует в базе данных. Выйдите из профиля и войдите заново.';
          } else {
            const lines = rawMsg.split('\n').map(l => l.trim()).filter(Boolean);
            friendly = lines[lines.length - 1] || rawMsg;
          }
          console.error(`[IPC ${channel}] ${friendly}`);
          throw new Error(friendly);
        }
      });
    };

    const getChatPrisma = () => {
      // Используем ту же папку данных (pdm-app) и тот же config.json, что и Express-сервер
      const cfg = readAppConfig();

      let dbUrl = '';
      if (cfg.currentDbType === 'LOCAL') {
        const localDbPath = resolveLocalDbPath(cfg.localDbPath);
        dbUrl = `file:${localDbPath}?connection_limit=1&busy_timeout=15000`;
      } else {
        dbUrl = cfg.databaseUrlSetting || "postgresql://postgres:gfhjkm1212@11.22.33.44:5432/pdm_system?schema=public";
      }

      if (!chatPrismaInstance || lastLoadedDbUrl !== dbUrl) {
        if (chatPrismaInstance) {
          try {
            chatPrismaInstance.$disconnect();
          } catch (e) {}
        }

        chatPrismaInstance = createDbClient(cfg.currentDbType, dbUrl);
        lastLoadedDbUrl = dbUrl;
      }
      return chatPrismaInstance;
    };

    const chatPrisma = new Proxy({}, {
      get(target, prop) {
        const client = getChatPrisma();
        const value = client[prop];
        if (typeof value === 'function') {
          return value.bind(client);
        }
        return value;
      }
    }) as any;

    handleDb('chat:get-messages', async (event, { senderId, receiverId }) => {
      return await chatPrisma.chatMessage.findMany({
        where: {
          OR: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId }
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
    });

    handleDb('chat:send-message', async (event, { senderId, receiverId, content, linkedElementId, linkedProjectId, attachments, replyToId }) => {
      const msg = await chatPrisma.chatMessage.create({
        data: {
          senderId,
          receiverId,
          content,
          linkedElementId: linkedElementId || null,
          linkedProjectId: linkedProjectId || null,
          replyToId: replyToId || null,
        }
      });

      if (attachments && Array.isArray(attachments)) {
        for (const att of attachments) {
          await chatPrisma.chatAttachment.create({
            data: {
              messageId: msg.id,
              fileName: att.fileName,
              filePath: att.filePath,
              fileSize: att.fileSize || 0
            }
          });
        }
      }

      // Личное уведомление получателю о новом сообщении (категория ЧАТ)
      try {
        const s = await chatPrisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
        await chatPrisma.notification.create({ data: {
          userId: receiverId, category: 'ЧАТ',
          title: `Новое сообщение от ${s?.name || 'сотрудника'}`,
          body: String(content || '').slice(0, 80),
          targetRoute: `/chat?from=${senderId}`,
        }});
      } catch (e) {}

      return await chatPrisma.chatMessage.findUnique({
        where: { id: msg.id },
        include: {
          attachments: true,
          sender: { select: { id: true, name: true, symbol: true, role: true } },
          receiver: { select: { id: true, name: true, symbol: true, role: true } },
          linkedElement: true,
          replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } }
        }
      });
    });

    handleDb('chat:upload-file', async (event, { fileName, base64Data }) => {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const dir = path.join(app.getPath('userData'), 'chat_files');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Sanitizing fileName to prevent Path Traversal
      let sanitizedFileName = path.basename(String(fileName || '')).replace(/[\/\\]/g, '').trim();
      // '.', '..' и пустое имя недопустимы — подставляем безопасное имя
      if (!sanitizedFileName || sanitizedFileName === '.' || sanitizedFileName === '..') {
        sanitizedFileName = `file_${Date.now()}`;
      }
      // Уникальность: не затираем существующее вложение с тем же именем
      {
        const dot = sanitizedFileName.lastIndexOf('.');
        const stem = dot > 0 ? sanitizedFileName.slice(0, dot) : sanitizedFileName;
        const ext = dot > 0 ? sanitizedFileName.slice(dot) : '';
        let n = 1;
        while (fs.existsSync(path.join(dir, sanitizedFileName))) {
          sanitizedFileName = `${stem}-${n}${ext}`;
          n++;
        }
      }
      const localPath = path.join(dir, sanitizedFileName);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(localPath, buffer);
      return { filePath: localPath, fileName: sanitizedFileName, fileSize: buffer.length };
    });

    handleDb('chat:open-file', async (event, filePath) => {
      const { shell, app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      // Открываем только вложения чата (каталог chat_files), а не произвольный путь
      const chatDir = path.resolve(path.join(app.getPath('userData'), 'chat_files'));
      const resolved = path.resolve(String(filePath || ''));
      if (resolved !== chatDir && !resolved.startsWith(chatDir + path.sep)) {
        return { success: false, error: 'Недопустимый путь к файлу.' };
      }
      if (fs.existsSync(resolved)) {
        await shell.openPath(resolved);
        return { success: true };
      } else {
        return { success: false, error: 'Файл не найден на системном диске.' };
      }
    });

    ipcMain.handle('shell:open-external', async (event, url) => {
      const { shell } = require('electron');
      try {
        let raw = String(url || '').trim();
        // Ссылка без схемы трактуется как http(s)
        if (raw && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) raw = 'https://' + raw;
        const parsed = new URL(raw);
        // Разрешаем только безопасные протоколы (не file:, не пользовательские схемы)
        if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
          return { success: false, error: 'Недопустимый протокол ссылки.' };
        }
        await shell.openExternal(raw);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    // Automated Project Group Chats Helpers and Handlers
    const ensureProjectChatGroupsIPC = async () => {
      try {
        const projects = await chatPrisma.project.findMany();
        const users = await chatPrisma.user.findMany();
        for (const p of projects) {
          const g = await chatPrisma.chatGroup.findFirst({ where: { projectId: p.id } });
          if (!g) {
            await chatPrisma.chatGroup.create({
              data: {
                name: `Проект: ${p.name}`,
                type: 'PROJECT',
                projectId: p.id,
                members: { connect: users.map((u: any) => ({ id: u.id })) }
              }
            });
          } else {
            // keep up to date and sync members
            await chatPrisma.chatGroup.update({
              where: { id: g.id },
              data: {
                name: `Проект: ${p.name}`,
                members: { connect: users.map((u: any) => ({ id: u.id })) }
              }
            });
          }
        }
      } catch (err) {
        console.warn('ensureProjectChatGroupsIPC error:', err);
      }
    };

    handleDb('chat:get-groups', async () => {
      await ensureProjectChatGroupsIPC();
      return await chatPrisma.chatGroup.findMany({
        include: {
          members: { select: { id: true, name: true, symbol: true, role: true } },
          project: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
    });

    handleDb('chat:get-group-messages', async (event, { groupId }) => {
      return await chatPrisma.chatMessage.findMany({
        where: { chatGroupId: groupId },
        include: {
          attachments: true,
          sender: { select: { id: true, name: true, symbol: true, role: true } },
          linkedElement: true,
          replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } }
        },
        orderBy: { createdAt: 'asc' }
      });
    });

    handleDb('chat:send-group-message', async (event, { senderId, groupId, content, linkedElementId, linkedProjectId, attachments, replyToId }) => {
      // В каналах писать может только владелец или администратор
      const grp = await chatPrisma.chatGroup.findUnique({ where: { id: groupId } });
      if (grp && grp.type === 'CHANNEL') {
        const u = await chatPrisma.user.findUnique({ where: { id: senderId } });
        if (grp.ownerId && grp.ownerId !== senderId && u?.role !== 'ADMIN') {
          throw new Error('В канал может писать только владелец или администратор');
        }
      }
      const msg = await chatPrisma.chatMessage.create({
        data: {
          senderId,
          chatGroupId: groupId,
          content,
          linkedElementId: linkedElementId || null,
          linkedProjectId: linkedProjectId || null,
          replyToId: replyToId || null,
        }
      });

      if (attachments && Array.isArray(attachments)) {
        for (const att of attachments) {
          await chatPrisma.chatAttachment.create({
            data: {
              messageId: msg.id,
              fileName: att.fileName,
              filePath: att.filePath,
              fileSize: att.fileSize || 0
            }
          });
        }
      }

      // Личные уведомления участникам группы (кроме отправителя)
      try {
        const s = await chatPrisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
        const g = await chatPrisma.chatGroup.findUnique({ where: { id: groupId }, include: { members: { select: { id: true } } } });
        for (const m of (g?.members || [])) {
          if (m.id === senderId) continue;
          await chatPrisma.notification.create({ data: {
            userId: m.id, category: 'ЧАТ',
            title: `${s?.name || 'Сотрудник'} в «${g?.name || 'группе'}»`,
            body: String(content || '').slice(0, 80),
            targetRoute: `/chat?group=${groupId}`,
          }});
        }
      } catch (e) {}

      return await chatPrisma.chatMessage.findUnique({
        where: { id: msg.id },
        include: {
          attachments: true,
          sender: { select: { id: true, name: true, symbol: true, role: true } },
          linkedElement: true,
          replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } }
        }
      });
    });

    // Редактирование своего сообщения
    handleDb('chat:edit-message', async (event, { messageId, userId, content }) => {
      const msg = await chatPrisma.chatMessage.findUnique({ where: { id: messageId } });
      if (!msg) throw new Error('Сообщение не найдено');
      if (msg.senderId !== userId) throw new Error('Можно редактировать только свои сообщения');
      return await chatPrisma.chatMessage.update({
        where: { id: messageId },
        data: { content: String(content || ''), editedAt: new Date() },
        include: {
          attachments: true,
          sender: { select: { id: true, name: true, symbol: true, role: true } },
          receiver: { select: { id: true, name: true, symbol: true, role: true } },
          linkedElement: true,
          replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } }
        }
      });
    });

    // Удаление своего сообщения
    handleDb('chat:delete-message', async (event, { messageId, userId }) => {
      const msg = await chatPrisma.chatMessage.findUnique({ where: { id: messageId } });
      if (!msg) throw new Error('Сообщение не найдено');
      if (msg.senderId !== userId) throw new Error('Можно удалять только свои сообщения');
      await chatPrisma.chatMessage.delete({ where: { id: messageId } });
      return { success: true };
    });

    // Feature 3: Screen capture
    ipcMain.handle('desktop:capture', async () => {
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 1280, height: 720 } });
      if (sources.length > 0) {
        return sources[0].thumbnail.toDataURL();
      }
      throw new Error('Источники видеозахвата не найдены.');
    });

    // Chat ComponentElement Search handler
    handleDb('chat:search-element', async (event, { tag }) => {
      return await chatPrisma.componentElement.findFirst({
        where: {
          OR: [
            { itemCode: tag },
            { name: tag },
            { id: tag },
            { tags: { some: { identifier: { contains: tag } } } }
          ]
        },
        include: {
          tags: true,
          monoblock: { include: { system: true } }
        }
      });
    });

    // Chat ComponentElement Autocomplete handler
    handleDb('chat:autocomplete-tags', async (event, { query, projectId }) => {
      const cleanQuery = query ? String(query).toLowerCase() : '';
      const cleanProjId = projectId ? String(projectId) : undefined;

      const suggestions: Array<{ text: string; description: string; elementId?: string }> = [];

      // 1. Fetch tags matching cleanQuery
      const tags = await chatPrisma.tag.findMany({
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
      const elements = await chatPrisma.componentElement.findMany({
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
      return suggestions.filter(s => {
        const key = s.text.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

  } catch (chatErr) {
    console.warn('[Electron Main] Prisma chat IPC handlers initialization skipped:', chatErr);
  }

  // Real auto-updater implementation
  let latestCachedUpdate: { version: string; fileUrl: string; changelog: string } | null = null;

  function isNewerVersion(latest: string, current: string): boolean {
    // Суффиксы вида "-beta" дают NaN при Number() и ломают сравнение — оставляем только цифры и точки
    const clean = (v: string) => String(v || '').replace(/[^0-9.]/g, '');
    const latestParts = clean(latest).split('.').map(Number);
    const currentParts = clean(current).split('.').map(Number);
    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const l = latestParts[i] || 0;
      const c = currentParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  function downloadUpdate(url: string, dest: string, onProgress: (percent: number) => void): Promise<void> {
    const fs = require('fs');
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');

    return new Promise((resolve, reject) => {
      let redirectCount = 0;

      function startGet(requestUrl: string) {
        let parsedUrl;
        try {
          parsedUrl = urlModule.parse(requestUrl);
        } catch (e) {
          reject(new Error(`Invalid download URL: ${requestUrl}`));
          return;
        }
        
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const req = protocol.get(requestUrl, (res: any) => {
          // Handle redirect (3xx codes)
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirectCount > 5) {
              reject(new Error('Prevail redirect limit of 5'));
              return;
            }
            redirectCount++;
            let nextUrl = res.headers.location;
            if (!nextUrl.startsWith('http')) {
              nextUrl = urlModule.resolve(requestUrl, nextUrl);
            }
            startGet(nextUrl);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Server responded with status code ${res.statusCode}`));
            return;
          }

          const totalLength = parseInt(res.headers['content-length'] || '0', 10);
          let downloadedLength = 0;
          const fileStream = fs.createWriteStream(dest);

          res.on('data', (chunk: any) => {
            downloadedLength += chunk.length;
            if (totalLength > 0) {
              const percent = Math.min(100, Math.round((downloadedLength / totalLength) * 100));
              onProgress(percent);
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });

          fileStream.on('error', (err: any) => {
            fs.unlink(dest, () => {});
            reject(err);
          });
        });

        req.on('error', (err: any) => {
          reject(err);
        });
      }

      startGet(url);
    });
  }

  // Check version and DB app update
  ipcMain.handle('updater:check', async () => {
    try {
      if (!app.isPackaged) {
        console.log('[Updater] Portable/Dev mode check: Auto-updates are offline.');
        return { available: false, isDevelopment: true, version: app.getVersion() || '1.0.0-dev' };
      }

      console.log('[Updater] Production: Checking configured database for update records...');
      const prismaInstance = createDbClient(currentDbType, finalDbUrl);

      const dbUpdate = await prismaInstance.appUpdate.findFirst({
        orderBy: { createdAt: 'desc' }
      });

      await prismaInstance.$disconnect();

      if (!dbUpdate) {
        console.log('[Updater] No update packages found in the remote database.');
        return { available: false, version: app.getVersion() || '1.0.0' };
      }

      const currentVer = app.getVersion() || '1.0.0';
      const newestAvailable = isNewerVersion(dbUpdate.version, currentVer);

      console.log(`[Updater] Current version: ${currentVer}. Latest in DB: ${dbUpdate.version}. Update available: ${newestAvailable}`);

      if (newestAvailable) {
        latestCachedUpdate = {
          version: dbUpdate.version,
          changelog: dbUpdate.changelog,
          fileUrl: dbUpdate.fileUrl
        };
        return {
          available: true,
          version: dbUpdate.version,
          changelog: dbUpdate.changelog,
          fileUrl: dbUpdate.fileUrl,
          isDevelopment: false
        };
      }

      return { available: false, version: currentVer, isDevelopment: false };
    } catch (err: any) {
      console.error('[Updater Check Error]', err);
      return { available: false, error: err.message, isDevelopment: false };
    }
  });

  // Download update file in background
  ipcMain.handle('updater:start-download', async () => {
    const fs = require('fs');
    const path = require('path');

    if (!latestCachedUpdate) {
      throw new Error('No update package metainformation is cached. Ensure updater:check was completed.');
    }

    try {
      const installerPath = path.join(app.getPath('temp'), `update-${latestCachedUpdate.version}.exe`);
      console.log(`[Updater] Starting download: ${latestCachedUpdate.fileUrl} -> ${installerPath}`);

      mainWindow?.webContents.send('updater:status', 'downloading', { percent: 0 });

      let lastPercent = -1;
      await downloadUpdate(latestCachedUpdate.fileUrl, installerPath, (percent) => {
        if (percent !== lastPercent) {
          lastPercent = percent;
          mainWindow?.webContents.send('updater:status', 'downloading', { percent });
        }
      });

      console.log('[Updater] Download completed successfully on disk.');
      mainWindow?.webContents.send('updater:status', 'downloaded', { version: latestCachedUpdate.version });
      return { success: true };
    } catch (err: any) {
      console.error('[Updater Download Error]', err);
      mainWindow?.webContents.send('updater:error', err.message);
      throw err;
    }
  });

  // Hot seamless quit & reinstall
  ipcMain.handle('updater:quitAndInstall', () => {
    const fs = require('fs');
    const path = require('path');
    const { spawn } = require('child_process');

    if (!latestCachedUpdate) {
      console.error('[Updater] No downloaded update package info cached.');
      return { success: false, error: 'Информация по пакету обновлений отсутствует.' };
    }

    const installerPath = path.join(app.getPath('temp'), `update-${latestCachedUpdate.version}.exe`);

    if (!fs.existsSync(installerPath)) {
      console.error(`[Updater] Installer file does not exist at: ${installerPath}`);
      return { success: false, error: 'Файл установщика не найден на системном накопителе.' };
    }

    try {
      console.log(`[Updater] Spawning silent automatic installer reinstall: "${installerPath}" /S`);

      // Spawn installer with silent /S flag
      const child = spawn(installerPath, ['/S'], {
        detached: true,
        stdio: 'ignore',
        shell: true
      });
      child.unref();

      console.log('[Updater] Exiting main electron application window context to allow overwrite...');
      app.exit(0);
      return { success: true };
    } catch (err: any) {
      console.error('[Updater Launch Error]', err);
      return { success: false, error: err.message };
    }
  });

  // Get app package status or information
  ipcMain.handle('updater:is-packaged', () => {
    return app.isPackaged;
  });

  ipcMain.handle('updater:version', () => {
    return app.getVersion() || '1.0.0';
  });

  // Admin publish release action
  ipcMain.handle('updater:publish-release', async (event, { version, changelog, fileUrl }) => {
    try {
      const prismaInstance = createDbClient(currentDbType, finalDbUrl);

      const update = await prismaInstance.appUpdate.upsert({
        where: { version },
        update: { changelog, fileUrl },
        create: { version, changelog, fileUrl }
      });

      await prismaInstance.$disconnect();
      return { success: true, update };
    } catch (err: any) {
      console.error('[Updater Publish Error]', err);
      return { success: false, error: err.message };
    }
  });

  // Maintain outdated mock simulations fallback
  ipcMain.handle('updater:simulateCheck', () => {
    mainWindow?.webContents.send('updater:status', 'checking');
    setTimeout(() => {
      mainWindow?.webContents.send('updater:status', 'available', {
        version: '1.2.0',
        releaseNotes: '### PDM Sync v1.2.0\n\n- Добавлен высокоскоростной конвейер Socket.io\n- Реализация конфликтов specs тегов\n- Повышение стабильности'
      });
    }, 1000);
  });

  ipcMain.handle('updater:simulateDownload', () => {
    let percent = 0;
    const interval = setInterval(() => {
      percent += 20;
      mainWindow?.webContents.send('updater:status', 'downloading', { percent });
      if (percent >= 100) {
        clearInterval(interval);
        mainWindow?.webContents.send('updater:status', 'downloaded', { version: '1.2.0' });
      }
    }, 500);
  });

  // --- STICKER SUB-WINDOW PROVISIONING (STEP 4) ---
  ipcMain.on('window:open-sticker', (event, noteId) => {
    const stickerWin = new BrowserWindow({
      width: 320,
      height: 380,
      frame: false,            // Полностью убирает рамки Windows (заголовок, кнопки сворачивания)
      alwaysOnTop: true,       // КРИТИЧЕСКИ: Окно всегда зафиксировано поверх всех окон в ОС!
      transparent: false,      // Для стабильного отображения контента
      resizable: true,         // Инженер может растягивать стикер за края
      skipTaskbar: true,       // Не засоряет панель задач Windows
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      }
    });

    // Загружаем фронтенд с хэш-роутом или query-параметром для отображения конкретной заметки
    // В Vite/React-router используй путь, например: `/sticker?id=${noteId}`
    if (app.isPackaged) {
      stickerWin.loadURL(`file://${path.join(__dirname, '../dist/index.html')}#/sticker?id=${noteId}`);
    } else {
      stickerWin.loadURL(`http://localhost:3000/#/sticker?id=${noteId}`);
    }
  });

});

app.on('window-all-closed', () => {
  app.quit();
});

