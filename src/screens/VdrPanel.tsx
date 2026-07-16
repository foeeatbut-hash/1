import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import {
  FileSpreadsheet, Plus, Upload, RefreshCw, Trash2, FileText, ArrowUpCircle,
  CheckCircle2, AlertTriangle, Send, Loader2, X, Pencil, Search,
} from 'lucide-react';

// ── ВДР: реестр документации поставщика (вкладка раздела «Менеджмент») ──
// Дизайн: docs/vdr-docflow-design.md. Строка реестра — карточка документа:
// номера, наименования, тип (VDR-код), ревизия, статус, исполнитель, документ.

interface Register {
  id: string; name: string; vendor: string; contractor: string; owner: string;
  poNumber: string; managerId?: string | null; counts: Record<string, number>;
}
interface Item {
  id: string; registerId: string; contractorNo: string; ownerNo: string; vendorNo: string;
  titleEn: string; titleRu: string; vdrCode: string; revision: string;
  issueDate?: string | null; reasonForIssue: string; language: string;
  status: string; docId?: string | null; fileNodeId?: string | null;
  assigneeId?: string | null; remarks: string;
}
interface UserLite { id: string; name: string; symbol?: string; role?: string }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'В работе', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
  READY: { label: 'Готово', cls: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' },
  REMARKS: { label: 'Замечания', cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400' },
  ACCEPTED: { label: 'Принят', cls: 'bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400' },
};

const fmtD = (s?: string | null) => { try { return s ? new Date(s).toLocaleDateString('ru-RU') : ''; } catch { return ''; } };

export default function VdrPanel() {
  const user = useStore(s => s.user);
  const activeProject = useStore(s => s.activeProject);
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = activeProject?.id || 'default';

  const [registers, setRegisters] = useState<Register[]>([]);
  const [regId, setRegId] = useState<string>(searchParams.get('vdr') || '');
  const [items, setItems] = useState<Item[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [editing, setEditing] = useState<Item | null>(null); // модалка правки/создания
  const [importing, setImporting] = useState(false);
  const focusItemId = searchParams.get('item');

  const register = registers.find(r => r.id === regId) || null;
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const loadRegisters = async (): Promise<Register[]> => {
    try {
      const r = await fetch(`/api/vdr/registers?projectId=${projectId}`);
      if (!r.ok) return [];
      const regs: Register[] = (await r.json()).registers || [];
      setRegisters(regs);
      return regs;
    } catch (_) { return []; }
  };

  const loadItems = async (id: string) => {
    if (!id) { setItems([]); return; }
    try {
      const r = await fetch(`/api/vdr/items?registerId=${id}`);
      if (r.ok) setItems((await r.json()).items || []);
    } catch (_) {}
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const regs = await loadRegisters();
      const chosen = regs.find(r => r.id === regId)?.id || regs[0]?.id || '';
      setRegId(chosen);
      await loadItems(chosen);
      setLoading(false);
      try {
        const r = await fetch('/api/users');
        if (r.ok) setUsers(((await r.json()).users || []).filter((u: any) => u.isActive !== false));
      } catch (_) {}
    })();
  }, [projectId]);

  useEffect(() => { if (regId) loadItems(regId); }, [regId]);

  const refresh = async () => { await loadRegisters(); await loadItems(regId); };

  const userName = (id?: string | null) => users.find(u => u.id === id)?.name?.split(' ')[0] || '';

  // ── Действия ──
  const patchItem = async (id: string, body: any, okMsg?: string) => {
    const r = await fetch(`/api/vdr/items/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) { if (okMsg) addToast(okMsg, 'success'); refresh(); }
    else { const d = await r.json().catch(() => ({})); addToast(d.error || 'Ошибка', 'error'); }
  };

  const setStatus = (it: Item, status: string) => {
    if (status === 'REMARKS') {
      const remarks = window.prompt('Текст замечаний (уйдёт исполнителю в уведомлении):', it.remarks || '');
      if (remarks === null) return;
      patchItem(it.id, { status, remarks }, 'Замечания отправлены исполнителю');
      return;
    }
    patchItem(it.id, { status }, status === 'READY' ? 'Менеджер уведомлён' : undefined);
  };

  const revisionUp = async (it: Item) => {
    const certify = /^[A-Z]$/i.test(it.revision) && window.confirm(`Ревизия «${it.revision}». ОК — следующая черновая (${it.revision}→${String.fromCharCode(it.revision.toUpperCase().charCodeAt(0) + 1)}), Отмена+повтор — утверждение.\n\nУтвердить как ревизию 0? (Отмена = просто следующая буква)`) === false ? false : false;
    const r = await fetch(`/api/vdr/items/${it.id}/revision-up`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ certify }),
    });
    if (r.ok) { addToast('Ревизия повышена', 'success'); refresh(); }
  };

  const certifyRevision = async (it: Item) => {
    if (!window.confirm(`Утвердить «${it.contractorNo || it.titleRu}» как ревизию 0 (Certified Final)?`)) return;
    const r = await fetch(`/api/vdr/items/${it.id}/revision-up`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ certify: true }),
    });
    if (r.ok) { addToast('Утверждено: ревизия 0', 'success'); refresh(); }
  };

  const createDoc = async (it: Item) => {
    const r = await fetch(`/api/vdr/items/${it.id}/create-doc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r.ok) { addToast('Не удалось создать документ', 'error'); return; }
    const d = await r.json();
    navigate(`/constructor?doc=${d.doc.id}`);
  };

  const deleteItem = async (it: Item) => {
    if (!window.confirm(`Удалить строку «${it.contractorNo || it.titleRu}» из реестра?`)) return;
    const r = await fetch(`/api/vdr/items/${it.id}`, { method: 'DELETE' });
    if (r.ok) { addToast('Строка удалена', 'success'); refresh(); }
    else { const d = await r.json().catch(() => ({})); addToast(d.error || 'Ошибка', 'error'); }
  };

  const importXlsx = async (file: File) => {
    setImporting(true);
    try {
      const b64: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      const r = await fetch('/api/vdr/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, content: b64, fileName: file.name, registerId: regId || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { addToast(d.error || 'Ошибка импорта', 'error'); return; }
      addToast(`Импорт «${d.sheet}»: +${d.created} новых, ${d.updated} обновлено`, 'success');
      const regs = await loadRegisters();
      const target = d.register?.id || regId || regs[0]?.id || '';
      setRegId(target);
      await loadItems(target);
    } finally { setImporting(false); }
  };

  const createRegister = async () => {
    const name = window.prompt('Название реестра (например «ВДР 22062-PEQ-0371»):', 'ВДР');
    if (!name) return;
    const r = await fetch('/api/vdr/registers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name }),
    });
    if (r.ok) { const d = await r.json(); await loadRegisters(); setRegId(d.register.id); }
  };

  // ── Фильтрация ──
  const codes = useMemo(() => [...new Set(items.map(i => i.vdrCode).filter(Boolean))].sort(), [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (codeFilter && i.vdrCode !== codeFilter) return false;
      if (!q) return true;
      return [i.contractorNo, i.ownerNo, i.vendorNo, i.titleRu, i.titleEn, i.vdrCode]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [items, search, statusFilter, codeFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { DRAFT: 0, READY: 0, REMARKS: 0, ACCEPTED: 0 };
    for (const i of items) c[i.status] = (c[i.status] || 0) + 1;
    return c;
  }, [items]);

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-3 text-slate-800 dark:text-slate-100">
      {/* Шапка: реестр, менеджер, действия */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs">
        <FileSpreadsheet className="w-5 h-5 text-indigo-500 shrink-0" />
        {registers.length > 0 ? (
          <select value={regId} onChange={e => setRegId(e.target.value)}
            className="px-2.5 py-1.5 text-sm font-semibold border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-800 dark:text-white cursor-pointer max-w-72">
            {registers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : (
          <span className="text-sm text-slate-400">Реестров пока нет — создайте или импортируйте Excel-ВДР</span>
        )}
        {register && (
          <select
            value={register.managerId || ''}
            onChange={e => fetch(`/api/vdr/registers/${register.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ managerId: e.target.value || null }) }).then(refresh)}
            disabled={!canManage}
            title="Менеджер реестра — получает уведомления «документ готов»"
            className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-60">
            <option value="">Менеджер: не назначен</option>
            {users.map(u => <option key={u.id} value={u.id}>Менеджер: {u.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer ${importing ? 'opacity-60 pointer-events-none' : ''}`}>
          {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Импорт Excel-ВДР
          <input type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.target.value = ''; }} />
        </label>
        <button onClick={createRegister} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> Реестр
        </button>
        {register && (
          <button onClick={() => setEditing({ id: '', registerId: register.id, contractorNo: '', ownerNo: '', vendorNo: '', titleEn: '', titleRu: '', vdrCode: '', revision: 'A', reasonForIssue: '', language: '', status: 'DRAFT', remarks: '' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Строка
          </button>
        )}
        <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {register && (
        <>
          {/* Счётчики-фильтры по статусам */}
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(STATUS_META).map(([st, meta]) => (
              <button key={st} onClick={() => setStatusFilter(statusFilter === st ? '' : st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border transition-all ${statusFilter === st ? 'border-indigo-500 ring-1 ring-indigo-400' : 'border-transparent'} ${meta.cls}`}>
                {meta.label}: {counts[st] || 0}
              </button>
            ))}
            <div className="flex-1" />
            {codes.length > 0 && (
              <select value={codeFilter} onChange={e => setCodeFilter(e.target.value)}
                className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 cursor-pointer">
                <option value="">Все типы</option>
                {codes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Номер, название…"
                className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500 w-52" />
            </div>
          </div>

          {/* Таблица реестра */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-320px)]">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                  <tr className="text-left text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2 font-bold whitespace-nowrap">№ документа</th>
                    <th className="px-3 py-2 font-bold">Наименование</th>
                    <th className="px-3 py-2 font-bold">Тип</th>
                    <th className="px-3 py-2 font-bold">Рев.</th>
                    <th className="px-3 py-2 font-bold whitespace-nowrap">Дата</th>
                    <th className="px-3 py-2 font-bold">Статус</th>
                    <th className="px-3 py-2 font-bold">Исполнитель</th>
                    <th className="px-3 py-2 font-bold text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                  {filtered.map(it => (
                    <tr key={it.id} className={`hover:bg-slate-50 dark:hover:bg-slate-900/60 ${focusItemId === it.id ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''}`}>
                      <td className="px-3 py-1.5 font-semibold whitespace-nowrap text-slate-800 dark:text-slate-100">{it.contractorNo || it.ownerNo || it.vendorNo || '—'}</td>
                      <td className="px-3 py-1.5 max-w-96"><div className="truncate" title={`${it.titleRu}\n${it.titleEn}`}>{it.titleRu || it.titleEn}</div></td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{it.vdrCode}</td>
                      <td className="px-3 py-1.5 font-bold">{it.revision}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{fmtD(it.issueDate)}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-2 py-0.5 rounded-md font-bold whitespace-nowrap ${STATUS_META[it.status]?.cls || ''}`}>{STATUS_META[it.status]?.label || it.status}</span>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <select value={it.assigneeId || ''} onChange={e => patchItem(it.id, { assigneeId: e.target.value || null })}
                          className="bg-transparent border-none text-xs text-slate-600 dark:text-slate-300 cursor-pointer focus:outline-none max-w-28">
                          <option value="">—</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-0.5">
                          {it.docId ? (
                            <button title="Открыть документ" onClick={() => navigate(`/constructor?doc=${it.docId}`)}
                              className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"><FileText className="w-3.5 h-3.5" /></button>
                          ) : (
                            <button title="Сформировать документ по этой строке" onClick={() => createDoc(it)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
                          )}
                          {it.status !== 'READY' && it.status !== 'ACCEPTED' && (
                            <button title="Готово — уведомить менеджера" onClick={() => setStatus(it, 'READY')}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"><Send className="w-3.5 h-3.5" /></button>
                          )}
                          {it.status === 'READY' && (
                            <>
                              <button title="Замечания — вернуть исполнителю" onClick={() => setStatus(it, 'REMARKS')}
                                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"><AlertTriangle className="w-3.5 h-3.5" /></button>
                              <button title="Принят заказчиком" onClick={() => setStatus(it, 'ACCEPTED')}
                                className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                          <button title="Повысить ревизию" onClick={() => revisionUp(it)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"><ArrowUpCircle className="w-3.5 h-3.5" /></button>
                          {/^[A-Za-z]$/.test(it.revision) && (
                            <button title="Утвердить (ревизия 0, CEF)" onClick={() => certifyRevision(it)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer text-[10px] font-black">0</button>
                          )}
                          <button title="Изменить" onClick={() => setEditing(it)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                          {canManage && (
                            <button title="Удалить строку" onClick={() => deleteItem(it)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Строк нет. Импортируйте Excel-ВДР или добавьте строку вручную.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-850">
              {filtered.length} из {items.length} строк {register.poNumber ? `· Заказ ${register.poNumber}` : ''} {register.vendor ? `· ${register.vendor}` : ''}
            </div>
          </div>
        </>
      )}

      {/* Модалка: правка/создание строки */}
      {editing && (
        <ItemEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ItemEditor({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const { addToast } = useToastStore();
  const [f, setF] = useState({ ...item });
  const [busy, setBusy] = useState(false);
  const isNew = !item.id;

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        registerId: f.registerId,
        contractorNo: f.contractorNo, ownerNo: f.ownerNo, vendorNo: f.vendorNo,
        titleEn: f.titleEn, titleRu: f.titleRu, vdrCode: f.vdrCode,
        revision: f.revision, language: f.language,
      };
      const r = await fetch(isNew ? '/api/vdr/items' : `/api/vdr/items/${item.id}`, {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); addToast(d.error || 'Ошибка', 'error'); return; }
      addToast(isNew ? 'Строка добавлена' : 'Сохранено', 'success');
      onSaved();
    } finally { setBusy(false); }
  };

  const F = ({ label, k, ph }: { label: string; k: keyof typeof f; ph?: string }) => (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase">{label}</label>
      <input value={String(f[k] || '')} onChange={e => setF(s => ({ ...s, [k]: e.target.value }))} placeholder={ph}
        className="w-full mt-0.5 px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 dark:text-white">{isNew ? 'Новая строка реестра' : 'Строка реестра'}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <F label="№ подрядчика (Contractor)" k="contractorNo" ph="22062-PEQ-0371-C01-0001" />
          <F label="№ заказчика (Owner)" k="ownerNo" />
          <F label="№ поставщика (Vendor)" k="vendorNo" />
          <F label="Тип (VDR-код)" k="vdrCode" ph="E02" />
          <F label="Ревизия" k="revision" ph="A" />
          <F label="Язык" k="language" ph="RU/EN" />
        </div>
        <F label="Наименование (рус)" k="titleRu" />
        <F label="Наименование (англ)" k="titleEn" />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer">Отмена</button>
          <button onClick={save} disabled={busy}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
