/**
 * «Выгрузить в Windows»: файл или документ ложится на диск человека.
 *
 * Одно место на всю программу, а не кнопка в каждом разделе. Выгрузка книги,
 * документа Word и обычного файла — одно и то же действие с точки зрения
 * человека, и вести себя оно обязано одинаково: спросить папку, положить файл,
 * сказать, куда положил.
 *
 * В программе открывается обычное окно сохранения Windows и, если известно,
 * откуда файл когда-то принесли, предлагается та же папка. В браузере окна
 * сохранения нет — там это обычное скачивание.
 */
import { buildDocx, partsFromText } from './docxWrite';

export interface SaveResult {
  ok: boolean;
  /** Куда легло — это и говорится человеку */
  path: string;
  /** Человек передумал: это не ошибка и ругаться не надо */
  canceled: boolean;
  error: string;
}

const elec = (): any => (typeof window !== 'undefined' ? (window as any).electron : undefined);

/** base64 из байтов — без промежуточной строки на десятки мегабайт */
export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(bin);
}

/** Скачивание браузером — запасной путь там, где нет окна сохранения */
function downloadInBrowser(name: string, bytes: Uint8Array): SaveResult {
  try {
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, path: name, canceled: false, error: '' };
  } catch (err: any) {
    return { ok: false, path: '', canceled: false, error: String(err?.message || err) };
  }
}

/** Положить байты на диск Windows */
export async function saveBytes(name: string, bytes: Uint8Array, dir = ''): Promise<SaveResult> {
  const e = elec();
  if (!e?.saveFileAs) return downloadInBrowser(name, bytes);
  const r = await e.saveFileAs({ name, base64: toBase64(bytes), dir });
  return {
    ok: !!r?.success,
    path: String(r?.filePath || ''),
    canceled: !!r?.canceled,
    error: String(r?.error || ''),
  };
}

/** Папка из полного пути файла: «C:\Users\И\Смета.xlsx» → «C:\Users\И» */
export function folderOf(fullPath: string): string {
  const p = String(fullPath || '');
  const at = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return at > 0 ? p.slice(0, at) : '';
}

/** Файл Проводника как есть: содержимое лежит строкой data-URL */
export async function saveFileNode(fileId: string): Promise<SaveResult> {
  const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`);
  if (!res.ok) return { ok: false, path: '', canceled: false, error: `Сервер ответил ${res.status}` };
  const d = await res.json();
  const file = d?.file;
  const raw = String(file?.content || '');
  if (!raw) {
    return {
      ok: false, path: '', canceled: false,
      error: 'У файла нет содержимого — выгружать нечего. Скорее всего, он был загружен старой версией программы.',
    };
  }
  const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return saveBytes(String(file.name || 'Файл'), bytes, folderOf(String(file.origin || '')));
}

/** Текстовый документ Flux → настоящий .docx на диске */
export async function saveTextDocAsWord(name: string, text: string, dir = ''): Promise<SaveResult> {
  const clean = name.replace(/\.[^.]+$/, '');
  return saveBytes(`${clean}.docx`, buildDocx(partsFromText(text)), dir);
}
