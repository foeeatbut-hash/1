import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Loader2, Search, X } from 'lucide-react';

// Выбор строки ВДР поиском (номер/название/тип) — общий для Проводника
// («Прикрепить к строке ВДР») и редакторов («Привязать документ к ВДР»).
export interface VdrItemLite {
  id: string; registerId: string; registerName?: string;
  contractorNo: string; titleRu: string; titleEn: string;
  vdrCode: string; revision: string; status: string; docId?: string | null;
}

export default function VdrItemPicker({ projectId, title, onPick, onClose }: {
  projectId: string;
  title?: string;
  onPick: (item: VdrItemLite) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<VdrItemLite[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/vdr/items/search?projectId=${projectId}&q=${encodeURIComponent(q)}`);
        if (r.ok) setItems((await r.json()).items || []);
      } catch (_) {}
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, projectId]);

  return (
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <span className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-indigo-500" /> {title || 'Выбор строки ВДР'}
          </span>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 border-b border-slate-100 dark:border-slate-850">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Номер документа, название, тип…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850">
          {busy && <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>}
          {!busy && items.map(it => (
            <button key={it.id} onClick={() => onPick(it)}
              className="w-full text-left px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 cursor-pointer">
              <div className="text-xs font-bold text-slate-800 dark:text-white">{it.contractorNo || '—'} <span className="ml-1 text-indigo-500 font-semibold">{it.vdrCode}</span> <span className="ml-1 text-slate-400">рев. {it.revision}</span>{it.docId && <span className="ml-1.5 text-[10px] text-amber-600">уже связан с документом</span>}</div>
              <div className="text-xs text-slate-500 truncate">{it.titleRu || it.titleEn}</div>
              {it.registerName && <div className="text-[10px] text-slate-400">{it.registerName}</div>}
            </button>
          ))}
          {!busy && items.length === 0 && <div className="p-6 text-center text-xs text-slate-400">Не найдено</div>}
        </div>
      </div>
    </div>
  );
}
