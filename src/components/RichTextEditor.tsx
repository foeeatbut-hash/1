import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Table, Check, AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo2, Redo2, Eraser, Baseline, Highlighter, Indent, Outdent, Link2, CheckSquare, SeparatorHorizontal, CalendarClock, Search, ExternalLink, Pencil, Unlink, Rows3, Columns3, Trash2, Tag as TagIcon, Image as ImageIcon } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Теги проекта для вставки внутренних ссылок («#3700-…») */
  projectTags?: { id: string; identifier: string }[];
  /** Клик по вставленной ссылке на тег */
  onTagNavigate?: (tagId: string, identifier: string) => void;
}

// Открытие внешней ссылки: в Electron — через системный браузер, в вебе — новая вкладка
function openExternal(url: string) {
  const win = window as any;
  if (win.electron?.ipcRenderer?.invoke) {
    win.electron.ipcRenderer.invoke('shell:open-external', url).catch(() => window.open(url, '_blank'));
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

// Палитры адаптируются к теме: тёмный текст невидим на тёмном фоне
const TEXT_COLORS_LIGHT = ['#0f172a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0284c7', '#7c3aed', '#db2777'];
const TEXT_COLORS_DARK = ['#f1f5f9', '#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6'];
const HIGHLIGHT_COLORS_LIGHT = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e9d5ff', 'transparent'];
const HIGHLIGHT_COLORS_DARK = ['#713f12', '#14532d', '#1e3a8a', '#831843', '#7c2d12', '#581c87', 'transparent'];

// Стили чек-бокса чек-листа — инлайновые, чтобы сохранялись в HTML заметки и в экспорте
const CLBOX_BASE = 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;border:1.5px solid #94a3b8;margin-right:8px;cursor:pointer;font-size:11px;line-height:1;user-select:none;vertical-align:-3px;flex:none;';
const CLBOX_ON = CLBOX_BASE + 'background:#059669;border-color:#059669;color:#fff;';

function makeChecklistItemHTML(text = '') {
  return `<li style="display:flex;align-items:flex-start;margin:3px 0;list-style:none;">` +
    `<span data-clbox="1" contenteditable="false" style="${CLBOX_BASE}"></span>` +
    `<span style="flex:1;min-width:0;">${text || '<br>'}</span></li>`;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Введите текст заметки...', className = '', disabled = false, projectTags, onTagNavigate }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false, italic: false, underline: false, strikeThrough: false, bulletList: false, orderedList: false,
  });

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const TEXT_COLORS = isDark ? TEXT_COLORS_DARK : TEXT_COLORS_LIGHT;
  const HIGHLIGHT_COLORS = isDark ? HIGHLIGHT_COLORS_DARK : HIGHLIGHT_COLORS_LIGHT;

  const [showColorPalette, setShowColorPalette] = useState<null | 'text' | 'highlight'>(null);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState('');

  // Вставка таблицы: сетка как в Word (наведение — размер, клик — вставить)
  const [showTableGrid, setShowTableGrid] = useState(false);
  const [gridHover, setGridHover] = useState({ r: 0, c: 0 });

  // Контекстное меню таблицы (ПКМ по ячейке)
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number } | null>(null);
  const tableMenuCellRef = useRef<HTMLTableCellElement | null>(null);

  // Всплывающее окно ссылки: вставка и редактирование (window.prompt в Electron не работает)
  const [linkPopover, setLinkPopover] = useState<{ x: number; y: number; mode: 'insert' | 'edit' } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const linkAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // Плашка действий по клику на ссылку: Открыть / Изменить / Убрать
  const [linkBubble, setLinkBubble] = useState<{ x: number; y: number; href: string } | null>(null);

  // Вставка ссылки на тег проекта («#3700-…» внутри заметки)
  const [tagPopover, setTagPopover] = useState<{ x: number; y: number } | null>(null);
  const [tagSearch, setTagSearch] = useState('');

  useEffect(() => {
    try { document.execCommand('styleWithCSS', false, 'true'); } catch (e) {}
  }, []);

  // Sync value from parent with local state to avoid losing cursor focus
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const executeCommand = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
    updateActiveFormats();
    handleInput();
  };

  const updateActiveFormats = () => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      bulletList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    });
  };

  // ── Таблицы ────────────────────────────────────────────────────────────────

  const TD_CLASS = 'border border-slate-300 dark:border-slate-700 p-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200';
  const TH_CLASS = 'border border-slate-300 dark:border-slate-700 p-2 text-left bg-slate-100 dark:bg-slate-800 font-semibold';

  const insertTableGrid = (rows: number, cols: number) => {
    let tableHtml = `<table class="w-full border-collapse border border-slate-300 dark:border-slate-700 my-3 rounded-lg overflow-hidden text-sm">`;
    tableHtml += `<thead><tr class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">`;
    for (let c = 0; c < cols; c++) tableHtml += `<th class="${TH_CLASS}"><br></th>`;
    tableHtml += `</tr></thead><tbody>`;
    for (let r = 0; r < rows - 1; r++) {
      tableHtml += `<tr>`;
      for (let c = 0; c < cols; c++) tableHtml += `<td class="${TD_CLASS}"><br></td>`;
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><p><br></p>`;
    editorRef.current?.focus();
    executeCommand('insertHTML', tableHtml);
    setShowTableGrid(false);
  };

  const cellOf = (node: Node | null): HTMLTableCellElement | null => {
    let n: Node | null = node;
    while (n && n !== editorRef.current) {
      if (n.nodeName === 'TD' || n.nodeName === 'TH') return n as HTMLTableCellElement;
      n = n.parentNode;
    }
    return null;
  };

  const tableOps = {
    rowAbove: (cell: HTMLTableCellElement) => {
      const tr = cell.closest('tr'); if (!tr || !tr.parentNode) return;
      tr.parentNode.insertBefore(buildRow(tr), tr);
    },
    rowBelow: (cell: HTMLTableCellElement) => {
      const tr = cell.closest('tr'); if (!tr || !tr.parentNode) return;
      tr.parentNode.insertBefore(buildRow(tr), tr.nextSibling);
    },
    colLeft: (cell: HTMLTableCellElement) => insertColumn(cell, 0),
    colRight: (cell: HTMLTableCellElement) => insertColumn(cell, 1),
    deleteRow: (cell: HTMLTableCellElement) => {
      const tr = cell.closest('tr'); const table = cell.closest('table');
      if (tr?.parentNode) tr.parentNode.removeChild(tr);
      if (table && !table.querySelector('td, th')) table.remove();
    },
    deleteCol: (cell: HTMLTableCellElement) => {
      const table = cell.closest('table'); if (!table) return;
      const idx = Array.prototype.indexOf.call(cell.parentNode?.children || [], cell);
      if (idx < 0) return;
      table.querySelectorAll('tr').forEach(row => { if (row.children[idx]) row.removeChild(row.children[idx]); });
      if (!table.querySelector('td, th')) table.remove();
    },
    deleteTable: (cell: HTMLTableCellElement) => { cell.closest('table')?.remove(); },
  };

  const buildRow = (templateTr: HTMLTableRowElement): HTMLTableRowElement => {
    const newTr = document.createElement('tr');
    for (let i = 0; i < templateTr.children.length; i++) {
      const td = document.createElement('td');
      td.className = TD_CLASS;
      td.innerHTML = '<br>';
      newTr.appendChild(td);
    }
    return newTr;
  };

  const insertColumn = (cell: HTMLTableCellElement, offset: 0 | 1) => {
    const table = cell.closest('table'); if (!table) return;
    const idx = Array.prototype.indexOf.call(cell.parentNode?.children || [], cell);
    if (idx < 0) return;
    table.querySelectorAll('tr').forEach(row => {
      const isHeader = row.querySelector('th') !== null;
      const c = document.createElement(isHeader ? 'th' : 'td');
      c.className = isHeader ? TH_CLASS : TD_CLASS;
      c.innerHTML = '<br>';
      const ref = row.children[idx + offset] || null;
      row.insertBefore(c, ref);
    });
  };

  const runTableOp = (op: keyof typeof tableOps) => {
    const cell = tableMenuCellRef.current;
    setTableMenu(null);
    if (!cell) return;
    tableOps[op](cell);
    handleInput();
  };

  // ── Ссылки ─────────────────────────────────────────────────────────────────

  const openLinkInsert = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    savedRangeRef.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    setLinkUrl('https://');
    setLinkText(sel ? sel.toString().trim() : '');
    linkAnchorRef.current = null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setLinkPopover({ x: rect.left, y: rect.bottom + 6, mode: 'insert' });
    setLinkBubble(null);
  };

  const openLinkEdit = (anchor: HTMLAnchorElement, x: number, y: number) => {
    linkAnchorRef.current = anchor;
    setLinkUrl(anchor.getAttribute('href') || 'https://');
    setLinkText(anchor.textContent || '');
    setLinkPopover({ x, y, mode: 'edit' });
    setLinkBubble(null);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url || url === 'https://') { setLinkPopover(null); return; }
    const safeUrl = /^(https?:|mailto:|file:)/i.test(url) ? url : `https://${url}`;
    if (linkPopover?.mode === 'edit' && linkAnchorRef.current) {
      linkAnchorRef.current.setAttribute('href', safeUrl);
      if (linkText.trim()) linkAnchorRef.current.textContent = linkText.trim();
      handleInput();
    } else {
      editorRef.current?.focus();
      const sel = window.getSelection();
      if (savedRangeRef.current && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
      const display = linkText.trim() || safeUrl;
      const hasSelection = sel && sel.toString().trim().length > 0 && !linkText.trim();
      if (hasSelection) {
        executeCommand('createLink', safeUrl);
        // createLink не ставит target — дополняем
        editorRef.current?.querySelectorAll(`a[href="${safeUrl}"]`).forEach(a => {
          a.setAttribute('rel', 'noopener'); (a as HTMLElement).className = 'text-emerald-600 underline';
        });
        handleInput();
      } else {
        executeCommand('insertHTML', `<a href="${safeUrl}" rel="noopener" class="text-emerald-600 underline">${display}</a>&nbsp;`);
      }
    }
    setLinkPopover(null);
  };

  const removeLink = () => {
    if (linkAnchorRef.current) {
      const a = linkAnchorRef.current;
      const text = document.createTextNode(a.textContent || '');
      a.parentNode?.replaceChild(text, a);
      handleInput();
    }
    setLinkBubble(null);
    setLinkPopover(null);
  };

  // ── Чек-лист ───────────────────────────────────────────────────────────────

  const insertChecklist = () => {
    editorRef.current?.focus();
    executeCommand('insertHTML',
      `<ul data-checklist="1" style="list-style:none;padding-left:2px;margin:8px 0;">${makeChecklistItemHTML('Пункт списка')}</ul><p><br></p>`
    );
  };

  const toggleClbox = (box: HTMLElement) => {
    const on = box.getAttribute('data-checked') === '1';
    if (on) {
      box.removeAttribute('data-checked');
      box.setAttribute('style', CLBOX_BASE);
      box.textContent = '';
    } else {
      box.setAttribute('data-checked', '1');
      box.setAttribute('style', CLBOX_ON);
      box.textContent = '✓';
    }
    const li = box.closest('li') as HTMLElement | null;
    if (li) {
      li.style.textDecoration = !on ? 'line-through' : 'none';
      li.style.opacity = !on ? '0.65' : '1';
    }
    handleInput();
  };

  // ── Клики в редакторе: чек-боксы, ссылки, обновление форматов ─────────────

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Новый чек-лист (span-галочка)
    const clbox = target.closest?.('[data-clbox]') as HTMLElement | null;
    if (clbox) {
      e.preventDefault();
      toggleClbox(clbox);
      return;
    }

    // Старые чек-листы (input) — обратная совместимость с уже сохранёнными заметками
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
      const cb = target as HTMLInputElement;
      if (cb.checked) cb.setAttribute('checked', 'checked');
      else cb.removeAttribute('checked');
      const li = cb.closest('li') as HTMLElement | null;
      if (li) li.style.textDecoration = cb.checked ? 'line-through' : 'none';
      handleInput();
      return;
    }

    // Ссылка на тег проекта — переход в раздел «Теги» с фокусом на позиции
    const tagAnchor = target.closest?.('a[data-tag-id]') as HTMLAnchorElement | null;
    if (tagAnchor && editorRef.current?.contains(tagAnchor)) {
      e.preventDefault();
      onTagNavigate?.(tagAnchor.dataset.tagId || '', tagAnchor.dataset.tagName || '');
      return;
    }

    // Ссылки: Ctrl+клик — открыть сразу; обычный клик — плашка действий
    const anchor = target.closest?.('a') as HTMLAnchorElement | null;
    if (anchor && editorRef.current?.contains(anchor)) {
      e.preventDefault();
      const href = anchor.getAttribute('href') || '';
      if (e.ctrlKey || e.metaKey) {
        if (href) openExternal(href);
      } else {
        const rect = anchor.getBoundingClientRect();
        linkAnchorRef.current = anchor;
        setLinkBubble({ x: rect.left, y: rect.bottom + 4, href });
      }
      return;
    }

    setLinkBubble(null);
    updateActiveFormats();
  };

  // ПКМ по ячейке таблицы — контекстное меню операций (как в Word)
  const handleEditorContextMenu = (e: React.MouseEvent) => {
    const cell = cellOf(e.target as Node);
    if (cell) {
      e.preventDefault();
      tableMenuCellRef.current = cell;
      setTableMenu({ x: e.clientX, y: e.clientY });
    }
  };

  // ── Клавиатура: Tab по ячейкам, Enter в чек-листе ──────────────────────────

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    // Tab / Shift+Tab: переход по ячейкам таблицы; Tab в последней ячейке добавляет строку
    if (e.key === 'Tab') {
      const sel = window.getSelection();
      const cell = cellOf(sel?.anchorNode || null);
      if (cell) {
        e.preventDefault();
        const table = cell.closest('table')!;
        const cells = Array.from(table.querySelectorAll('td, th')) as HTMLTableCellElement[];
        const idx = cells.indexOf(cell);
        let targetCell: HTMLTableCellElement | null = null;
        if (e.shiftKey) {
          targetCell = cells[idx - 1] || null;
        } else if (idx === cells.length - 1) {
          const tr = cell.closest('tr')!;
          const newTr = buildRow(tr);
          tr.parentNode!.insertBefore(newTr, tr.nextSibling);
          targetCell = newTr.firstElementChild as HTMLTableCellElement;
          handleInput();
        } else {
          targetCell = cells[idx + 1];
        }
        if (targetCell) {
          const range = document.createRange();
          range.selectNodeContents(targetCell);
          range.collapse(true);
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(range);
        }
        return;
      }
    }

    // Enter в чек-листе: продолжить список новой галочкой; на пустом пункте — выйти
    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      let node: Node | null = sel?.anchorNode || null;
      let li: HTMLElement | null = null;
      while (node && node !== editorRef.current) {
        if (node.nodeName === 'LI' && (node.parentNode as HTMLElement)?.getAttribute?.('data-checklist')) {
          li = node as HTMLElement;
          break;
        }
        node = node.parentNode;
      }
      if (li) {
        e.preventDefault();
        const textSpan = li.querySelector('span:not([data-clbox])') as HTMLElement | null;
        const isEmpty = !(textSpan?.textContent || '').trim();
        const ul = li.parentElement!;
        if (isEmpty) {
          // Пустой пункт: выходим из списка обычным абзацем
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          ul.parentNode!.insertBefore(p, ul.nextSibling);
          li.remove();
          if (!ul.querySelector('li')) ul.remove();
          const range = document.createRange();
          range.selectNodeContents(p);
          range.collapse(true);
          sel?.removeAllRanges(); sel?.addRange(range);
        } else {
          const tmp = document.createElement('template');
          tmp.innerHTML = makeChecklistItemHTML('');
          const newLi = tmp.content.firstElementChild as HTMLElement;
          li.parentNode!.insertBefore(newLi, li.nextSibling);
          const target = newLi.querySelector('span:not([data-clbox])') as HTMLElement;
          const range = document.createRange();
          range.selectNodeContents(target);
          range.collapse(true);
          sel?.removeAllRanges(); sel?.addRange(range);
        }
        handleInput();
        return;
      }
    }
  };

  // ── Картинки: файлом и вставкой из буфера (скриншоты) ──
  const imageInputRef = useRef<HTMLInputElement>(null);
  const insertImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      editorRef.current?.focus();
      executeCommand('insertHTML', `<img src="${reader.result}" style="max-width:100%;border-radius:8px;margin:4px 0;" alt="" /><br>`);
    };
    reader.readAsDataURL(file);
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) { e.preventDefault(); insertImageFile(f); return; }
      }
    }
  };

  // Счётчик слов/символов — обновляется на вводе
  const [countInfo, setCountInfo] = useState({ words: 0, chars: 0 });
  const recount = useCallback(() => {
    const text = editorRef.current?.innerText || '';
    const words = (text.match(/[А-Яа-яA-Za-z0-9ёЁ]+/g) || []).length;
    setCountInfo({ words, chars: text.replace(/\s/g, '').length });
  }, []);
  useEffect(() => { recount(); }, [value, recount]);

  // Вставка сегодняшней даты и времени
  const insertDateTime = () => {
    const d = new Date();
    const str = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    executeCommand('insertHTML', `<strong>${str}</strong>&nbsp;`);
  };

  // ── Ссылка на тег проекта ─────────────────────────────────────────────────
  const openTagInsert = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    savedRangeRef.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    setTagSearch('');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTagPopover({ x: rect.left, y: rect.bottom + 6 });
  };

  const insertTagLink = (tag: { id: string; identifier: string }) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    // Инлайновые стили — чтобы чип выглядел одинаково в заметке, стикере и экспорте
    const style = 'display:inline-block;padding:1px 6px;margin:0 2px;border-radius:6px;border:1px solid #a7f3d0;background:#ecfdf5;color:#047857;font-weight:700;font-size:12px;text-decoration:none;cursor:pointer;user-select:none;';
    executeCommand('insertHTML',
      `<a data-tag-id="${tag.id}" data-tag-name="${tag.identifier}" contenteditable="false" style="${style}" title="Открыть тег в разделе «Теги»">#${tag.identifier}</a>&nbsp;`);
    setTagPopover(null);
  };

  // Поиск по заметке (подсветка встроенным поиском Chromium)
  const runFind = () => {
    if (!findText.trim()) return;
    try { (window as any).find?.(findText, false, false, true); } catch (_) {}
  };

  // Закрытие всплывающих панелей по клику мимо и Esc
  useEffect(() => {
    if (!tableMenu && !linkBubble && !showTableGrid && !linkPopover && !tagPopover) return;
    const close = () => { setTableMenu(null); setLinkBubble(null); setShowTableGrid(false); setTagPopover(null); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); setLinkPopover(null); }
    };
    window.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('keydown', onKey);
    function closeOnOutside(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.closest?.('[data-rte-popup]')) return;
      close();
    }
    return () => {
      window.removeEventListener('mousedown', closeOnOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [tableMenu, linkBubble, showTableGrid, linkPopover, tagPopover]);

  const toolBtn = 'p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer';
  const toolBtnActive = 'p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold cursor-pointer';

  return (
    <div className={`flex flex-col border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950 transition-colors ${className}`}>
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 select-none">

        <button type="button" onClick={() => executeCommand('bold')} className={activeFormats.bold ? toolBtnActive : toolBtn} title="Жирный (Ctrl+B)"><Bold className="w-4 h-4" /></button>
        <button type="button" onClick={() => executeCommand('italic')} className={activeFormats.italic ? toolBtnActive : toolBtn} title="Курсив (Ctrl+I)"><Italic className="w-4 h-4" /></button>
        <button type="button" onClick={() => executeCommand('underline')} className={activeFormats.underline ? toolBtnActive : toolBtn} title="Подчеркнутый (Ctrl+U)"><Underline className="w-4 h-4" /></button>
        <button type="button" onClick={() => executeCommand('strikeThrough')} className={activeFormats.strikeThrough ? toolBtnActive : toolBtn} title="Зачеркнутый"><Strikethrough className="w-4 h-4" /></button>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Заголовки и размер шрифта */}
        <select
          onChange={(e) => { if (e.target.value) { executeCommand('formatBlock', e.target.value); e.target.value = ''; } }}
          defaultValue=""
          className="h-7 px-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 cursor-pointer outline-none"
          title="Стиль абзаца"
        >
          <option value="" disabled>Стиль</option>
          <option value="p">Обычный</option>
          <option value="h1">Заголовок 1</option>
          <option value="h2">Заголовок 2</option>
          <option value="h3">Заголовок 3</option>
          <option value="blockquote">Цитата</option>
        </select>

        <select
          onChange={(e) => { if (e.target.value) { executeCommand('fontSize', e.target.value); e.target.value = ''; } }}
          defaultValue=""
          className="h-7 px-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 cursor-pointer outline-none"
          title="Размер текста"
        >
          <option value="" disabled>Размер</option>
          <option value="1">Мелкий</option>
          <option value="3">Обычный</option>
          <option value="5">Крупный</option>
          <option value="7">Очень крупный</option>
        </select>

        <select
          onChange={(e) => { if (e.target.value) { executeCommand('fontName', e.target.value); e.target.value = ''; } }}
          defaultValue=""
          className="h-7 px-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 cursor-pointer outline-none max-w-[90px]"
          title="Шрифт"
        >
          <option value="" disabled>Шрифт</option>
          <option value="Arial">Arial</option>
          <option value="Calibri">Calibri</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Georgia">Georgia</option>
          <option value="Courier New">Courier New</option>
          <option value="Verdana">Verdana</option>
        </select>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Цвет текста и выделение */}
        <div className="relative" data-rte-popup>
          <button type="button" onClick={() => setShowColorPalette(showColorPalette === 'text' ? null : 'text')} className={toolBtn} title="Цвет текста">
            <Baseline className="w-4 h-4" />
          </button>
          {showColorPalette === 'text' && (
            <div className="absolute top-full left-0 mt-1 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl flex gap-1 z-50">
              {TEXT_COLORS.map(c => (
                <button key={c} type="button" onMouseDown={(e) => { e.preventDefault(); executeCommand('foreColor', c); setShowColorPalette(null); }}
                  className="w-5 h-5 rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
        </div>

        <div className="relative" data-rte-popup>
          <button type="button" onClick={() => setShowColorPalette(showColorPalette === 'highlight' ? null : 'highlight')} className={toolBtn} title="Цвет выделения (маркер)">
            <Highlighter className="w-4 h-4" />
          </button>
          {showColorPalette === 'highlight' && (
            <div className="absolute top-full left-0 mt-1 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl flex gap-1 z-50">
              {HIGHLIGHT_COLORS.map(c => (
                <button key={c} type="button" onMouseDown={(e) => { e.preventDefault(); executeCommand('hiliteColor', c); setShowColorPalette(null); }}
                  className="w-5 h-5 rounded border border-slate-300 dark:border-slate-600 cursor-pointer hover:scale-110 transition-transform"
                  style={{ backgroundColor: c === 'transparent' ? (isDark ? '#0f172a' : 'white') : c, backgroundImage: c === 'transparent' ? 'linear-gradient(45deg, transparent 45%, #f43f5e 45%, #f43f5e 55%, transparent 55%)' : undefined }}
                  title={c === 'transparent' ? 'Убрать выделение' : undefined} />
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Выравнивание */}
        <button type="button" onClick={() => executeCommand('justifyLeft')} className={toolBtn} title="По левому краю"><AlignLeft className="w-4 h-4" /></button>
        <button type="button" onClick={() => executeCommand('justifyCenter')} className={toolBtn} title="По центру"><AlignCenter className="w-4 h-4" /></button>
        <button type="button" onClick={() => executeCommand('justifyRight')} className={toolBtn} title="По правому краю"><AlignRight className="w-4 h-4" /></button>
        <button type="button" onClick={() => executeCommand('justifyFull')} className={toolBtn} title="По ширине"><AlignJustify className="w-4 h-4" /></button>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Отступы */}
        <button type="button" onClick={() => executeCommand('indent')} className={toolBtn} title="Увеличить отступ"><Indent className="w-4 h-4" /></button>
        <button type="button" onClick={() => executeCommand('outdent')} className={toolBtn} title="Уменьшить отступ"><Outdent className="w-4 h-4" /></button>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Списки */}
        <button type="button" onClick={() => executeCommand('insertUnorderedList')} className={activeFormats.bulletList ? toolBtnActive : toolBtn} title="Маркированный список"><List className="w-4 h-4" /></button>
        <button type="button" onClick={() => executeCommand('insertOrderedList')} className={activeFormats.orderedList ? toolBtnActive : toolBtn} title="Нумерованный список"><ListOrdered className="w-4 h-4" /></button>
        <button type="button" onClick={insertChecklist} className={toolBtn} title="Чек-лист: клик по галочке отмечает пункт, Enter продолжает список">
          <CheckSquare className="w-4 h-4 text-emerald-600" />
        </button>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Ссылка */}
        <button type="button" onClick={openLinkInsert} className={toolBtn} title="Вставить ссылку (клик по ссылке в тексте — открыть/изменить)">
          <Link2 className="w-4 h-4 text-sky-600" />
        </button>
        {projectTags && projectTags.length > 0 && (
          <button type="button" onClick={openTagInsert} className={toolBtn} title="Вставить ссылку на тег проекта (клик по тегу в тексте — открыть его в «Тегах»)">
            <TagIcon className="w-4 h-4 text-emerald-600" />
          </button>
        )}

        {/* Горизонтальная линия и дата */}
        <button type="button" onClick={() => executeCommand('insertHorizontalRule')} className={toolBtn} title="Горизонтальная линия"><SeparatorHorizontal className="w-4 h-4" /></button>
        <button type="button" onClick={insertDateTime} className={toolBtn} title="Вставить дату и время"><CalendarClock className="w-4 h-4" /></button>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Таблица: сетка как в Word; операции — ПКМ по ячейке */}
        <div className="relative" data-rte-popup>
          <button type="button" onClick={() => setShowTableGrid(v => !v)} className={`${toolBtn} flex items-center gap-1.5 text-xs font-medium`} title="Вставить таблицу (операции со строками/столбцами — правой кнопкой по ячейке)">
            <Table className="w-4 h-4 text-sky-600" />
            <span>Таблица</span>
          </button>
          {showTableGrid && (
            <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50">
              <div className="grid grid-cols-10 gap-0.5" onMouseLeave={() => setGridHover({ r: 0, c: 0 })}>
                {Array.from({ length: 8 }).map((_, r) =>
                  Array.from({ length: 10 }).map((_, c) => (
                    <div
                      key={`${r}-${c}`}
                      onMouseEnter={() => setGridHover({ r: r + 1, c: c + 1 })}
                      onMouseDown={(e) => { e.preventDefault(); insertTableGrid(r + 1, c + 1); }}
                      className={`w-4 h-4 rounded-sm border cursor-pointer ${
                        r < gridHover.r && c < gridHover.c
                          ? 'bg-emerald-500 border-emerald-600'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    />
                  ))
                )}
              </div>
              <div className="text-center text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 font-mono">
                {gridHover.r > 0 ? `${gridHover.r} × ${gridHover.c}` : 'Выберите размер'}
              </div>
            </div>
          )}
        </div>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* История и очистка форматирования */}
        <button type="button" onClick={() => executeCommand('undo')} className={toolBtn} title="Отменить (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
        <button type="button" onClick={() => executeCommand('redo')} className={toolBtn} title="Повторить (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
        <button type="button" onClick={() => { executeCommand('removeFormat'); executeCommand('formatBlock', 'p'); }} className={toolBtn} title="Очистить форматирование"><Eraser className="w-4 h-4" /></button>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Картинка: файлом или вставкой из буфера (Ctrl+V со скриншотом) */}
        <button type="button" onClick={() => imageInputRef.current?.click()} className={toolBtn} title="Вставить картинку (или Ctrl+V со скриншотом)">
          <ImageIcon className="w-4 h-4" />
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) insertImageFile(f); e.target.value = ''; }} />

        {/* Поиск по заметке */}
        <button type="button" onClick={() => setShowFind(v => !v)} className={showFind ? toolBtnActive : toolBtn} title="Найти в заметке">
          <Search className="w-4 h-4" />
        </button>
        {showFind && (
          <input
            type="text"
            autoFocus
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runFind(); } }}
            placeholder="Найти… (Enter — далее)"
            className="h-7 px-2 text-xs rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 outline-none w-40"
          />
        )}
      </div>

      {/* EDITOR WORK AREA */}
      <div
        id="editor-body"
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onClick={handleEditorClick}
        onContextMenu={handleEditorContextMenu}
        onKeyDown={handleEditorKeyDown}
        onKeyUp={updateActiveFormats}
        onPaste={handlePaste}
        className={`flex-1 min-h-[220px] p-4 text-sm text-slate-800 dark:text-slate-200 outline-none overflow-y-auto prose dark:prose-invert max-w-none focus:bg-slate-50/20 dark:focus:bg-slate-950/20 transition-all`}
        style={{ direction: 'ltr' }}
      />

      {/* Счётчик слов и символов */}
      <div className="shrink-0 px-4 py-1 text-[10px] text-slate-400 dark:text-slate-600 border-t border-slate-100 dark:border-slate-800 select-none">
        {countInfo.words} слов · {countInfo.chars} символов
      </div>

      {/* Всплывающее окно вставки/редактирования ссылки */}
      {linkPopover && createPortal(
        <div
          data-rte-popup
          className="fixed z-[140] p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-72 space-y-1.5"
          style={{ left: Math.min(linkPopover.x, window.innerWidth - 300), top: Math.min(linkPopover.y, window.innerHeight - 140) }}
        >
          <input
            autoFocus
            type="text"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }}
            placeholder="Адрес: https://…"
            className="w-full h-7 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-400"
          />
          <input
            type="text"
            value={linkText}
            onChange={e => setLinkText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }}
            placeholder="Текст ссылки (необязательно)"
            className="w-full h-7 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-400"
          />
          <div className="flex items-center gap-1.5 pt-0.5">
            <button type="button" onClick={applyLink} className="flex-1 h-7 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer flex items-center justify-center gap-1">
              <Check className="w-3.5 h-3.5" /> {linkPopover.mode === 'edit' ? 'Сохранить' : 'Вставить'}
            </button>
            {linkPopover.mode === 'edit' && (
              <button type="button" onClick={removeLink} className="h-7 px-2 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-500 text-xs cursor-pointer" title="Убрать ссылку">
                <Unlink className="w-3.5 h-3.5" />
              </button>
            )}
            <button type="button" onClick={() => setLinkPopover(null)} className="h-7 px-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs cursor-pointer">
              Отмена
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Всплывающий выбор тега проекта для вставки */}
      {tagPopover && createPortal(
        <div
          data-rte-popup
          className="fixed z-[140] p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-72"
          style={{ left: Math.min(tagPopover.x, window.innerWidth - 300), top: Math.min(tagPopover.y, window.innerHeight - 300) }}
        >
          <input
            autoFocus
            type="text"
            value={tagSearch}
            onChange={e => setTagSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); setTagPopover(null); }
              if (e.key === 'Enter') {
                e.preventDefault();
                const list = (projectTags || []).filter(t => t.identifier.toLowerCase().includes(tagSearch.toLowerCase()));
                if (list[0]) insertTagLink(list[0]);
              }
            }}
            placeholder="Поиск тега…"
            className="w-full h-7 px-2 mb-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-400"
          />
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {(projectTags || [])
              .filter(t => t.identifier.toLowerCase().includes(tagSearch.toLowerCase()))
              .slice(0, 50)
              .map(t => (
                <button key={t.id} type="button" onMouseDown={(e) => { e.preventDefault(); insertTagLink(t); }}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <TagIcon className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="truncate">{t.identifier}</span>
                </button>
              ))}
            {(projectTags || []).filter(t => t.identifier.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && (
              <p className="px-2 py-2 text-xs text-slate-400">Ничего не найдено.</p>
            )}
          </div>
          <button type="button" onClick={() => setTagPopover(null)} className="mt-1.5 h-6 px-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs cursor-pointer">
            Отмена
          </button>
        </div>,
        document.body
      )}

      {/* Плашка действий по клику на ссылку */}
      {linkBubble && createPortal(
        <div
          data-rte-popup
          className="fixed z-[140] flex items-center gap-0.5 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl text-xs"
          style={{ left: Math.min(linkBubble.x, window.innerWidth - 260), top: Math.min(linkBubble.y, window.innerHeight - 44) }}
        >
          <span className="px-1.5 text-slate-400 max-w-[140px] truncate font-mono" title={linkBubble.href}>{linkBubble.href}</span>
          <button type="button" onClick={() => { openExternal(linkBubble.href); setLinkBubble(null); }} className="p-1.5 rounded hover:bg-sky-50 dark:hover:bg-sky-950/40 text-sky-600 cursor-pointer" title="Открыть (или Ctrl+клик по ссылке)">
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => { if (linkAnchorRef.current) openLinkEdit(linkAnchorRef.current, linkBubble.x, linkBubble.y); }} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer" title="Изменить">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={removeLink} className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 cursor-pointer" title="Убрать ссылку">
            <Unlink className="w-3.5 h-3.5" />
          </button>
        </div>,
        document.body
      )}

      {/* Контекстное меню таблицы */}
      {tableMenu && createPortal(
        <div
          data-rte-popup
          className="fixed z-[140] py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl text-xs min-w-[210px]"
          style={{ left: Math.min(tableMenu.x, window.innerWidth - 230), top: Math.min(tableMenu.y, window.innerHeight - 260) }}
        >
          {([
            ['rowAbove', 'Вставить строку выше', Rows3],
            ['rowBelow', 'Вставить строку ниже', Rows3],
            ['colLeft', 'Вставить столбец слева', Columns3],
            ['colRight', 'Вставить столбец справа', Columns3],
          ] as const).map(([op, label, Icon]) => (
            <button key={op} type="button" onClick={() => runTableOp(op)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer">
              <Icon className="w-3.5 h-3.5 text-emerald-600" /> {label}
            </button>
          ))}
          <div className="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-2" />
          {([
            ['deleteRow', 'Удалить строку'],
            ['deleteCol', 'Удалить столбец'],
            ['deleteTable', 'Удалить таблицу'],
          ] as const).map(([op, label]) => (
            <button key={op} type="button" onClick={() => runTableOp(op)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
