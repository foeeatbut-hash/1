/**
 * Куда попадает сбой.
 *
 * Три места, у каждого своя роль, и ни одно не заменяет остальные:
 *
 *   — ФАЙЛ на рабочем столе, в папке «Flux — журналы». Человек может открыть
 *     его и отдать целиком, никого не спрашивая. Раньше файлы лежали в AppData
 *     под именами вида `pdm-crash-log-<время>.txt`, и найти их не мог никто;
 *   — ЖУРНАЛ ПРОГРАММЫ (раздел «Журнал»): там сбой виден рядом с тем, что
 *     человек делал до него;
 *   — КАНАЛ «ОШИБКИ» в чате — но только по желанию человека. Отправлять
 *     молча то, что происходит на его машине, нельзя.
 *
 * Здесь — первое и второе. Третье делает человек кнопкой в параметрах.
 */
import { useLogStore } from '../store/logStore';

const api = () => (window as any).electron?.logs || null;

/**
 * Записать сбой. Не бросает: программа, падающая из-за записи о падении, —
 * худшее, что можно придумать.
 */
export function writeCrash(where: string, message: string, details = ''): void {
  try {
    useLogStore.getState().addLog('ERROR', where, message, details);
  } catch (_) { /* журнал недоступен */ }
  try {
    api()?.append({ level: 'ERROR', where, text: `${message}${details ? ` — ${details.slice(0, 2000)}` : ''}` });
  } catch (_) { /* файл недоступен — остаётся журнал программы */ }
}

/** Обычная запись в файл: запуск, вход, смена базы */
export function writeNote(where: string, message: string): void {
  try { api()?.append({ level: 'INFO', where, text: message }); } catch (_) { /* не записалось */ }
}

/** Сегодняшний журнал целиком — его прикладывают к сообщению об ошибке */
export async function todayLog(): Promise<string> {
  try { return String((await api()?.today()) || ''); } catch (_) { return ''; }
}

export async function logsFolder(): Promise<string> {
  try { return String((await api()?.folder()) || ''); } catch (_) { return ''; }
}

export async function openLogsFolder(): Promise<void> {
  try { await api()?.openFolder(); } catch (_) { /* папку не открыть */ }
}

export const hasLogFiles = (): boolean => !!api();
