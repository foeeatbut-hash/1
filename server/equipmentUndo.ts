/**
 * Отмена импорта расчёта.
 *
 * Правило программы: любая массовая запись должна отменяться (skill
 * flux-data-safety §6). У захвата с экрана отмена была, у ввоза расчёта — нет,
 * хотя он меняет именно характеристики, по которым потом заказывают железо.
 *
 * Отменяем по партии: у каждой записи истории есть batchId того ввоза, который
 * её сделал. Собирать партию по времени было нельзя — два импорта подряд
 * слились бы в один.
 *
 * Чужие правки не трогаем. Если после импорта человек уже поправил элемент
 * руками, откат его пропускает и говорит об этом: молча стереть чужую работу
 * хуже, чем не доделать откат.
 */

export interface HistoryRow {
  id: string;
  elementId: string;
  version: number;
  changedAt: string | Date;
  oldSpecs: string | null;
  newSpecs: string | null;
  changeType: string;
}

export interface ElementNow {
  id: string;
  itemCode: string;
  specs: string | null;
  version: number;
  where: string;
}

export type UndoAction = 'restore' | 'remove' | 'skip';

export interface UndoItem {
  elementId: string;
  itemCode: string;
  where: string;
  action: UndoAction;
  /** Почему пропускаем — показывается человеку до применения */
  reason?: string;
  /** Значение, которое вернём (только для restore) */
  specs?: string | null;
  version?: number;
}

export interface UndoPlan {
  batchId: string;
  restore: UndoItem[];
  remove: UndoItem[];
  skip: UndoItem[];
}

/** Сравнение характеристик по смыслу, а не по строке: пробелы и порядок ключей
 *  в JSON меняются при пересохранении, а данные при этом те же */
function sameSpecs(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  const norm = (x: string | null) => {
    if (!x) return '';
    try {
      const groups = (JSON.parse(x)?.groups || []).map((g: any) => ({
        t: String(g?.title || ''),
        p: (g?.params || []).map((p: any) => `${p?.key}=${p?.value ?? ''}`).sort(),
      }));
      groups.sort((g1: any, g2: any) => g1.t.localeCompare(g2.t));
      return JSON.stringify(groups);
    } catch (_) { return String(x); }
  };
  return norm(a) === norm(b);
}

/**
 * Что сделает отмена: список на возврат, на удаление и на пропуск.
 *
 * Считается до записи, показывается человеку и только потом применяется —
 * прямой записи «по кнопке» в программе быть не должно.
 */
export function planUndo(batchId: string, rows: HistoryRow[], elements: Map<string, ElementNow>): UndoPlan {
  const plan: UndoPlan = { batchId, restore: [], remove: [], skip: [] };

  // Свежие записи первыми: если импорт трогал элемент дважды, возвращаем к
  // тому, что было до первого касания
  const byElement = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    if (!byElement.has(r.elementId)) byElement.set(r.elementId, []);
    byElement.get(r.elementId)!.push(r);
  }

  for (const [elementId, list] of byElement) {
    list.sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
    const first = list[0];
    const last = list[list.length - 1];
    const el = elements.get(elementId);

    if (!el) {
      plan.skip.push({ elementId, itemCode: '—', where: '', action: 'skip', reason: 'элемента уже нет' });
      continue;
    }

    if (first.changeType === 'CREATE') {
      // Элемент завёл этот импорт. Удаляем, только если после него никто не
      // трогал: иначе человек уже вложил в него работу
      if (!sameSpecs(el.specs, last.newSpecs)) {
        plan.skip.push({ elementId, itemCode: el.itemCode, where: el.where, action: 'skip', reason: 'после импорта его правили вручную' });
      } else {
        plan.remove.push({ elementId, itemCode: el.itemCode, where: el.where, action: 'remove' });
      }
      continue;
    }

    // Обновление: возвращаем то, что было до импорта
    if (!sameSpecs(el.specs, last.newSpecs)) {
      plan.skip.push({ elementId, itemCode: el.itemCode, where: el.where, action: 'skip', reason: 'характеристики уже изменили после импорта' });
      continue;
    }
    plan.restore.push({
      elementId, itemCode: el.itemCode, where: el.where, action: 'restore',
      specs: first.oldSpecs, version: first.version,
    });
  }

  const byCode = (a: UndoItem, b: UndoItem) => a.itemCode.localeCompare(b.itemCode, 'ru');
  plan.restore.sort(byCode); plan.remove.sort(byCode); plan.skip.sort(byCode);
  return plan;
}

/** Момент импорта, зашитый в идентификатор партии: imp-<мс>-<хвост> */
export function batchTime(batchId: string): number {
  const m = /^imp-(\d+)-/.exec(String(batchId || ''));
  return m ? Number(m[1]) : 0;
}

/** Короткая сводка для подтверждения человеком */
export function describePlan(plan: UndoPlan): string {
  const parts: string[] = [];
  if (plan.restore.length) parts.push(`вернём характеристики: ${plan.restore.length}`);
  if (plan.remove.length) parts.push(`удалим заведённые импортом: ${plan.remove.length}`);
  if (plan.skip.length) parts.push(`пропустим (уже правили): ${plan.skip.length}`);
  return parts.length ? parts.join(', ') : 'отменять нечего';
}
