import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import * as XLSX from 'xlsx';
import {
  Table2, Plus, ArrowLeft, Loader2, Download, FolderOpen, Copy, Trash2,
  RotateCcw, Lock, Users2, Search, ChevronRight, Database, X, CheckCircle2, FileSpreadsheet
} from 'lucide-react';

// ── Конструктор: сборка своих таблиц из данных проекта ──
// Дизайн: docs/constructor-design-v0.25*.md. Реализация MVP (Фаза 1):
// Библиотека (мои/общие/корзина), редактор на движке Univer (полноценная
// таблица: формулы, стили, листы), мастер «Собрать данные» (теги/оборудование →
// колонки из каталога → фильтр → вставка), автосейв, именование при закрытии,
// экспорт XLSX (скачать / в Проводник). Живые блоки и совместное
// редактирование — следующие фазы (части II и IV дизайна).

interface DocMeta {
  id: string; name: string; kind: string; scope: string; ownerId?: string | null;
  named: boolean; createdById?: string | null; updatedById?: string | null;
  deletedAt?: string | null; createdAt: string; updatedAt: string;
}

const RECENT_KEY = (userId: string) => `constructor_recent_${userId}`;

function pushRecent(userId: string, docId: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(RECENT_KEY(userId)) || '[]');
    const next = [docId, ...list.filter(id => id !== docId)].slice(0, 10);
    localStorage.setItem(RECENT_KEY(userId), JSON.stringify(next));
  } catch (_) {}
}

function fmtDate(s: string) {
  try { return new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return s; }
}

// ═══════════════════════ Мастер «Собрать данные» ═══════════════════════

interface CatalogData {
  counts: { tags: number; elements: number };
  tagFields: { path: string; title: string }[];
  elementFields: { path: string; title: string }[];
  params: { group: string; key: string; unit: string; count: number; sample: string }[];
  metaKeys: { path: string; key: string; count: number }[];
}

interface WizardResult {
  headers: string[];
  rows: any[][];
  suggestedName: string;
}

function DataWizard({ projectId, onInsert, onClose }: {
  projectId: string;
  onInsert: (r: WizardResult) => void;
  onClose: () => void;
}) {
  const { addToast } = useToastStore();
  const [step, setStep] = useState(1);
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [entity, setEntity] = useState<'tag' | 'element'>('tag');
  const [selected, setSelected] = useState<{ path: string; title: string }[]>([]);
  const [search, setSearch] = useState('');
  const [filterField, setFilterField] = useState('');
  const [filterOp, setFilterOp] = useState('contains');
  const [filterValue, setFilterValue] = useState('');
  const [preview, setPreview] = useState<{ rows: any[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/constructor/catalog?projectId=${projectId}`)
      .then(r => r.json())
      .then(setCatalog)
      .catch(() => addToast('Не удалось загрузить каталог полей', 'error'));
  }, [projectId]);

  const toggle = (path: string, title: string) => {
    setSelected(prev => prev.find(s => s.path === path)
      ? prev.filter(s => s.path !== path)
      : [...prev, { path, title }]);
  };

  const buildFilters = () => (filterField && (filterValue || filterOp === 'empty' || filterOp === 'nempty'))
    ? [{ field: filterField, op: filterOp, value: filterValue }]
    : [];

  const runQuery = async (limit: number) => {
    const res = await fetch('/api/constructor/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, entity, columns: selected.map(s => s.path), filters: buildFilters(), limit }),
    });
    if (!res.ok) throw new Error('query failed');
    return res.json();
  };

  const loadPreview = async () => {
    setBusy(true);
    try { setPreview(await runQuery(8)); }
    catch (_) { addToast('Ошибка запроса данных', 'error'); }
    finally { setBusy(false); }
  };

  const insert = async () => {
    setBusy(true);
    try {
      const data = await runQuery(50000);
      const entityName = entity === 'tag' ? 'Теги' : 'Оборудование';
      onInsert({
        headers: selected.map(s => s.title),
        rows: data.rows.map((r: any) => r.cells),
        suggestedName: filterValue ? `${entityName}: ${filterValue}` : `${entityName} проекта`,
      });
    } catch (_) { addToast('Ошибка запроса данных', 'error'); }
    finally { setBusy(false); }
  };

  // Дерево доступных колонок для выбранной сущности
  const fields = useMemo(() => {
    if (!catalog) return [] as { path: string; title: string; note?: string }[];
    const base = entity === 'tag' ? catalog.tagFields : catalog.elementFields;
    const meta = entity === 'tag' ? catalog.metaKeys.map(m => ({ path: m.path, title: m.key, note: `${m.count}` })) : [];
    const params = catalog.params.map(p => ({
      path: `param:${p.group}|${p.key}`,
      title: `${p.key}${p.unit ? `, ${p.unit}` : ''}`,
      note: `${p.group} · есть у ${p.count}`,
    }));
    const all = [...base, ...meta, ...params];
    const q = search.trim().toLowerCase();
    return q ? all.filter(f => f.title.toLowerCase().includes(q) || (f as any).note?.toLowerCase?.().includes(q)) : all;
  }, [catalog, entity, search]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Database className="w-4.5 h-4.5 text-emerald-600" /> Собрать данные — шаг {step} из 3
          </h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer"><X className="w-4.5 h-4.5" /></button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'tag' as const, title: 'Теги', desc: 'Реестр тегов проекта: идентификаторы, марки, отделы + параметры связанного оборудования', count: catalog?.counts.tags },
                { key: 'element' as const, title: 'Оборудование', desc: 'Элементы оборудования: позиции, типы, системы + все параметры из бланков', count: catalog?.counts.elements },
              ].map(c => (
                <button key={c.key} onClick={() => { setEntity(c.key); setSelected([]); }}
                  className={`text-left p-5 rounded-xl border-2 transition-all cursor-pointer ${entity === c.key ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                  <div className="font-bold text-slate-800 dark:text-white text-lg">{c.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{c.desc}</div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-3">{c.count ?? '…'} в проекте</div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск поля или параметра…"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <span className="text-xs font-bold text-slate-500 shrink-0">Выбрано: {selected.length}</span>
              </div>
              <div className="max-h-[46vh] overflow-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-850">
                {fields.map(f => {
                  const on = !!selected.find(s => s.path === f.path);
                  return (
                    <label key={f.path} className="flex items-center gap-3 px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => toggle(f.path, f.title)} className="w-4 h-4 accent-emerald-500" />
                      <span className="text-sm text-slate-800 dark:text-slate-200">{f.title}</span>
                      {(f as any).note && <span className="text-[11px] text-slate-400 ml-auto shrink-0">{(f as any).note}</span>}
                    </label>
                  );
                })}
                {fields.length === 0 && <div className="p-6 text-center text-sm text-slate-400">Ничего не найдено</div>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Фильтр строк:</span>
                <select value={filterField} onChange={e => setFilterField(e.target.value)}
                  className="text-sm px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-white">
                  <option value="">— без фильтра (все строки) —</option>
                  {selected.map(s => <option key={s.path} value={s.path}>{s.title}</option>)}
                </select>
                {filterField && (
                  <>
                    <select value={filterOp} onChange={e => setFilterOp(e.target.value)}
                      className="text-sm px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-white">
                      <option value="contains">содержит</option>
                      <option value="eq">равно</option>
                      <option value="neq">не равно</option>
                      <option value="nempty">не пусто</option>
                      <option value="empty">пусто</option>
                    </select>
                    {filterOp !== 'empty' && filterOp !== 'nempty' && (
                      <input value={filterValue} onChange={e => setFilterValue(e.target.value)} placeholder="значение…"
                        className="text-sm px-2.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-white w-44" />
                    )}
                  </>
                )}
                <button onClick={loadPreview} disabled={busy}
                  className="ml-auto text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer flex items-center gap-1.5">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Предпросмотр
                </button>
              </div>

              {preview && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-auto max-h-[40vh]">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-850 sticky top-0">
                      <tr>{selected.map(s => <th key={s.path} className="text-left px-3 py-2 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{s.title}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                      {preview.rows.map((r: any, i: number) => (
                        <tr key={i}>{r.cells.map((c: any, j: number) => <td key={j} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">{String(c)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-850 sticky bottom-0">
                    Показаны первые {preview.rows.length} из {preview.total} строк — вставятся все
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-slate-800">
          <button onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
            {step > 1 ? '← Назад' : 'Отмена'}
          </button>
          {step < 3 ? (
            <button onClick={() => { setStep(step + 1); if (step === 2 && selected.length === 0) return; }}
              disabled={step === 2 && selected.length === 0}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold cursor-pointer flex items-center gap-1.5">
              Далее <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={insert} disabled={busy || selected.length === 0}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold cursor-pointer flex items-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Вставить таблицу
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════ Редактор (движок Univer) ═══════════════════════

function DocEditor({ docId, onClose }: { docId: string; onClose: () => void }) {
  const user = useStore(s => s.user);
  const activeProject = useStore(s => s.activeProject);
  const { addToast } = useToastStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<any>(null);       // { univer, univerAPI }
  const lastSavedRef = useRef<string>('');
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState<null | { suggestion: string }>(null);
  const suggestionRef = useRef<string>('');

  // Снапшот текущей книги (JSON-строка) — для автосейва и экспорта
  const takeSnapshot = (): string => {
    try {
      const wb = univerRef.current?.univerAPI?.getActiveWorkbook?.();
      const data = wb?.save?.();
      return data ? JSON.stringify(data) : '';
    } catch (_) { return ''; }
  };

  const saveNow = async (extra?: Record<string, any>) => {
    const snapshot = takeSnapshot();
    if (!snapshot && !extra) return;
    if (snapshot === lastSavedRef.current && !extra) return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/constructor/docs/${docId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(snapshot ? { workbook: snapshot } : {}), ...(extra || {}) }),
      });
      if (res.ok) {
        if (snapshot) lastSavedRef.current = snapshot;
        const d = await res.json();
        setDoc(d.doc);
        setSaveState('saved');
      } else {
        const d = await res.json().catch(() => ({}));
        if (d.error) addToast(d.error, 'error');
        setSaveState('idle');
      }
    } catch (_) { setSaveState('idle'); }
  };

  // Инициализация движка: загрузка документа → createUniver → книга из снапшота
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const res = await fetch(`/api/constructor/docs/${docId}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          addToast(d.error || 'Не удалось открыть документ', 'error');
          onClose();
          return;
        }
        const { doc: loaded } = await res.json();
        if (disposed) return;
        setDoc(loaded);
        if (user) pushRecent(user.id, docId);

        // Движок подгружается лениво — тяжёлый бандл не попадает в общий чанк
        const [{ createUniver, LocaleType, mergeLocales, defaultTheme }, corePreset, ruRU] = await Promise.all([
          import('@univerjs/presets'),
          import('@univerjs/presets/preset-sheets-core'),
          import('@univerjs/presets/preset-sheets-core/locales/ru-RU'),
        ]);
        await import('@univerjs/presets/lib/styles/preset-sheets-core.css');
        if (disposed || !containerRef.current) return;

        const { univer, univerAPI } = createUniver({
          locale: LocaleType.RU_RU,
          locales: { [LocaleType.RU_RU]: mergeLocales((ruRU as any).default ?? ruRU) },
          theme: defaultTheme,
          presets: [(corePreset as any).UniverSheetsCorePreset({ container: containerRef.current })],
        });
        univerRef.current = { univer, univerAPI };

        let snapshot: any = null;
        try { snapshot = loaded.workbook ? JSON.parse(loaded.workbook) : null; } catch (_) {}
        univerAPI.createWorkbook(snapshot || { name: loaded.name });
        lastSavedRef.current = loaded.workbook || '';
        setLoading(false);
      } catch (err: any) {
        console.error('[Constructor] Ошибка инициализации движка:', err);
        addToast('Не удалось загрузить редактор таблиц', 'error');
        onClose();
      }
    })();

    // Автосейв: раз в 2.5 с, только если снапшот реально изменился
    const timer = setInterval(() => { saveNow(); }, 2500);

    return () => {
      disposed = true;
      clearInterval(timer);
      try { univerRef.current?.univer?.dispose?.(); } catch (_) {}
      univerRef.current = null;
    };
  }, [docId]);

  // Вставка собранной таблицы от активной ячейки (или A1)
  const handleInsert = (r: WizardResult) => {
    setWizardOpen(false);
    suggestionRef.current = r.suggestedName;
    try {
      const api = univerRef.current?.univerAPI;
      const ws = api?.getActiveWorkbook?.()?.getActiveSheet?.();
      if (!ws) return;
      const sel = ws.getSelection?.()?.getActiveRange?.();
      const r0 = sel ? sel.getRow() : 0;
      const c0 = sel ? sel.getColumn() : 0;
      const matrix = [r.headers, ...r.rows];
      ws.getRange(r0, c0, matrix.length, r.headers.length).setValues(matrix);
      try { ws.getRange(r0, c0, 1, r.headers.length).setFontWeight('bold'); } catch (_) {}
      addToast(`Вставлено строк: ${r.rows.length}`, 'success');
      saveNow();
    } catch (err) {
      console.error('[Constructor] Ошибка вставки:', err);
      addToast('Не удалось вставить данные', 'error');
    }
  };

  // Снапшот книги → книга SheetJS (все листы, значения)
  const buildXlsx = () => {
    const snap = JSON.parse(takeSnapshot() || '{}');
    const wb = XLSX.utils.book_new();
    const order: string[] = snap.sheetOrder || Object.keys(snap.sheets || {});
    for (const sheetId of order) {
      const sh = snap.sheets?.[sheetId];
      if (!sh) continue;
      const aoa: any[][] = [];
      const cellData = sh.cellData || {};
      for (const rk of Object.keys(cellData)) {
        const r = Number(rk);
        for (const ck of Object.keys(cellData[rk] || {})) {
          const c = Number(ck);
          if (!aoa[r]) aoa[r] = [];
          aoa[r][c] = cellData[rk][ck]?.v ?? '';
        }
      }
      const wsx = XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [[]]);
      XLSX.utils.book_append_sheet(wb, wsx, (sh.name || 'Лист').slice(0, 31));
    }
    return wb;
  };

  const exportDownload = () => {
    try {
      XLSX.writeFile(buildXlsx(), `${doc?.name || 'Документ'}.xlsx`);
    } catch (err) { addToast('Ошибка экспорта', 'error'); }
  };

  const exportToExplorer = async () => {
    try {
      const b64 = XLSX.write(buildXlsx(), { type: 'base64', bookType: 'xlsx' });
      const fileName = `${doc?.name || 'Документ'}.xlsx`;
      const res = await fetch('/api/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fileName,
          filePath: `/shared/${fileName}`,
          size: Math.round(b64.length * 0.75),
          content: b64,
          createdById: user?.id || null,
        }),
      });
      if (!res.ok) throw new Error('files failed');
      addToast(`«${fileName}» сохранён в Проводник`, 'success');
    } catch (_) { addToast('Не удалось сохранить в Проводник', 'error'); }
  };

  // Закрытие: единственный диалог — имя, и только если оно автогенерированное
  const handleClose = async () => {
    await saveNow();
    if (doc && !doc.named) {
      setNameDialog({ suggestion: suggestionRef.current || `Таблица — ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` });
      return;
    }
    onClose();
  };

  const isAuthor = !doc?.createdById || doc?.createdById === user?.id || user?.role === 'ADMIN';

  return (
    <div className="h-full flex flex-col">
      {/* Шапка редактора: все свойства файла в одну строку, без диалогов */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <button onClick={handleClose} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Закрыть
        </button>
        <input
          value={doc?.name || ''}
          onChange={e => setDoc((d: any) => ({ ...d, name: e.target.value }))}
          onBlur={e => { const v = e.target.value.trim(); if (v && v !== '' && doc) saveNow({ name: v }); }}
          className="font-bold text-slate-800 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none px-1 py-0.5 min-w-40 max-w-md"
        />
        {isAuthor && doc && (
          <select
            value={doc.scope}
            onChange={e => saveNow({ scope: e.target.value })}
            className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 cursor-pointer"
            title="Общий — виден всем; Личный — только вам"
          >
            <option value="SHARED">Общий</option>
            <option value="PERSONAL">Личный</option>
          </select>
        )}
        <div className="flex-1" />
        <button onClick={() => setWizardOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer">
          <Database className="w-3.5 h-3.5" /> Собрать данные
        </button>
        <button onClick={exportDownload} title="Скачать XLSX" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-bold cursor-pointer">
          <Download className="w-3.5 h-3.5" /> XLSX
        </button>
        <button onClick={exportToExplorer} title="Сохранить XLSX в Проводник программы" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-bold cursor-pointer">
          <FolderOpen className="w-3.5 h-3.5" /> В Проводник
        </button>
        <span className="text-[11px] text-slate-400 w-24 text-right">
          {saveState === 'saving' ? 'сохраняю…' : saveState === 'saved' ? `сохранено` : ''}
        </span>
      </div>

      {/* Полотно движка */}
      <div className="flex-1 min-h-0 relative bg-white">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-slate-950">
            <div className="flex items-center gap-3 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Загрузка редактора…</div>
          </div>
        )}
      </div>

      {wizardOpen && (
        <DataWizard projectId={activeProject?.id || 'default'} onInsert={handleInsert} onClose={() => setWizardOpen(false)} />
      )}

      {/* Диалог именования при закрытии (часть III §3.3) */}
      {nameDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-white">Как назвать документ?</h3>
            <input
              autoFocus
              defaultValue={nameDialog.suggestion}
              onFocus={e => e.target.select()}
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) await saveNow({ name: v });
                  onClose();
                }
              }}
              id="constructor-name-input"
              className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer">
                Оставить черновиком
              </button>
              <button
                onClick={async () => {
                  const v = (document.getElementById('constructor-name-input') as HTMLInputElement)?.value?.trim();
                  if (v) await saveNow({ name: v });
                  onClose();
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer">
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════ Библиотека ═══════════════════════

export default function ConstructorScreen() {
  const user = useStore(s => s.user);
  const activeProject = useStore(s => s.activeProject);
  const { addToast } = useToastStore();
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const projectId = activeProject?.id || 'default';

  const loadDocs = async () => {
    try {
      const res = await fetch(`/api/constructor/docs?projectId=${projectId}`);
      if (res.ok) setDocs((await res.json()).docs || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { setLoading(true); loadDocs(); }, [activeProject?.id, activeDocId]);

  const me = user?.id;
  const alive = docs.filter(d => !d.deletedAt);
  const recents = useMemo(() => {
    if (!me) return [] as DocMeta[];
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(RECENT_KEY(me)) || '[]');
      return ids.map(id => alive.find(d => d.id === id)).filter(Boolean).slice(0, 3) as DocMeta[];
    } catch (_) { return []; }
  }, [docs, me]);
  // «Мои» — по авторству, а не только по приватности (часть III §1)
  const myDocs = alive.filter(d => d.scope === 'PERSONAL' ? d.ownerId === me : d.createdById === me);
  const sharedDocs = alive.filter(d => d.scope === 'SHARED');
  const trash = docs.filter(d => d.deletedAt);

  const createDoc = async () => {
    const res = await fetch('/api/constructor/docs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    if (res.ok) {
      const { doc } = await res.json();
      setActiveDocId(doc.id);
    } else addToast('Не удалось создать документ', 'error');
  };

  const patchDoc = async (id: string, body: any, okMsg?: string) => {
    const res = await fetch(`/api/constructor/docs/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) { if (okMsg) addToast(okMsg, 'success'); loadDocs(); }
    else { const d = await res.json().catch(() => ({})); addToast(d.error || 'Ошибка', 'error'); }
  };

  const duplicateDoc = async (id: string) => {
    const res = await fetch(`/api/constructor/docs/${id}/duplicate`, { method: 'POST' });
    if (res.ok) { addToast('Документ продублирован', 'success'); loadDocs(); }
  };

  const deleteForever = async (id: string) => {
    if (!confirm('Удалить документ окончательно? Это действие необратимо.')) return;
    const res = await fetch(`/api/constructor/docs/${id}`, { method: 'DELETE' });
    if (res.ok) { addToast('Документ удалён', 'success'); loadDocs(); }
    else { const d = await res.json().catch(() => ({})); addToast(d.error || 'Ошибка', 'error'); }
  };

  if (activeDocId) {
    return <DocEditor docId={activeDocId} onClose={() => setActiveDocId(null)} />;
  }

  const Card = ({ d, inTrash }: { d: DocMeta; inTrash?: boolean }) => (
    <div className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-emerald-400 dark:hover:border-emerald-700 hover:shadow-md transition-all cursor-pointer"
      onClick={() => !inTrash && setActiveDocId(d.id)}>
      <div className="flex items-start justify-between gap-2">
        <Table2 className="w-5 h-5 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {!inTrash && (
            <>
              <button title="Дублировать" onClick={() => duplicateDoc(d.id)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded cursor-pointer"><Copy className="w-3.5 h-3.5" /></button>
              <button title="В корзину" onClick={() => patchDoc(d.id, { deleted: true }, 'Перемещён в корзину')} className="p-1.5 text-slate-400 hover:text-rose-500 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </>
          )}
          {inTrash && (
            <>
              <button title="Восстановить" onClick={() => patchDoc(d.id, { deleted: false }, 'Восстановлен')} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /></button>
              <button title="Удалить навсегда" onClick={() => deleteForever(d.id)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </>
          )}
        </div>
      </div>
      <div className="mt-2.5 font-semibold text-sm text-slate-800 dark:text-white truncate flex items-center gap-1.5">
        {d.scope === 'PERSONAL' && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
        <span className="truncate">{d.name}</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-2">
        <span>{fmtDate(d.updatedAt)}</span>
        {!d.named && <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-bold">ЧЕРНОВИК</span>}
      </div>
    </div>
  );

  const Section = ({ title, icon: Icon, items, inTrash }: any) => (
    <div>
      <h2 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-400" /> {title} <span className="text-slate-400 font-normal">({items.length})</span>
      </h2>
      {items.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((d: DocMeta) => <Card key={d.id} d={d} inTrash={inTrash} />)}
        </div>
      ) : (
        <div className="text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl px-4 py-6 text-center">Пока пусто</div>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Table2 className="w-6 h-6 text-emerald-600" /> Конструктор
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Собирайте свои таблицы и документы из данных проекта</p>
        </div>
        <button onClick={createDoc} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm cursor-pointer">
          <Plus className="w-4 h-4" /> Новый документ
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          {recents.length > 0 && (
            <Section title="Продолжить" icon={RotateCcw} items={recents} />
          )}
          <Section title="Мои файлы" icon={Lock} items={myDocs} />
          <Section title="Общие файлы" icon={Users2} items={sharedDocs.filter(d => d.createdById !== me)} />

          {trash.length > 0 && (
            <div>
              <button onClick={() => setTrashOpen(v => !v)} className="text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-2 cursor-pointer">
                <Trash2 className="w-4 h-4" /> Корзина ({trash.length}) {trashOpen ? '▾' : '▸'}
              </button>
              {trashOpen && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 opacity-70">
                  {trash.map(d => <Card key={d.id} d={d} inTrash />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
