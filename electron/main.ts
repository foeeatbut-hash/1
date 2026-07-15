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

  // Читает config.json: тип БД, удаленный URL, пользовательский путь SQLite,
  // папку crash-логов и адрес сервера компании (пусто = встроенный сервер)
  const readAppConfig = () => {
    const result = { currentDbType: 'LOCAL', databaseUrlSetting: '', localDbPath: '', crashLogDir: '', remoteServerUrl: '' };
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.current_db_type === 'string') {
            result.currentDbType = parsed.current_db_type;
            result.databaseUrlSetting = parsed.database_url || '';
            result.localDbPath = parsed.local_db_path || '';
            result.crashLogDir = parsed.crash_log_dir || '';
          }
          result.remoteServerUrl = String(parsed.remote_server_url || '').trim();
        }
      }
    } catch (e) {}
    return result;
  };

  // Смена адреса сервера из интерфейса (экран входа): пусто = встроенный.
  // Пишем в config.json, не трогая остальные ключи; применяется при
  // следующем запуске (рендерер сам перезагружается и читает localStorage)
  ipcMain.handle('app:set-server-url', (_event, url: string) => {
    try {
      let parsed: any = {};
      try {
        if (fs.existsSync(CONFIG_FILE)) parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) || {};
      } catch (e) { parsed = {}; }
      parsed.remote_server_url = String(url || '').trim();
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });
  ipcMain.handle('app:get-server-url', () => readAppConfig().remoteServerUrl);

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

  if (app.isPackaged && startupConfig.remoteServerUrl) {
    // Настроен сервер компании: встроенный Express не нужен — клиент ходит
    // на удалённый адрес (fetch-прокси и socket.io в рендерере), старт мгновенный
    console.log('[Electron Main] Режим сервера компании:', startupConfig.remoteServerUrl, '— встроенный сервер не запускается.');
  } else if (app.isPackaged) {
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
  // Управление окном (кастомный заголовок, frame:false). Кнопки заголовка
  // действуют на то окно, откуда пришли (главное или вынесенное) — поэтому
  // берём окно отправителя, а не единственный mainWindow.
  const senderWin = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(event.sender) || mainWindow;
  ipcMain.on('window:minimize', (event) => { senderWin(event)?.minimize(); });
  ipcMain.on('window:maximize', (event) => {
    const w = senderWin(event);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });
  ipcMain.on('window:close', (event) => { senderWin(event)?.close(); });
  ipcMain.handle('window:is-maximized', (event) => !!senderWin(event)?.isMaximized());

  // Вынести раздел в отдельное окно (мультимонитор): полноценное главное окно,
  // открытое на нужном разделе. Своё меню, свои панели, тоже делится на панели.
  ipcMain.on('window:open-main', (_event, route: string) => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 620,
      backgroundColor: '#0f172a',
      autoHideMenuBar: true,
      frame: false,
      titleBarStyle: 'hidden',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    const hash = `#${route && route.startsWith('/') ? route : '/' + (route || '')}`;
    if (app.isPackaged) {
      win.loadURL(`file://${path.join(__dirname, '../dist/index.html')}${hash}`);
    } else {
      win.loadURL(`http://localhost:3000/${hash}`);
    }
    win.once('ready-to-show', () => win.show());
    setTimeout(() => { try { win.show(); } catch (_) {} }, 10000);
    win.on('maximize', () => win.webContents.send('window:maximized-changed', true));
    win.on('unmaximize', () => win.webContents.send('window:maximized-changed', false));
  });

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

  // --- ЛОКАЛЬНЫЕ IPC-ВОЗМОЖНОСТИ ---
  // Чат полностью переведён на сервер (HTTP + socket.io): обработчики с прямым
  // доступом к БД из главного процесса удалены — они шли мимо сервера (события
  // не рассылались, вложения писались на диск отправителя). Здесь остались
  // только по-настоящему локальные возможности Electron.

  // Легаси: открытие СТАРЫХ вложений чата, сохранённых прежними версиями
  // на диск этой машины (новые вложения живут на сервере и открываются по URL)
  ipcMain.handle('chat:open-file', async (event, filePath) => {
    const { shell } = require('electron');
    try {
      // Открываем только вложения чата (каталог chat_files), а не произвольный путь
      const chatDir = path.resolve(path.join(app.getPath('userData'), 'chat_files'));
      const resolved = path.resolve(String(filePath || ''));
      if (resolved !== chatDir && !resolved.startsWith(chatDir + path.sep)) {
        return { success: false, error: 'Недопустимый путь к файлу.' };
      }
      if (fs.existsSync(resolved)) {
        await shell.openPath(resolved);
        return { success: true };
      }
      return { success: false, error: 'Файл не найден на системном диске.' };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
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

  // PDF из готового HTML (печатный вид Конструктора): скрытое окно →
  // printToPDF → диалог сохранения. Векторный PDF без внешних зависимостей.
  ipcMain.handle('print:to-pdf', async (_event, { html, title, landscape }: { html: string; title?: string; landscape?: boolean }) => {
    const { dialog } = require('electron');
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html || '')));
      const pdf = await pdfWin.webContents.printToPDF({ landscape: !!landscape, printBackground: true });
      const result = await dialog.showSaveDialog({
        title: 'Сохранить PDF',
        defaultPath: `${String(title || 'Документ').replace(/[\\/:*?"<>|]/g, '_')}.pdf`,
        filters: [{ name: 'PDF (*.pdf)', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      fs.writeFileSync(result.filePath, pdf);
      return { success: true, filePath: result.filePath };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    } finally {
      try { pdfWin.destroy(); } catch (e) {}
    }
  });

  // Захват экрана (вставка скриншота в чат)
  ipcMain.handle('desktop:capture', async () => {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 1280, height: 720 } });
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL();
    }
    throw new Error('Источники видеозахвата не найдены.');
  });

  // ── Автообновления через сервер ──
  // Проверка и публикация релизов идут через HTTP API сервера (см. UpdaterWidget):
  // рендерер сам знает адрес сервера и токен сессии. Главному процессу остаются
  // две вещи, которые из рендерера не сделать: скачать большой exe на диск и
  // подменить работающий портативный exe новым.
  let latestCachedUpdate: { version: string; installerPath: string } | null = null;

  function downloadUpdate(url: string, dest: string, onProgress: (percent: number) => void, headers?: Record<string, string>): Promise<void> {
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

        const req = protocol.get(requestUrl, { headers: headers || {} }, (res: any) => {
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

  // Скачивание файла обновления на диск. Рендерер передаёт абсолютный адрес,
  // версию и токен сессии (сервер отдаёт exe только авторизованным).
  ipcMain.handle('updater:start-download', async (_event, payload: { url: string; version: string; token?: string }) => {
    const path = require('path');

    const url = String(payload?.url || '');
    const version = String(payload?.version || '').replace(/[^0-9a-zA-Z.\-]/g, '');
    if (!url || !version) throw new Error('Не переданы адрес или версия обновления.');

    try {
      const installerPath = path.join(app.getPath('temp'), `flux-update-${version}.exe`);
      console.log(`[Updater] Starting download: ${url} -> ${installerPath}`);

      mainWindow?.webContents.send('updater:status', 'downloading', { percent: 0 });

      const headers: Record<string, string> = {};
      if (payload?.token) headers['Authorization'] = `Bearer ${payload.token}`;

      let lastPercent = -1;
      await downloadUpdate(url, installerPath, (percent) => {
        if (percent !== lastPercent) {
          lastPercent = percent;
          mainWindow?.webContents.send('updater:status', 'downloading', { percent });
        }
      }, headers);

      latestCachedUpdate = { version, installerPath };
      console.log('[Updater] Download completed successfully on disk.');
      mainWindow?.webContents.send('updater:status', 'downloaded', { version });
      return { success: true };
    } catch (err: any) {
      console.error('[Updater Download Error]', err);
      mainWindow?.webContents.send('updater:error', err.message);
      throw err;
    }
  });

  // Установка скачанного обновления с перезапуском.
  // Портативный exe не может перезаписать сам себя, пока запущен, поэтому
  // подмену делает отдельный cmd-скрипт: ждёт выхода приложения, кладёт новый
  // exe на место старого (то же имя файла, тот же ярлык) и запускает его.
  // Для установленной NSIS-версии остаётся классический тихий инсталлятор /S.
  ipcMain.handle('updater:quitAndInstall', () => {
    const fs = require('fs');
    const path = require('path');
    const { spawn } = require('child_process');

    if (!latestCachedUpdate) {
      console.error('[Updater] No downloaded update package info cached.');
      return { success: false, error: 'Обновление ещё не скачано.' };
    }

    const installerPath = latestCachedUpdate.installerPath;
    if (!fs.existsSync(installerPath)) {
      console.error(`[Updater] Installer file does not exist at: ${installerPath}`);
      return { success: false, error: 'Файл обновления не найден на диске.' };
    }

    try {
      // electron-builder portable выставляет путь к исходному exe пользователя
      const portableExe = process.env.PORTABLE_EXECUTABLE_FILE || '';

      if (portableExe && fs.existsSync(portableExe)) {
        const scriptPath = path.join(app.getPath('temp'), `flux-update-${Date.now()}.cmd`);
        const script = [
          '@echo off',
          'chcp 65001 >nul',
          ':wait',
          // ждём завершения текущего процесса (фильтр по PID не зависит от языка системы)
          `tasklist /FI "PID eq ${process.pid}" 2>nul | find "${process.pid}" >nul && (ping -n 2 127.0.0.1 >nul & goto wait)`,
          `move /y "${installerPath}" "${portableExe}"`,
          `start "" "${portableExe}"`,
          'del "%~f0"',
        ].join('\r\n');
        fs.writeFileSync(scriptPath, script);
        console.log(`[Updater] Portable self-replace scheduled: ${installerPath} -> ${portableExe}`);
        const child = spawn('cmd.exe', ['/c', scriptPath], { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
      } else {
        console.log(`[Updater] Spawning silent installer: "${installerPath}" /S`);
        const child = spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore', shell: true });
        child.unref();
      }

      console.log('[Updater] Exiting application to allow overwrite...');
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

