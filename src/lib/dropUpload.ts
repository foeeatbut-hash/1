/**
 * Отправка принесённых файлов на сервер — одна на стол и на Проводник.
 *
 * Правила приёма (что берём, под каким именем, что говорим) живут отдельно, в
 * dropFiles.ts: у них есть правильный ответ, и его проверяет скрипт. Здесь —
 * сама отправка, которой нужен браузер, поэтому её проверяют живой пробой.
 *
 * Один путь на два приёмника не ради экономии строк: пока стол и Проводник
 * принимали файлы по-своему, одно и то же движение мышью давало разный
 * результат — и разошлись они настолько, что стол не принимал файлы вовсе.
 */
import { planDrop, typeOf, dropResult, MAX_FILE_BYTES } from './dropFiles';

export interface UploadTarget {
  /** Папка Проводника; null — корень раздела */
  folderId: string | null;
  scope?: 'SHARED' | 'PERSONAL';
  ownerId?: string | null;
  /** Кто принёс — для полей «создал» и «изменил» */
  userId?: string | null;
}

export interface UploadOutcome {
  ok: number;
  /** Что отклонили правилами и почему */
  refused: { name: string; why: string }[];
  /** Что не дошло до сервера */
  failed: string[];
  /** Строка для человека */
  said: string;
}

/** Предел размера файла спрашивается у сервера: он зависит от базы */
let limitCache = 0;
export async function fileLimit(): Promise<number> {
  if (limitCache) return limitCache;
  try {
    const res = await fetch('/api/limits');
    const d = await res.json();
    limitCache = Number(d?.maxFileBytes) || MAX_FILE_BYTES;
  } catch (_) {
    limitCache = MAX_FILE_BYTES;
  }
  return limitCache;
}

/**
 * Откуда файл принесли. В программе путь спрашивается у оболочки, в браузере
 * его не знает никто — и это нормально: выгрузка тогда просто не подставит
 * папку, а спросит.
 */
export function originOf(file: File): string {
  try {
    const e = (window as any).electron;
    return e?.pathOfFile ? String(e.pathOfFile(file) || '') : '';
  } catch (_) {
    return '';
  }
}

const readAsDataUrl = (file: File): Promise<string | undefined> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result || '') || undefined);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(file);
  });

/**
 * Отправить принесённые файлы. `taken` — имена, уже занятые в папке.
 * `onProgress` зовётся после каждого файла: перенос большой книги — дело не
 * мгновенное, и человек должен видеть, что оно идёт.
 */
export async function uploadDropped(
  files: File[],
  target: UploadTarget,
  taken: Iterable<string> = [],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadOutcome> {
  const max = await fileLimit();
  const plan = planDrop(files, taken, max);
  const failed: string[] = [];
  let ok = 0;

  for (let i = 0; i < plan.accepted.length; i++) {
    const { file, name } = plan.accepted[i];
    const content = await readAsDataUrl(file);
    if (!content) { failed.push(name); onProgress?.(i + 1, plan.accepted.length); continue; }
    try {
      const scopeLabel = target.scope === 'PERSONAL' ? 'personal' : 'shared';
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          folderId: target.folderId,
          ...(target.scope ? { scope: target.scope, ownerId: target.ownerId } : {}),
          filePath: `/${scopeLabel}/${name}`,
          size: file.size,
          type: typeOf(name),
          department: 'Unassigned',
          content,
          origin: originOf(file),
          createdById: target.userId,
          updatedById: target.userId,
        }),
      });
      if (res.ok) ok++;
      else failed.push(name);
    } catch (_) {
      failed.push(name);
    }
    onProgress?.(i + 1, plan.accepted.length);
  }

  return { ok, refused: plan.refused, failed, said: dropResult(ok, plan.refused, failed) };
}

/**
 * Файлы из переноса. Отдельной функцией, потому что у переноса из Windows и
 * переноса своих значков одно и то же событие: если не отделить одно от
 * другого, стол либо не примет файл, либо «примет» собственный значок.
 */
export function filesFrom(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  try {
    return Array.from(dt.files || []);
  } catch (_) {
    return [];
  }
}

/** Несут ли файлы Windows — это видно ещё до того, как отпустили кнопку */
export function carriesFiles(dt: DataTransfer | null): boolean {
  try {
    return !!dt && Array.from(dt.types || []).includes('Files');
  } catch (_) {
    return false;
  }
}
