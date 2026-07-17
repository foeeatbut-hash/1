import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ENV_CONFIG, getAuthToken } from '../config/env';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import {
  ArrowLeft, Loader2, Download, FolderOpen, Printer, History, X, FileText, Database, StickyNote, Stamp,
} from 'lucide-react';
import TitlePanel, { fetchTitlePageHtml, buildPageTemplates, fetchRevisionsSheetHtml, TitleSettings } from './TitlePanel';

// ── Текстовый документ (Ворд) — редактор студии Конструктора ──
// Тот же движок Univer, что и у таблиц, но документный пресет: страницы А4,
// шрифты и стили, списки, таблицы, поиск, отмена/повтор. Хранение — снапшот
// IDocumentData в ConstructorDoc.workbook (общие маршруты: автосейв, версии,
// корзина, зеркало в Проводнике). Дизайн: docs/docs-studio-design.md.

function fmtDate(s: string) {
  try { return new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return s; }
}

// Валидный пустой документ (форма тела — как в getEmptyHeaderFooterBody самого
// Univer): без корректных body/paragraphs/sectionBreaks движок рисует пустую
// страницу и сыплет ошибками getDataModel/dirty$
function emptyDocSnapshot(id: string, title: string) {
  return {
    id,
    title,
    body: {
      dataStream: '\r\n',
      textRuns: [],
      customBlocks: [],
      paragraphs: [{ startIndex: 0 }],
      sectionBreaks: [{ startIndex: 1 }],
    },
    documentStyle: {
      pageSize: { width: 595.3, height: 841.98 }, // А4 в pt
      marginTop: 50, marginBottom: 50, marginLeft: 45, marginRight: 45,
    },
  };
}

// Плоский текст документа из снапшота (для экспорта TXT и поиска)
function snapshotToPlainText(snap: any): string {
  const ds: string = snap?.body?.dataStream || '';
  // \r — конец абзаца, \n — конец секции; служебные маркеры объектов отсекаем
  return ds.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/\r/g, '\n').replace(/\n+$/, '');
}

// Печатный HTML: абзацы + жирный/курсив/подчёркивание/размер/цвет из textRuns
function snapshotToPrintHtml(snap: any, title: string, subtitle: string): string {
  const body = snap?.body || {};
  const ds: string = body.dataStream || '';
  const runs: any[] = Array.isArray(body.textRuns) ? body.textRuns : [];
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Разметка символов стилями: для каждого абзаца собираем HTML c учётом runs
  const styleAt = (idx: number) => runs.find(r => idx >= r.st && idx < r.ed)?.ts || null;
  const openTag = (ts: any) => {
    if (!ts) return '';
    const css: string[] = [];
    if (ts.bl === 1) css.push('font-weight:bold');
    if (ts.it === 1) css.push('font-style:italic');
    if (ts.ul?.s === 1) css.push('text-decoration:underline');
    if (ts.fs) css.push(`font-size:${ts.fs}pt`);
    if (ts.cl?.rgb) css.push(`color:${ts.cl.rgb}`);
    if (ts.bg?.rgb) css.push(`background:${ts.bg.rgb}`);
    return css.length ? `<span style="${css.join(';')}">` : '';
  };

  let html = '';
  let para = '';
  let curTs: any = undefined;
  let open = '';
  const flushRun = () => { if (open) { para += '</span>'; open = ''; } };
  const flushPara = () => { flushRun(); html += `<p>${para || '&nbsp;'}</p>`; para = ''; curTs = undefined; };

  for (let i = 0; i < ds.length; i++) {
    const ch = ds[i];
    if (ch === '\r') { flushPara(); continue; }
    if (ch === '\n') continue; // конец секции
    if (ch.charCodeAt(0) < 32) continue; // служебные маркеры (объекты, таблицы)
    const ts = styleAt(i);
    if (JSON.stringify(ts) !== JSON.stringify(curTs)) {
      flushRun();
      curTs = ts;
      open = openTag(ts);
      para += open;
    }
    para += esc(ch);
  }
  if (para) flushPara();

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; margin: 20mm 18mm; color: #0f172a; font-size: 11pt; line-height: 1.45; }
      h1 { font-size: 14px; margin: 0 0 2px; }
      .sub { font-size: 9px; color: #64748b; margin-bottom: 12px; border-bottom: 0.5pt solid #cbd5e1; padding-bottom: 6px; }
      p { margin: 0 0 6px; }
      @page { margin: 15mm; }
    </style></head><body>
    <h1>${esc(title)}</h1>
    <div class="sub">${esc(subtitle)}</div>
    ${html}</body></html>`;
}

// ── Панель «Данные»: вставка живых значений проекта в текст ──
// Значения берутся из тех же серверных функций, что и формулы таблиц
// (/api/constructor/fn), тег/параметр — по вводу пользователя.
function DataFieldsPanel({ projectId, projectName, userName, onInsert, onClose }: {
  projectId: string; projectName: string; userName: string;
  onInsert: (text: string) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<'project' | 'tag' | 'now'>('project');
  const [tagId, setTagId] = useState('');
  const [tagField, setTagField] = useState('brand');
  const [paramGroup, setParamGroup] = useState('');
  const [paramKey, setParamKey] = useState('');
  const [busy, setBusy] = useState(false);

  const callFn = async (fn: string, args: string[]): Promise<string> => {
    try {
      const r = await fetch('/api/constructor/fn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, calls: [{ fn, args }] }),
      });
      if (!r.ok) return '';
      const v = (await r.json()).results?.[0];
      return v == null || v === '#ОШИБКА' ? '' : String(v);
    } catch (_) { return ''; }
  };

  const insertProject = async (field: string) => {
    setBusy(true);
    const v = await callFn('project', [field]);
    setBusy(false);
    onInsert(v || `{Проект.${field}}`);
  };
  const insertTagField = async () => {
    if (!tagId.trim()) return;
    setBusy(true);
    const v = await callFn('tag', [tagId.trim(), tagField]);
    setBusy(false);
    onInsert(v || `{Тег ${tagId}: ${tagField}}`);
  };
  const insertParam = async () => {
    if (!tagId.trim() || !paramKey.trim()) return;
    setBusy(true);
    const v = await callFn('param', [tagId.trim(), paramGroup.trim(), paramKey.trim()]);
    setBusy(false);
    onInsert(v || `{Параметр ${tagId}: ${paramKey}}`);
  };

  return (
    <div className="absolute right-4 top-14 z-40 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
        <span className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5"><Database className="w-4 h-4 text-sky-600" /> Вставить данные</span>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex border-b border-slate-100 dark:border-slate-850">
        {([['project', 'Проект'], ['tag', 'Тег'], ['now', 'Дата/автор']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 px-2 py-2 text-xs font-bold cursor-pointer ${tab === id ? 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 border-b-2 border-sky-500' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="p-4 space-y-2.5 max-h-96 overflow-auto">
        {tab === 'project' && (
          <>
            <p className="text-[11px] text-slate-400">Текущий проект: <b>{projectName || '—'}</b>. Нажмите — значение вставится в текст.</p>
            {[['name', 'Название'], ['code', 'Код проекта'], ['customer', 'Заказчик'], ['contractor', 'Подрядчик'], ['description', 'Описание']].map(([f, label]) => (
              <button key={f} disabled={busy} onClick={() => insertProject(f)}
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/20 text-sm text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50">
                {label}
              </button>
            ))}
          </>
        )}
        {tab === 'tag' && (
          <>
            <label className="block text-[11px] font-bold text-slate-500 uppercase">Обозначение тега</label>
            <input value={tagId} onChange={e => setTagId(e.target.value)} placeholder="напр. AHU-01"
              className="w-full px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-sky-500" />
            <label className="block text-[11px] font-bold text-slate-500 uppercase mt-2">Поле тега</label>
            <div className="flex gap-2">
              <select value={tagField} onChange={e => setTagField(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-white">
                <option value="brand">Марка</option>
                <option value="department">Отдел</option>
                <option value="fluid">Среда</option>
                <option value="wbs">WBS</option>
              </select>
              <button disabled={busy || !tagId.trim()} onClick={insertTagField}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer">Вставить</button>
            </div>
            <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-850">
              <label className="block text-[11px] font-bold text-slate-500 uppercase">Параметр оборудования по тегу</label>
              <input value={paramGroup} onChange={e => setParamGroup(e.target.value)} placeholder="группа (напр. Габариты)"
                className="w-full mt-1 px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-sky-500" />
              <div className="flex gap-2 mt-1.5">
                <input value={paramKey} onChange={e => setParamKey(e.target.value)} placeholder="параметр (напр. Высота)"
                  className="flex-1 px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-sky-500" />
                <button disabled={busy || !tagId.trim() || !paramKey.trim()} onClick={insertParam}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer">Вставить</button>
              </div>
            </div>
          </>
        )}
        {tab === 'now' && (
          <>
            <button onClick={() => onInsert(new Date().toLocaleDateString('ru-RU'))}
              className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/20 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              Сегодняшняя дата ({new Date().toLocaleDateString('ru-RU')})
            </button>
            <button onClick={() => onInsert(new Date().toLocaleString('ru-RU'))}
              className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/20 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              Дата и время
            </button>
            <button onClick={() => onInsert(userName)}
              className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/20 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              Автор ({userName})
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function TextDocEditor({ docId, onClose }: { docId: string; onClose: () => void }) {
  const user = useStore(s => s.user);
  const activeProject = useStore(s => s.activeProject);
  const { addToast } = useToastStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<any>(null);
  const fdocRef = useRef<any>(null);         // FDocument для вставки текста
  const lastSavedRef = useRef<string>('');
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [nameDialog, setNameDialog] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<{ id: string; version: number; comment: string; createdAt: string }[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [dataOpen, setDataOpen] = useState(false); // панель «Данные» (умные поля)
  // ── Титул: присвоенный шаблон + реквизиты именно этого документа ──
  const [titleOpen, setTitleOpen] = useState(false);
  const [settings, setSettings] = useState<TitleSettings>({});
  // «Выпустить ревизию» — для документов, привязанных к строке ВДР
  const [revDialog, setRevDialog] = useState(false);
  const [revPlace, setRevPlace] = useState('');
  const [revDesc, setRevDesc] = useState('');
  const [revBusy, setRevBusy] = useState(false);

  const issueRevision = async (kind: 'next' | 'certify') => {
    if (!settings.vdrItemId) return;
    setRevBusy(true);
    try {
      const r = await fetch(`/api/vdr/items/${settings.vdrItemId}/issue-revision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, place: revPlace, description: revDesc }),
      });
      if (!r.ok) { addToast('Не удалось выпустить ревизию', 'error'); return; }
      const d = await r.json();
      setSettings(s => ({ ...s, docMeta: { ...s.docMeta, revision: d.item.revision } }));
      addToast(`Выпущена ревизия ${d.item.revision}`, 'success');
      setRevDialog(false); setRevPlace(''); setRevDesc('');
      // Снимок версии документа — ревизия зафиксирована и в истории Конструктора
      makeVersion(`ревизия ${d.item.revision}`);
    } finally { setRevBusy(false); }
  };

  // ── Совместное редактирование (как у таблиц): комната документа ──
  interface Peer { socketId: string; userId: string; name: string; color: string }
  const collabSocketRef = useRef<Socket | null>(null);
  const applyingRemoteRef = useRef(false);
  const [peers, setPeers] = useState<Peer[]>([]);

  const takeSnapshot = (): string => {
    try {
      const d = univerRef.current?.univerAPI?.getActiveDocument?.();
      const data = d?.getSnapshot?.();
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

  // Страховка от вылета: несохранённый снапшот уходит keepalive-запросом
  useEffect(() => {
    const flushOnClose = () => {
      try {
        const snapshot = takeSnapshot();
        if (!snapshot || snapshot === lastSavedRef.current) return;
        fetch(`/api/constructor/docs/${docId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workbook: snapshot }),
          keepalive: true,
        }).catch(() => {});
        lastSavedRef.current = snapshot;
      } catch (_) {}
    };
    window.addEventListener('beforeunload', flushOnClose);
    window.addEventListener('pagehide', flushOnClose);
    return () => {
      window.removeEventListener('beforeunload', flushOnClose);
      window.removeEventListener('pagehide', flushOnClose);
    };
  }, [docId]);

  // Инициализация движка: документный пресет Univer (страницы как в Ворде)
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
        try { setSettings(loaded.settings ? JSON.parse(loaded.settings) : {}); } catch (_) { setSettings({}); }

        // Ядро документов + гиперссылки + картинки (drawing) — ближе к Ворду
        const pick = (m: any) => m.default ?? m;
        const [{ createUniver, LocaleType, mergeLocales, defaultTheme }, docsPreset, linkP, drawP, ruRU, linkRu, drawRu] = await Promise.all([
          import('@univerjs/presets'),
          import('@univerjs/presets/preset-docs-core'),
          import('@univerjs/presets/preset-docs-hyper-link'),
          import('@univerjs/presets/preset-docs-drawing'),
          import('@univerjs/presets/preset-docs-core/locales/ru-RU'),
          import('@univerjs/presets/preset-docs-hyper-link/locales/ru-RU'),
          import('@univerjs/presets/preset-docs-drawing/locales/ru-RU'),
        ]);
        await Promise.all([
          import('@univerjs/presets/lib/styles/preset-docs-core.css'),
          import('@univerjs/presets/lib/styles/preset-docs-hyper-link.css'),
          import('@univerjs/presets/lib/styles/preset-docs-drawing.css'),
        ]);
        if (disposed || !containerRef.current) return;

        const { univer, univerAPI } = createUniver({
          locale: LocaleType.RU_RU,
          locales: { [LocaleType.RU_RU]: mergeLocales(pick(ruRU), pick(linkRu), pick(drawRu)) },
          theme: defaultTheme,
          presets: [
            (docsPreset as any).UniverDocsCorePreset({ container: containerRef.current }),
            (linkP as any).UniverDocsHyperLinkPreset(),
            (drawP as any).UniverDocsDrawingPreset(),
          ],
        });
        univerRef.current = { univer, univerAPI };

        let snapshot: any = null;
        try { snapshot = loaded.workbook ? JSON.parse(loaded.workbook) : null; } catch (_) {}
        // Пустого снапшота движку недостаточно — даём валидный чистый лист
        const isNew = !snapshot || !snapshot.body;
        if (isNew) snapshot = emptyDocSnapshot(loaded.id, loaded.name);
        const fdoc = univerAPI.createUniverDoc(snapshot);
        fdocRef.current = fdoc;
        lastSavedRef.current = loaded.workbook || '';

        // Импорт из файла Проводника: содержимое вставляется при первом
        // открытии (сервер положил plain-текст в bindings.importText)
        if (isNew) {
          try {
            const b = loaded.bindings ? JSON.parse(loaded.bindings) : null;
            const importText = String(b?.importText || '');
            if (importText) {
              await fdoc?.appendText?.(importText);
              // Текст вставлен — очищаем задание импорта и сохраняем снапшот
              setTimeout(() => saveNow({ bindings: JSON.stringify({}) }), 800);
            }
          } catch (_) {}
        }

        // ── Коллаборация: комната документа (presence + репликация операций) ──
        const sock = io(ENV_CONFIG.socketUrl, {
          auth: { token: getAuthToken() },
          transports: ['websocket', 'polling'],
          reconnectionDelay: 800, reconnectionDelayMax: 4000,
        });
        collabSocketRef.current = sock;
        sock.on('connect', () => sock.emit('constructor:join', { docId }));
        sock.on('constructor:presence', ({ peers: roster }: any) => {
          setPeers((roster || []).filter((pp: any) => pp.socketId !== sock.id));
        });
        sock.on('constructor:op', ({ op }: any) => {
          if (!op?.id) return;
          applyingRemoteRef.current = true;
          try { univerAPI.executeCommand(op.id, op.params, { fromCollab: true } as any); }
          catch (_) {}
          finally { setTimeout(() => { applyingRemoteRef.current = false; }, 0); }
        });
        const cmdDisposer = univerAPI.onCommandExecuted((command: any, options: any) => {
          if (applyingRemoteRef.current || options?.fromCollab || options?.fromChangeset) return;
          if (command?.type !== 2) return; // MUTATION
          const cmdId = String(command.id || '');
          if (!cmdId.startsWith('doc.mutation.')) return;
          collabSocketRef.current?.emit('constructor:op', { docId, op: { id: cmdId, params: command.params } });
        });
        (univerRef.current as any).cmdDisposer = cmdDisposer;

        setLoading(false);
      } catch (err: any) {
        console.error('[Constructor] Ошибка инициализации текстового редактора:', err);
        addToast('Не удалось загрузить редактор документов', 'error');
        onClose();
      }
    })();

    const timer = setInterval(() => { saveNow(); }, 2500);
    return () => {
      disposed = true;
      clearInterval(timer);
      try { (univerRef.current as any)?.cmdDisposer?.dispose?.(); } catch (_) {}
      try {
        collabSocketRef.current?.emit('constructor:leave', { docId });
        collabSocketRef.current?.disconnect();
      } catch (_) {}
      collabSocketRef.current = null;
      try { univerRef.current?.univer?.dispose?.(); } catch (_) {}
      univerRef.current = null;
      fdocRef.current = null;
    };
  }, [docId, reloadTick]);

  // Вставка «умного поля»: живое значение проекта/тега/даты — в позицию курсора
  const insertField = async (text: string) => {
    const fdoc = fdocRef.current;
    if (!fdoc) return;
    try {
      if (fdoc.insertText) await fdoc.insertText(text);
      else await fdoc.appendText?.(text);
      setTimeout(() => saveNow(), 400);
    } catch (_) { addToast('Не удалось вставить значение', 'error'); }
  };

  // ── Версии (общие маршруты с таблицами) ──
  const makeVersion = async (comment: string) => {
    try {
      await saveNow();
      await fetch(`/api/constructor/docs/${docId}/versions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
    } catch (_) {}
  };

  const loadVersions = async () => {
    try {
      const r = await fetch(`/api/constructor/docs/${docId}/versions`);
      if (r.ok) setVersions((await r.json()).versions || []);
    } catch (_) {}
  };

  const restoreVersion = async (v: { id: string; version: number }) => {
    if (!confirm(`Восстановить версию ${v.version}? Текущее состояние сохранится отдельной версией.`)) return;
    const r = await fetch(`/api/constructor/docs/${docId}/restore/${v.id}`, { method: 'POST' });
    if (!r.ok) { addToast('Не удалось восстановить версию', 'error'); return; }
    addToast(`Восстановлена версия ${v.version}`, 'success');
    setVersionsOpen(false);
    setLoading(true);
    setReloadTick(t => t + 1);
  };

  // ── Печать / PDF / экспорт ──
  const buildHtml = () => {
    const snap = JSON.parse(takeSnapshot() || '{}');
    return snapshotToPrintHtml(snap, doc?.name || 'Документ', `${activeProject?.name || ''} · ${new Date().toLocaleDateString('ru-RU')} · Flux Конструктор`);
  };
  // Полный HTML на печать: титульный лист (если присвоен) + тело документа
  const buildFullHtml = async (): Promise<string> => {
    const base = buildHtml();
    const [title, revSheet] = await Promise.all([
      fetchTitlePageHtml(docId, settings.titleTemplateId),
      fetchRevisionsSheetHtml(settings),
    ]);
    const front = (title || '') + (revSheet || '');
    return front ? base.replace('<body>', `<body>${front}`) : base;
  };

  const handlePrint = async () => {
    try {
      const html = await buildFullHtml();
      const w = window.open('', '_blank');
      if (!w) { addToast('Всплывающее окно заблокировано', 'error'); return; }
      w.document.write(html);
      w.document.close();
      setTimeout(() => { try { w.print(); } catch (_) {} }, 400);
    } catch (_) { addToast('Ошибка подготовки печати', 'error'); }
  };

  const handlePdf = async () => {
    try {
      const win = window as any;
      if (win.electron?.ipcRenderer?.invoke) {
        const hf = await buildPageTemplates(docId, settings);
        const r = await win.electron.ipcRenderer.invoke('print:to-pdf', { html: await buildFullHtml(), title: doc?.name || 'Документ', ...hf });
        if (r?.success) addToast('PDF сохранён', 'success');
        else if (!r?.canceled) addToast(r?.error || 'Не удалось сохранить PDF', 'error');
      } else handlePrint();
    } catch (_) { addToast('Ошибка экспорта PDF', 'error'); }
  };

  const exportTxt = () => {
    try {
      const text = snapshotToPlainText(JSON.parse(takeSnapshot() || '{}'));
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${doc?.name || 'Документ'}.txt`; a.click();
      URL.revokeObjectURL(url);
    } catch (_) { addToast('Ошибка экспорта', 'error'); }
  };

  const exportToExplorer = async () => {
    try {
      const text = snapshotToPlainText(JSON.parse(takeSnapshot() || '{}'));
      const b64 = btoa(unescape(encodeURIComponent(text)));
      const fileName = `${doc?.name || 'Документ'}.txt`;
      const res = await fetch('/api/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fileName, filePath: `/shared/${fileName}`, type: 'TXT',
          size: text.length, content: b64, createdById: user?.id || null,
        }),
      });
      if (!res.ok) throw new Error('files failed');
      addToast(`«${fileName}» сохранён в Проводник`, 'success');
    } catch (_) { addToast('Не удалось сохранить в Проводник', 'error'); }
  };

  const handleClose = async () => {
    await saveNow();
    if (doc && !doc.named) { setNameDialog(true); return; }
    onClose();
  };

  const isAuthor = !doc?.createdById || doc?.createdById === user?.id || user?.role === 'ADMIN';

  return (
    <div className="h-full flex flex-col">
      {/* Шапка: те же элементы, что у таблиц — раздел выглядит цельно */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <button onClick={handleClose} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Закрыть
        </button>
        {doc?.kind === 'NOTE'
          ? <StickyNote className="w-4 h-4 text-amber-500 shrink-0" />
          : <FileText className="w-4 h-4 text-sky-600 shrink-0" />}
        <input
          value={doc?.name || ''}
          onChange={e => setDoc((d: any) => ({ ...d, name: e.target.value }))}
          onBlur={e => { const v = e.target.value.trim(); if (v && doc) saveNow({ name: v }); }}
          className="font-bold text-slate-800 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-none px-1 py-0.5 min-w-40 max-w-md"
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
        {peers.length > 0 && (
          <div className="flex items-center mr-1" title={`В документе: ${peers.map(pp => pp.name).join(', ')}`}>
            <div className="flex -space-x-1.5">
              {peers.slice(0, 5).map(pp => (
                <div key={pp.socketId}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white ring-2 ring-white dark:ring-slate-900"
                  style={{ background: pp.color }} title={pp.name}>
                  {pp.name.trim().charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <span className="ml-2 text-[11px] font-semibold text-sky-600 dark:text-sky-400">✏️ {peers.length + 1} в документе</span>
          </div>
        )}
        <button onClick={() => setDataOpen(v => !v)}
          title="Вставить живые данные проекта: код, заказчик, тег, дата, автор"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer">
          <Database className="w-3.5 h-3.5" /> Данные
        </button>
        {doc?.kind !== 'NOTE' && (
          <button onClick={() => setTitleOpen(v => !v)}
            title="Присвоить шаблон титульного листа — заполнится данными этого документа"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${settings.titleTemplateId ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850'}`}>
            <Stamp className="w-3.5 h-3.5" /> Титул
          </button>
        )}
        {settings.vdrItemId && (
          <button onClick={() => setRevDialog(true)}
            title={`Выпустить новую ревизию (текущая: ${settings.docMeta?.revision || '—'}) — обновит ВДР, титул и лист ревизий`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">
            Рев. {settings.docMeta?.revision || '—'} ↑
          </button>
        )}
        <button onClick={() => { setVersionsOpen(v => !v); if (!versionsOpen) loadVersions(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-bold cursor-pointer">
          <History className="w-3.5 h-3.5" /> История
        </button>
        <button onClick={handlePrint} title="Печать документа" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-bold cursor-pointer">
          <Printer className="w-3.5 h-3.5" /> Печать
        </button>
        <button onClick={handlePdf} title="Сохранить в PDF" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-bold cursor-pointer">
          PDF
        </button>
        <button onClick={exportTxt} title="Скачать как текст" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-bold cursor-pointer">
          <Download className="w-3.5 h-3.5" /> TXT
        </button>
        <button onClick={exportToExplorer} title="Сохранить текст в Проводник" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-bold cursor-pointer">
          <FolderOpen className="w-3.5 h-3.5" /> В Проводник
        </button>
        <span className="text-[11px] text-slate-400 w-24 text-right">
          {saveState === 'saving' ? 'сохраняю…' : saveState === 'saved' ? 'сохранено' : ''}
        </span>
      </div>

      {/* Полотно движка: страницы документа */}
      <div className="flex-1 min-h-0 relative bg-slate-100 dark:bg-slate-950">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-slate-950">
            <div className="flex items-center gap-3 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Загрузка редактора…</div>
          </div>
        )}
      </div>

      {/* Панель «Титул»: выбор шаблона + реквизиты этого документа */}
      {titleOpen && (
        <TitlePanel
          docId={docId}
          projectId={activeProject?.id || 'default'}
          settings={settings}
          onChange={(next, persist) => { setSettings(next); if (persist) saveNow({ settings: JSON.stringify(next) }); }}
          onClose={() => setTitleOpen(false)}
        />
      )}

      {/* Панель «Данные»: живые поля проекта, тегов, дата/автор */}
      {dataOpen && (
        <DataFieldsPanel
          projectId={activeProject?.id || 'default'}
          projectName={activeProject?.name || ''}
          userName={user?.name || user?.symbol || 'Пользователь'}
          onInsert={insertField}
          onClose={() => setDataOpen(false)}
        />
      )}

      {/* История версий */}
      {versionsOpen && (
        <div className="absolute right-4 top-14 z-40 w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-800 dark:text-white">История версий</span>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => { await makeVersion('ручное сохранение'); await loadVersions(); addToast('Версия сохранена', 'success'); }}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white cursor-pointer flex items-center gap-1">
                <History className="w-3 h-3" /> Сохранить версию
              </button>
              <button onClick={() => setVersionsOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto divide-y divide-slate-100 dark:divide-slate-850">
            {versions.map(v => (
              <div key={v.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="w-9 h-6 shrink-0 rounded bg-slate-100 dark:bg-slate-850 flex items-center justify-center text-[11px] font-bold text-slate-500">в{v.version}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{v.comment || 'без комментария'}</div>
                  <div className="text-[10px] text-slate-400">{fmtDate(v.createdAt)}</div>
                </div>
                <button onClick={() => restoreVersion(v)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-950/30 hover:text-sky-700 cursor-pointer">
                  Восстановить
                </button>
              </div>
            ))}
            {versions.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-slate-400">Версий пока нет. Нажмите «Сохранить версию» перед важными правками.</div>
            )}
          </div>
        </div>
      )}

      {/* Выпуск ревизии: место и описание изменения → ВДР + лист ревизий */}
      {revDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={() => setRevDialog(false)}>
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 dark:text-white">Выпустить ревизию (текущая: {settings.docMeta?.revision || '—'})</h3>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase">Место изменения</label>
              <input value={revPlace} onChange={e => setRevPlace(e.target.value)} placeholder="напр. Разд. 3, лист 2"
                className="w-full mt-0.5 px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase">Описание изменения</label>
              <textarea value={revDesc} onChange={e => setRevDesc(e.target.value)} rows={2} placeholder="что изменено"
                className="w-full mt-0.5 px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setRevDialog(false)} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer">Отмена</button>
              {/^[A-Za-zА-Яа-я]$/.test(settings.docMeta?.revision || '') && (
                <button onClick={() => issueRevision('certify')} disabled={revBusy}
                  className="px-3.5 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer disabled:opacity-50">
                  Утвердить (→0)
                </button>
              )}
              <button onClick={() => issueRevision('next')} disabled={revBusy}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">
                Следующая ревизия
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Именование при закрытии */}
      {nameDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-white">Как назвать документ?</h3>
            <input
              autoFocus
              defaultValue={`Документ — ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}
              onFocus={e => e.target.select()}
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) await saveNow({ name: v });
                  onClose();
                }
              }}
              id="textdoc-name-input"
              className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-sky-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer">
                Оставить черновиком
              </button>
              <button
                onClick={async () => {
                  const v = (document.getElementById('textdoc-name-input') as HTMLInputElement)?.value?.trim();
                  if (v) await saveNow({ name: v });
                  onClose();
                }}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer">
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
