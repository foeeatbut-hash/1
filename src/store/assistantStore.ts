import { create } from 'zustand';
import * as XLSX from 'xlsx';
import { ENV_CONFIG } from '../config/env';
import { findKnowledge } from '../assistant/knowledge';
import { TOURS, findTourByText, Tour } from '../assistant/tours';

export interface AssistantAction {
  label: string;
  kind: 'tour' | 'export-excel' | 'export-word' | 'navigate';
  tourId?: string;
  route?: string;
}

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
  tags: { id: string; identifier: string; brand?: string; department?: string; wbs?: string; fluid?: string }[];
  components: { id: string; name: string; itemCode: string; systemName: string; category: string; monoblockName: string; status: string; hasConflict: boolean; tags: string[] }[];
  counts: Record<string, number>;
}

interface AssistantState {
  isOpen: boolean;
  messages: AssistantMessage[];
  loading: boolean;

  // Состояние демонстрации (тура)
  activeTour: Tour | null;
  tourStepIndex: number;
  highlightSelector: string | null;

  // Последняя выборка для экспорта
  lastTable: AssistantTable | null;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  ask: (text: string) => Promise<void>;
  runAction: (action: AssistantAction) => void;
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

export const useAssistantStore = create<AssistantState>((set, get) => ({
  isOpen: false,
  messages: [{
    id: uid(),
    role: 'assistant',
    text: 'Здравствуйте! Я встроенный помощник PDM System и работаю полностью локально.\n\nСпросите меня о данных («покажи все теги», «теги коробок», «сколько оборудования») или о том, как что-то сделать («как добавить тег»). Я могу подсветить нужные кнопки прямо в программе и выгрузить данные в Excel или Word.',
    actions: [
      { label: 'Как добавить тег', kind: 'tour', tourId: 'add-tag' },
      { label: 'Что ты умеешь?', kind: 'navigate', route: '__help' },
    ],
  }],
  loading: false,
  activeTour: null,
  tourStepIndex: 0,
  highlightSelector: null,
  lastTable: null,

  toggleOpen: () => set(s => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),

  setHighlight: (selector) => set({ highlightSelector: selector }),

  ask: async (text) => {
    const clean = text.trim();
    if (!clean) return;
    const userMsg: AssistantMessage = { id: uid(), role: 'user', text: clean };
    set(s => ({ messages: [...s.messages, userMsg], loading: true }));

    try {
      const reply = await resolveQuery(clean);
      set(s => ({ messages: [...s.messages, reply], loading: false, lastTable: reply.table || s.lastTable }));
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
    } else if (action.kind === 'export-excel' && get().lastTable) {
      exportTableToExcel(get().lastTable!);
    } else if (action.kind === 'export-word' && get().lastTable) {
      exportTableToWord(get().lastTable!);
    } else if (action.kind === 'navigate') {
      if (action.route === '__help') {
        const ans = findKnowledge('что умеешь');
        set(s => ({ messages: [...s.messages, { id: uid(), role: 'assistant', text: ans || '' }] }));
      } else if (action.route && navigateFn) {
        navigateFn(action.route);
      }
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

// --- Распознавание запроса (полностью локальное) ---
async function resolveQuery(text: string): Promise<AssistantMessage> {
  const lower = text.toLowerCase();

  // 0. Вопрос-определение ("что такое", "для чего", "объясни") -> сразу справка,
  //    чтобы "что такое реестр тегов" не уходило в выборку данных
  const isInfoQuestion = /(что так|что эт|для чего|зачем|расскажи|объясни|чем отлич|что значит|как работает)/.test(lower);
  if (isInfoQuestion) {
    const knowledge = findKnowledge(lower);
    if (knowledge) return { id: uid(), role: 'assistant', text: knowledge };
  }

  // 1. Демонстрация: "как ...", "покажи как", "демонстрация".
  // ВАЖНО: \b в JS не работает с кириллицей, поэтому "как" ищем как отдельное
  // слово вручную через границы из не-кириллических символов.
  const wantsTour = /(^|[^а-яёa-z])как([^а-яёa-z]|$)/i.test(lower)
    || /(демонстрац|научи|инструкц|покажи как|пошагов)/.test(lower);
  if (wantsTour) {
    const tour = findTourByText(lower);
    if (tour) {
      return {
        id: uid(), role: 'assistant', text: tour.intro,
        actions: [{ label: '▶ Показать демонстрацию', kind: 'tour', tourId: tour.id }],
      };
    }
  }

  // 2. Запрос данных: явный глагол выборки или упоминание сущности с "все/список"
  const hasDataVerb = /(покажи|показать|список|сколько|количеств|выгруз|экспорт|найд|дай|сформируй|выведи|собери|все|всё|выбор)/.test(lower);
  const hasEntity = /(тег|оборудован|компонент|вентилятор|короб|клапан|проект|систем|моноблок|аху|ahu)/.test(lower);
  const wantsData = hasDataVerb || hasEntity;
  if (wantsData) {
    const data = await fetchAssistantData();

    // Счётчик
    if (/сколько|количеств/.test(lower)) {
      const c = data.counts;
      return {
        id: uid(), role: 'assistant',
        text: `В активном проекте сейчас:\n• Тегов: ${c.tags}\n• Компонентов оборудования: ${c.components}\n• Систем: ${c.systems}\n• Папок: ${c.folders}\n• Файлов: ${c.files}\n\nВсего проектов: ${c.projects}, пользователей: ${c.users}, заметок: ${c.notes}.`,
      };
    }

    const terms = tokensFrom(text);
    const mentionsEquip = /(оборудован|компонент|систем|моноблок)/.test(lower);
    const mentionsTag = /(тег)/.test(lower);

    // Поиск по тегам
    const matchedTags = data.tags.filter(tg => {
      if (terms.length === 0) return true;
      return terms.some(term =>
        fieldMatches(tg.identifier, term) || fieldMatches(tg.brand, term) ||
        fieldMatches(tg.department, term) || fieldMatches(tg.fluid, term) || fieldMatches(tg.wbs, term)
      );
    });

    // Поиск по оборудованию
    const matchedComps = data.components.filter(c => {
      if (terms.length === 0) return true;
      return terms.some(term =>
        fieldMatches(c.name, term) || fieldMatches(c.itemCode, term) ||
        fieldMatches(c.category, term) || fieldMatches(c.systemName, term) ||
        c.tags.some(tag => fieldMatches(tag, term))
      );
    });

    // Решаем, что показывать
    const showTags = mentionsTag || (!mentionsEquip && matchedTags.length >= matchedComps.length);

    if (showTags) {
      if (matchedTags.length === 0) {
        return { id: uid(), role: 'assistant', text: terms.length ? `По запросу «${terms.join(' ')}» теги не найдены. Попробуйте другое слово или проверьте активный проект.` : 'В активном проекте пока нет тегов.' };
      }
      const table: AssistantTable = {
        title: terms.length ? `Теги: ${terms.join(' ')}` : 'Все теги проекта',
        columns: ['Тег', 'Марка', 'Отдел', 'WBS', 'Среда'],
        rows: matchedTags.map(t => [t.identifier || '', t.brand || '', t.department || '', t.wbs || '', t.fluid || '']),
      };
      return {
        id: uid(), role: 'assistant',
        text: `Нашёл тегов: ${matchedTags.length}${terms.length ? ` по запросу «${terms.join(' ')}»` : ''}.`,
        table,
        actions: [
          { label: 'Выгрузить в Excel', kind: 'export-excel' },
          { label: 'Выгрузить в Word', kind: 'export-word' },
        ],
      };
    } else {
      if (matchedComps.length === 0) {
        return { id: uid(), role: 'assistant', text: terms.length ? `По запросу «${terms.join(' ')}» оборудование не найдено.` : 'В активном проекте пока нет оборудования.' };
      }
      const table: AssistantTable = {
        title: terms.length ? `Оборудование: ${terms.join(' ')}` : 'Всё оборудование проекта',
        columns: ['Компонент', 'Код', 'Категория', 'Система', 'Теги'],
        rows: matchedComps.map(c => [c.name || '', c.itemCode || '', c.category || '', c.systemName || '', c.tags.join(', ')]),
      };
      return {
        id: uid(), role: 'assistant',
        text: `Нашёл компонентов: ${matchedComps.length}${terms.length ? ` по запросу «${terms.join(' ')}»` : ''}.`,
        table,
        actions: [
          { label: 'Выгрузить в Excel', kind: 'export-excel' },
          { label: 'Выгрузить в Word', kind: 'export-word' },
        ],
      };
    }
  }

  // 3. База знаний (справка о разделах)
  const knowledge = findKnowledge(lower);
  if (knowledge) {
    return { id: uid(), role: 'assistant', text: knowledge };
  }

  // 4. Фоллбэк с подсказками
  return {
    id: uid(), role: 'assistant',
    text: 'Я не уверен, что вы имеете в виду. Я работаю локально и могу: найти данные («покажи теги коробок»), показать демонстрацию («как добавить тег») или рассказать о разделе («что такое реестр тегов»).',
    actions: [
      { label: 'Что ты умеешь?', kind: 'navigate', route: '__help' },
      { label: 'Как добавить тег', kind: 'tour', tourId: 'add-tag' },
    ],
  };
}
