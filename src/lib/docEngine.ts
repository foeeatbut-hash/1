/**
 * Переходник к движку документов: применить стиль к выделению, не перезагружая
 * редактор.
 *
 * Зачем он вообще нужен. У движка есть готовые команды на выравнивание абзаца,
 * но не на междустрочный интервал и отступы — а именно их тянут с линейки.
 * Делать это перезаписью снапшота с перезагрузкой нельзя: при каждом движении
 * мыши пропадал бы курсор и место в документе. Поэтому изменение уходит той же
 * мутацией, которой пользуется само выравнивание (RichTextEditingMutation), —
 * то есть попадает в отмену, в совместное редактирование и в автосохранение
 * ровно так же, как обычный набор текста.
 *
 * Внутренности движка нарочно собраны в одном файле: если Univer сменит их в
 * следующей версии, ломается только этот модуль, а не экран редактора. Всё, что
 * здесь может не получиться, возвращает false, и вызывающий показывает человеку
 * честное «не удалось», а не молча теряет правку.
 */
import {
  BuildTextUtils, JSONX, TextX, MemoryCursor, TextXActionType, UpdateDocsAttributeType,
} from '@univerjs/core';

/** Мутация правки текста: тот же путь, что у штатных команд движка */
const RICH_TEXT_EDITING = 'doc.mutation.rich-text-editing';

/**
 * Отправить мутацию синхронно — как это делают сами команды движка
 * (doc.command.align-action и соседние).
 *
 * Асинхронный executeCommand возвращает обещание, и Boolean(обещание) — всегда
 * true: любая неудача превращалась в «получилось», а сама ошибка вылетала
 * необработанным отклонением в журнал. Синхронный вызов возвращает настоящий
 * ответ и бросает исключение сюда, в наш try, — вызывающий показывает честное
 * «не удалось». Плюс операция строится и применяется без промежутка: при
 * перетаскивании бегунка мышь успевала выдать следующую правку по уже
 * устаревшему снимку.
 */
function runMutation(ctx: EngineCtx, params: any): boolean {
  const api = ctx.univerAPI;
  if (typeof api?.syncExecuteCommand === 'function') {
    return Boolean(api.syncExecuteCommand(RICH_TEXT_EDITING, params));
  }
  // Движок без синхронного вызова — старая версия. Отклонение гасим сами,
  // иначе оно уйдёт в журнал как критическая ошибка программы.
  const p = api?.executeCommand?.(RICH_TEXT_EDITING, params);
  if (p && typeof p.catch === 'function') p.catch(() => {});
  return Boolean(p);
}

export interface EngineCtx {
  /** Экземпляр Univer — из него берём внедрение зависимостей */
  univer: any;
  univerAPI: any;
  /** Модуль пресета: оттуда берём службу выделения (ядро её не отдаёт) */
  preset: any;
  /** Документ фасада — снапшот и идентификатор */
  fdoc: any;
}

/** Стиль абзаца: только то, чем управляет линейка и кнопка интервала */
export interface ParagraphPatch {
  lineSpacing?: number | null;
  spaceAbove?: { v: number } | null;
  spaceBelow?: { v: number } | null;
  indentFirstLine?: { v: number } | null;
  indentStart?: { v: number } | null;
  indentEnd?: { v: number } | null;
}

function selectionRanges(ctx: EngineCtx): any[] {
  try {
    const service = ctx.univer?.__getInjector?.().get(ctx.preset?.DocSelectionManagerService);
    const ranges = service?.getDocRanges?.() || [];
    return Array.isArray(ranges) ? ranges : [];
  } catch (_) { return []; }
}

/** Абзацы, попавшие в выделение. Пустое выделение — абзац под курсором. */
function selectedParagraphs(ctx: EngineCtx): { paragraphs: any[]; ranges: any[] } | null {
  const ranges = selectionRanges(ctx);
  if (!ranges.length) return null;
  // Курсор в колонтитуле: там своя область правки, линейкой её не трогаем
  if (ranges[0]?.segmentId) return null;
  const snap = ctx.fdoc?.getSnapshot?.();
  const paragraphs = snap?.body?.paragraphs;
  const dataStream = snap?.body?.dataStream;
  if (!Array.isArray(paragraphs) || typeof dataStream !== 'string') return null;
  try {
    const hit = BuildTextUtils.range.getParagraphsInRanges(ranges as any, paragraphs, dataStream);
    return hit?.length ? { paragraphs: hit, ranges } : null;
  } catch (_) { return null; }
}

/** Стиль первого выделенного абзаца — чтобы линейка и кнопки показывали текущее */
export function readParagraphStyle(ctx: EngineCtx): any | null {
  const found = selectedParagraphs(ctx);
  return found ? (found.paragraphs[0]?.paragraphStyle ?? {}) : null;
}

/**
 * Применить стиль ко всем выделенным абзацам.
 * Значение null удаляет свойство — «как в документе по умолчанию» это не то же
 * самое, что «одинарный интервал».
 */
export function patchParagraphs(ctx: EngineCtx, patch: ParagraphPatch): boolean {
  const found = selectedParagraphs(ctx);
  if (!found) return false;
  const unitId = ctx.fdoc?.getId?.();
  if (!unitId) return false;

  try {
    const textX = new TextX();
    const jsonX = JSONX.getInstance();
    const cursor = new MemoryCursor();
    cursor.reset();

    for (const paragraph of found.paragraphs) {
      const { startIndex } = paragraph;
      const style: any = { ...(paragraph.paragraphStyle || {}) };
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined) delete style[key];
        else style[key] = value;
      }
      textX.push({ t: TextXActionType.RETAIN, len: startIndex - cursor.cursor });
      textX.push({
        t: TextXActionType.RETAIN,
        len: 1,
        body: { dataStream: '', paragraphs: [{ ...paragraph, paragraphStyle: style, startIndex: 0 }] },
        coverType: UpdateDocsAttributeType.REPLACE,
      });
      cursor.moveCursorTo(startIndex + 1);
    }

    return runMutation(ctx, {
      unitId,
      actions: jsonX.editOp(textX.serialize(), ['body']),
      // Выделение сохраняем: иначе после каждой правки курсор прыгает в начало
      textRanges: found.ranges,
    });
  } catch (_) { return false; }
}

/**
 * Поле страницы — свойство всего документа. Меняем той же мутацией, поэтому
 * лист перерисовывается сразу, отмена работает, и перезагружать редактор (с
 * потерей курсора и места) не нужно.
 */
export function patchDocumentStyle(ctx: EngineCtx, patch: Record<string, any>): boolean {
  const unitId = ctx.fdoc?.getId?.();
  const snap = ctx.fdoc?.getSnapshot?.();
  if (!unitId || !snap) return false;
  try {
    const jsonX = JSONX.getInstance();
    const current = snap.documentStyle || {};
    const actions: any[] = [];
    for (const [key, value] of Object.entries(patch)) {
      const path = ['documentStyle', key];
      // Свойства раньше не было — вставка; было — замена. Перепутать нельзя:
      // движок применяет операцию буквально и на несоответствии ломает документ.
      const op = current[key] === undefined
        ? jsonX.insertOp(path, value)
        : jsonX.replaceOp(path, current[key], value);
      if (op) actions.push(op);
    }
    if (!actions.length) return false;
    const composed = actions.length === 1 ? actions[0] : actions.reduce((a, b) => JSONX.compose(a, b));
    return runMutation(ctx, { unitId, actions: composed, textRanges: selectionRanges(ctx) });
  } catch (_) { return false; }
}

/**
 * Масштаб полотна — чтобы линейка была ровно по ширине листа.
 *
 * Берём только масштаб, а положение листа считаем от середины полотна: лист
 * движок рисует по центру (измерено — центр листа совпадает с центром полотна
 * с точностью до полосы прокрутки). Искать объект листа в сцене было бы точнее
 * на бумаге, но эта часть движка не описана и меняется между версиями, а
 * ошибка на пару пикселей делает линейку хуже, чем её отсутствие.
 */
export function readZoom(ctx: EngineCtx): number {
  try {
    const unitId = ctx.fdoc?.getId?.();
    const render = ctx.univer?.__getInjector?.().get(ctx.preset?.IRenderManagerService)?.getRenderById?.(unitId);
    const zoom = Number(render?.scene?.scaleX);
    return isFinite(zoom) && zoom > 0 ? zoom : 1;
  } catch (_) { return 1; }
}
