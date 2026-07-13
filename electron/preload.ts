import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, func: (...args: any[]) => void) => {
      const subscription = (event: any, ...args: any[]) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  },
  saveLog: (text: string) => ipcRenderer.invoke('log:save-dialog', text),
  emergencySave: (text: string) => ipcRenderer.send('log:emergency-save', text),
  
  // Автообновления: проверка и публикация идут через HTTP API сервера
  // (см. UpdaterWidget); главный процесс скачивает exe и подменяет приложение
  startDownload: (data: { url: string; version: string; token?: string }) =>
    ipcRenderer.invoke('updater:start-download', data),
  quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
  getAppVersion: () => ipcRenderer.invoke('updater:version'),
  isPackaged: () => ipcRenderer.invoke('updater:is-packaged'),

  // Listener registrations
  onUpdaterStatus: (callback: (state: string, data?: any) => void) => {
    const subscription = (event: any, state: string, data: any) => callback(state, data);
    ipcRenderer.on('updater:status', subscription);
    return () => {
      ipcRenderer.removeListener('updater:status', subscription);
    };
  },
  onUpdaterError: (callback: (errMsg: string) => void) => {
    const subscription = (event: any, errMsg: string) => callback(errMsg);
    ipcRenderer.on('updater:error', subscription);
    return () => {
      ipcRenderer.removeListener('updater:error', subscription);
    };
  },

  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // Управление окном (кастомный заголовок)
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback: (val: boolean) => void) => {
      const subscription = (_event: any, val: boolean) => callback(val);
      ipcRenderer.on('window:maximized-changed', subscription);
      return () => ipcRenderer.removeListener('window:maximized-changed', subscription);
    },
  },
});
