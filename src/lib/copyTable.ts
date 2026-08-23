/**
 * «Скопировать как таблицу»: список из программы — сразу в Ворд или Эксель.
 *
 * Зачем не выгрузка файлом. Чаще всего нужно три строки в письмо или в протокол
 * совещания, а выгрузка заставляет создать файл, найти его, открыть, выделить и
 * удалить. Через буфер это одно нажатие.
 *
 * В буфер кладём сразу два вида: обычный текст с табуляциями (его Эксель
 * разложит по столбцам) и HTML-таблицу (её Ворд вставит настоящей таблицей с
 * рамками). Приложение само возьмёт тот вид, который понимает.
 */

const esc = (v: any) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Табы и переводы строк внутри ячейки ломают разбор — заменяем пробелами */
const flat = (v: any) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

export function tableToText(rows: Record<string, any>[], columns?: string[]): string {
  if (!rows.length) return '';
  const cols = columns || Object.keys(rows[0]);
  return [cols.join('\t'), ...rows.map(r => cols.map(c => flat(r[c])).join('\t'))].join('\n');
}

export function tableToHtml(rows: Record<string, any>[], columns?: string[]): string {
  if (!rows.length) return '';
  const cols = columns || Object.keys(rows[0]);
  const head = cols.map(c => `<th style="border:1px solid #999;padding:4px 8px;background:#f0f0f0;text-align:left">${esc(c)}</th>`).join('');
  const body = rows.map(r =>
    `<tr>${cols.map(c => `<td style="border:1px solid #999;padding:4px 8px">${esc(flat(r[c]))}</td>`).join('')}</tr>`).join('');
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Положить таблицу в буфер обмена.
 *
 * Возвращает false, а не бросает: вызывающий показывает человеку понятное
 * «не удалось скопировать», а не белый экран. Отказать буфер может законно —
 * например, когда окно потеряло фокус.
 */
export async function copyAsTable(rows: Record<string, any>[], columns?: string[]): Promise<boolean> {
  if (!rows.length) return false;
  const text = tableToText(rows, columns);
  const html = tableToHtml(rows, columns);
  try {
    const nav: any = navigator;
    if (nav?.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await nav.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
      return true;
    }
    if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(text); return true; }
  } catch (_) { /* ниже — запасной путь */ }

  // Запасной путь для окружений без разрешения на буфер: скрытое поле и
  // старая команда копирования. Работает и в Electron, и в браузере.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) { return false; }
}
