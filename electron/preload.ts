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
  
  // Real database & auto-update APIs
  checkUpdates: () => ipcRenderer.invoke('updater:check'),
  startDownload: () => ipcRenderer.invoke('updater:start-download'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
  getAppVersion: () => ipcRenderer.invoke('updater:version'),
  isPackaged: () => ipcRenderer.invoke('updater:is-packaged'),
  publishRelease: (data: { version: string; changelog: string; fileUrl: string }) => 
    ipcRenderer.invoke('updater:publish-release', data),

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

  // Simulated updater and existing helper APIs on window.electron
  simulateCheck: () => ipcRenderer.invoke('updater:simulateCheck'),
  simulateDownload: () => ipcRenderer.invoke('updater:simulateDownload'),
});
