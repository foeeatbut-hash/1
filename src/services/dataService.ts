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

// --- HELPER WRAPPER ---
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = options?.method || 'GET';
  const url = endpoint.startsWith('http') ? endpoint : `${ENV_CONFIG.apiUrl}${endpoint}`;
  
  useLogStore.getState().addLog('INFO', 'Network Stack', `[${method}] отправка запроса: ${endpoint}`);
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody.message || `Http request failed: ${response.status}`;
      useLogStore.getState().addLog('ERROR', 'Network Stack', `[${method}] запрос ${endpoint} завершился с ошибкой: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    useLogStore.getState().addLog('INFO', 'Network Stack', `[${method}] получен успешный ответ от ${endpoint}`);
    return response.json() as Promise<T>;
  } catch (err: any) {
    useLogStore.getState().addLog('ERROR', 'Network Stack', `[${method}] сбой при отправке запроса ${endpoint}: ${err.message}`, err.stack);
    throw err;
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

  async createUser(userData: { symbol: string; name: string; role: string; password?: string }): Promise<User> {
    return request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // --- PROJECTS ---
  async getProjects(): Promise<Project[]> {
    const res = await request<{ projects: Project[] }>('/projects');
    return res.projects || [];
  },

  async createProject(name: string, description?: string, info?: string): Promise<Project> {
    const res = await request<{ project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description, info }),
    });
    return res.project;
  },

  async updateProject(id: string, name: string, description?: string, info?: string, status?: string): Promise<Project> {
    const res = await request<{ project: Project }>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description, info, status }),
    });
    return res.project;
  },

  async deleteProject(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/projects/${id}`, {
      method: 'DELETE',
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
