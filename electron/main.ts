import { app, BrowserWindow, ipcMain } from 'electron';
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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
}

app.whenReady().then(() => {
  createWindow();

  // Configure default dynamic PostgreSQL connection string
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:gfhjkm1212@11.22.33.44:5432/pdm_system?schema=public";

  try {
    const ispg = app.isPackaged;
    const { PrismaClient } = ispg ? require('@prisma/client-pg') : require('@prisma/client');
    
    let dbUrl = process.env.DATABASE_URL;
    if (!ispg) {
      const fs = require('fs');
      const path = require('path');
      let sqlitePath = path.join(process.cwd(), 'prisma/prisma/database.sqlite');
      const DB_CONFIG_FILE = path.join(process.cwd(), 'db-config.json');
      try {
        if (fs.existsSync(DB_CONFIG_FILE)) {
          const content = fs.readFileSync(DB_CONFIG_FILE, 'utf-8');
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed.databasePath === 'string') {
            sqlitePath = parsed.databasePath;
          }
        }
      } catch (e) {}
      dbUrl = `file:${sqlitePath}?connection_limit=1&busy_timeout=15000`;
    }

    const localPrisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl
        }
      }
    });
    
    // PostgreSQL database connection check & safe Auto-Seed
    (async () => {
      try {
        if (!app.isPackaged) {
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
  ipcMain.handle('log:save-dialog', async (event, text: string) => {
    const { dialog } = require('electron');
    const fs = require('fs');
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const result = await dialog.showSaveDialog({
        title: 'Экспорт журнала логов',
        defaultPath: `pdm_action_log_${dateStr}.txt`,
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
    const fs = require('fs');
    const path = require('path');
    try {
      const timestamp = Date.now();
      const fileName = `pdm-crash-log-${timestamp}.txt`;
      
      let targetPath;
      try {
        targetPath = path.join(app.getPath('desktop'), fileName);
      } catch (desktopErr) {
        const appDataDir = path.join(app.getPath('userData'), 'crashes');
        if (!fs.existsSync(appDataDir)) {
          fs.mkdirSync(appDataDir, { recursive: true });
        }
        targetPath = path.join(appDataDir, fileName);
      }
      
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

    const getChatPrisma = () => {
      const ispg = app.isPackaged;
      
      let dbUrl = process.env.DATABASE_URL;
      if (!ispg) {
        const fs = require('fs');
        const path = require('path');
        let sqlitePath = path.join(process.cwd(), 'prisma/prisma/database.sqlite');
        const DB_CONFIG_FILE = path.join(process.cwd(), 'db-config.json');
        try {
          if (fs.existsSync(DB_CONFIG_FILE)) {
            const content = fs.readFileSync(DB_CONFIG_FILE, 'utf-8');
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed.databasePath === 'string') {
              sqlitePath = parsed.databasePath;
            }
          }
        } catch (e) {}
        dbUrl = `file:${sqlitePath}?connection_limit=1&busy_timeout=15000`;
      }

      if (!chatPrismaInstance || lastLoadedDbUrl !== dbUrl) {
        if (chatPrismaInstance) {
          try {
            chatPrismaInstance.$disconnect();
          } catch (e) {}
        }
        
        const { PrismaClient } = ispg ? require('@prisma/client-pg') : require('@prisma/client');
        chatPrismaInstance = new PrismaClient({
          datasources: {
            db: {
              url: dbUrl
            }
          }
        });
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

    ipcMain.handle('chat:get-messages', async (event, { senderId, receiverId }) => {
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
          linkedElement: true
        },
        orderBy: { createdAt: 'asc' }
      });
    });

    ipcMain.handle('chat:send-message', async (event, { senderId, receiverId, content, linkedElementId, linkedProjectId, attachments }) => {
      const msg = await chatPrisma.chatMessage.create({
        data: {
          senderId,
          receiverId,
          content,
          linkedElementId: linkedElementId || null,
          linkedProjectId: linkedProjectId || null,
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

      return await chatPrisma.chatMessage.findUnique({
        where: { id: msg.id },
        include: {
          attachments: true,
          sender: { select: { id: true, name: true, symbol: true, role: true } },
          receiver: { select: { id: true, name: true, symbol: true, role: true } },
          linkedElement: true
        }
      });
    });

    ipcMain.handle('chat:upload-file', async (event, { fileName, base64Data }) => {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const dir = path.join(app.getPath('userData'), 'chat_files');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Sanitizing fileName to prevent Path Traversal
      const sanitizedFileName = path.basename(fileName).replace(/[\/\\]/g, '');
      const localPath = path.join(dir, sanitizedFileName);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(localPath, buffer);
      return { filePath: localPath, fileName: sanitizedFileName, fileSize: buffer.length };
    });

    ipcMain.handle('chat:open-file', async (event, filePath) => {
      const { shell } = require('electron');
      const fs = require('fs');
      if (fs.existsSync(filePath)) {
        await shell.openPath(filePath);
        return { success: true };
      } else {
        return { success: false, error: 'Файл не найден на системном диске.' };
      }
    });

    ipcMain.handle('shell:open-external', async (event, url) => {
      const { shell } = require('electron');
      try {
        await shell.openExternal(url);
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

    ipcMain.handle('chat:get-groups', async () => {
      await ensureProjectChatGroupsIPC();
      return await chatPrisma.chatGroup.findMany({
        include: {
          members: { select: { id: true, name: true, symbol: true, role: true } },
          project: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
    });

    ipcMain.handle('chat:get-group-messages', async (event, { groupId }) => {
      return await chatPrisma.chatMessage.findMany({
        where: { chatGroupId: groupId },
        include: {
          attachments: true,
          sender: { select: { id: true, name: true, symbol: true, role: true } },
          linkedElement: true
        },
        orderBy: { createdAt: 'asc' }
      });
    });

    ipcMain.handle('chat:send-group-message', async (event, { senderId, groupId, content, linkedElementId, linkedProjectId, attachments }) => {
      const msg = await chatPrisma.chatMessage.create({
        data: {
          senderId,
          chatGroupId: groupId,
          content,
          linkedElementId: linkedElementId || null,
          linkedProjectId: linkedProjectId || null,
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

      return await chatPrisma.chatMessage.findUnique({
        where: { id: msg.id },
        include: {
          attachments: true,
          sender: { select: { id: true, name: true, symbol: true, role: true } },
          linkedElement: true
        }
      });
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
    ipcMain.handle('chat:search-element', async (event, { tag }) => {
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
    ipcMain.handle('chat:autocomplete-tags', async (event, { query, projectId }) => {
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
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);
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

      console.log('[Updater] Production: Checking PostgreSQL databases for update records...');
      const { PrismaClient } = require('@prisma/client');
      const prismaInstance = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL || "postgresql://postgres:gfhjkm1212@11.22.33.44:5432/pdm_system?schema=public"
          }
        }
      });

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
      const { PrismaClient } = require('@prisma/client');
      const prismaInstance = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL || "postgresql://postgres:gfhjkm1212@11.22.33.44:5432/pdm_system?schema=public"
          }
        }
      });

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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

