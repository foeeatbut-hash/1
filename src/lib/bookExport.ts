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
