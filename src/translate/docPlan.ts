/**
 * Английская версия документа: что переводить и куда класть перевод.
 *
 * Документ — это снимок книги: листы, ячейки, стили, формулы, объединения.
 * Переводить в нём можно только текст ячеек, и это не осторожность: число,
 * пересчитанное «переводом», и формула, потерявшая ссылку, — это уже не
 * английская версия, а другой документ.
 *
 * Четыре вида двуязычия просил владелец, и каждый нужен своему случаю:
 *  • file   — второй файл: заказчику уходят два документа, и каждый цельный;
 *  • sheet  — второй лист той же книги: структура и оформление копируются;
 *  • lines  — две строки в ячейке: как в двуязычных бланках и опросных листах;
 *  • column — столбец рядом: реестры, где заказчик читает обе колонки сразу.
 *
 * Столбец рядом сдвигает содержимое вправо, и формулы после такого сдвига
 * ссылались бы не туда. Поэтому на листе с формулами этот вид не предлагается —
 * молча испортить ссылки хуже, чем честно сказать «здесь так нельзя».
 */
import { nothingToTranslate } from './protect';
import { fingerprint } from './segment';

export type BiMode = 'file' | 'sheet' | 'lines' | 'column';

export const BI_MODES: { id: BiMode; label: string; hint: string }[] = [
  { id: 'file', label: 'Второй файл', hint: 'Отдельный английский документ рядом с русским' },
  { id: 'sheet', label: 'Второй лист', hint: 'Лист «English» в той же книге: структура и оформление те же' },
  { id: 'lines', label: 'Две строки в ячейке', hint: 'Русский сверху, английский снизу — как в двуязычных бланках' },
  { id: 'column', label: 'Столбец рядом', hint: 'Английский столбец справа от каждого текстового' },
];

export interface DocCell {
  sheetId: string;
  r: number;
  c: number;
  text: string;
}

export const cellKey = (sheetId: string, r: number, c: number) => `${sheetId}:${r}:${c}`;

/** Листы книги в порядке показа */
function sheetsOf(snap: any): string[] {
  return snap?.sheetOrder?.length ? snap.sheetOrder : Object.keys(snap?.sheets || {});
}

/**
 * Ячейки, которые есть смысл переводить.
 *
 * Формулы, числа, даты и ячейки, где остались одни коды, пропускаются: гнать
 * их через словарь значит засорять и сверку, и память переводов пустышками.
 */
export function collectDocCells(snap: any): DocCell[] {
  const out: DocCell[] = [];
  for (const sheetId of sheetsOf(snap)) {
    const sh = snap?.sheets?.[sheetId];
    if (!sh) continue;
    const cellData = sh.cellData || {};
    for (const rk of Object.keys(cellData)) {
      const row = cellData[rk] || {};
      for (const ck of Object.keys(row)) {
        const cell = row[ck];
        if (!cell || cell.f || cell.si) continue;      // формула и её копии
        const v = cell.v;
        if (typeof v !== 'string' || !v.trim()) continue;
        if (nothingToTranslate(v)) continue;
        out.push({ sheetId, r: Number(rk), c: Number(ck), text: v });
      }
    }
  }
  return out;
}

/** Отпечаток текста документа: по нему видно, что русский изменился */
export function docFingerprint(snap: any): string {
  return fingerprint(collectDocCells(snap).map((c) => c.text));
}

/** Есть ли на листе формулы — от этого зависит, можно ли двигать столбцы */
export function hasFormulas(snap: any, sheetId?: string): boolean {
  for (const id of sheetId ? [sheetId] : sheetsOf(snap)) {
    const cellData = snap?.sheets?.[id]?.cellData || {};
    for (const rk of Object.keys(cellData)) {
      for (const ck of Object.keys(cellData[rk] || {})) {
        if (cellData[rk][ck]?.f) return true;
      }
    }
  }
  return false;
}

/** Виды двуязычия, которые сейчас допустимы для этого документа */
export function modesFor(snap: any): BiMode[] {
  const all: BiMode[] = ['file', 'sheet', 'lines', 'column'];
  return hasFormulas(snap) ? all.filter((m) => m !== 'column') : all;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Перенос строки внутри ячейки виден только с включённым переносом текста */
function setWrap(sh: any, snapStyles: any, r: number, c: number): void {
  const cell = sh.cellData?.[r]?.[c];
  if (!cell) return;
  if (typeof cell.s === 'string') {
    // Стиль общий для многих ячеек — правим копию, чтобы не задеть соседей
    const base = clone(snapStyles?.[cell.s] || {});
    base.tb = 3;
    const id = `${cell.s}_wrap`;
    snapStyles[id] = base;
    cell.s = id;
    return;
  }
  cell.s = { ...(cell.s || {}), tb: 3 };
}

export interface ApplyResult {
  snap: any;
  /** Сколько ячеек изменилось */
  changed: number;
  /** Что не получилось — показывается человеку как есть */
  problem: string;
}

/**
 * Положить перевод в снимок.
 *
 * Снимок не меняется на месте: вызывающий сравнивает «до» и «после» и решает,
 * сохранять ли. Молча переписать открытый документ — самый дорогой способ
 * ошибиться.
 */
export function applyTranslation(snapshot: any, pairs: Map<string, string>, mode: BiMode): ApplyResult {
  const snap = clone(snapshot);
  if (!snap?.sheets) return { snap: snapshot, changed: 0, problem: 'В документе нет листов' };
  snap.styles = snap.styles || {};
  let changed = 0;

  if (mode === 'file' || mode === 'sheet') {
    const targets = mode === 'sheet' ? duplicateSheets(snap) : new Map(sheetsOf(snap).map((id) => [id, id]));
    for (const [srcId, dstId] of targets) {
      const sh = snap.sheets[dstId];
      if (!sh) continue;
      for (const rk of Object.keys(sh.cellData || {})) {
        for (const ck of Object.keys(sh.cellData[rk] || {})) {
          const dst = pairs.get(cellKey(srcId, Number(rk), Number(ck)));
          if (!dst) continue;
          sh.cellData[rk][ck].v = dst;
          changed++;
        }
      }
    }
    return { snap, changed, problem: '' };
  }

  if (mode === 'lines') {
    for (const sheetId of sheetsOf(snap)) {
      const sh = snap.sheets[sheetId];
      if (!sh) continue;
      for (const rk of Object.keys(sh.cellData || {})) {
        for (const ck of Object.keys(sh.cellData[rk] || {})) {
          const dst = pairs.get(cellKey(sheetId, Number(rk), Number(ck)));
          const cell = sh.cellData[rk][ck];
          if (!dst || typeof cell?.v !== 'string') continue;
          if (cell.v.includes(dst)) continue;          // уже двуязычная ячейка
          cell.v = `${cell.v}\n${dst}`;
          setWrap(sh, snap.styles, Number(rk), Number(ck));
          changed++;
        }
      }
    }
    return { snap, changed, problem: '' };
  }

  // mode === 'column'
  if (hasFormulas(snap)) {
    return { snap: snapshot, changed: 0, problem: 'На листе есть формулы: сдвиг столбцов увёл бы их ссылки' };
  }
  for (const sheetId of sheetsOf(snap)) {
    const sh = snap.sheets[sheetId];
    if (!sh) continue;
    changed += spreadColumns(sh, sheetId, pairs);
  }
  return { snap, changed, problem: '' };
}

/** Скопировать каждый лист книги рядом; возвращает пары «источник → копия» */
function duplicateSheets(snap: any): Map<string, string> {
  const pairs = new Map<string, string>();
  const order = sheetsOf(snap).slice();
  for (const id of order) {
    const src = snap.sheets[id];
    if (!src) continue;
    const copyId = `${id}_en`;
    const copy = clone(src);
    copy.id = copyId;
    copy.name = `${String(src.name || 'Лист').slice(0, 25)} EN`;
    snap.sheets[copyId] = copy;
    snap.sheetOrder = [...(snap.sheetOrder || order), copyId];
    pairs.set(id, copyId);
  }
  return pairs;
}

/**
 * Раздвинуть лист: справа от каждого текстового столбца встаёт английский.
 *
 * Сдвигаются и ячейки, и ширины столбцов, и объединения — иначе шапка
 * «Наименование», объединённая на две колонки, накроет собой перевод.
 */
function spreadColumns(sh: any, sheetId: string, pairs: Map<string, string>): number {
  const cellData = sh.cellData || {};
  const cols = new Set<number>();
  for (const rk of Object.keys(cellData)) {
    for (const ck of Object.keys(cellData[rk] || {})) {
      if (pairs.get(cellKey(sheetId, Number(rk), Number(ck)))) cols.add(Number(ck));
    }
  }
  if (!cols.size) return 0;
  const sorted = [...cols].sort((a, b) => a - b);
  const shift = (c: number) => c + sorted.filter((x) => x < c).length;

  const next: any = {};
  let changed = 0;
  for (const rk of Object.keys(cellData)) {
    const row = cellData[rk] || {};
    const outRow: any = {};
    for (const ck of Object.keys(row)) {
      const c = Number(ck);
      const at = shift(c);
      outRow[at] = row[ck];
      if (!cols.has(c)) continue;
      const dst = pairs.get(cellKey(sheetId, Number(rk), c));
      // Оформление берём у соседа слева: перевод должен выглядеть так же,
      // как то, что он переводит, — иначе таблица расслаивается на две
      outRow[at + 1] = dst
        ? { ...clone(row[ck]), v: dst, f: undefined, si: undefined }
        : { ...clone(row[ck]), v: '' };
      if (dst) changed++;
    }
    next[rk] = outRow;
  }
  sh.cellData = next;

  if (sh.columnData) {
    const cd: any = {};
    for (const ck of Object.keys(sh.columnData)) {
      const c = Number(ck);
      cd[shift(c)] = sh.columnData[ck];
      if (cols.has(c)) cd[shift(c) + 1] = clone(sh.columnData[ck]);
    }
    sh.columnData = cd;
  }
  if (Array.isArray(sh.mergeData)) {
    sh.mergeData = sh.mergeData.map((m: any) => ({
      ...m,
      startColumn: shift(m.startColumn),
      endColumn: shift(m.endColumn) + (cols.has(m.endColumn) ? 1 : 0),
    }));
  }
  if (typeof sh.columnCount === 'number') sh.columnCount += sorted.length;
  return changed;
}
