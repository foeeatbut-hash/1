/**
 * Выгрузка ответа помощника: тот же список, но файлом.
 *
 * Отдельно от хранилища разговора по одной причине: библиотека xlsx весит
 * около 900 КБ, а хранилище поднимается при старте программы. Статический
 * импорт держал бы всю библиотеку в стартовом куске ради кнопки, которую
 * нажимают раз в неделю, — поэтому она грузится по требованию.
 */
import type { AssistantTable } from './types';

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

export async function exportTableToExcel(table: AssistantTable) {
  const XLSX = await import('xlsx');
  const aoa = [table.columns, ...table.rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Данные');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  triggerDownload(new Blob([out], { type: 'application/octet-stream' }), `PDM_${ts}.xlsx`);
}

export function exportTableToWord(table: AssistantTable) {
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
