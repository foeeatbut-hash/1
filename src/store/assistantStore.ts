import { create } from 'zustand';
import * as XLSX from 'xlsx';
import { ENV_CONFIG } from '../config/env';
import { findKnowledge } from '../assistant/knowledge';
import { TOURS, findTourByText, findBestTour, Tour } from '../assistant/tours';
import { getSection } from '../assistant/sections';
import { parse, hasIntent, fieldMatchesStems, Parsed } from '../assistant/nlp';

export interface AssistantAction {
  label: string;
  kind: 'tour' | 'export-excel' | 'export-word' | 'navigate' | 'ask'
      | 'focus-tag' | 'find-duplicates' | 'create-note' | 'open-section'
      | 'bulk-stage' | 'apply-links' | 'checklist-note' | 'undo-bulk';
  tourId?: string;
  route?: string;
  query?: string;
  tagId?: string;   // для focus-tag
  code?: string;    // для find-duplicates
  noteTitle?: string; // для create-note
  // Планы действий (превью → выполнение)
  stagePlan?: { tagIds: string[]; stageId: string; stageLabel: string };
  linkPlan?: { pairs: { childId: string; parentId: string }[] };
  checklist?: { title: string; items: string[] };
}

// Снимок для «Отмены» массовой операции: прежние metadata по тегам
interface UndoSnapshot { label: string; before: { id: string; metadata: string }[]; }

export interface AssistantTable {
  columns: string[];
  rows: (string | number)[][];
  title: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: AssistantAction[];
  table?: AssistantTable;
}

interface AssistantData {
  projectId: string;
  projects: { id: string; name: string; status: string }[];
  tags: { id: string; identifier: string; brand?: string; department?: string; wbs?: string; fluid?: string; mainName?: string; actuality?: string; stageId?: string; stageLabel?: string; supplier?: string; qty?: string; connCount?: number; hasEquipment?: boolean; metadata?: string }[];
  components: { id: string; name: string; itemCode: string; systemName: string; category: string; monoblockName: string; status: string; hasConflict: boolean; tags: string[] }[];
  stages: { id: string; label: string }[];
  duplicates: { code: string; count: number; ids: string[] }[];
  notes: { id: string; title: string; updatedAt: string }[];
  recentLogs: { description: string; userName: string; targetRoute: string; createdAt: string }[];
  counts: Record<string, number>;
}

// Последний результат — для follow-up вопросов («а сколько их?», «выгрузи», «первый на холсте»)
interface LastResult {
  kind: 'tags' | 'components' | 'duplicates';
  ids: string[];
  label: string;
}

interface AssistantState {
  isOpen: boolean;
  messages: AssistantMessage[];
  loading: boolean;
  demoMode: boolean;          // режим «Демонстрация»: любой вопрос → ближайшая демонстрация
  currentRoute: string;
  greetedRoutes: Record<string, boolean>;

  // Состояние демонстрации (тура)
  activeTour: Tour | null;
  tourStepIndex: number;
  highlightSelector: string | null;

  // Последняя выборка для экспорта
  lastTable: AssistantTable | null;
  // Контекст диалога — последний найденный список (для «а сколько их / выгрузи / первый»)
  lastResult: LastResult | null;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  toggleDemoMode: () => void;
  setRoute: (route: string) => void;
  ask: (text: string) => Promise<void>;
  runAction: (action: AssistantAction) => void;
  pushAssistant: (text: string, actions?: AssistantAction[]) => void;
  maybeDigest: () => Promise<void>;
  runSuggestion: (s: { kind: 'ask' | 'tour'; query?: string; tourId?: string }) => void;
  describeCurrentSection: () => void;
  startTour: (tourId: string) => void;
  advanceTour: () => void;
  cancelTour: () => void;
  setHighlight: (selector: string | null) => void;
}

let navigateFn: ((path: string) => void) | null = null;
export function setAssistantNavigator(fn: (path: string) => void) {
  navigateFn = fn;
}

let getActiveProjectId: (() => string | null) | null = null;
export function setAssistantProjectGetter(fn: () => string | null) {
  getActiveProjectId = fn;
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Разбор запроса и сопоставление живёт в nlp.ts (стеммер, опечатки, синонимы) —
// прежние tokensFrom/fieldMatches удалены как дублирующие.

let dataCache: { data: AssistantData; ts: number } | null = null;

// Сброс кэша: вызывается после изменений данных (в т.ч. действий самого чата),
// чтобы ответы всегда были свежими, а не устаревшими на 15 секунд.
export function invalidateAssistantData() { dataCache = null; }

async function fetchAssistantData(): Promise<AssistantData> {
  const now = Date.now();
  if (dataCache && now - dataCache.ts < 15000) return dataCache.data;
  const projectId = (getActiveProjectId && getActiveProjectId()) || '';
  const res = await fetch(`${ENV_CONFIG.apiUrl}/assistant/data?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) throw new Error('Не удалось получить данные из базы');
  const data = await res.json();
  dataCache = { data, ts: now };
  return data;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

function exportTableToExcel(table: AssistantTable) {
  const aoa = [table.columns, ...table.rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Данные');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  triggerDownload(new Blob([out], { type: 'application/octet-stream' }), `PDM_${ts}.xlsx`);
}

function exportTableToWord(table: AssistantTable) {
  const head = table.columns.map(c => `<th style="border:1px solid #888;padding:6px;background:#eee">${c}</th>`).join('');
  const body = table.rows.map(r =>
    '<tr>' + r.map(c => `<td style="border:1px solid #888;padding:6px">${String(c ?? '')}</td>`).join('') + '</tr>'
  ).join('');
  const html =
    `<html><head><meta charset="utf-8"></head><body>` +
    `<h2>${table.title}</h2>` +
    `<table style="border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `</body></html>`;
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  triggerDownload(new Blob(['﻿', html], { type: 'application/msword' }), `PDM_${ts}.doc`);
}

// Преобразование подсказки раздела в кнопку-действие сообщения
function toAction(s: { label: string; kind: 'ask' | 'tour'; query?: string; tourId?: string }): AssistantAction {
  return s.kind === 'tour'
    ? { label: s.label, kind: 'tour', tourId: s.tourId }
    : { label: s.label, kind: 'ask', query: s.query };
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  isOpen: false,
  messages: [{
    id: uid(),
    role: 'assistant',
    text: 'Здравствуйте! Я помощник PDM System — работаю локально, понимаю обычную речь и опечатки.\n\nМожно спросить про данные («покажи вентиляторы», «где 3700-K02»), проблемы («покажи дубли», «что требует внимания»), закупки («что не заказано») — а я найду и дам кнопки: открыть на холсте, показать в Менеджменте, выгрузить в Excel. Могу и выполнить: «открой менеджмент», «создай заметку». Ctrl+K — вызвать меня из любого места.',
    actions: [
      { label: 'Покажи дубли', kind: 'ask', query: 'покажи дубли' },
      { label: 'Что не заказано', kind: 'ask', query: 'что не заказано' },
      { label: 'Что ты умеешь?', kind: 'navigate', route: '__help' },
    ],
  }],
  loading: false,
  demoMode: false,
  currentRoute: '/',
  greetedRoutes: {},
  activeTour: null,
  tourStepIndex: 0,
  highlightSelector: null,
  lastTable: null,
  lastResult: null,

  toggleOpen: () => set(s => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  toggleDemoMode: () => set(s => ({ demoMode: !s.demoMode })),

  setRoute: (route) => {
    const prev = get().currentRoute;
    set({ currentRoute: route });
    // Встречаем пользователя при заходе в новый раздел (один раз за сессию), если чат открыт
    if (route !== prev && get().isOpen) {
      const sec = getSection(route);
      if (sec && !get().greetedRoutes[route]) {
        set(s => ({
          greetedRoutes: { ...s.greetedRoutes, [route]: true },
          messages: [...s.messages, {
            id: uid(), role: 'assistant',
            text: `${sec.emoji} ${sec.greeting}`,
            actions: sec.suggestions.map(toAction),
          }],
        }));
      }
    }
  },

  setHighlight: (selector) => set({ highlightSelector: selector }),

  describeCurrentSection: () => {
    const sec = getSection(get().currentRoute);
    if (!sec) return;
    set(s => ({
      messages: [...s.messages, {
        id: uid(), role: 'assistant',
        text: `${sec.emoji} Раздел «${sec.title}»\n\n${sec.description}`,
        actions: sec.suggestions.map(toAction),
      }],
    }));
  },

  runSuggestion: (s) => {
    if (s.kind === 'tour' && s.tourId) {
      get().startTour(s.tourId);
    } else if (s.kind === 'ask' && s.query) {
      get().ask(s.query);
    }
  },

  ask: async (text) => {
    const clean = text.trim();
    if (!clean) return;
    const userMsg: AssistantMessage = { id: uid(), role: 'user', text: clean };
    set(s => ({ messages: [...s.messages, userMsg], loading: true }));

    try {
      const { message, result } = await resolveQuery(clean, get().demoMode, get().lastResult);
      set(s => ({
        messages: [...s.messages, message],
        loading: false,
        lastTable: message.table || s.lastTable,
        lastResult: result !== undefined ? result : s.lastResult,
      }));
    } catch (err: any) {
      set(s => ({
        messages: [...s.messages, { id: uid(), role: 'assistant', text: `Не удалось обработать запрос: ${err.message}` }],
        loading: false,
      }));
    }
  },

  pushAssistant: (text, actions) => set(s => ({ messages: [...s.messages, { id: uid(), role: 'assistant', text, actions }] })),

  // Проактивный дайджест при первом открытии за сессию: коротко о том, что горит
  maybeDigest: async () => {
    if (digestShownThisSession) return;
    digestShownThisSession = true;
    try {
      const data = await fetchAssistantData();
      const c = data.counts;
      const problems = (c.duplicates || 0) + (c.critical || 0);
      if (problems === 0) return; // молчим, если всё в порядке — не шумим
      const parts: string[] = [];
      if (c.duplicates) parts.push(`дублей ${c.duplicates}`);
      if (c.critical) parts.push(`критичных ${c.critical}`);
      if (c.warning) parts.push(`на проверку ${c.warning}`);
      const stuck = data.tags.filter(t => t.stageId === 'added').length;
      if (stuck) parts.push(`ждут заказа ${stuck}`);
      get().pushAssistant(
        `📋 По проекту требуют внимания: ${parts.join(', ')}.`,
        [
          { label: 'Полный аудит', kind: 'ask', query: 'аудит проекта' },
          { label: 'Что мне доделать', kind: 'ask', query: 'что мне доделать' },
        ]
      );
    } catch (_) { /* тихо */ }
  },

  runAction: (action) => {
    if (action.kind === 'tour' && action.tourId) {
      get().startTour(action.tourId);
    } else if (action.kind === 'ask' && action.query) {
      get().ask(action.query);
    } else if (action.kind === 'export-excel' && get().lastTable) {
      exportTableToExcel(get().lastTable!);
    } else if (action.kind === 'export-word' && get().lastTable) {
      exportTableToWord(get().lastTable!);
    } else if (action.kind === 'navigate' || action.kind === 'open-section') {
      if (action.route === '__help') {
        const ans = findKnowledge('что умеешь');
        set(s => ({ messages: [...s.messages, { id: uid(), role: 'assistant', text: ans || '' }] }));
      } else if (action.route && navigateFn) {
        navigateFn(action.route);
      }
    } else if (action.kind === 'focus-tag' && action.tagId && navigateFn) {
      // Глубокая ссылка: раздел прочитает ?focus= и центрирует/подсветит позицию
      navigateFn(`/registry?focus=${encodeURIComponent(action.tagId)}`);
    } else if (action.kind === 'find-duplicates' && action.code && navigateFn) {
      navigateFn(`/registry?dup=${encodeURIComponent(action.code)}`);
    } else if (action.kind === 'create-note' && navigateFn) {
      navigateFn(`/notes?new=${encodeURIComponent(action.noteTitle || 'Новая заметка')}`);
    } else if (action.kind === 'bulk-stage' && action.stagePlan) {
      executeBulkStage(action.stagePlan, get().pushAssistant);
    } else if (action.kind === 'apply-links' && action.linkPlan) {
      executeApplyLinks(action.linkPlan, get().pushAssistant);
    } else if (action.kind === 'checklist-note' && action.checklist) {
      executeChecklistNote(action.checklist, get().pushAssistant);
    } else if (action.kind === 'undo-bulk') {
      executeUndo(get().pushAssistant);
    }
  },

  startTour: (tourId) => {
    const tour = TOURS.find(t => t.id === tourId);
    if (!tour) return;
    set({ activeTour: tour, tourStepIndex: 0 });
    const step = tour.steps[0];
    set(s => ({
      messages: [...s.messages, { id: uid(), role: 'assistant', text: `▶ Демонстрация «${tour.title}»\n\nШаг 1 из ${tour.steps.length}: ${step.text}` }],
    }));
    if (step.route && navigateFn) navigateFn(step.route);
    get().setHighlight(step.target || null);
  },

  advanceTour: () => {
    const { activeTour, tourStepIndex } = get();
    if (!activeTour) return;
    const nextIndex = tourStepIndex + 1;
    if (nextIndex >= activeTour.steps.length) {
      set({ activeTour: null, tourStepIndex: 0, highlightSelector: null });
      return;
    }
    const step = activeTour.steps[nextIndex];
    set(s => ({
      tourStepIndex: nextIndex,
      messages: [...s.messages, { id: uid(), role: 'assistant', text: `Шаг ${nextIndex + 1} из ${activeTour.steps.length}: ${step.text}` }],
    }));
    if (step.route && navigateFn) navigateFn(step.route);
    get().setHighlight(step.target || null);
  },

  cancelTour: () => set({ activeTour: null, tourStepIndex: 0, highlightSelector: null }),
}));

// ── Выполнение действий над данными (превью → выполнить → отмена) ────────────

let lastUndo: UndoSnapshot | null = null;
let digestShownThisSession = false;

async function bulkPutMetadata(updates: { id: string; metadata: string }[]) {
  const res = await fetch(`${ENV_CONFIG.apiUrl}/tags/bulk-metadata`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) throw new Error('Сервер отклонил изменение');
}

function parseMeta(raw?: string): any { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } }

type Push = (text: string, actions?: AssistantAction[]) => void;

// Массовая смена этапа закупки
async function executeBulkStage(plan: { tagIds: string[]; stageId: string; stageLabel: string }, push: Push) {
  try {
    const data = await fetchAssistantData();
    const byId = new Map(data.tags.map(t => [t.id, t]));
    const stageIds = data.stages.map(s => s.id);
    const targetIdx = stageIds.indexOf(plan.stageId);
    const now = new Date().toISOString();
    const before: { id: string; metadata: string }[] = [];
    const updates: { id: string; metadata: string }[] = [];
    for (const id of plan.tagIds) {
      const t = byId.get(id); if (!t) continue;
      before.push({ id, metadata: t.metadata || '' });
      const meta = parseMeta(t.metadata);
      const proc = { ...(meta.procurement || {}) };
      const log = { ...(proc.stageLog || {}) };
      for (let i = 1; i < data.stages.length; i++) {
        const sid = data.stages[i].id;
        if (i <= targetIdx) { if (!log[sid]) log[sid] = { at: now, by: 'ИИ-помощник' }; }
        else delete log[sid];
      }
      proc.stage = plan.stageId; proc.stageLog = log;
      updates.push({ id, metadata: JSON.stringify({ ...meta, procurement: proc }) });
    }
    if (updates.length === 0) { push('Не нашёл позиции для изменения.'); return; }
    await bulkPutMetadata(updates);
    lastUndo = { label: `этап «${plan.stageLabel}»`, before };
    invalidateAssistantData();
    push(`Готово: этап «${plan.stageLabel}» установлен для ${updates.length} позиц.`, [
      { label: '↶ Отменить', kind: 'undo-bulk' },
      { label: 'Открыть Менеджмент', kind: 'open-section', route: '/management' },
    ]);
  } catch (e: any) {
    push(`Не удалось выполнить: ${e.message}`);
  }
}

// Применение предложенных связей (родитель→дочерний)
async function executeApplyLinks(plan: { pairs: { childId: string; parentId: string }[] }, push: Push) {
  try {
    const data = await fetchAssistantData();
    const byId = new Map(data.tags.map(t => [t.id, t]));
    const metaById = new Map<string, any>();
    const before: { id: string; metadata: string }[] = [];
    const touched = new Set<string>();
    const getMeta = (id: string) => {
      if (!metaById.has(id)) {
        const t = byId.get(id);
        before.push({ id, metadata: t?.metadata || '' });
        metaById.set(id, parseMeta(t?.metadata));
      }
      return metaById.get(id);
    };
    for (const { childId, parentId } of plan.pairs) {
      if (!byId.has(childId) || !byId.has(parentId)) continue;
      const pm = getMeta(parentId);
      pm.connections = Array.isArray(pm.connections) ? pm.connections : [];
      if (!pm.connections.includes(childId)) pm.connections.push(childId);
      const cm = getMeta(childId);
      cm.parentId = parentId;
      touched.add(parentId); touched.add(childId);
    }
    const updates = Array.from(touched).map(id => ({ id, metadata: JSON.stringify(metaById.get(id)) }));
    if (updates.length === 0) { push('Нечего связывать.'); return; }
    await bulkPutMetadata(updates);
    lastUndo = { label: 'связи по коду', before };
    invalidateAssistantData();
    push(`Готово: создано связей ${plan.pairs.length}. Проверьте на холсте.`, [
      { label: '↶ Отменить', kind: 'undo-bulk' },
      { label: 'Открыть холст', kind: 'open-section', route: '/registry' },
    ]);
  } catch (e: any) {
    push(`Не удалось связать: ${e.message}`);
  }
}

// Чек-лист задач → новая заметка в блокноте
async function executeChecklistNote(checklist: { title: string; items: string[] }, push: Push) {
  try {
    const boxes = checklist.items.map(it =>
      `<li style="display:flex;align-items:flex-start;margin:3px 0;list-style:none;">` +
      `<span data-clbox="1" contenteditable="false" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;border:1.5px solid #94a3b8;margin-right:8px;font-size:11px;vertical-align:-3px;flex:none;"></span>` +
      `<span style="flex:1;min-width:0;">${it.replace(/</g, '&lt;')}</span></li>`).join('');
    const content = `<h2>${checklist.title}</h2><ul data-checklist="1" style="list-style:none;padding-left:2px;margin:8px 0;">${boxes}</ul>`;
    const res = await fetch(`${ENV_CONFIG.apiUrl}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: checklist.title, content }),
    });
    if (!res.ok) throw new Error('не удалось создать заметку');
    invalidateAssistantData();
    push(`Чек-лист «${checklist.title}» (${checklist.items.length} пунктов) добавлен в Блокнот.`, [
      { label: 'Открыть блокнот', kind: 'open-section', route: '/notes' },
    ]);
  } catch (e: any) {
    push(`Не удалось создать чек-лист: ${e.message}`);
  }
}

async function executeUndo(push: Push) {
  if (!lastUndo) { push('Отменять нечего.'); return; }
  try {
    await bulkPutMetadata(lastUndo.before);
    const label = lastUndo.label;
    lastUndo = null;
    invalidateAssistantData();
    push(`Отменено: ${label}. Значения возвращены.`);
  } catch (e: any) {
    push(`Не удалось отменить: ${e.message}`);
  }
}

// Результат распознавания: сообщение + (опционально) контекст последнего списка
interface Resolved { message: AssistantMessage; result?: LastResult | null; }
const msg = (text: string, extra: Partial<AssistantMessage> = {}): Resolved =>
  ({ message: { id: uid(), role: 'assistant', text, ...extra } });

const EXPORT_ACTIONS: AssistantAction[] = [
  { label: 'Выгрузить в Excel', kind: 'export-excel' },
  { label: 'Выгрузить в Word', kind: 'export-word' },
];

// Разделы для навигационных команд «открой …»
const ROUTE_WORDS: { stems: string[]; route: string; name: string }[] = [
  { stems: ['менеджмент', 'закупк'], route: '/management', name: 'Менеджмент' },
  { stems: ['тег', 'реестр', 'холст', 'граф'], route: '/registry', name: 'Теги' },
  { stems: ['оборудован'], route: '/equipment', name: 'Оборудование' },
  { stems: ['проводник', 'файл'], route: '/explorer', name: 'Проводник' },
  { stems: ['блокнот', 'заметк'], route: '/notes', name: 'Блокнот' },
  { stems: ['справочник', 'словар'], route: '/directory', name: 'Справочник' },
  { stems: ['чат', 'переписк'], route: '/chat', name: 'Рабочий чат' },
  { stems: ['проект'], route: '/projects', name: 'Проекты' },
];

// «Как …» — обучающий вопрос, а не команда (защита bulk-команд от «как перевести»)
function wantsTourGuard(lower: string): boolean {
  return /(^|[^а-яёa-z])как([^а-яёa-z]|$)/i.test(lower);
}

// Предложение связей по структуре кода KKS: дочерний код = родительский + суффикс.
// Для каждого тега без родителя ищем самый длинный код-префикс среди других тегов.
export function suggestKksLinks(tags: AssistantData['tags']): { childId: string; parentId: string }[] {
  const rows = tags.map(t => ({ id: t.id, code: (t.identifier || '').trim(), meta: parseMeta(t.metadata) }));
  const pairs: { childId: string; parentId: string }[] = [];
  for (const c of rows) {
    if (!c.code || c.meta.parentId) continue;
    let best: { id: string; code: string } | null = null;
    for (const par of rows) {
      if (par.id === c.id || !par.code) continue;
      if (c.code.length > par.code.length && c.code.startsWith(par.code) && /[-./]/.test(c.code[par.code.length])) {
        if (!best || par.code.length > best.code.length) best = { id: par.id, code: par.code };
      }
    }
    if (best) pairs.push({ childId: c.id, parentId: best.id });
  }
  return pairs;
}

// --- Распознавание запроса (полностью локальное) ---
// injectedData — тестовый шов: подставить данные вместо обращения к серверу.
export async function resolveQuery(
  text: string, demoMode = false, lastResult: LastResult | null = null,
  injectedData?: AssistantData,
): Promise<Resolved> {
  const lower = text.toLowerCase().replace(/ё/g, 'е');
  const p = parse(text);
  const getData = () => injectedData ? Promise.resolve(injectedData) : fetchAssistantData();

  // Режим «Демонстрация»: любой вопрос → ближайшая по смыслу демонстрация
  if (demoMode) {
    const m = findBestTour(text);
    if (m && m.tour) {
      return msg(
        m.score >= 1.5 ? m.tour.intro : `Похоже, вам подойдёт демонстрация «${m.tour.title}». ${m.tour.intro}`,
        { actions: [{ label: '▶ Показать демонстрацию', kind: 'tour', tourId: m.tour.id }] }
      );
    }
    return msg('Не нашёл подходящую демонстрацию. Попробуйте, например, «как добавить тег» или «как импортировать оборудование».');
  }

  // A. Навигационная команда: «открой/перейди в <раздел>»
  if (/(^|\s)(открой|открыть|перейд|зайд|покажи раздел|переключ)/.test(lower)) {
    for (const r of ROUTE_WORDS) {
      if (hasIntent(p, r.stems)) {
        return msg(`Открываю раздел «${r.name}».`, {
          actions: [{ label: `Перейти в «${r.name}»`, kind: 'open-section', route: r.route }],
        });
      }
    }
  }

  // B. Команда «создай заметку [про X]»
  if (/(создай|создать|新)\s*(заметк|запис)/.test(lower) || /(заметк|запис).*(создай|добав|нов)/.test(lower)) {
    const about = text.replace(/.*(заметк\w*|запис\w*)\s*(про|о|об)?\s*/i, '').trim();
    const title = about && about.length < 60 ? about : 'Новая заметка';
    return msg(`Создаю заметку${about ? ` «${title}»` : ''} в блокноте.`, {
      actions: [{ label: 'Открыть блокнот', kind: 'create-note', noteTitle: title }],
    });
  }

  // B2. Массовая смена этапа: «переведи/пометь/установи <фильтр> в <этап>»
  if (/(перевед|переведи|пометь|помет|установи|поставь|отметь|переключи)/.test(lower) && !wantsTourGuard(lower)) {
    const data = await getData();
    // Целевой этап — по словам этапа или синонимам
    const stageMap: { re: RegExp; id: string }[] = [
      { re: /куплен|закуплен|оплач/, id: 'purchased' },
      { re: /заказан|заказ/, id: 'ordered' },
      { re: /утвержд|согласован/, id: 'approved' },
      { re: /добавлен|сброс|в начал/, id: 'added' },
    ];
    let target = stageMap.find(s => s.re.test(lower));
    let stage = target ? data.stages.find(s => s.id === target!.id) : undefined;
    if (!stage) stage = data.stages.find(s => fieldMatchesStems(s.label, p.stems));
    if (stage) {
      // Из фильтра выкидываем командные глаголы и слова этапов (двусторонний префикс)
      const noise = ['перевед', 'помет', 'установ', 'поставь', 'отмет', 'переключ', 'этап', 'закупк', 'все', 'всех', 'куплен', 'закуплен', 'заказан', 'утвержд', 'согласован', 'добавлен', 'оплач', 'сброс'];
      const filterStems = p.stems.filter(s => !noise.some(x => (s.length >= 3 && (s.startsWith(x) || x.startsWith(s)))));
      const affected = filterStems.length === 0
        ? data.tags
        : data.tags.filter(t => fieldMatchesStems(t.identifier, filterStems) || fieldMatchesStems(t.brand, filterStems) || fieldMatchesStems(t.mainName, filterStems) || fieldMatchesStems(t.department, filterStems));
      const toChange = affected.filter(t => t.stageId !== stage!.id);
      if (affected.length === 0) return msg(`Не нашёл позиции по фильтру${filterStems.length ? ` «${filterStems.join(' ')}»` : ''}. Уточните.`);
      if (toChange.length === 0) return msg(`Все ${affected.length} позиц. уже на этапе «${stage.label}».`);
      return msg(
        `Переведу в «${stage.label}» позиц.: ${toChange.length}${filterStems.length ? ` (фильтр: ${filterStems.join(' ')})` : ''}.\nПримеры: ${toChange.slice(0, 5).map(t => t.identifier).join(', ')}${toChange.length > 5 ? '…' : ''}`,
        { actions: [
          { label: `✓ Выполнить (${toChange.length})`, kind: 'bulk-stage', stagePlan: { tagIds: toChange.map(t => t.id), stageId: stage.id, stageLabel: stage.label } },
          { label: 'Показать список', kind: 'ask', query: `${filterStems.join(' ')} закупки` },
        ] }
      );
    }
  }

  // B3. Автосвязывание по коду KKS: «свяжи похожие / автосвязывание / построй граф»
  if (/(свяжи|связать|автосвяз|построй граф|соедини похож|связи по коду)/.test(lower)) {
    const data = await getData();
    const pairs = suggestKksLinks(data.tags);
    if (pairs.length === 0) return msg('Не нашёл очевидных родитель-дочерних связей по кодам. Коды должны иметь общий префикс, например 3700-C01-AHU-001 и 3700-C01-AHU-001-FAN.');
    const byId = new Map(data.tags.map(t => [t.id, t]));
    const sample = pairs.slice(0, 6).map(pr => `${byId.get(pr.childId)?.identifier} → ${byId.get(pr.parentId)?.identifier}`).join('\n');
    return msg(
      `Нашёл ${pairs.length} возможных связей по структуре кода (дочерний → родитель):\n${sample}${pairs.length > 6 ? '\n…' : ''}`,
      { actions: [{ label: `🔗 Связать (${pairs.length})`, kind: 'apply-links', linkPlan: { pairs } }, { label: 'Открыть холст', kind: 'open-section', route: '/registry' }] }
    );
  }

  // C. Вопрос-определение → справка
  if (/(что так|что эт|для чего|зачем|расскажи|объясни|чем отлич|что значит|как работает)/.test(lower)) {
    const knowledge = findKnowledge(lower);
    if (knowledge) return msg(knowledge);
  }

  // D. Демонстрация: «как …»
  const wantsTour = /(^|[^а-яёa-z])как([^а-яёa-z]|$)/i.test(lower)
    || /(демонстрац|научи|инструкц|покажи как|пошагов)/.test(lower);
  if (wantsTour) {
    const tour = findTourByText(lower);
    if (tour) return msg(tour.intro, { actions: [{ label: '▶ Показать демонстрацию', kind: 'tour', tourId: tour.id }] });
  }

  // E. Прямой код тега/марки → карточка позиции
  if (p.codes.length > 0) {
    const data = await getData();
    const code = p.codes[0];
    const found = data.tags.filter(t => (t.identifier || '').toLowerCase() === code.toLowerCase()
      || (t.identifier || '').toLowerCase().includes(code.toLowerCase())
      || (t.brand || '').toLowerCase().includes(code.toLowerCase()));
    if (found.length) {
      const t = found[0];
      const dup = data.duplicates.find(d => d.code === (t.identifier || '').trim());
      const actions: AssistantAction[] = [
        { label: 'Открыть на холсте', kind: 'focus-tag', tagId: t.id },
        { label: 'Показать в Менеджменте', kind: 'open-section', route: `/management?focus=${encodeURIComponent(t.id)}` },
      ];
      if (dup) actions.push({ label: `Найти дубли (${dup.count})`, kind: 'find-duplicates', code: dup.code });
      const lines = [
        `${t.identifier}${t.mainName ? ` — ${t.mainName}` : ''}`,
        t.brand ? `Марка: ${t.brand}` : '',
        t.department ? `Отдел: ${t.department}` : '',
        `Актуальность: ${ACTUALITY_RU[t.actuality || 'draft'] || t.actuality}`,
        `Этап закупки: ${t.stageLabel || '—'}${t.supplier ? `, поставщик: ${t.supplier}` : ''}`,
        (t.connCount || 0) === 0 ? '⚠ Нет связей на графе (сирота)' : '',
        dup ? `⚠ Дубль кода: встречается ${dup.count} раз(а)` : '',
      ].filter(Boolean);
      return { message: { id: uid(), role: 'assistant', text: lines.join('\n'), actions }, result: { kind: 'tags', ids: found.map(f => f.id), label: code } };
    }
  }

  // F. Follow-up: «а сколько их / выгрузи / покажи их» по прошлому результату
  if (lastResult && /^(а\s+)?(сколько|скольк).{0,6}(их| их\?)?$|^выгруз|^экспорт|^покажи их|^их$/.test(lower.trim())) {
    if (/выгруз|экспорт/.test(lower)) {
      return msg(`Готовлю выгрузку по предыдущему списку «${lastResult.label}» — нажмите кнопку.`, { actions: EXPORT_ACTIONS });
    }
    return msg(`В предыдущем списке «${lastResult.label}»: ${lastResult.ids.length}.`);
  }

  // G. Домены данных
  const wantsData = /(покажи|показать|список|сколько|количеств|выгруз|экспорт|найд|дай|выведи|собери|все|всё|скольк)/.test(lower)
    || hasIntent(p, ['тег', 'оборудован', 'компонент', 'вентилятор', 'установк', 'клапан', 'проект', 'систем', 'дубл', 'закупк', 'критичн', 'внимани', 'проблем', 'заметк', 'этап', 'поставщик', 'аудит', 'сирот'])
    || /не заказан|не куплен|куплен|закуплен|заказан|утвержд|просроч|что изменилос|кто менял|что менял|последн.*(действ|измен|запис)|что требует|требует внимани|конфликт ревиз|аудит|проверь проект|что не так|доделать|что.{0,6}сделать|мои задач|план дня|чек.?лист задач|без поставщик|без наименован|без имени|без связ/.test(lower);
  if (wantsData) {
    const data = await getData();
    const c = data.counts;

    // G0. Аудит проекта — свод проблем с кнопками
    if (/аудит|проверь проект|что не так|проверк проект|линтер/.test(lower) || hasIntent(p, ['аудит'])) {
      const unnamed = data.tags.filter(t => !t.mainName);
      const orphans = data.tags.filter(t => (t.connCount || 0) === 0);
      const noEquip = data.tags.filter(t => !t.hasEquipment);
      const conflicts = data.components.filter(cm => cm.hasConflict);
      const issues: { n: number; text: string; q?: string }[] = [
        { n: data.duplicates.length, text: `Дубли кодов: ${data.duplicates.length}`, q: 'покажи дубли' },
        { n: c.critical || 0, text: `Критичные позиции: ${c.critical || 0}`, q: 'критичные позиции' },
        { n: unnamed.length, text: `Без наименования: ${unnamed.length}`, q: 'теги без наименования' },
        { n: orphans.length, text: `Сироты (без связей): ${orphans.length}`, q: 'теги без связей' },
        { n: noEquip.length, text: `Без привязки к оборудованию: ${noEquip.length}` },
        { n: conflicts.length, text: `Конфликты ревизий оборудования: ${conflicts.length}` },
      ].filter(i => i.n > 0);
      if (issues.length === 0) return msg('✓ Аудит пройден: дублей, сирот, конфликтов и позиций без наименования не найдено. Проект в порядке!');
      const actions: AssistantAction[] = issues.filter(i => i.q).slice(0, 3).map(i => ({ label: i.text.split(':')[0], kind: 'ask', query: i.q! }));
      actions.push({ label: '✅ План в блокнот', kind: 'ask', query: 'что мне доделать' });
      return msg(`Аудит проекта — найдено ${issues.reduce((s, i) => s + i.n, 0)} замечаний:\n${issues.map(i => `• ${i.text}`).join('\n')}`, { actions });
    }

    // G0b. «Что мне доделать» → чек-лист задач в блокнот
    if (/что.*(доделать|сделать)|мои задач|мой план|чек.?лист задач|план дня/.test(lower)) {
      const items: string[] = [];
      const unnamed = data.tags.filter(t => !t.mainName);
      const orphans = data.tags.filter(t => (t.connCount || 0) === 0);
      const stuck = data.tags.filter(t => t.stageId === 'added');
      if (data.duplicates.length) items.push(`Разобрать дубли кодов: ${data.duplicates.slice(0, 5).map(d => d.code).join(', ')}${data.duplicates.length > 5 ? '…' : ''}`);
      if (unnamed.length) items.push(`Задать наименование ${unnamed.length} тегам`);
      if (orphans.length) items.push(`Связать на графе ${orphans.length} тегов-сирот`);
      if ((c.critical || 0)) items.push(`Проверить ${c.critical} критичных позиций`);
      if (stuck.length) items.push(`Заказать ${stuck.length} позиций (этап «Добавлен»)`);
      if (items.length === 0) return msg('По проекту нет висящих задач — всё сделано. 👍');
      return msg(`Собрал план из ${items.length} задач:\n${items.map(i => `• ${i}`).join('\n')}`, {
        actions: [{ label: '✅ Добавить чек-лист в Блокнот', kind: 'checklist-note', checklist: { title: `Задачи по проекту ${new Date().toLocaleDateString('ru-RU')}`, items } }],
      });
    }

    // G0c. Аналитика: без поставщика / без наименования / без связей
    if (/без поставщик|нет поставщик/.test(lower)) {
      const sel = data.tags.filter(t => !t.supplier);
      if (sel.length === 0) return msg('У всех позиций указан поставщик. 👍');
      return { message: { id: uid(), role: 'assistant', text: `Без поставщика: ${sel.length} позиц.`, table: { title: 'Без поставщика', columns: ['Тег', 'Наименование', 'Этап'], rows: sel.map(t => [t.identifier || '', t.mainName || '', t.stageLabel || '']) }, actions: EXPORT_ACTIONS }, result: { kind: 'tags', ids: sel.map(t => t.id), label: 'без поставщика' } };
    }
    if (/без наименован|без имени|нет наименован/.test(lower)) {
      const sel = data.tags.filter(t => !t.mainName);
      if (sel.length === 0) return msg('У всех тегов есть наименование. 👍');
      return { message: { id: uid(), role: 'assistant', text: `Без наименования: ${sel.length} тегов.`, table: { title: 'Без наименования', columns: ['Тег', 'Марка', 'Отдел'], rows: sel.map(t => [t.identifier || '', t.brand || '', t.department || '']) }, actions: [{ label: 'Открыть на холсте', kind: 'focus-tag', tagId: sel[0].id }, ...EXPORT_ACTIONS] }, result: { kind: 'tags', ids: sel.map(t => t.id), label: 'без наименования' } };
    }
    if (/без связ|сирот|не связан/.test(lower)) {
      const sel = data.tags.filter(t => (t.connCount || 0) === 0);
      if (sel.length === 0) return msg('Тегов-сирот нет — все связаны на графе. 👍');
      return { message: { id: uid(), role: 'assistant', text: `Сироты (без связей): ${sel.length}. Можно связать автоматически по коду.`, table: { title: 'Без связей', columns: ['Тег', 'Наименование'], rows: sel.map(t => [t.identifier || '', t.mainName || '']) }, actions: [{ label: '🔗 Связать по коду', kind: 'ask', query: 'свяжи похожие' }, ...EXPORT_ACTIONS] }, result: { kind: 'tags', ids: sel.map(t => t.id), label: 'сироты' } };
    }

    // G1. Сводка/счётчики
    if (hasIntent(p, ['сводк', 'статус']) || /сколько всего|общая|итого|готовност/.test(lower)
        || (/сколько|количеств/.test(lower) && !hasIntent(p, ['дубл', 'критичн', 'закупк', 'вентилятор', 'клапан', 'установк']))) {
      const problems = (c.critical || 0) + (c.duplicates || 0);
      return msg(
        `Сводка по активному проекту:\n• Тегов: ${c.tags}\n• Оборудования: ${c.components}\n• Систем: ${c.systems}\n• Файлов: ${c.files}, заметок: ${c.notes}\n` +
        `${problems > 0 ? `\n⚠ Требуют внимания: критичных ${c.critical || 0}, дублей ${c.duplicates || 0}.` : '\n✓ Критичных позиций и дублей нет.'}`,
        { actions: problems > 0 ? [{ label: 'Показать дубли', kind: 'ask', query: 'покажи дубли' }, { label: 'Показать критичные', kind: 'ask', query: 'критичные позиции' }] : [] }
      );
    }

    // G2. Дубли
    if (hasIntent(p, ['дубл'])) {
      if (data.duplicates.length === 0) return msg('Дубликатов кодов тегов в проекте нет — все коды уникальны. 👍');
      const table: AssistantTable = {
        title: 'Дубликаты кодов тегов',
        columns: ['Код тега', 'Повторов'],
        rows: data.duplicates.map(d => [d.code, d.count]),
      };
      const first = data.duplicates[0];
      return {
        message: {
          id: uid(), role: 'assistant',
          text: `Нашёл дублей: ${data.duplicates.length}. Всего повторяющихся позиций: ${data.duplicates.reduce((s, d) => s + d.count, 0)}.`,
          table,
          actions: [
            { label: `Найти на холсте: ${first.code}`, kind: 'find-duplicates', code: first.code },
            ...EXPORT_ACTIONS,
          ],
        },
        result: { kind: 'duplicates', ids: data.duplicates.flatMap(d => d.ids), label: 'дубли' },
      };
    }

    // G3. Проблемы / актуальность
    if (hasIntent(p, ['критичн', 'внимани', 'проблем', 'конфликт'])) {
      const bad = data.tags.filter(t => t.actuality === 'critical' || t.actuality === 'warning');
      if (bad.length === 0) return msg('Критичных позиций и позиций «на проверку» нет. ✓');
      const table: AssistantTable = {
        title: 'Требуют внимания',
        columns: ['Тег', 'Наименование', 'Состояние'],
        rows: bad.map(t => [t.identifier || '', t.mainName || '', ACTUALITY_RU[t.actuality || 'draft'] || '']),
      };
      return {
        message: { id: uid(), role: 'assistant', text: `Требуют внимания: ${bad.length} (критичных ${bad.filter(t => t.actuality === 'critical').length}).`, table, actions: EXPORT_ACTIONS },
        result: { kind: 'tags', ids: bad.map(t => t.id), label: 'требуют внимания' },
      };
    }

    // G4. Закупки / этапы
    if (hasIntent(p, ['закупк', 'этап', 'поставщик']) || /не заказан|не куплен|заказан|куплен|утвержд/.test(lower)) {
      let sel = data.tags;
      let label = 'позиции закупки';
      if (/не заказан|не куплен|осталось|просроч/.test(lower)) { sel = data.tags.filter(t => t.stageId === 'added'); label = 'не заказано'; }
      else if (/куплен|закуплен/.test(lower)) { sel = data.tags.filter(t => t.stageId === 'purchased'); label = 'куплено'; }
      else if (/заказан/.test(lower)) { sel = data.tags.filter(t => t.stageId === 'ordered'); label = 'заказано'; }
      const table: AssistantTable = {
        title: `Закупки: ${label}`,
        columns: ['Тег', 'Наименование', 'Этап', 'Поставщик'],
        rows: sel.map(t => [t.identifier || '', t.mainName || '', t.stageLabel || '', t.supplier || '']),
      };
      return {
        message: {
          id: uid(), role: 'assistant',
          text: `${label[0].toUpperCase()}${label.slice(1)}: ${sel.length} позиц.`,
          table,
          actions: [{ label: 'Открыть Менеджмент', kind: 'open-section', route: '/management' }, ...EXPORT_ACTIONS],
        },
        result: { kind: 'tags', ids: sel.map(t => t.id), label },
      };
    }

    // G5. Поиск по заметкам
    if (hasIntent(p, ['заметк', 'запис']) && p.stems.some(s => !['заметк', 'запис', 'блокнот'].includes(s))) {
      const q = p.stems.filter(s => !['заметк', 'запис', 'блокнот', 'найд', 'поиск'].includes(s));
      const found = data.notes.filter(n => fieldMatchesStems(n.title, q));
      if (found.length === 0) return msg('Заметок по этому запросу не нашёл. Поиск идёт по заголовкам — уточните слово.');
      return msg(`Нашёл заметок: ${found.length}.\n${found.slice(0, 8).map(n => `• ${n.title}`).join('\n')}`, {
        actions: [{ label: 'Открыть блокнот', kind: 'open-section', route: '/notes' }],
      });
    }

    // G6. История / последние изменения
    if (hasIntent(p, ['изменени', 'истори', 'изменил']) || /кто менял|что менял|последн.*(действ|измен|запис)|что изменилос/.test(lower)) {
      if (!data.recentLogs.length) return msg('Записей об изменениях пока нет.');
      const items = data.recentLogs.slice(0, 10).map(l => `• ${l.description} — ${l.userName}`);
      return msg(`Последние изменения:\n${items.join('\n')}`);
    }

    // G7. Поиск тегов/оборудования (по стемам с синонимами)
    const stems = p.stems.filter(s => !['тег', 'оборудован', 'компонент', 'покажи', 'список', 'найд'].includes(s));
    const mentionsEquip = hasIntent(p, ['оборудован', 'компонент', 'систем', 'моноблок']);
    const mentionsTag = hasIntent(p, ['тег']);

    const matchedTags = data.tags.filter(tg => stems.length === 0
      || fieldMatchesStems(tg.identifier, stems) || fieldMatchesStems(tg.brand, stems)
      || fieldMatchesStems(tg.department, stems) || fieldMatchesStems(tg.fluid, stems)
      || fieldMatchesStems(tg.mainName, stems));
    const matchedComps = data.components.filter(cm => stems.length === 0
      || fieldMatchesStems(cm.name, stems) || fieldMatchesStems(cm.itemCode, stems)
      || fieldMatchesStems(cm.category, stems) || fieldMatchesStems(cm.systemName, stems)
      || cm.tags.some(tag => fieldMatchesStems(tag, stems)));

    const showTags = mentionsTag || (!mentionsEquip && matchedTags.length >= matchedComps.length);
    if (showTags) {
      if (matchedTags.length === 0) return msg(stems.length ? `По запросу «${stems.join(' ')}» теги не найдены. Попробуйте другое слово или проверьте активный проект.` : 'В активном проекте пока нет тегов.');
      const table: AssistantTable = {
        title: stems.length ? `Теги: ${stems.join(' ')}` : 'Все теги проекта',
        columns: ['Тег', 'Марка', 'Отдел', 'Среда', 'Этап'],
        rows: matchedTags.map(t => [t.identifier || '', t.brand || '', t.department || '', t.fluid || '', t.stageLabel || '']),
      };
      const actions: AssistantAction[] = [...EXPORT_ACTIONS];
      if (matchedTags.length === 1) actions.unshift({ label: 'Открыть на холсте', kind: 'focus-tag', tagId: matchedTags[0].id });
      return {
        message: { id: uid(), role: 'assistant', text: `Нашёл тегов: ${matchedTags.length}${stems.length ? ` по запросу «${stems.join(' ')}»` : ''}.`, table, actions },
        result: { kind: 'tags', ids: matchedTags.map(t => t.id), label: stems.join(' ') || 'все теги' },
      };
    } else {
      if (matchedComps.length === 0) return msg(stems.length ? `По запросу «${stems.join(' ')}» оборудование не найдено.` : 'В активном проекте пока нет оборудования.');
      const table: AssistantTable = {
        title: stems.length ? `Оборудование: ${stems.join(' ')}` : 'Всё оборудование проекта',
        columns: ['Компонент', 'Код', 'Категория', 'Система', 'Теги'],
        rows: matchedComps.map(cm => [cm.name || '', cm.itemCode || '', cm.category || '', cm.systemName || '', cm.tags.join(', ')]),
      };
      return {
        message: { id: uid(), role: 'assistant', text: `Нашёл компонентов: ${matchedComps.length}${stems.length ? ` по запросу «${stems.join(' ')}»` : ''}.`, table, actions: [{ label: 'Открыть Оборудование', kind: 'open-section', route: '/equipment' }, ...EXPORT_ACTIONS] },
        result: { kind: 'components', ids: matchedComps.map(cm => cm.id), label: stems.join(' ') || 'всё оборудование' },
      };
    }
  }

  // H. База знаний (справка о разделах)
  const knowledge = findKnowledge(lower);
  if (knowledge) return msg(knowledge);

  // I. Честное «не знаю» с тремя кликабельными темами
  return msg(
    'Не понял вопрос. Возможно, вам нужно одно из этого:',
    {
      actions: [
        { label: 'Показать дубли', kind: 'ask', query: 'покажи дубли' },
        { label: 'Этапы закупки', kind: 'ask', query: 'что не заказано' },
        { label: 'Как импортировать бланк', kind: 'ask', query: 'как импортировать оборудование' },
        { label: 'Что ты умеешь?', kind: 'navigate', route: '__help' },
      ],
    }
  );
}

const ACTUALITY_RU: Record<string, string> = {
  actual: 'актуально', warning: 'проверить', critical: 'критично', info: 'в работе', draft: 'черновик',
};
