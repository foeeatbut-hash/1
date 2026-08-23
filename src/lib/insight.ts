/**
 * Связи проекта на стороне программы: формы ответов и обращения к серверу.
 *
 * Считает всё сервер — по одному срезу проекта. В браузере это построить не из
 * чего: разделы держат только видимую часть своих списков, и связь тега с
 * документом, который сейчас не открыт, там просто неоткуда взять.
 */

export type UsageKind = 'tag' | 'element' | 'doc' | 'file' | 'vdr';
export type Severity = 'critical' | 'warning' | 'info';

export interface UsageLink {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
  badge?: string;
}

export interface UsageGroup { id: string; title: string; hint: string; links: UsageLink[] }

export interface UsageResult {
  found: boolean; kind: UsageKind; id: string;
  title: string; subtitle: string; total: number; groups: UsageGroup[];
}

export interface Finding { id: string; title: string; subtitle: string; route: string }

export interface CheckGroup {
  id: string; title: string; why: string; severity: Severity; count: number; findings: Finding[];
}

export interface CheckResult {
  projectId: string; projectName: string; at: string;
  total: number; critical: number; warning: number; info: number;
  groups: CheckGroup[];
  hidden: { id: string; title: string; count: number }[];
}

export interface ParamChange { group: string; key: string; was: string; now: string; kind: 'added' | 'removed' | 'changed' }

export interface ChangeEntry {
  id: string; at: string; elementId: string; itemCode: string; where: string;
  version: number; changeType: string; changes: ParamChange[]; route: string;
}

export interface ChangeList { since: string | null; until: string; total: number; entries: ChangeEntry[] }

export interface SearchHit {
  kind: string; id: string; title: string; subtitle: string; route: string; score: number;
}

/** Подписи видов объектов — одни и те же во всех списках программы */
export const KIND_RU: Record<string, string> = {
  tag: 'тег', element: 'оборудование', doc: 'документ', file: 'файл',
  vdr: 'ВДР', note: 'заметка', chat: 'сообщение', system: 'установка', section: 'раздел',
};

/** Цвета степеней важности — из палитры программы, своих оттенков не вводим */
export const SEVERITY_STYLE: Record<Severity, { dot: string; text: string; bg: string; label: string }> = {
  critical: { dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30', label: 'Важно' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', label: 'Стоит поправить' },
  info: { dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/30', label: 'Мелочи' },
};

const qs = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(url);
    if (!r.ok) return fallback;
    return await r.json();
  } catch (_) { return fallback; }
}

export const EMPTY_USAGE: UsageResult = { found: false, kind: 'tag', id: '', title: '', subtitle: '', total: 0, groups: [] };
export const EMPTY_CHECK: CheckResult = { projectId: '', projectName: '', at: '', total: 0, critical: 0, warning: 0, info: 0, groups: [], hidden: [] };
export const EMPTY_CHANGES: ChangeList = { since: null, until: '', total: 0, entries: [] };

export const fetchWhereUsed = (kind: UsageKind, id: string, projectId?: string) =>
  getJson<UsageResult>(`/api/insight/where-used?${qs({ kind, id, projectId })}`, EMPTY_USAGE);

export const fetchCheck = (projectId?: string) =>
  getJson<CheckResult>(`/api/insight/check?${qs({ projectId })}`, EMPTY_CHECK);

export const fetchChanges = (projectId?: string, days = 14) =>
  getJson<ChangeList>(`/api/insight/changes?${qs({ projectId, days })}`, EMPTY_CHANGES);

export const fetchSearch = (q: string, projectId?: string) =>
  getJson<{ hits: SearchHit[] }>(`/api/insight/search?${qs({ q, projectId })}`, { hits: [] }).then(r => r.hits || []);

export async function muteRule(ruleId: string, muted: boolean): Promise<boolean> {
  try {
    const r = await fetch('/api/insight/mute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleId, muted }),
    });
    return r.ok;
  } catch (_) { return false; }
}

/** Дата коротко и по-русски: «22 авг., 14:05» */
export function shortDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return iso; }
}
