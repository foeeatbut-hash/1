/**
 * Куда уходит собранная книга: на диск Windows или в Проводник.
 *
 * Вынесено из экрана Конструктора не ради его размера, а потому что это два
 * разных ответа на один вопрос «отдать людям» — и отвечать на него должны
 * одинаково и книга, и текстовый документ. Пока это лежало в экране, книга
 * уходила скачиванием мимо человека (в «Загрузки», где и терялась), а документ
 * Word спрашивал папку.
 */
import * as XLSX from 'xlsx';
import { saveBytes, type SaveResult } from './saveToWindows';

/**
 * Снимок книги Конструктора → книга SheetJS.
 *
 * Живёт рядом с выгрузкой, а не в экране: превращение снимка в книгу нужно и
 * тому, кто сохраняет на диск, и тому, кто кладёт файл в Проводник, — а два
 * одинаковых превращения однажды разошлись бы.
 */
export function bookFromSnapshot(snapshotJson: string): any {
  let snap: any = {};
  try { snap = JSON.parse(snapshotJson || '{}'); } catch (_) { snap = {}; }
  const wb = XLSX.utils.book_new();
  const order: string[] = snap.sheetOrder || Object.keys(snap.sheets || {});
  for (const sheetId of order) {
    const sh = snap.sheets?.[sheetId];
    if (!sh) continue;
    const aoa: any[][] = [];
    const cellData = sh.cellData || {};
    for (const rk of Object.keys(cellData)) {
      const r = Number(rk);
      for (const ck of Object.keys(cellData[rk] || {})) {
        const c = Number(ck);
        if (!aoa[r]) aoa[r] = [];
        aoa[r][c] = cellData[rk][ck]?.v ?? '';
      }
    }
    const wsx = XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [[]]);
    // Имя листа в Excel не длиннее 31 символа — иначе книга не откроется
    XLSX.utils.book_append_sheet(wb, wsx, (sh.name || 'Лист').slice(0, 31));
  }
  return wb;
}

/** Книга → настоящий файл .xlsx на диске, через окно сохранения Windows */
export async function saveBookToWindows(workbook: any, name: string): Promise<SaveResult> {
  const fileName = name.endsWith('.xlsx') ? name : `${name}.xlsx`;
  const bytes = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
  return saveBytes(fileName, bytes);
}

/** Книга → файл в Проводнике: отдать коллеге, не пересылая почтой */
export async function saveBookToExplorer(workbook: any, name: string, userId?: string | null): Promise<string> {
  const fileName = name.endsWith('.xlsx') ? name : `${name}.xlsx`;
  const b64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const res = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: fileName,
      filePath: `/shared/${fileName}`,
      // base64 длиннее содержимого на треть — размер считаем от него обратно
      size: Math.round(b64.length * 0.75),
      type: 'XLSX',
      content: b64,
      createdById: userId || null,
    }),
  });
  if (!res.ok) throw new Error(`Сервер ответил ${res.status}`);
  return fileName;
}
