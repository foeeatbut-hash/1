/**
 * Метки: данные проекта, подставленные в документ.
 *
 * До этого их было две штуки под разными именами и с разным поведением. В
 * таблице — «умный блок»: живая связь с данными проекта, обновляется по
 * кнопке. В текстовом документе — панель «Данные», которая вставляла ГОТОВОЕ
 * ЗНАЧЕНИЕ ТЕКСТОМ; в коде так и было написано: «вставляется значение, а не
 * формула». Из-за этого шифр проекта в записке застывал в момент вставки, а в
 * ведомости оставался живым, и два документа расходились — а человек считал,
 * что «умные блоки не работают».
 *
 * Теперь понятие одно: метка. Она помнит, ОТКУДА взято значение, и умеет
 * обновиться. В документ по-прежнему попадает значение, а не код: документ
 * уходит в Word и к заказчику, где считать некому.
 *
 * Здесь только правила, без React и без движка документа: у них есть
 * правильный ответ, и его проверяет скрипт (scripts/test-doc-labels.ts).
 */

export interface DocLabel {
  id: string;
  /** Серверная функция значений: project, tag, param… — та же, что у таблиц */
  fn: string;
  args: string[];
  /** Что стоит в документе сейчас: по нему метка себя и находит */
  value: string;
  /** Как называется в списке меток */
  title: string;
}

export interface LabelsBinding {
  schemaVersion: number;
  labels: DocLabel[];
}

export const EMPTY_LABELS: LabelsBinding = { schemaVersion: 1, labels: [] };

/** Прочитать метки из привязок документа, не падая на чужом содержимом */
export function readLabels(raw: string | null | undefined): LabelsBinding {
  if (!raw) return { ...EMPTY_LABELS, labels: [] };
  try {
    const parsed = JSON.parse(String(raw));
    const labels = Array.isArray(parsed?.labels) ? parsed.labels : [];
    return { schemaVersion: Number(parsed?.schemaVersion) || 1, labels };
  } catch (_) {
    return { ...EMPTY_LABELS, labels: [] };
  }
}

/** Имя метки для списка: человек должен узнать её, не открывая свойств */
export function labelTitle(fn: string, args: string[]): string {
  const a = args.map((x) => String(x ?? ''));
  if (fn === 'project') return `Проект · ${a[0] || 'поле'}`;
  if (fn === 'tag') return `Тег ${a[0] || '—'} · ${a[1] || 'поле'}`;
  if (fn === 'param') return `Параметр ${a[0] || '—'} · ${a[1] || ''}${a[2] ? ` · ${a[2]}` : ''}`;
  if (fn === 'paramEl') return `Изделие ${a[0] || '—'} · ${a[1] || ''}${a[2] ? ` · ${a[2]}` : ''}`;
  if (fn === 'now') return 'Дата';
  return `${fn} · ${a.join(' · ')}`;
}

export type LabelState = 'same' | 'changed' | 'detached';

export interface RefreshItem {
  label: DocLabel;
  /** Что стало значением после обновления */
  next: string;
  state: LabelState;
}

/**
 * Что произойдёт при обновлении.
 *
 * `fresh` — новые значения по идентификаторам меток. `text` — текст документа
 * целиком: по нему видно, на месте ли ещё старое значение.
 *
 * «Оторвалась» — это когда прежнего значения в тексте больше нет: его стёрли
 * или переписали руками. Такую метку молча подставлять обратно нельзя — можно
 * затереть то, что человек написал нарочно; о ней говорится отдельно.
 */
export function planRefresh(text: string, labels: DocLabel[], fresh: Record<string, string>): RefreshItem[] {
  const body = String(text || '');
  return labels.map((label) => {
    const next = fresh[label.id] ?? label.value;
    if (!label.value || !body.includes(label.value)) {
      return { label, next, state: 'detached' as const };
    }
    return { label, next, state: next === label.value ? ('same' as const) : ('changed' as const) };
  });
}

/** Применить обновление к тексту: меняются только те метки, что нашлись */
export function applyRefresh(text: string, plan: RefreshItem[]): { text: string; changed: number } {
  let out = String(text || '');
  let changed = 0;
  for (const item of plan) {
    if (item.state !== 'changed') continue;
    // Заменяем первое вхождение: одинаковое значение может встречаться и в
    // обычном тексте, и затирать его нельзя
    const at = out.indexOf(item.label.value);
    if (at < 0) continue;
    out = out.slice(0, at) + item.next + out.slice(at + item.label.value.length);
    changed++;
  }
  return { text: out, changed };
}

/** Итог обновления одной строкой — человеку, а не в журнал */
export function refreshReport(plan: RefreshItem[]): string {
  const changed = plan.filter((p) => p.state === 'changed').length;
  const detached = plan.filter((p) => p.state === 'detached').length;
  if (!plan.length) return 'В документе нет меток данных.';
  const parts: string[] = [];
  parts.push(changed ? `Обновлено меток: ${changed}` : 'Все метки уже с текущими значениями');
  if (detached) {
    parts.push(`оторвалось: ${detached} — их значение в тексте изменили вручную, и подставлять поверх я не стал`);
  }
  return parts.join('. ');
}

/** Добавить метку, не заводя вторую такую же на то же место */
export function addLabel(binding: LabelsBinding, label: DocLabel): LabelsBinding {
  const без = binding.labels.filter((l) => l.id !== label.id);
  return { schemaVersion: binding.schemaVersion || 1, labels: [...без, label] };
}
