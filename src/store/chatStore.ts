import { create } from 'zustand';
import { ENV } from '../config/env';
import { io, Socket } from 'socket.io-client';

export interface ChatAttachment {
  id: string;
  messageId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
}

export interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  receiverId?: string | null;
  chatGroupId?: string | null;
  linkedElementId?: string | null;
  linkedProjectId?: string | null;
  attachments?: ChatAttachment[];
  sender: {
    id: string;
    name: string;
    symbol: string;
    role: string;
  };
  receiver?: {
    id: string;
    name: string;
    symbol: string;
    role: string;
  } | null;
  linkedElement?: {
    id: string;
    name: string;
    itemCode: string;
  } | null;
}

export interface ChatUser {
  id: string;
  name: string;
  symbol: string;
  role: string;
}

export interface ChatGroup {
  id: string;
  name: string;
  type: string;
  projectId?: string | null;
  members?: ChatUser[];
  project?: { id: string; name: string } | null;
}

interface ChatState {
  messages: ChatMessage[];
  users: ChatUser[];
  groups: ChatGroup[];
  activeReceiverId: string | null;
  activeGroupId: string | null;
  activeType: 'DIRECT' | 'PROJECT';
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setActiveReceiverId: (id: string | null) => void;
  setActiveGroupId: (id: string | null) => void;
  fetchUsers: () => Promise<void>;
  fetchGroups: () => Promise<void>;
  fetchMessages: (currentUserId: string) => Promise<void>;
  sendMessage: (
    currentUserId: string,
    content: string,
    linkedElementId?: string | null,
    linkedProjectId?: string | null,
    attachments?: { fileName: string; filePath: string; fileSize: number }[]
  ) => Promise<void>;
  uploadFile: (fileName: string, base64Data: string) => Promise<{ filePath: string; fileName: string; fileSize: number }>;
  openFile: (filePath: string) => Promise<void>;
  startPolling: (currentUserId: string) => void;
  stopPolling: () => void;
  setupSocket: (currentUserId: string) => void;
  disconnectSocket: () => void;
}

let socketInstance: Socket | null = null;
let pollTimer: NodeJS.Timeout | null = null;

export const useChatStore = create<ChatState>((set, get) => {
  return {
    messages: [],
    users: [],
    groups: [],
    activeReceiverId: null,
    activeGroupId: null,
    activeType: 'DIRECT',
    searchQuery: '',

    setSearchQuery: (query) => set({ searchQuery: query }),
    
    setActiveReceiverId: (id) => {
      set({ activeReceiverId: id, activeGroupId: null, activeType: 'DIRECT', messages: [] });
    },

    setActiveGroupId: (id) => {
      set({ activeGroupId: id, activeReceiverId: null, activeType: 'PROJECT', messages: [] });
    },

    fetchUsers: async () => {
      try {
        const url = ENV.isProduction ? `${ENV.serverUrl}/api/users` : '/api/users';
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch users');
        const data = await response.json();
        set({ users: data });
      } catch (err) {
        console.error('[ChatStore] Error fetching users:', err);
      }
    },

    fetchGroups: async () => {
      try {
        if (ENV.isProduction) {
          const url = `${ENV.serverUrl}/api/chat/groups`;
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            set({ groups: data });
          }
        } else {
          const win = window as any;
          if (win.electron && win.electron.ipcRenderer) {
            const data = await win.electron.ipcRenderer.invoke('chat:get-groups');
            set({ groups: data });
          } else {
            const response = await fetch('/api/chat/groups');
            if (response.ok) {
              const data = await response.json();
              set({ groups: data });
            }
          }
        }
      } catch (err) {
        console.error('[ChatStore] Error fetching groups:', err);
      }
    },

    fetchMessages: async (currentUserId) => {
      const { activeReceiverId, activeGroupId, activeType } = get();
      
      try {
        if (activeType === 'DIRECT') {
          if (!activeReceiverId) return;
          if (ENV.isProduction) {
            const url = `${ENV.serverUrl}/api/chat/messages?senderId=${currentUserId}&receiverId=${activeReceiverId}`;
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              set({ messages: data });
            }
          } else {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
              const data = await win.electron.ipcRenderer.invoke('chat:get-messages', {
                senderId: currentUserId,
                receiverId: activeReceiverId
              });
              set({ messages: data });
            } else {
              const res = await fetch(`/api/chat/messages?senderId=${currentUserId}&receiverId=${activeReceiverId}`);
              if (res.ok) {
                const data = await res.json();
                set({ messages: data });
              }
            }
          }
        } else {
          // PROJECT Group
          if (!activeGroupId) return;
          if (ENV.isProduction) {
            const url = `${ENV.serverUrl}/api/chat/group-messages?groupId=${activeGroupId}`;
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              set({ messages: data });
            }
          } else {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
              const data = await win.electron.ipcRenderer.invoke('chat:get-group-messages', {
                groupId: activeGroupId
              });
              set({ messages: data });
            } else {
              const res = await fetch(`/api/chat/group-messages?groupId=${activeGroupId}`);
              if (res.ok) {
                const data = await res.json();
                set({ messages: data });
              }
            }
          }
        }
      } catch (err) {
        console.error('[ChatStore] Error fetching messages:', err);
      }
    },

    sendMessage: async (currentUserId, content, linkedElementId = null, linkedProjectId = null, attachments = []) => {
      const { activeReceiverId, activeGroupId, activeType } = get();

      try {
        if (activeType === 'DIRECT') {
          if (!activeReceiverId) return;
          const payload = {
            senderId: currentUserId,
            receiverId: activeReceiverId,
            content,
            linkedElementId,
            linkedProjectId,
            attachments
          };
          if (ENV.isProduction) {
            const url = `${ENV.serverUrl}/api/chat/messages`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (res.ok) {
              const data = await res.json();
              set((state) => ({ messages: [...state.messages.filter(m => m.id !== data.id), data] }));
              if (socketInstance) {
                socketInstance.emit('chat:message_sent', data);
              }
            }
          } else {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
              const data = await win.electron.ipcRenderer.invoke('chat:send-message', payload);
              set((state) => ({ messages: [...state.messages.filter(m => m.id !== data.id), data] }));
            } else {
              const res = await fetch(`/api/chat/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              if (res.ok) {
                const data = await res.json();
                set((state) => ({ messages: [...state.messages.filter(m => m.id !== data.id), data] }));
              }
            }
          }
        } else {
          // PROJECT Group
          if (!activeGroupId) return;
          const payload = {
            senderId: currentUserId,
            groupId: activeGroupId,
            content,
            linkedElementId,
            linkedProjectId,
            attachments
          };
          if (ENV.isProduction) {
            const url = `${ENV.serverUrl}/api/chat/group-messages`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (res.ok) {
              const data = await res.json();
              set((state) => ({ messages: [...state.messages.filter(m => m.id !== data.id), data] }));
              if (socketInstance) {
                socketInstance.emit('chat:message_sent', data);
              }
            }
          } else {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
              const data = await win.electron.ipcRenderer.invoke('chat:send-group-message', payload);
              set((state) => ({ messages: [...state.messages.filter(m => m.id !== data.id), data] }));
            } else {
              const res = await fetch(`/api/chat/group-messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              if (res.ok) {
                const data = await res.json();
                set((state) => ({ messages: [...state.messages.filter(m => m.id !== data.id), data] }));
              }
            }
          }
        }
      } catch (err) {
        console.error('[ChatStore] Error sending message:', err);
      }
    },

    uploadFile: async (fileName, base64Data) => {
      try {
        if (ENV.isProduction) {
          const url = `${ENV.serverUrl}/api/chat/upload`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName, base64Data })
          });
          if (!res.ok) throw new Error('File upload failure');
          return await res.json();
        } else {
          const win = window as any;
          if (win.electron && win.electron.ipcRenderer) {
            return await win.electron.ipcRenderer.invoke('chat:upload-file', { fileName, base64Data });
          } else {
            const res = await fetch('/api/chat/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName, base64Data })
            });
            if (!res.ok) throw new Error('Local simulation upload failed');
            return await res.json();
          }
        }
      } catch (err: any) {
        console.error('[ChatStore] Error uploading file:', err);
        throw err;
      }
    },

    openFile: async (filePath) => {
      try {
        const win = window as any;
        if (win.electron && win.electron.ipcRenderer) {
          const result = await win.electron.ipcRenderer.invoke('chat:open-file', filePath);
          if (!result.success) {
            alert(result.error || 'Cannot open file.');
          }
        } else {
          window.open(filePath, '_blank');
        }
      } catch (err) {
        console.error('[ChatStore] Error opening file:', err);
      }
    },

    startPolling: (currentUserId) => {
      get().stopPolling();
      get().fetchMessages(currentUserId);
      pollTimer = setInterval(() => {
        get().fetchMessages(currentUserId);
      }, 3000);
    },

    stopPolling: () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },

    setupSocket: (currentUserId) => {
      if (ENV.isProduction) {
        get().disconnectSocket();
        
        console.log('[ChatStore] Connecting Socket.io client to OFFICE server:', ENV.serverUrl);
        socketInstance = io(ENV.serverUrl);
        
        socketInstance.on('connect', () => {
          console.log('[ChatStore] Socket.io connected. Handshaking user:', currentUserId);
        });

        socketInstance.on('chat:message_received', (msg: ChatMessage) => {
          const { activeReceiverId, activeGroupId, activeType } = get();
          
          if (activeType === 'DIRECT' && activeReceiverId && (msg.senderId === activeReceiverId || msg.receiverId === activeReceiverId)) {
            set((state) => {
              const cleaned = state.messages.filter(m => m.id !== msg.id);
              return { messages: [...cleaned, msg] };
            });
          } else if (activeType === 'PROJECT' && activeGroupId && msg.chatGroupId === activeGroupId) {
            set((state) => {
              const cleaned = state.messages.filter(m => m.id !== msg.id);
              return { messages: [...cleaned, msg] };
            });
          }
        });
      }
    },

    disconnectSocket: () => {
      if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
      }
    }
  };
});
