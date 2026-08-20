import { ENV_CONFIG } from '../config/env';

/**
 * Обращения к серверу из раздела «Почта».
 *
 * Намеренно мимо общего dataService: тот при сбое сети подставляет заглушечные
 * данные из локального набора — для справочников это удобно, а для почты
 * недопустимо. Показать выдуманное письмо хуже, чем показать ошибку.
 *
 * Токен доступа навешивается общей обёрткой над fetch (src/config/env.ts),
 * поэтому здесь его нет.
 */

export interface MailAccount {
  id: string;
  email: string;
  displayName: string;
  imapHost: string; imapPort: number; imapSecure: boolean;
  smtpHost: string; smtpPort: number; smtpSecure: boolean;
  login: string;
  signature: string;
  syncDays: number;
  active: boolean;
  hasSecret: boolean;
  lastSyncAt: string | null;
  lastError: string;
  syncing?: boolean;
}

export interface MailFolder {
  id: string;
  accountId: string;
  path: string;
  name: string;
  kind: string;
  unread: number;
  total: number;
  syncedAt: string | null;
}

export interface MailThread {
  threadKey: string;
  count: number;
  unread: boolean;
  flagged: boolean;
  hasFiles: boolean;
  answered: boolean;
  subject: string;
  snippet: string;
  sentAt: string;
  from: Array<{ name: string; addr: string }>;
  lastId: string;
  ids: string[];
}

export interface MailMessage {
  id: string;
  folderId: string;
  uid: number;
  messageId: string;
  fromName: string; fromAddr: string;
  toAddrs: string; ccAddrs: string;
  subject: string; snippet: string;
  sentAt: string;
  size: number;
  seen: boolean; flagged: boolean; answered: boolean; hasFiles: boolean;
  bodyAt: string | null;
}

export interface MailAttachment {
  id: string;
  messageId: string;
  fileName: string;
  size: number;
  mimeType: string;
  contentId: string;
  inline: boolean;
}

export interface MailPreset {
  domain: string;
  title: string;
  imapHost: string; imapPort: number;
  smtpHost: string; smtpPort: number;
  hint: string;
  help: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENV_CONFIG.apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body?.error || `Сервер ответил ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === false) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v === true ? 1 : v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
};

export const mailService = {
  /** Настройки серверов по адресу почты — чтобы человек их не искал. */
  preset: (email: string) =>
    call<{ preset: MailPreset | null; known?: boolean }>(`/mail/preset${qs({ email })}`),

  accounts: () => call<{ accounts: MailAccount[]; keyIn: 'system' | 'file' }>('/mail/accounts'),

  addAccount: (data: Record<string, unknown>) =>
    call<{ account: MailAccount }>('/mail/accounts', { method: 'POST', body: JSON.stringify(data) }),

  updateAccount: (id: string, data: Record<string, unknown>) =>
    call<{ account: MailAccount }>(`/mail/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  removeAccount: (id: string) =>
    call<{ ok: boolean }>(`/mail/accounts/${id}`, { method: 'DELETE' }),

  verify: (id: string) =>
    call<{ imap: { ok: boolean; error: string; folders: number } }>(`/mail/accounts/${id}/verify`, { method: 'POST' }),

  sync: (id: string, opts: { deep?: boolean; folderId?: string } = {}) =>
    call<{ report: { folders: number; added: number; updated: number; resynced: string[]; error: string } }>(
      `/mail/accounts/${id}/sync`, { method: 'POST', body: JSON.stringify(opts) },
    ),

  folders: (accountId: string) =>
    call<{ folders: MailFolder[] }>(`/mail/folders${qs({ accountId })}`),

  threads: (p: { accountId: string; folderId?: string; q?: string; unread?: boolean; flagged?: boolean; limit?: number; skip?: number }) =>
    call<{ threads: MailThread[]; total: number }>(`/mail/threads${qs(p as any)}`),

  thread: (accountId: string, threadKey: string) =>
    call<{ messages: MailMessage[]; attachments: MailAttachment[] }>(`/mail/thread${qs({ accountId, threadKey })}`),

  body: (messageId: string) =>
    call<{ text: string; html: string; error: string; attachments: MailAttachment[] }>(`/mail/messages/${messageId}/body`),

  flag: (ids: string[], flag: 'seen' | 'flagged', on: boolean) =>
    call<{ ok: boolean; changed: number }>('/mail/flag', { method: 'POST', body: JSON.stringify({ ids, flag, on }) }),

  move: (ids: string[], to: 'TRASH' | 'ARCHIVE' | 'INBOX') =>
    call<{ ok: boolean }>('/mail/move', { method: 'POST', body: JSON.stringify({ ids, to }) }),

  /** Ссылка на вложение — по ней же браузер его и скачивает. */
  attachmentUrl: (id: string) => `${ENV_CONFIG.apiUrl}/mail/attachments/${id}`,
};
