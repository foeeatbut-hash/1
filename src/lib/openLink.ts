/**
 * Открыть ссылку — одним способом на всю программу.
 *
 * Раньше каждая ссылка решала за себя: заметка звала системный браузер, чат —
 * тоже, письмо открывало новую вкладку окна. Человек нажимал ссылку в письме и
 * оказывался в Windows, а вернуться в программу мог только через панель задач,
 * потеряв место. Теперь ссылка открывается вкладкой браузера рядом с работой.
 *
 * Наружу, в системный браузер, уходит только то, что человек отправил туда сам
 * (кнопка «Открыть в браузере Windows»), и всё подряд в вебе, где своего
 * браузера нет.
 */

/** Событие для оболочки: «открой это вкладкой браузера» */
export const OPEN_URL_EVENT = 'flux:open-url';

const desktop = (): boolean => !!(window as any).electron?.browser;

export function openLink(url: string): void {
  const target = String(url || '').trim();
  if (!target) return;

  if (desktop()) {
    try {
      window.dispatchEvent(new CustomEvent(OPEN_URL_EVENT, { detail: target }));
      return;
    } catch (_) { /* событие не ушло — открываем как раньше */ }
  }

  const win = window as any;
  if (win.electron?.ipcRenderer?.invoke) {
    win.electron.ipcRenderer.invoke('shell:open-external', target).catch(() => window.open(target, '_blank'));
    return;
  }
  window.open(target, '_blank', 'noopener');
}
