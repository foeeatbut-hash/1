import { ENV_CONFIG } from '../config/env';
import { useLogStore } from '../store/logStore';

// --- TYPE DEFINITIONS ---

export interface User {
  id: string;
  name: string;
  symbol: string;
  login?: string;
  role: string;
  password?: string;
  isActive?: boolean;
  validUntil?: string | Date | null;
  permissions?: string | null;
  createdAt?: string | Date;
}

export interface UserNote {
  id: string;
  title: string;
  content: string;
  color: string;
  equipmentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SystemChangeLog {
  id: string;
  userName: string;
  userSymbol: string;
  description: string;
  targetRoute: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  info?: string;
  status: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  identifier: string;
  department?: string | null;
  wbs?: string | null;
  fluid?: string | null;
  projectId: string;
  equipmentId?: string | null;
  metadata?: string | null;
  createdAt: string;
}

export interface EquipmentSystem {
  id: string;
  name: string;
  projectId: string;
  fileName?: string | null;
  monoblocks?: Monoblock[];
  createdAt: string;
}

export interface Monoblock {
  id: string;
  name: string;
  systemId: string;
  components?: ComponentElement[];
  createdAt: string;
}

export interface ComponentElement {
  id: string;
  name: string;
  itemCode: string;
  monoblockId: string;
  monoblock?: Monoblock;
  specs?: string | null;
  tags?: Tag[];
  createdAt: string;
  updatedAt: string;
  status: string;
  hasConflict: boolean;
  conflictType?: string | null;
  conflictLog?: string | null;
  version: number;
}

export interface EquipmentHistory {
  id: string;
  elementId: string;
  version: number;
  changedAt: string;
  oldSpecs?: string | null;
  newSpecs?: string | null;
  changeType: string;
}

export interface Dictionary {
  id: string;
  projectId: string;
  name: string;
  items?: DictionaryItem[];
}

export interface DictionaryItem {
  id: string;
  dictionaryId: string;
  code: string;
  nameRu: string;
  parentId?: string | null;
  children?: DictionaryItem[];
}

export interface Folder {
  id: string;
  name: string;
  projectId: string;
  parentId?: string | null;
  children?: Folder[];
  files?: FileNode[];
  updatedAt: string;
}

export interface FileNode {
  id: string;
  name: string;
  filePath: string;
  size: number;
  type: string;
  department?: string | null;
  statusCode: string;
  revision: string;
  createdAt: string;
  createdById?: string | null;
  updatedById?: string | null;
  updatedAt: string;
  content?: string | null;
  folderId?: string | null;
  mainTags?: Tag[];
  additionalTags?: Tag[];
}

// --- LOCAL FALLBACK ENGINE FOR OFFLINE / DISCONNECTED MODE ---
function getFallbackData<T>(endpoint: string, method: string, body?: any): T {
  const cleanEndpoint = endpoint.split('?')[0];

  const getStorageItem = (key: string, defaultValue: any) => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  };

  const saveStorageItem = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  // 1. DATABASE CONFIG Fallback
  if (cleanEndpoint === '/db/config') {
    return {
      current_db_type: 'LOCAL',
      database_url: '',
      databasePath: 'AppData/Roaming/pdm-app/database.sqlite',
      isConfigured: true,
      displayPath: 'Профиль / pdm-app/database.sqlite',
      defaultPath: 'AppData/Roaming/pdm-app/database.sqlite'
    } as unknown as T;
  }

  // 2. PROJECTS Fallback
  if (cleanEndpoint === '/projects') {
    const defaultProjs = [
      { id: 'proj-alpha', name: 'Технологический Проект Альфа', description: 'Базовая информация о новом технологическом или инженерном проекте.', info: 'Добавьте подробное техническое описание, состав оборудования и основные чертежи/спецификации.', status: 'ACTIVE', createdAt: new Date().toISOString() },
      { id: 'proj-beta', name: 'Система вентиляции Блок Б', description: 'Инженерный чертеж и спецификация воздуховодов.', info: 'Раздел ОВ.', status: 'PLANNING', createdAt: new Date().toISOString() }
    ];
    let projs = getStorageItem('max_fallback_projects', defaultProjs);

    if (method === 'POST' && body) {
      try {
        const parsedBody = JSON.parse(body);
        const newProj = {
          id: `proj-${Date.now()}`,
          name: parsedBody.name,
          description: parsedBody.description || '',
          info: parsedBody.info || '',
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        };
        projs.push(newProj);
        saveStorageItem('max_fallback_projects', projs);
        return { project: newProj } as unknown as T;
      } catch (e) {}
    }
    return { projects: projs } as unknown as T;
  }

  // 3. CHANGE LOGS Fallback
  if (cleanEndpoint === '/logs') {
    const defaultLogs = [
      { id: 'log-1', userName: 'Инженер (qwerty)', userSymbol: 'qwerty', description: 'Система запущена в автономном режиме симуляции локальной БД', targetRoute: '/', createdAt: new Date(Date.now() - 60000).toISOString() },
      { id: 'log-2', userName: 'Главный Администратор', userSymbol: 'KhKh', description: 'Добавлен элемент оборудования в локальную спецификацию', targetRoute: '/equipment', createdAt: new Date(Date.now() - 360000).toISOString() }
    ];
    let logs = getStorageItem('max_fallback_logs', defaultLogs);

    if (method === 'POST' && body) {
      try {
        const parsedBody = JSON.parse(body);
        const newLog = {
          id: `log-${Date.now()}`,
          userName: parsedBody.userName || 'Инженер',
          userSymbol: parsedBody.userSymbol || 'qwerty',
          description: parsedBody.description,
          targetRoute: parsedBody.targetRoute || '/',
          createdAt: new Date().toISOString()
        };
        logs.unshift(newLog);
        saveStorageItem('max_fallback_logs', logs);
        return { log: newLog } as unknown as T;
      } catch (e) {}
    }
    return { logs } as unknown as T;
  }

  // 4. NOTES Fallback
  if (cleanEndpoint === '/notes' || cleanEndpoint.startsWith('/notes/')) {
    const defaultNotes = [
      { id: 'note-1', title: 'Ревизия лопаток вентилятора', content: 'Выполнить плановый контроль аэродинамически нагруженных узлов до конца текущей смены.', color: 'bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-900/40', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'note-2', title: 'Таблица ККС кодов', content: 'Сверить KKS шифры распределителей воздуха согласно актуальному чертежу ПДМ.', color: 'bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/40', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ];
    let notes = getStorageItem('max_fallback_notes', defaultNotes);

    if (method === 'POST' && body) {
      try {
        const parsedBody = JSON.parse(body);
        const newNote = {
          id: `note-${Date.now()}`,
          title: parsedBody.title,
          content: parsedBody.content,
          color: parsedBody.color || 'bg-slate-50 dark:bg-dark-bg/50 dark:border-dark-border',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        notes.unshift(newNote);
        saveStorageItem('max_fallback_notes', notes);
        return { note: newNote } as unknown as T;
      } catch (e) {}
    } else if (method === 'PATCH' && body) {
      try {
        const id = cleanEndpoint.split('/').pop();
        const parsedBody = JSON.parse(body);
        notes = notes.map((n: any) => n.id === id ? { ...n, ...parsedBody, updatedAt: new Date().toISOString() } : n);
        saveStorageItem('max_fallback_notes', notes);
        const updated = notes.find((n: any) => n.id === id);
        return { note: updated } as unknown as T;
      } catch (e) {}
    } else if (method === 'DELETE') {
      const id = cleanEndpoint.split('/').pop();
      notes = notes.filter((n: any) => n.id !== id);
      saveStorageItem('max_fallback_notes', notes);
      return { success: true } as unknown as T;
    }

    return { notes } as unknown as T;
  }

  // 5. USERS Fallback
  if (cleanEndpoint === '/users') {
    const defaultUsers = [
      { id: 'fallback-admin', name: 'Главный Администратор (KhKh)', symbol: 'KhKh', role: 'ADMIN' },
      { id: 'fallback-user', name: 'Инженер (qwerty)', symbol: 'qwerty', role: 'USER' }
    ];
    let users = getStorageItem('max_fallback_users', defaultUsers);

    if (method === 'POST' && body) {
      try {
        const parsedBody = JSON.parse(body);
        const newUser = {
          id: `user-${Date.now()}`,
          name: parsedBody.name,
          symbol: parsedBody.symbol,
          role: parsedBody.role || 'USER'
        };
        users.push(newUser);
        saveStorageItem('max_fallback_users', users);
        return newUser as unknown as T;
      } catch (e) {}
    }
    return users as unknown as T;
  }

  // 6. DEFAULT DICTIONARIES offline fallbacks
  if (cleanEndpoint.includes('/dictionaries')) {
    const defaultDicts = [
      { id: 'dict-1', name: 'Автономный справочник ККС', projectId: 'proj-alpha' }
    ];
    return getStorageItem('max_fallback_dicts', defaultDicts) as unknown as T;
  }
  
  if (cleanEndpoint.includes('/tag-template')) {
    return {
      template: 'KKS-{department}-{wbs}-{number}'
    } as unknown as T;
  }

  if (cleanEndpoint.includes('/systems')) {
    const defaultSystems = [
      { id: 'sys-1', name: 'Система приточной вентиляции П1', projectId: 'proj-alpha', createdAt: new Date().toISOString() },
      { id: 'sys-2', name: 'Рециркуляционная система Р1', projectId: 'proj-alpha', createdAt: new Date().toISOString() }
    ];
    return getStorageItem('max_fallback_systems', defaultSystems) as unknown as T;
  }

  if (cleanEndpoint.includes('/folders') || cleanEndpoint.includes('/files')) {
    return {
      folders: [
        { id: 'fold-1', name: 'Дочерняя документация', projectId: 'proj-alpha', updatedAt: new Date().toISOString() }
      ],
      files: [
        { id: 'file-1', name: 'Схема расположения_ОВ.pdf', size: 1421000, type: 'pdf', statusCode: 'APPROVED', revision: 'A', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      ]
    } as unknown as T;
  }

  if (cleanEndpoint.includes('/tags') || cleanEndpoint.includes('/registry')) {
    return [
      { id: 'tag-1', identifier: 'KKS-VENT-01', department: 'ОВ', wbs: 'ОВ-01', fluid: 'Air', projectId: 'proj-alpha', createdAt: new Date().toISOString() }
    ] as unknown as T;
  }

  if (cleanEndpoint.includes('/equipment') || cleanEndpoint.includes('/components')) {
    return [] as unknown as T;
  }

  return {} as unknown as T;
}

// --- HELPER WRAPPER ---
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = options?.method || 'GET';
  const url = endpoint.startsWith('http') ? endpoint : `${ENV_CONFIG.apiUrl}${endpoint}`;
  
  useLogStore.getState().addLog('INFO', 'Network Stack', `[${method}] отправка запроса: ${endpoint}`);
  
  const headers: Record<string, string> = {};
  if (options?.body || method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }
  Object.assign(headers, options?.headers || {});

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody.message || errorBody.error || `Http request failed: ${response.status}`;
      useLogStore.getState().addLog('ERROR', 'Network Stack', `[${method}] запрос ${endpoint} завершился с ошибкой: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    useLogStore.getState().addLog('INFO', 'Network Stack', `[${method}] получен успешный ответ от ${endpoint}`);
    return response.json() as Promise<T>;
  } catch (err: any) {
    // Для входа автономный fallback не используется: пользователь должен
    // увидеть настоящую причину отказа сервера (неверный пароль и т.п.)
    if (endpoint.split('?')[0] === '/login') {
      throw err;
    }
    useLogStore.getState().addLog('WARN', 'Network Stack', `[${method}] сбой при отправке запроса. Активация локальной автономной БД для ${endpoint}: ${err.message}`);
    return getFallbackData<T>(endpoint, method, options?.body);
  }
}

// --- DATA ACCESS SERVICE (DAO PATTERN) ---
export const dataService = {
  
  // --- USER AUTHENTICATION & SEEDING ---
  async login(symbolVal: string, passwordVal: string): Promise<{ success: boolean; user: any; message?: string }> {
    return request('/login', {
      method: 'POST',
      body: JSON.stringify({ symbol: symbolVal, password: passwordVal }),
    });
  },

  async seedDatabase(): Promise<void> {
    return request('/seed', { method: 'POST' });
  },

  async getUsers(): Promise<User[]> {
    return request<User[]>('/users');
  },

  async createUser(userData: { symbol: string; name: string; role: string; password?: string; validUntil?: string | null; isActive?: boolean; permissions?: string | null }): Promise<User> {
    return request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async updateUser(id: string, data: { name?: string; symbol?: string; role?: string; password?: string; isActive?: boolean; validUntil?: string | null; permissions?: string | null }): Promise<{ success: boolean; user?: User; message?: string }> {
    return request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteUser(id: string): Promise<{ success: boolean; message?: string }> {
    return request(`/users/${id}`, { method: 'DELETE' });
  },

  // Проверка действительности профиля во время работы (таймер/отключение админом)
  async checkAuth(userId: string): Promise<{ valid: boolean; reason?: string; degraded?: boolean }> {
    return request(`/auth/check?userId=${encodeURIComponent(userId)}`);
  },

  // --- PROJECTS ---
  async getProjects(): Promise<Project[]> {
    const res = await request<{ projects: Project[] }>('/projects');
    return res.projects || [];
  },

  async createProject(name: string, description?: string, info?: string, actorId?: string): Promise<Project> {
    const res = await request<{ project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description, info, actorId }),
    });
    return res.project;
  },

  async updateProject(id: string, name: string, description?: string, info?: string, status?: string, actorId?: string): Promise<Project> {
    const res = await request<{ project: Project }>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description, info, status, actorId }),
    });
    return res.project;
  },

  async deleteProject(id: string, actorId?: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/projects/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ actorId }),
    });
  },

  // --- SYSTEMS / EQUIPMENT & CONFLICTS ---
  async getSystems(projectId: string): Promise<any> {
    const id = projectId || 'default';
    return request<any>(`/projects/${id}/systems`);
  },

  async getSystemById(systemId: string): Promise<any> {
    return request(`/systems/${systemId}`);
  },

  async createSystem(projectId: string, systemData: any): Promise<EquipmentSystem> {
    const id = projectId || 'default';
    return request<EquipmentSystem>(`/projects/${id}/systems`, {
      method: 'POST',
      body: JSON.stringify(systemData),
    });
  },

  async deleteSystem(systemId: string): Promise<{ success: boolean; error?: string }> {
    return request<{ success: boolean; error?: string }>(`/systems/${systemId}`, {
      method: 'DELETE',
    });
  },

  async resolveConflict(componentId: string, specs?: any): Promise<ComponentElement> {
    return request<ComponentElement>(`/components/${componentId}/resolve-conflict`, {
      method: 'POST',
      body: JSON.stringify({ specs }),
    });
  },

  async getComponentHistory(componentId: string): Promise<EquipmentHistory[]> {
    return request<EquipmentHistory[]>(`/components/${componentId}/history`);
  },

  // --- TAGS AND GENERATOR ---
  async getTags(projectId: string): Promise<any> {
    return request<any>(`/projects/${projectId}/tags`);
  },

  async createTag(projectId: string, tagData: Partial<Tag>): Promise<Tag> {
    return request<Tag>(`/projects/${projectId}/tags`, {
      method: 'POST',
      body: JSON.stringify(tagData),
    });
  },

  async updateTag(tagId: string, tagData: Partial<Tag>): Promise<Tag> {
    return request<Tag>(`/tags/${tagId}`, {
      method: 'PUT',
      body: JSON.stringify(tagData),
    });
  },

  async deleteTag(tagId: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/tags/${tagId}`, {
      method: 'DELETE',
    });
  },

  async linkTagToComponent(componentId: string, tagId: string): Promise<any> {
    return request(`/components/${componentId}/tags/${tagId}`, {
      method: 'POST',
    });
  },

  async unlinkTagFromComponent(componentId: string, tagId: string): Promise<any> {
    return request(`/components/${componentId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  },

  async generateTag(tagGeneratorPayload: any): Promise<{ tag: Tag }> {
    return request<{ tag: Tag }>('/tags/generate', {
      method: 'POST',
      body: JSON.stringify(tagGeneratorPayload),
    });
  },

  async getTagTemplate(projectId: string): Promise<any> {
    return request(`/projects/${projectId}/tag-template`);
  },

  async saveTagTemplate(projectId: string, schemaJson: string): Promise<any> {
    return request(`/projects/${projectId}/tag-template`, {
      method: 'POST',
      body: JSON.stringify({ schemaJson }),
    });
  },

  // --- DICTIONARIES & METADATA ---
  async getDictionaries(projectId: string): Promise<any> {
    const id = projectId || 'default';
    return request<any>(`/projects/${id}/dictionaries`);
  },

  async createDictionary(projectId: string, name: string): Promise<Dictionary> {
    const id = projectId || 'default';
    return request<Dictionary>(`/projects/${id}/dictionaries`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async getDictionaryItems(dictionaryId: string): Promise<DictionaryItem[]> {
    return request<DictionaryItem[]>(`/dictionaries/${dictionaryId}/items`);
  },

  async createDictionaryItem(projectId: string, dictionaryId: string, itemData: any): Promise<DictionaryItem> {
    return request<DictionaryItem>(`/projects/${projectId}/dictionaries/${dictionaryId}/items`, {
      method: 'POST',
      body: JSON.stringify(itemData),
    });
  },

  async updateDictionaryItem(itemId: string, itemData: any): Promise<DictionaryItem> {
    return request<DictionaryItem>(`/dictionaries/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(itemData),
    });
  },

  async deleteDictionaryItem(itemId: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/dictionaries/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  // --- EXPLORER (FOLDERS & FILES) ---
  async getFolders(projectId: string): Promise<Folder[]> {
    return request<Folder[]>(`/projects/${projectId}/folders`);
  },

  async createFolder(projectId: string, name: string, parentId?: string | null): Promise<Folder> {
    return request<Folder>('/folders', {
      method: 'POST',
      body: JSON.stringify({ projectId, name, parentId }),
    });
  },

  async updateFolder(folderId: string, updateData: any): Promise<Folder> {
    return request<Folder>(`/folders/${folderId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  },

  async deleteFolder(folderId: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/folders/${folderId}`, {
      method: 'DELETE',
    });
  },

  async getDocumentsList(): Promise<any[]> {
    // Top documents used for dashboard lists
    return request<any[]>('/documents');
  },

  async parseAndImportBimFile(projectId: string, payload: { fileName: string; fileBase64: string }): Promise<any> {
    return request(`/projects/${projectId}/excel/parse-and-import`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async createFile(fileData: any): Promise<FileNode> {
    return request<FileNode>('/files', {
      method: 'POST',
      body: JSON.stringify(fileData),
    });
  },

  async updateFile(fileId: string, updateData: any): Promise<FileNode> {
    return request<FileNode>(`/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  },

  async copyFile(payload: { fileId: string; targetFolderId: string }): Promise<any> {
    return request('/files/copy', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async linkTagToFile(fileId: string, tagId: string, role: 'main' | 'additional'): Promise<any> {
    return request(`/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ tagAction: 'link', tagId, role }),
    });
  },

  async unlinkTagFromFile(fileId: string, tagId: string, role: 'main' | 'additional'): Promise<any> {
    return request(`/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ tagAction: 'unlink', tagId, role }),
    });
  },

  async deleteFile(fileId: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/files/${fileId}`, {
      method: 'DELETE',
    });
  },

  // --- USER NOTES & LOGS ---
  async getNotes(): Promise<UserNote[]> {
    const res = await request<{ notes: UserNote[] }>('/notes');
    return res.notes;
  },

  async getNoteById(id: string): Promise<UserNote> {
    const res = await request<{ note: UserNote }>(`/notes/${id}`);
    return res.note;
  },

  async createNote(noteData: { title: string; content: string; color?: string; equipmentId?: string }): Promise<UserNote> {
    const res = await request<{ note: UserNote }>('/notes', {
      method: 'POST',
      body: JSON.stringify(noteData),
    });
    return res.note;
  },

  async updateNote(id: string, noteData: { title?: string; content?: string; color?: string; equipmentId?: string }): Promise<UserNote> {
    const res = await request<{ note: UserNote }>(`/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(noteData),
    });
    return res.note;
  },

  async deleteNote(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/notes/${id}`, {
      method: 'DELETE',
    });
  },

  async getLogs(): Promise<SystemChangeLog[]> {
    const res = await request<{ logs: SystemChangeLog[] }>('/logs');
    return res.logs;
  },

  async createLog(logData: { userName: string; userSymbol: string; description: string; targetRoute?: string }): Promise<SystemChangeLog> {
    const res = await request<{ log: SystemChangeLog }>('/logs', {
      method: 'POST',
      body: JSON.stringify(logData),
    });
    return res.log;
  },

  // --- DATABASE CONFIGURATION API ---
  async getDbConfig(): Promise<{ isConfigured: boolean; databasePath: string; displayPath: string; defaultPath: string }> {
    return request<{ isConfigured: boolean; databasePath: string; displayPath: string; defaultPath: string }>('/db/config');
  },

  async testDbConnection(databasePath: string): Promise<{ success: boolean; exists: boolean; message: string }> {
    return request<{ success: boolean; exists: boolean; message: string }>('/db/test', {
      method: 'POST',
      body: JSON.stringify({ databasePath }),
    });
  },

  async saveDbConfig(databasePath: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>('/db/save', {
      method: 'POST',
      body: JSON.stringify({ databasePath }),
    });
  }
};
