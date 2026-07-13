// Настраиваемые этапы закупки для раздела «Менеджмент».
// Хранятся глобально в AppSetting (key = procurement_stages): администратор
// настраивает под свой процесс название, значок и цвет каждого этапа.

import {
  PlusCircle, ShoppingCart, ClipboardCheck, PackageCheck, Truck, CreditCard,
  FileCheck, Wrench, Star, Flag, Clock, CheckCircle2, Box, Send, Banknote, Building2
} from 'lucide-react';

export interface ProcurementStage {
  id: string;      // стабильный идентификатор (хранится в metadata тегов)
  label: string;   // название этапа («Заказан», «Оплачен», …)
  icon: string;    // имя значка из STAGE_ICONS
  color: string;   // имя цвета из STAGE_COLORS
}

export const STAGE_ICONS: Record<string, any> = {
  PlusCircle, ShoppingCart, ClipboardCheck, PackageCheck, Truck, CreditCard,
  FileCheck, Wrench, Star, Flag, Clock, CheckCircle2, Box, Send, Banknote, Building2,
};

export const STAGE_COLORS: Record<string, { color: string; bg: string; border: string; solid: string }> = {
  slate:   { color: 'text-slate-500 dark:text-slate-400',    bg: 'bg-slate-100 dark:bg-slate-900',        border: 'border-slate-300 dark:border-slate-700',   solid: 'bg-slate-500' },
  sky:     { color: 'text-sky-600 dark:text-sky-400',        bg: 'bg-sky-50 dark:bg-sky-950/40',          border: 'border-sky-300 dark:border-sky-800',       solid: 'bg-sky-500' },
  amber:   { color: 'text-amber-600 dark:text-amber-400',    bg: 'bg-amber-50 dark:bg-amber-950/40',      border: 'border-amber-300 dark:border-amber-800',   solid: 'bg-amber-500' },
  emerald: { color: 'text-emerald-600 dark:text-emerald-400',bg: 'bg-emerald-50 dark:bg-emerald-950/40',  border: 'border-emerald-300 dark:border-emerald-800', solid: 'bg-emerald-500' },
  indigo:  { color: 'text-indigo-600 dark:text-indigo-400',  bg: 'bg-indigo-50 dark:bg-indigo-950/40',    border: 'border-indigo-300 dark:border-indigo-800', solid: 'bg-indigo-500' },
  rose:    { color: 'text-rose-600 dark:text-rose-400',      bg: 'bg-rose-50 dark:bg-rose-950/40',        border: 'border-rose-300 dark:border-rose-800',     solid: 'bg-rose-500' },
  violet:  { color: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-50 dark:bg-violet-950/40',    border: 'border-violet-300 dark:border-violet-800', solid: 'bg-violet-500' },
  teal:    { color: 'text-teal-600 dark:text-teal-400',      bg: 'bg-teal-50 dark:bg-teal-950/40',        border: 'border-teal-300 dark:border-teal-800',     solid: 'bg-teal-500' },
  orange:  { color: 'text-orange-600 dark:text-orange-400',  bg: 'bg-orange-50 dark:bg-orange-950/40',    border: 'border-orange-300 dark:border-orange-800', solid: 'bg-orange-500' },
};

export const DEFAULT_STAGES: ProcurementStage[] = [
  { id: 'added',     label: 'Добавлен',  icon: 'PlusCircle',     color: 'slate' },
  { id: 'ordered',   label: 'Заказан',   icon: 'ShoppingCart',   color: 'sky' },
  { id: 'approved',  label: 'Утверждён', icon: 'ClipboardCheck', color: 'amber' },
  { id: 'purchased', label: 'Куплен',    icon: 'PackageCheck',   color: 'emerald' },
];

export function stageIcon(name: string) {
  return STAGE_ICONS[name] || Box;
}

export function stageColor(name: string) {
  return STAGE_COLORS[name] || STAGE_COLORS.slate;
}

// ── Шаблоны этапов ──────────────────────────────────────────────────────────
// Кроме стандартного набора этапов можно завести именованные шаблоны со своими
// этапами и правилами применения: по отделу (классу) тега, по типу оборудования
// привязанного элемента, по категории установки, по подстроке в обозначении —
// или назначить шаблон конкретным тегам вручную (metadata.procurement.templateId).
export interface StageTemplateRules {
  departments: string[];        // классы/отделы тега («ОВ», «ВК», …)
  equipTypes: string[];         // типы оборудования элементов («КЛАПАН», «ФИЛЬТР», …)
  categories: string[];         // категории установок («AHU», «FAN», …)
  identifierIncludes: string[]; // подстроки обозначения («P-», «-EX», …)
}

export interface StageTemplate {
  id: string;
  name: string;                 // «Импортное оборудование», «Насосы», …
  stages: ProcurementStage[];
  rules: StageTemplateRules;
}

export const DEFAULT_TEMPLATE_ID = 'default';

export function emptyRules(): StageTemplateRules {
  return { departments: [], equipTypes: [], categories: [], identifierIncludes: [] };
}

// Загрузка шаблонов (кроме стандартного — он живёт в procurement_stages)
export async function loadStageTemplates(): Promise<StageTemplate[]> {
  try {
    const res = await fetch('/api/settings/procurement_templates');
    const data = await res.json();
    if (data.global) {
      const parsed = JSON.parse(data.global);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((t: any) => t && t.id && t.name && Array.isArray(t.stages) && t.stages.length >= 2)
          .map((t: any) => ({ ...t, rules: { ...emptyRules(), ...(t.rules || {}) } }));
      }
    }
  } catch (_) {}
  return [];
}

export async function saveStageTemplates(templates: StageTemplate[]): Promise<boolean> {
  try {
    const res = await fetch('/api/settings/procurement_templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(templates) })
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

// Информация о привязках тега для подбора шаблона (равнение по данным
// componentElements, которые сервер отдаёт вместе с тегами)
export interface TagTemplateContext {
  identifier: string;
  department: string;
  equipTypes: string[];   // типы привязанных элементов
  categories: string[];   // категории установок привязанных элементов
  explicitTemplateId?: string; // metadata.procurement.templateId
}

// Подбор шаблона для тега. Приоритет: явное назначение → обозначение →
// тип оборудования → категория установки → отдел → стандартный (null).
export function resolveTemplate(ctx: TagTemplateContext, templates: StageTemplate[]): StageTemplate | null {
  if (ctx.explicitTemplateId) {
    if (ctx.explicitTemplateId === DEFAULT_TEMPLATE_ID) return null; // явно «стандартный»
    const t = templates.find(t => t.id === ctx.explicitTemplateId);
    if (t) return t;
  }
  const idLow = (ctx.identifier || '').toLowerCase();
  for (const t of templates) {
    if (t.rules.identifierIncludes.some(s => s && idLow.includes(s.toLowerCase()))) return t;
  }
  for (const t of templates) {
    if (t.rules.equipTypes.some(e => e && ctx.equipTypes.some(et => et.toLowerCase() === e.toLowerCase()))) return t;
  }
  for (const t of templates) {
    if (t.rules.categories.some(c => c && ctx.categories.some(cat => cat.toLowerCase() === c.toLowerCase()))) return t;
  }
  const depLow = (ctx.department || '').toLowerCase();
  for (const t of templates) {
    if (depLow && t.rules.departments.some(d => d && d.toLowerCase() === depLow)) return t;
  }
  return null;
}

// Загрузка этапов из настроек (глобальная настройка; при отсутствии — стандартные)
export async function loadProcurementStages(): Promise<ProcurementStage[]> {
  try {
    const res = await fetch('/api/settings/procurement_stages');
    const data = await res.json();
    if (data.global) {
      const parsed = JSON.parse(data.global);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed.filter((s: any) => s && s.id && s.label);
      }
    }
  } catch (_) {}
  return DEFAULT_STAGES;
}

export async function saveProcurementStages(stages: ProcurementStage[]): Promise<boolean> {
  try {
    const res = await fetch('/api/settings/procurement_stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(stages) })
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}
