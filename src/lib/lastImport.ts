/**
 * Последний ввоз расчёта — чтобы его можно было отменить.
 *
 * Держим в браузере, а не в базе: отменяет тот, кто импортировал, и делает это
 * почти сразу — «не туда залил, верните как было». Ставить ради этого запись в
 * общую базу и показывать кнопку отмены всем коллегам было бы хуже: чужой откат
 * посреди работы неотличим от поломки.
 *
 * Через неделю предложение пропадает. Отмена месячной давности опаснее самой
 * ошибки: за это время по данным уже что-то заказали.
 */
export interface LastImport {
  batchId: string;
  at: number;
  files: number;
}

const KEY = (projectId: string) => `flux_last_import_${projectId || 'default'}`;
const WEEK = 7 * 24 * 60 * 60 * 1000;

export function rememberImport(projectId: string, batchId: string, files: number): void {
  if (!batchId) return;
  try {
    localStorage.setItem(KEY(projectId), JSON.stringify({ batchId, at: Date.now(), files } as LastImport));
  } catch (_) {}
}

export function readLastImport(projectId: string): LastImport | null {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (!raw) return null;
    const v = JSON.parse(raw) as LastImport;
    if (!v?.batchId || !v.at || Date.now() - v.at > WEEK) { forgetImport(projectId); return null; }
    return v;
  } catch (_) { return null; }
}

export function forgetImport(projectId: string): void {
  try { localStorage.removeItem(KEY(projectId)); } catch (_) {}
}
