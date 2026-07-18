import { create } from 'zustand';
import * as XLSX from 'xlsx';
import { ENV_CONFIG } from '../config/env';
import { findKnowledge } from '../assistant/knowledge';
import { TOURS, findTourByText, findBestTour, Tour } from '../assistant/tours';
import { getSection } from '../assistant/sections';
import { parse, hasIntent, fieldMatchesStems, Parsed } from '../assistant/nlp';
import { matchLabel, fieldByUniqueUnit, FIELDS, FieldDef } from '../import/dictionary';

export interface AssistantAction {
  label: string;
  kind: 'tour' | 'export-excel' | 'export-word' | 'navigate' | 'ask'
      | 'focus-tag' | 'find-duplicates' | 'create-note' | 'open-section'
      | 'focus-equipment' | 'prompt-rename-tag' | 'cancel-input';
  tourId?: string;
  route?: string;
  query?: string;
  tagId?: string;   // для focus-tag / prompt-rename-tag
  code?: string;    // для find-duplicates / prompt-rename-tag (текущий код)
  noteTitle?: string; // для create-note
  componentId?: string; // для focus-equipment: какой элемент открыть
  specKey?: string;     // для focus-equipment: какую характеристику подсветить
  danger?: boolean;     // акцент опасного действия
}

export interface AssistantTable {
  columns: string[];
  rows: (string | number)[][];
  title: string;
}

// Интерактивный элемент списка (например, тег-дубликат с кнопками действий)
export interface AssistantListItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  actions: AssistantAction[];
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: AssistantAction[];
  table?: AssistantTable;
  list?: AssistantListItem[];
}

// Ожидание ввода в диалоге: следующая реплика пользователя — не запрос,
// а значение для начатого действия (например, новый код переименовываемого тега)
type PendingInput =
  | { kind: 'rename-tag'; tagId: string; oldCode: string }
  | null;

interface AssistantData {
  projectId: string;
  projects: { id: string; name: string; status: string }[];
  tags: { id: string; identifier: string; brand?: string; department?: string; wbs?: string; fluid?: string; mainName?: string; actuality?: string; stageId?: string; stageLabel?: string; supplier?: string; qty?: string }[];
  components: { id: string; name: string; itemCode: string; systemName: string; category: string; monoblockName: string; status: string; hasConflict: boolean; tags: string[]; specs?: { key: string; value: string; unit: string; group: string }[] }[];
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
  // Ожидание ввода (диалоговое действие, например переименование тега)
  pendingInput: PendingInput;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  toggleDemoMode: () => void;
  setRoute: (route: string) => void;
  ask: (text: string) => Promise<void>;
  runAction: (action: AssistantAction) => void;
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

// Стоп-слова: их выкидываем при выделении искомого термина
const STOPWORDS = new Set([
  'покажи', 'показать', 'дай', 'мне', 'нужны', 'нужен', 'нужно', 'все', 'всё', 'весь',
  'вся', 'список', 'найди', 'найти', 'сколько', 'выгрузи', 'выведи', 'хочу', 'это',
  'и', 'в', 'на', 'по', 'для', 'с', 'со', 'про', 'теги', 'тег', 'тегов', 'тега',
  'оборудование', 'оборудования', 'компоненты', 'компонент', 'компонентов',
  'есть', 'какие', 'какой', 'что', 'a', 'the',
]);

function tokensFrom(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\wа-яё\s-]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

// Грубое сопоставление с учётом русских окончаний: совпадает, если поле
// содержит токен или его «корень» (токен без 1-2 последних букв)
function fieldMatches(fieldValue: string | undefined, token: string): boolean {
  if (!fieldValue) return false;
  const f = fieldValue.toLowerCase();
  if (f.includes(token)) return true;
  if (token.length > 4) {
    const stem = token.slice(0, token.length - 2);
    if (stem.length >= 3 && f.includes(stem)) return true;
  }
  return false;
}

let dataCache: { data: AssistantData; ts: number } | null = null;

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

function invalidateDataCache() { dataCache = null; }

// Переименование тега = смена identifier. Связи хранятся по id тега в metadata,
// поэтому при переименовании они сохраняются автоматически.
async function renameTagApi(tagId: string, newCode: string): Promise<void> {
  const res = await fetch(`${ENV_CONFIG.apiUrl}/tags/${tagId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: newCode }),
  });
  if (!res.ok) {
    let m = 'Не удалось переименовать тег';
    try { const d = await res.json(); if (d?.error) m = d.error; } catch (_) {}
    throw new Error(m);
  }
  invalidateDataCache();
  // Разделы, показывающие теги (холст/дерево), перечитают данные
  try { window.dispatchEvent(new CustomEvent('flux:tags-changed')); } catch (_) {}
}

// Проверка кода тега: непустой, разумной длины, без пробелов внутри
function validateTagCode(raw: string): { ok: boolean; code: string; error?: string } {
  const code = raw.trim();
  if (!code) return { ok: false, code, error: 'Код пустой' };
  if (code.length > 80) return { ok: false, code, error: 'Слишком длинный код (макс. 80 символов)' };
  if (/\s/.test(code)) return { ok: false, code, error: 'В коде тега не должно быть пробелов' };
  return { ok: true, code };
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

// ── Исправление перепутанной раскладки клавиатуры ────────────────────────────
// «gjrf;b ntub» → «покажи теги», «покажи ntub» → «покажи теги», «щзут» → «open».
// Конвертируем только те слова, которые после конвертации становятся знакомыми,
// или явно выглядят как «мусор» в текущей раскладке (латиница без гласных).
const EN2RU: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
  '[': 'х', ']': 'ъ', a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о',
  k: 'л', l: 'д', ';': 'ж', "'": 'э', z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и',
  n: 'т', m: 'ь', ',': 'б', '.': 'ю', '`': 'ё',
};
const RU2EN: Record<string, string> = {};
for (const [en, ru] of Object.entries(EN2RU)) RU2EN[ru] = en;

function convertLayout(word: string, map: Record<string, string>): string {
  let out = '';
  for (const ch of word) {
    const lower = ch.toLowerCase();
    const rep = map[lower];
    out += rep === undefined ? ch : (ch === lower ? rep : rep.toUpperCase());
  }
  return out;
}

// Знакомые русские слова: команды помощника + синонимы полей словаря
let VOCAB_RU: string[] | null = null;
function vocabRu(): string[] {
  if (!VOCAB_RU) {
    const words = new Set<string>([
      'покажи', 'показать', 'найди', 'найти', 'сколько', 'выгрузи', 'выведи', 'открой',
      'характеристики', 'данные', 'параметры', 'оборудование', 'теги', 'тег', 'дубли',
      'дубликаты', 'проект', 'проекты', 'файл', 'файлы', 'папка', 'заметка', 'заметки',
      'чат', 'сотрудники', 'критичные', 'позиции', 'позиция', 'этап', 'заказан', 'куплен',
      'закупки', 'менеджмент', 'проводник', 'блокнот', 'справочник', 'помощь', 'привет',
      'умеешь', 'создай', 'создать', 'вентилятор', 'вентиляторы', 'клапан', 'клапаны',
      'фильтр', 'нагреватель', 'охладитель', 'установка', 'кондиционер', 'сводка', 'демонстрация',
    ]);
    for (const f of FIELDS) {
      for (const w of f.label.toLowerCase().split(/\s+/)) if (w.length >= 3) words.add(w);
      for (const syn of f.synonyms) for (const w of syn.split(/\s+/)) if (w.length >= 3) words.add(w);
    }
    VOCAB_RU = [...words];
  }
  return VOCAB_RU;
}
function isKnownRu(token: string): boolean {
  if (token.length < 3) return false;
  const p = Math.min(5, token.length);
  const head = token.slice(0, p);
  return vocabRu().some(w => w.slice(0, p) === head);
}
const VOCAB_EN = ['show', 'open', 'find', 'help', 'tags', 'tag', 'files', 'file', 'create',
  'equipment', 'project', 'projects', 'chat', 'notes', 'note', 'export', 'excel', 'word', 'demo'];

export function fixKeyboardLayout(text: string): string {
  return text.split(/(\s+)/).map(tok => {
    const t = tok.trim();
    // Коды/теги (3700-B02…), короткие слова и числа не трогаем
    if (!t || t.length < 3 || /\d/.test(t) || /-/.test(t)) return tok;
    if (/^[a-z\[\];',.`]+$/i.test(t)) {
      // Латиница: возможно, русское слово в английской раскладке
      const conv = convertLayout(t, EN2RU);
      if (/^[а-яё]+$/i.test(conv)) {
        if (isKnownRu(conv.toLowerCase())) return conv;
        // без гласных в латинице, но с гласными после конвертации — почти наверняка раскладка
        if (!/[aeiouy]/i.test(t) && /[аеёиоуыэюя]/i.test(conv)) return conv;
      }
    } else if (/^[а-яё]+$/i.test(t)) {
      // Кириллица: возможно, английское слово в русской раскладке
      const conv = convertLayout(t, RU2EN).toLowerCase();
      if (/^[a-z]+$/.test(conv) && VOCAB_EN.includes(conv) && !isKnownRu(t.toLowerCase())) return conv;
    }
    return tok;
  }).join('');
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  isOpen: false,
  messages: [{
    id: uid(),
    role: 'assistant',
    text: 'Здравствуйте! Я помощник Flux — работаю локально, понимаю обычную речь и опечатки.\n\nМожно спросить про данные («покажи вентиляторы», «где 3700-K02»), проблемы («покажи дубли», «что требует внимания»), закупки («что не заказано») — а я найду и дам кнопки: открыть на холсте, показать в Менеджменте, выгрузить в Excel. Могу и выполнить: «открой менеджмент», «создай заметку». Ctrl+K — вызвать меня из любого места.',
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
  pendingInput: null,

  toggleOpen: () => set(s => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  toggleDemoMode: () => set(s => ({ demoMode: !s.demoMode })),

  setRoute: (route) => {
    const prev = get().currentRoute;
    set({ currentRoute: route });
    // Встречаем пользователя при заходе в новый раздел (один раз за сессию),
    // только в режиме «Демонстрация» и при открытом чате
    if (route !== prev && get().isOpen && get().demoMode) {
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

    // Диалоговый режим: ждём значение для начатого действия (переименование)
    const pending = get().pendingInput;
    if (pending) {
      set(s => ({ messages: [...s.messages, userMsg], loading: true }));
      const post = (m: AssistantMessage) => set(s => ({ messages: [...s.messages, m], loading: false }));
      // Отмена по ключевым словам
      if (/^(отмена|отмени|отменить|стоп|cancel|назад|не надо|нет)$/i.test(clean)) {
        set({ pendingInput: null });
        post({ id: uid(), role: 'assistant', text: 'Хорошо, отменил. Чем ещё помочь?' });
        return;
      }
      if (pending.kind === 'rename-tag') {
        const v = validateTagCode(clean);
        if (!v.ok) {
          // остаёмся в режиме ожидания — просим корректный код
          post({ id: uid(), role: 'assistant', text: `${v.error}. Введите новый код для тега «${pending.oldCode}» ещё раз или напишите «отмена».` });
          return;
        }
        if (v.code === pending.oldCode) {
          set({ pendingInput: null });
          post({ id: uid(), role: 'assistant', text: 'Новый код совпадает со старым — оставил без изменений.' });
          return;
        }
        try {
          // Предупреждение о новом дубле (не блокируем — иногда так и нужно)
          let collision = 0;
          try {
            const data = await fetchAssistantData();
            collision = data.tags.filter(t => t.id !== pending.tagId && (t.identifier || '').trim().toLowerCase() === v.code.toLowerCase()).length;
            invalidateDataCache();
          } catch (_) {}
          await renameTagApi(pending.tagId, v.code);
          set({ pendingInput: null });
          const warn = collision > 0 ? `\n⚠ Такой код уже есть у ${collision} тег(ов) — теперь это новый дубль. Можно переименовать и его.` : '';
          post({
            id: uid(), role: 'assistant',
            text: `✅ Переименовал: «${pending.oldCode}» → «${v.code}». Связи и подописания сохранены.${warn}`,
            actions: [
              { label: 'Показать на холсте', kind: 'focus-tag', tagId: pending.tagId },
              { label: 'Показать дубли', kind: 'ask', query: 'покажи дубли' },
            ],
          });
        } catch (err: any) {
          set({ pendingInput: null });
          post({ id: uid(), role: 'assistant', text: `Не удалось переименовать: ${err.message}` });
        }
        return;
      }
    }

    set(s => ({ messages: [...s.messages, userMsg], loading: true }));

    try {
      // Понимаем запросы с перепутанной раскладкой («gjrf;b ntub» → «покажи теги»)
      const fixed = fixKeyboardLayout(clean);
      const { message, result, pending } = await resolveQuery(fixed, get().demoMode, get().lastResult);
      if (fixed !== clean) {
        message.text = `🌐 Понял как: «${fixed}»\n\n${message.text}`;
      }
      set(s => ({
        messages: [...s.messages, message],
        loading: false,
        lastTable: message.table || s.lastTable,
        lastResult: result !== undefined ? result : s.lastResult,
        pendingInput: pending !== undefined ? pending : s.pendingInput,
      }));
    } catch (err: any) {
      set(s => ({
        messages: [...s.messages, { id: uid(), role: 'assistant', text: `Не удалось обработать запрос: ${err.message}` }],
        loading: false,
      }));
    }
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
    } else if (action.kind === 'prompt-rename-tag' && action.tagId) {
      // Начинаем диалог переименования: следующая реплика — новый код
      set(s => ({
        pendingInput: { kind: 'rename-tag', tagId: action.tagId!, oldCode: action.code || '' },
        messages: [...s.messages, {
          id: uid(), role: 'assistant',
          text: `Введите новый код для тега «${action.code || ''}». Связи и подописания сохранятся.\n(или напишите «отмена»)`,
          actions: [{ label: 'Отмена', kind: 'cancel-input' }],
        }],
      }));
    } else if (action.kind === 'cancel-input') {
      if (get().pendingInput) {
        set(s => ({ pendingInput: null, messages: [...s.messages, { id: uid(), role: 'assistant', text: 'Отменил. Чем ещё помочь?' }] }));
      }
    } else if (action.kind === 'focus-tag' && action.tagId && navigateFn) {
      // Глубокая ссылка: раздел прочитает ?focus= и центрирует/подсветит позицию
      navigateFn(`/registry?focus=${encodeURIComponent(action.tagId)}`);
    } else if (action.kind === 'focus-equipment' && action.componentId && navigateFn) {
      // Переход к конкретному элементу оборудования с подсветкой характеристики
      try {
        sessionStorage.setItem('flux_equip_focus', JSON.stringify({
          componentId: action.componentId,
          specKey: action.specKey || '',
          ts: Date.now(),
        }));
      } catch (_) {}
      navigateFn('/equipment');
    } else if (action.kind === 'find-duplicates' && action.code && navigateFn) {
      navigateFn(`/registry?dup=${encodeURIComponent(action.code)}`);
    } else if (action.kind === 'create-note' && navigateFn) {
      // Заметки теперь в студии (Конструктор → вкладка «Заметки»)
      navigateFn(`/notes?new=${encodeURIComponent(action.noteTitle || 'Новая заметка')}`);
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

// Результат распознавания: сообщение + (опционально) контекст последнего списка
// + (опционально) переход в режим ожидания ввода (диалоговое действие)
interface Resolved { message: AssistantMessage; result?: LastResult | null; pending?: PendingInput; }
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
  { stems: ['конструктор', 'таблиц', 'документ', 'ворд', 'эксел'], route: '/constructor', name: 'Конструктор' },
  { stems: ['справочник', 'словар'], route: '/directory', name: 'Справочник' },
  { stems: ['чат', 'переписк'], route: '/chat', name: 'Рабочий чат' },
  { stems: ['проект'], route: '/projects', name: 'Проекты' },
];

// --- Характеристики позиций (для ответов «какой расход у …») ---
type CompSpec = { key: string; value: string; unit: string; group: string };
type CompData = AssistantData['components'][number];

// Поле, о котором спрашивает пользователь (по синонимам словаря в тексте запроса)
function askedField(lower: string): FieldDef | null {
  let best: FieldDef | null = null, bestLen = 0;
  for (const f of FIELDS) {
    for (const syn of f.synonyms) {
      if (syn.length >= 4 && lower.includes(syn) && syn.length > bestLen) { best = f; bestLen = syn.length; }
    }
  }
  return best;
}
// Характеристика компонента, соответствующая полю (по подписи, затем по единице).
// При дублях (в бланках бывает «0 м³/ч» рядом с реальным) предпочитаем ненулевое.
function specForField(specs: CompSpec[], field: FieldDef): CompSpec | null {
  const byLabel = specs.filter(s => { const m = matchLabel(s.key); return !!m && m.field.id === field.id; });
  const byUnit = specs.filter(s => s.unit && fieldByUniqueUnit(s.unit) === field.id);
  const cand = byLabel.length ? byLabel : byUnit;
  return cand.find(s => s.value && !/^0([.,]0+)?$/.test(s.value.trim())) || cand[0] || null;
}
// Компонент по коду тега / itemCode / имени
function findComponentByCode(comps: CompData[], code: string): CompData | null {
  const lc = code.toLowerCase();
  return comps.find(c =>
    (c.tags || []).some(t => (t || '').toLowerCase() === lc)
    || (c.itemCode || '').toLowerCase() === lc
    || (c.name || '').toLowerCase().includes(lc)) || null;
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

  // D2. Переименование тега: «переименуй 3700-A», «смени код 3700-A на 3700-B»,
  // «поменяй тег 3700-A → 3700-B». Связи сохраняются (хранятся по id тега).
  const renameIntent = /(переимен|renam)/.test(lower)
    || (/(смен|помен|замен|исправ|переправ)\w*/.test(lower) && /(тег|код|назван|номер|марк)/.test(lower));
  if (renameIntent && p.codes.length > 0) {
    const data = await getData();
    const oldCode = p.codes[0];
    const matches = data.tags.filter(t => (t.identifier || '').trim().toLowerCase() === oldCode.toLowerCase());
    if (matches.length === 0) {
      return msg(`Не нашёл тег «${oldCode}» в проекте. Проверьте код или скажите «покажи теги».`);
    }
    // Код-дубликат: нужно выбрать конкретный экземпляр
    if (matches.length > 1) {
      return {
        message: {
          id: uid(), role: 'assistant',
          text: `Код «${oldCode}» встречается ${matches.length} раз — выберите, какой тег переименовать:`,
          list: matches.map(t => ({
            id: t.id, title: t.identifier || oldCode, subtitle: t.mainName || t.department || '', badge: 'дубль',
            actions: [
              { label: 'Переименовать', kind: 'prompt-rename-tag', tagId: t.id, code: t.identifier || oldCode },
              { label: 'На холсте', kind: 'focus-tag', tagId: t.id },
            ],
          })),
        },
      };
    }
    const tag = matches[0];
    // Явно указан новый код → переименовываем сразу
    if (p.codes.length >= 2) {
      const v = validateTagCode(p.codes[1]);
      if (!v.ok) return msg(`Не могу применить код «${p.codes[1]}»: ${v.error}.`);
      if (v.code.toLowerCase() === oldCode.toLowerCase()) return msg('Новый код совпадает со старым — менять нечего.');
      try {
        const collision = data.tags.filter(t => t.id !== tag.id && (t.identifier || '').trim().toLowerCase() === v.code.toLowerCase()).length;
        await renameTagApi(tag.id, v.code);
        const warn = collision > 0 ? `\n⚠ Такой код уже есть у ${collision} тег(ов) — образовался новый дубль.` : '';
        return {
          message: {
            id: uid(), role: 'assistant',
            text: `✅ Переименовал: «${oldCode}» → «${v.code}». Связи и подописания сохранены.${warn}`,
            actions: [
              { label: 'Показать на холсте', kind: 'focus-tag', tagId: tag.id },
              { label: 'Показать дубли', kind: 'ask', query: 'покажи дубли' },
            ],
          },
        };
      } catch (err: any) {
        return msg(`Не удалось переименовать: ${err.message}`);
      }
    }
    // Новый код не указан → входим в диалог: следующая реплика станет новым кодом
    return {
      message: {
        id: uid(), role: 'assistant',
        text: `Введите новый код для тега «${tag.identifier || oldCode}». Связи и подописания сохранятся.\n(или напишите «отмена»)`,
        actions: [{ label: 'Отмена', kind: 'cancel-input' }],
      },
      pending: { kind: 'rename-tag', tagId: tag.id, oldCode: tag.identifier || oldCode },
    };
  }

  // E0. Характеристики позиции из «Оборудования»: «какой расход у 3700-…»,
  // «характеристики 3700-…», «собери расход и мощность у …» (в т.ч. по нескольким тегам)
  if (p.codes.length > 0) {
    const field = askedField(lower);
    const wantsSpecs = !!field || /(характеристик|данные|парам|собери|выпиши|сведени)/.test(lower);
    if (wantsSpecs) {
      const data = await getData();

      // Одна позиция + конкретное поле → короткий ответ
      if (p.codes.length === 1 && field) {
        const comp = findComponentByCode(data.components, p.codes[0]);
        if (comp && comp.specs) {
          const sv = specForField(comp.specs, field);
          if (sv) {
            return msg(`${field.label} у ${p.codes[0]}: ${sv.value}${sv.unit ? ' ' + sv.unit : ''}.`,
              { actions: [{ label: 'Показать в оборудовании', kind: 'focus-equipment', componentId: comp.id, specKey: sv.key }] });
          }
          return msg(`У «${p.codes[0]}» характеристику «${field.label}» не нашёл — показать все характеристики?`,
            { actions: [{ label: 'Все характеристики', kind: 'ask', query: `характеристики ${p.codes[0]}` }] });
        }
        // нет привязанного компонента → провалимся в карточку тега (E)
      }

      // Одна позиция без конкретного поля → все её характеристики
      if (p.codes.length === 1 && !field) {
        const comp = findComponentByCode(data.components, p.codes[0]);
        if (comp && comp.specs && comp.specs.length) {
          const table: AssistantTable = {
            title: `Характеристики ${p.codes[0]}`,
            columns: ['Характеристика', 'Значение', 'Ед.'],
            rows: comp.specs.map(s => [s.key, s.value, s.unit]),
          };
          return { message: { id: uid(), role: 'assistant', text: `Характеристики «${comp.name || p.codes[0]}»: ${comp.specs.length} параметр(ов).`, table,
            actions: [{ label: 'Показать в оборудовании', kind: 'focus-equipment', componentId: comp.id }, ...EXPORT_ACTIONS] }, result: null };
        }
      }

      // Несколько позиций → сводная таблица (по указанному полю или ключевым)
      if (p.codes.length > 1) {
        const cols = field ? [field] : ['airflow', 'pressure', 'power'].map(id => FIELDS.find(f => f.id === id)).filter(Boolean) as FieldDef[];
        const rows: (string | number)[][] = p.codes.map(code => {
          const comp = findComponentByCode(data.components, code);
          return [code, ...cols.map(f => {
            const sv = comp && comp.specs ? specForField(comp.specs, f) : null;
            return sv ? `${sv.value}${sv.unit ? ' ' + sv.unit : ''}` : '—';
          })];
        });
        const table: AssistantTable = { title: field ? `${field.label} по позициям` : 'Характеристики позиций', columns: ['Тег', ...cols.map(f => f.label)], rows };
        return { message: { id: uid(), role: 'assistant', text: `Собрал данные по ${p.codes.length} позиц.`, table, actions: EXPORT_ACTIONS }, result: null };
      }
    }
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
        { label: 'Показать в Менеджменте', kind: 'open-section', route: '/management' },
      ];
      if (dup) actions.push({ label: `Найти дубли (${dup.count})`, kind: 'find-duplicates', code: dup.code });
      const lines = [
        `${t.identifier}${t.mainName ? ` — ${t.mainName}` : ''}`,
        t.brand ? `Марка: ${t.brand}` : '',
        t.department ? `Отдел: ${t.department}` : '',
        `Актуальность: ${ACTUALITY_RU[t.actuality || 'draft'] || t.actuality}`,
        `Этап закупки: ${t.stageLabel || '—'}${t.supplier ? `, поставщик: ${t.supplier}` : ''}`,
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
    || hasIntent(p, ['тег', 'оборудован', 'компонент', 'вентилятор', 'установк', 'клапан', 'проект', 'систем', 'дубл', 'закупк', 'критичн', 'внимани', 'проблем', 'заметк', 'этап', 'поставщик'])
    || /не заказан|не куплен|куплен|закуплен|заказан|утвержд|просроч|что изменилос|кто менял|что менял|последн.*(действ|измен|запис)|что требует|требует внимани|конфликт ревиз/.test(lower);
  if (wantsData) {
    const data = await getData();
    const c = data.counts;

    // Остаточные стемы — то, что осталось после служебных/доменных слов.
    // Позволяют пересекать фильтры: «критичные ВЕНТИЛЯТОРЫ», «не заказаны КЛАПАНЫ».
    const filterStems = p.stems.filter(s => ![
      'тег', 'оборудован', 'компонент', 'покажи', 'список', 'найд', 'сколько', 'выгруз',
      'критичн', 'внимани', 'проблем', 'конфликт', 'дубл', 'закупк', 'этап', 'поставщик',
      'заметк', 'запис', 'истори', 'изменени', 'изменил', 'сводк', 'статус',
      // общие слова и слова-этапы — не считаем их фильтром-термином
      'позици', 'позиц', 'штук', 'заказан', 'куплен', 'закуплен', 'утвержд', 'добавлен',
      'осталось', 'просроч', 'требует', 'требуют',
    ].includes(s));
    const tagTextMatch = (t: AssistantData['tags'][number], stems: string[]) =>
      fieldMatchesStems(t.identifier, stems) || fieldMatchesStems(t.brand, stems)
      || fieldMatchesStems(t.mainName, stems) || fieldMatchesStems(t.department, stems)
      || fieldMatchesStems(t.fluid, stems);

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
      const tagById: Record<string, AssistantData['tags'][number]> = {};
      for (const t of data.tags) tagById[t.id] = t;
      // Раскрываем группы дублей в отдельные экземпляры с кнопками действий
      const list: AssistantListItem[] = [];
      for (const d of data.duplicates) {
        d.ids.forEach((id, i) => {
          const t = tagById[id];
          list.push({
            id,
            title: t?.identifier || d.code,
            subtitle: `${t?.mainName || t?.department || 'без наименования'} · экземпляр ${i + 1} из ${d.count}`,
            badge: 'дубль',
            actions: [
              { label: 'Переименовать', kind: 'prompt-rename-tag', tagId: id, code: t?.identifier || d.code },
              { label: 'На холсте', kind: 'focus-tag', tagId: id },
            ],
          });
        });
      }
      // Таблица — для выгрузки/контекста (не отображается, когда есть список)
      const table: AssistantTable = {
        title: 'Дубликаты кодов тегов',
        columns: ['Код тега', 'Повторов'],
        rows: data.duplicates.map(d => [d.code, d.count]),
      };
      return {
        message: {
          id: uid(), role: 'assistant',
          text: `Нашёл дублей: ${data.duplicates.length} (всего ${data.duplicates.reduce((s, d) => s + d.count, 0)} позиций).\nНажмите «Переименовать» у любого — я спрошу новый код, а связи сохранятся.`,
          list,
          table,
          actions: EXPORT_ACTIONS,
        },
        result: { kind: 'duplicates', ids: data.duplicates.flatMap(d => d.ids), label: 'дубли' },
      };
    }

    // G3. Проблемы / актуальность (+ пересечение с текстовым фильтром)
    if (hasIntent(p, ['критичн', 'внимани', 'проблем', 'конфликт'])) {
      let bad = data.tags.filter(t => t.actuality === 'critical' || t.actuality === 'warning');
      if (filterStems.length) bad = bad.filter(t => tagTextMatch(t, filterStems));
      const suffix = filterStems.length ? ` по запросу «${filterStems.join(' ')}»` : '';
      if (bad.length === 0) return msg(`Критичных позиций и позиций «на проверку»${suffix} нет. ✓`);
      const table: AssistantTable = {
        title: `Требуют внимания${suffix}`,
        columns: ['Тег', 'Наименование', 'Состояние'],
        rows: bad.map(t => [t.identifier || '', t.mainName || '', ACTUALITY_RU[t.actuality || 'draft'] || '']),
      };
      return {
        message: { id: uid(), role: 'assistant', text: `Требуют внимания${suffix}: ${bad.length} (критичных ${bad.filter(t => t.actuality === 'critical').length}).`, table, actions: EXPORT_ACTIONS },
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
      // Пересечение с текстовым фильтром: «не заказаны ВЕНТИЛЯТОРЫ отдела ОВ»
      if (filterStems.length) { sel = sel.filter(t => tagTextMatch(t, filterStems)); label += ` · ${filterStems.join(' ')}`; }
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
        actions: [{ label: 'Открыть заметки', kind: 'open-section', route: '/notes' }],
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
