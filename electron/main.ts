import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

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
    const { PrismaClient } = require('@prisma/client');
    const localPrisma = new PrismaClient();
    
    // PostgreSQL database connection check & safe Auto-Seed
    (async () => {
      try {
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
        await localPrisma.$disconnect();
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
    const { PrismaClient } = require('@prisma/client');
    const chatPrisma = new PrismaClient();

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
      const localPath = path.join(dir, fileName);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(localPath, buffer);
      return { filePath: localPath, fileName, fileSize: buffer.length };
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

  // STAGE 4: Auto-updater setup wrapped strictly inside isPackaged check
  if (app.isPackaged) {
    try {
      // Lazy load electron-updater to prevent crashing in dev environments where it isn't installed
      const { autoUpdater } = require('electron-updater');
      
      autoUpdater.logger = console;
      autoUpdater.checkForUpdatesAndNotify();

      autoUpdater.on('checking-for-update', () => {
        mainWindow?.webContents.send('updater:status', 'checking');
      });

      autoUpdater.on('update-available', (info: any) => {
        mainWindow?.webContents.send('updater:status', 'available', {
          version: info.version,
          releaseNotes: info.releaseNotes || 'Повышена общая производительность систем.'
        });
      });

      autoUpdater.on('download-progress', (progress: any) => {
        mainWindow?.webContents.send('updater:status', 'downloading', {
          percent: progress.percent
        });
      });

      autoUpdater.on('update-downloaded', (info: any) => {
        mainWindow?.webContents.send('updater:status', 'downloaded', {
          version: info.version
        });
      });

      autoUpdater.on('error', (err: any) => {
        console.error('Updater error:', err);
        mainWindow?.webContents.send('updater:error', err.message);
      });

      ipcMain.handle('updater:quitAndInstall', () => {
        autoUpdater.quitAndInstall();
      });
    } catch (err) {
      console.error('Failed to initialize electron-updater:', err);
    }
  } else {
    // Isolated / LOCAL Simulation for Developer Preview
    console.log('[LOCAL Mode] Simulating electron-updater triggers.');
    
    // Simulate check, update found, download loop after some boots
    ipcMain.handle('updater:simulateCheck', () => {
      mainWindow?.webContents.send('updater:status', 'checking');
      
      setTimeout(() => {
        mainWindow?.webContents.send('updater:status', 'available', {
          version: '1.2.0',
          releaseNotes: '### PDM Sync v1.2.0\n\n- Добавлен высокоскоростной конвейер Socket.io\n- Реализация конфликтов specs тегов\n- Повышение отказоустойчивости СУБД SQLite/PostgreSQL\n- Логирование версий и обновлений'
        });
      }, 1500);
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
      }, 800);
    });

    ipcMain.handle('updater:quitAndInstall', () => {
      console.log('[LOCAL Mode] Simulate relaunch / quitAndInstall.');
      app.relaunch();
      app.exit(0);
    });
  }

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

