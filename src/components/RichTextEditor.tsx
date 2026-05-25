import React, { useRef, useEffect, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Table, Grid2X2, Plus, Minus, Check, Minimize2 } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Введите текст заметки...', className = '', disabled = false }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    bulletList: false,
    orderedList: false,
  });

  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [showTableModal, setShowTableModal] = useState(false);

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

  const insertTable = () => {
    let tableHtml = `<table class="w-full border-collapse border border-slate-300 dark:border-slate-700 my-3 rounded-lg overflow-hidden text-sm">`;
    tableHtml += `<thead><tr class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">`;
    for (let c = 0; c < tableCols; c++) {
      tableHtml += `<th class="border border-slate-300 dark:border-slate-700 p-2 text-left">Заголовок ${c + 1}</th>`;
    }
    tableHtml += `</tr></thead><tbody>`;
    for (let r = 0; r < tableRows - 1; r++) {
      tableHtml += `<tr>`;
      for (let c = 0; c < tableCols; c++) {
        tableHtml += `<td class="border border-slate-300 dark:border-slate-700 p-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Ячейка</td>`;
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><p><br></p>`;

    executeCommand('insertHTML', tableHtml);
    setShowTableModal(false);
  };

  // Find parent element in contenteditable
  const findParentTag = (tagName: string): HTMLElement | null => {
    const selection = window.getSelection();
    if (!selection || rangeCountEmpty(selection)) return null;
    
    let node: Node | null = selection.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.nodeName.toUpperCase() === tagName.toUpperCase()) {
        return node as HTMLElement;
      }
      node = node.parentNode;
    }
    return null;
  };

  const rangeCountEmpty = (selection: Selection) => {
    return selection.rangeCount === 0;
  };

  const addRow = () => {
    const tr = findParentTag('TR');
    if (tr && tr.parentNode) {
      const newTr = document.createElement('tr');
      const cellsCount = tr.children.length;
      for (let i = 0; i < cellsCount; i++) {
        const td = document.createElement('td');
        td.className = "border border-slate-300 dark:border-slate-700 p-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200";
        td.innerHTML = "Ячейка";
        newTr.appendChild(td);
      }
      tr.parentNode.insertBefore(newTr, tr.nextSibling);
      handleInput();
    } else {
      alert("Поставьте курсор в ячейку таблицы, чтобы добавить строку!");
    }
  };

  const deleteRow = () => {
    const tr = findParentTag('TR');
    if (tr && tr.parentNode) {
      tr.parentNode.removeChild(tr);
      handleInput();
    } else {
      alert("Поставьте курсор в ячейку таблицы, чтобы удалить строку!");
    }
  };

  const addColumn = () => {
    const table = findParentTag('TABLE');
    if (table) {
      const rows = table.querySelectorAll('tr');
      rows.forEach((row, index) => {
        const isHeader = row.parentNode?.nodeName.toUpperCase() === 'THEAD' || row.querySelector('th') !== null;
        const cell = document.createElement(isHeader ? 'th' : 'td');
        cell.className = isHeader 
          ? "border border-slate-300 dark:border-slate-700 p-2 text-left bg-slate-100 dark:bg-slate-800 font-semibold"
          : "border border-slate-300 dark:border-slate-700 p-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200";
        cell.innerHTML = isHeader ? `Заголовок` : "Ячейка";
        row.appendChild(cell);
      });
      handleInput();
    } else {
      alert("Поставьте курсор в ячейку таблицы, чтобы добавить столбец!");
    }
  };

  const deleteColumn = () => {
    const cell = findParentTag('TD') || findParentTag('TH');
    const table = findParentTag('TABLE');
    if (cell && table) {
      const colIndex = Array.prototype.indexOf.call(cell.parentNode?.children || [], cell);
      if (colIndex !== -1) {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          if (row.children[colIndex]) {
            row.removeChild(row.children[colIndex]);
          }
        });
        handleInput();
      }
    } else {
      alert("Поставьте курсор в ячейку таблицы, чтобы удалить столбец!");
    }
  };

  return (
    <div className={`flex flex-col border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950 transition-colors ${className}`}>
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 select-none">
        
        {/* Basic formatting */}
        <button
          type="button"
          onClick={() => executeCommand('bold')}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${activeFormats.bold ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'}`}
          title="Жирный"
        >
          <Bold className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('italic')}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${activeFormats.italic ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'}`}
          title="Курсив"
        >
          <Italic className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('underline')}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${activeFormats.underline ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'}`}
          title="Подчеркнутый"
        >
          <Underline className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('strikeThrough')}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${activeFormats.strikeThrough ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'}`}
          title="Зачеркнутый"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Lists */}
        <button
          type="button"
          onClick={() => executeCommand('insertUnorderedList')}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${activeFormats.bulletList ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'}`}
          title="Маркированный список"
        >
          <List className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('insertOrderedList')}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${activeFormats.orderedList ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'}`}
          title="Нумерованный список"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Dynamic Table Commands */}
        <button
          type="button"
          onClick={() => setShowTableModal(true)}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 text-xs font-medium"
          title="Вставить таблицу"
        >
          <Table className="w-4 h-4 text-sky-600 dark:text-sky-450" />
          <span>Таблица</span>
        </button>

        <button
          type="button"
          onClick={addRow}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-0.5 text-xs font-semibold"
          title="Добавить строку снизу"
        >
          <Plus className="w-3 h-3 text-emerald-600" />
          <span>Строку</span>
        </button>

        <button
          type="button"
          onClick={deleteRow}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-0.5 text-xs font-semibold"
          title="Удалить текущую строку"
        >
          <Minus className="w-3 h-3 text-rose-500" />
          <span>Строку</span>
        </button>

        <button
          type="button"
          onClick={addColumn}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-0.5 text-xs"
          title="Добавить столбец справа"
        >
          <Plus className="w-3 h-3 text-emerald-600" />
          <span>Столбец</span>
        </button>

        <button
          type="button"
          onClick={deleteColumn}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-0.5 text-xs"
          title="Удалить текущий столбец"
        >
          <Minus className="w-3 h-3 text-rose-500" />
          <span>Столбец</span>
        </button>
      </div>

      {/* TABLE SETUPS POPOVER MODAL */}
      {showTableModal && (
        <div className="p-3 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 text-xs animate-fadeIn select-none">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400">Строк:</span>
            <input
              type="number"
              min="1"
              max="20"
              value={tableRows}
              onChange={(e) => setTableRows(parseInt(e.target.value) || 2)}
              className="w-12 px-1.5 py-0.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded text-center text-slate-800 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400">Столбцов:</span>
            <input
              type="number"
              min="1"
              max="20"
              value={tableCols}
              onChange={(e) => setTableCols(parseInt(e.target.value) || 2)}
              className="w-12 px-1.5 py-0.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded text-center text-slate-800 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={insertTable}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Вставить</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTableModal(false)}
            className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 rounded font-medium cursor-pointer transition-colors"
          >
            Отмена
          </button>
        </div>
      )}

      {/* EDITOR WORK AREA */}
      <div 
        id="editor-body"
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onClick={updateActiveFormats}
        onKeyUp={updateActiveFormats}
        className={`flex-1 min-h-[220px] p-4 text-sm text-slate-800 dark:text-slate-200 outline-none overflow-y-auto prose dark:prose-invert max-w-none focus:bg-slate-50/20 dark:focus:bg-slate-950/20 transition-all`}
        style={{ direction: 'ltr' }}
      />
    </div>
  );
}
