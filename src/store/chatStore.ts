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
  replyToId?: string | null;
  replyTo?: {
    id: string;
    content: string;
    sender?: { id: string; name: string } | null;
  } | null;
  editedAt?: string | null;
  reactions?: string | null;     // JSON: { "👍": ["userId", ...] }
  pinned?: boolean;
  forwardedFrom?: string | null;
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
  description?: string;
  color?: string;
  ownerId?: string | null;
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
  // Передача черновика из виджета логов в чат (группа «Ошибки»)
  pendingGroupName: string | null;
  pendingDraft: string | null;
  setPending: (groupName: string, draft: string) => void;
  clearPending: () => void;
  // Передача «поделиться-ссылки» в ЛС с пользователем (вставка, не замена)
  pendingReceiverId: string | null;
  pendingInsert: string | null;
  setPendingShare: (receiverId: string, insert: string) => void;
  clearPendingShare: () => void;
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
    attachments?: { fileName: string; filePath: string; fileSize: number }[],
    replyToId?: string | null
  ) => Promise<void>;
  editMessage: (currentUserId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (currentUserId: string, messageId: string) => Promise<void>;
  reactToMessage: (currentUserId: string, messageId: string, emoji: string) => Promise<void>;
  pinMessage: (messageId: string) => Promise<void>;
  forwardMessage: (currentUserId: string, messageId: string, target: { groupId?: string; receiverId?: string }) => Promise<void>;
  clearConversation: (currentUserId: string) => Promise<void>;
  createGroup: (data: { name: string; type: 'CUSTOM' | 'CHANNEL'; memberIds: string[]; description?: string; color?: string; ownerId: string }) => Promise<ChatGroup | null>;
  updateGroup: (id: string, data: { name?: string; description?: string; color?: string; memberIds?: string[]; userId: string }) => Promise<void>;
  deleteGroup: (id: string, userId: string) => Promise<void>;
  uploadFile: (fileName: string, base64Data: string) => Promise<{ filePath: string; fileName: string; fileSize: number }>;
  openFile: (filePath: string) => Promise<void>;
  startPolling: (currentUserId: string) => void;
  stopPolling: () => void;
  setupSocket: (currentUserId: string) => void;
  disconnectSocket: () => void;
}

let socketInstance: Socket | null = null;
let pollTimer: NodeJS.Timeout | null = null;

// Обновляет messages только если список реально изменился — опрос каждые 3 секунды
// не должен дергать перерисовку и скролл без новых сообщений
const messagesSignature = (list: any[]) =>
  list.map(m => `${m.id}:${m.editedAt || ''}:${m.reactions || ''}:${m.pinned ? 1 : 0}`).join('|');

const setMessagesIfChanged = (set: any, get: any, data: any[]) => {
  const prev = get().messages || [];
  if (Array.isArray(data) && messagesSignature(prev) === messagesSignature(data)) {
    return;
  }
  set({ messages: data });
};


export const useChatStore = create<ChatState>((set, get) => {
  return {
    messages: [],
    users: [],
    groups: [],
    activeReceiverId: null,
    activeGroupId: null,
    activeType: 'DIRECT',
    searchQuery: '',
    pendingGroupName: null,
    pendingDraft: null,
    pendingReceiverId: null,
    pendingInsert: null,

    setPending: (groupName, draft) => set({ pendingGroupName: groupName, pendingDraft: draft }),
    clearPending: () => set({ pendingGroupName: null, pendingDraft: null }),
    setPendingShare: (receiverId, insert) => set({ pendingReceiverId: receiverId, pendingInsert: insert }),
    clearPendingShare: () => set({ pendingReceiverId: null, pendingInsert: null }),

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
        console.error('[ChatStore] Error fetching users, fallback mode activated:', err);
        const mockUsers = [
          { id: 'fallback-admin', name: 'Главный Администратор (KhKh)', symbol: 'KhKh', role: 'ADMIN' },
          { id: 'fallback-user', name: 'Инженер (qwerty)', symbol: 'qwerty', role: 'USER' }
        ];
        set({ users: mockUsers });
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
          } else {
            throw new Error('Failed response');
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
            } else {
              throw new Error('Failed response');
            }
          }
        }
      } catch (err) {
        console.error('[ChatStore] Error fetching groups, fallback mode activated:', err);
        const mockGroups = [
          { id: 'group-1', name: 'Рабочий чат проекта Альфа', type: 'PROJECT', projectId: 'proj-alpha' },
          { id: 'group-2', name: 'Группа вентиляции Блок Б', type: 'PROJECT', projectId: 'proj-beta' }
        ];
        set({ groups: mockGroups });
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
              setMessagesIfChanged(set, get, data);
            } else {
              throw new Error('Failed response');
            }
          } else {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
              const data = await win.electron.ipcRenderer.invoke('chat:get-messages', {
                senderId: currentUserId,
                receiverId: activeReceiverId
              });
              setMessagesIfChanged(set, get, data);
            } else {
              const res = await fetch(`/api/chat/messages?senderId=${currentUserId}&receiverId=${activeReceiverId}`);
              if (res.ok) {
                const data = await res.json();
                setMessagesIfChanged(set, get, data);
              } else {
                throw new Error('Failed response');
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
              setMessagesIfChanged(set, get, data);
            } else {
              throw new Error('Failed response');
            }
          } else {
            const win = window as any;
            if (win.electron && win.electron.ipcRenderer) {
              const data = await win.electron.ipcRenderer.invoke('chat:get-group-messages', {
                groupId: activeGroupId
              });
              setMessagesIfChanged(set, get, data);
            } else {
              const res = await fetch(`/api/chat/group-messages?groupId=${activeGroupId}`);
              if (res.ok) {
                const data = await res.json();
                setMessagesIfChanged(set, get, data);
              } else {
                throw new Error('Failed response');
              }
            }
          }
        }
      } catch (err) {
        console.error('[ChatStore] Error fetching messages, fallback simulation loaded:', err);
        // Pre-seed mock conversation to keep the area populated in case of database offline
        const key = `max_chat_backup_${activeType === 'DIRECT' ? activeReceiverId : activeGroupId}`;
        const defaultMsgs = [
          {
            id: 'mock-msg-1',
            content: 'Привет! Добро пожаловать в рабочую область обсуждения. Это резервная копия чата.',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            senderId: 'fallback-admin',
            sender: { id: 'fallback-admin', name: 'Главный Администратор', symbol: 'KhKh', role: 'ADMIN' }
          }
        ];
        try {
          const saved = localStorage.getItem(key);
          if (saved) {
            set({ messages: JSON.parse(saved) });
          } else {
            localStorage.setItem(key, JSON.stringify(defaultMsgs));
            set({ messages: defaultMsgs });
          }
        } catch (e) {
          set({ messages: defaultMsgs });
        }
      }
    },

    sendMessage: async (currentUserId, content, linkedElementId = null, linkedProjectId = null, attachments = [], replyToId = null) => {
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
            attachments,
            replyToId
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
            attachments,
            replyToId
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
        throw err;
      }
    },

    // Редактирование своего сообщения
    editMessage: async (currentUserId, messageId, content) => {
      const win = window as any;
      let updated: ChatMessage | null = null;
      if (win.electron && win.electron.ipcRenderer) {
        updated = await win.electron.ipcRenderer.invoke('chat:edit-message', {
          messageId, userId: currentUserId, content
        });
      } else {
        const res = await fetch(`/api/chat/messages/${messageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUserId, content })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Не удалось изменить сообщение');
        updated = data;
      }
      if (updated) {
        set((state) => ({ messages: state.messages.map(m => m.id === messageId ? updated! : m) }));
      }
    },

    // Удаление своего сообщения
    deleteMessage: async (currentUserId, messageId) => {
      const win = window as any;
      if (win.electron && win.electron.ipcRenderer) {
        await win.electron.ipcRenderer.invoke('chat:delete-message', {
          messageId, userId: currentUserId
        });
      } else {
        const res = await fetch(`/api/chat/messages/${messageId}?userId=${encodeURIComponent(currentUserId)}`, {
          method: 'DELETE'
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Не удалось удалить сообщение');
        }
      }
      set((state) => ({ messages: state.messages.filter(m => m.id !== messageId) }));
    },

    // Реакция эмодзи (через встроенный сервер; в Electron fetch проксируется)
    reactToMessage: async (currentUserId, messageId, emoji) => {
      const res = await fetch(`/api/chat/messages/${messageId}/react`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, emoji }),
      }).catch(() => null);
      let reactions: string | null = null;
      if (res && res.ok) { reactions = (await res.json()).reactions; }
      set((state) => ({ messages: state.messages.map(m => m.id === messageId ? { ...m, reactions } : m) }));
    },

    pinMessage: async (messageId) => {
      const res = await fetch(`/api/chat/messages/${messageId}/pin`, { method: 'POST' }).catch(() => null);
      if (res && res.ok) {
        const { pinned } = await res.json();
        set((state) => ({ messages: state.messages.map(m => m.id === messageId ? { ...m, pinned } : m) }));
      }
    },

    forwardMessage: async (currentUserId, messageId, target) => {
      const res = await fetch(`/api/chat/forward`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, senderId: currentUserId, toGroupId: target.groupId || null, toReceiverId: target.receiverId || null }),
      }).catch(() => null);
      if (!res || !res.ok) throw new Error('Не удалось переслать сообщение');
    },

    clearConversation: async (currentUserId) => {
      const { activeType, activeGroupId, activeReceiverId } = get();
      let url = '';
      if (activeType === 'PROJECT' && activeGroupId) {
        url = `/api/chat/conversation?groupId=${encodeURIComponent(activeGroupId)}`;
      } else if (activeReceiverId) {
        url = `/api/chat/conversation?userA=${encodeURIComponent(currentUserId)}&userB=${encodeURIComponent(activeReceiverId)}`;
      }
      if (!url) return;
      const res = await fetch(url, { method: 'DELETE' }).catch(() => null);
      if (res && res.ok) set({ messages: [] });
    },

    createGroup: async (data) => {
      const res = await fetch(`/api/chat/groups`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(() => null);
      if (!res || !res.ok) throw new Error('Не удалось создать');
      const { group } = await res.json();
      await get().fetchGroups();
      return group;
    },

    updateGroup: async (id, data) => {
      const res = await fetch(`/api/chat/groups/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(() => null);
      if (!res || !res.ok) {
        const d = res ? await res.json().catch(() => ({})) : {};
        throw new Error(d.message || 'Не удалось изменить');
      }
      await get().fetchGroups();
    },

    deleteGroup: async (id, userId) => {
      const res = await fetch(`/api/chat/groups/${id}?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }).catch(() => null);
      if (!res || !res.ok) {
        const d = res ? await res.json().catch(() => ({})) : {};
        throw new Error(d.message || 'Не удалось удалить');
      }
      await get().fetchGroups();
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
