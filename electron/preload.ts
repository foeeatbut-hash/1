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
  
  // Simulated updater and existing helper APIs on window.electron
  simulateCheck: () => ipcRenderer.invoke('updater:simulateCheck'),
  simulateDownload: () => ipcRenderer.invoke('updater:simulateDownload'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall')
});
