import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Layers, X } from 'lucide-react';
import type { ProjectInput } from '../services/dataService';

interface Props {
  title?: string;
  initial?: ProjectInput;
  onClose: () => void;
  onSave: (data: ProjectInput) => Promise<void> | void;
}

// Форма проекта: Наименование, Код, Заказчик, Подрядчик, Примечание (все необязательны)
export default function ProjectFormModal({ title = 'Новый проект', initial, onClose, onSave }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [code, setCode] = useState(initial?.code || '');
  const [customer, setCustomer] = useState(initial?.customer || '');
  const [contractor, setContractor] = useState(initial?.contractor || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        code: code.trim(),
        customer: customer.trim(),
        contractor: contractor.trim(),
        description: description.trim(),
      });
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all";
  const lbl = "block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1";

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={() => !busy && onClose()} />
      <div className="flex min-h-full items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800"
        >
          <div className="flex items-center justify-between mb-5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Layers className="w-5 h-5" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <div>
              <label className={lbl}>Наименование</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={busy} className={field} placeholder="Можно оставить пустым" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Код проекта</label>
                <input type="text" value={code} onChange={e => setCode(e.target.value)} disabled={busy} className={field} placeholder="—" />
              </div>
              <div>
                <label className={lbl}>Заказчик</label>
                <input type="text" value={customer} onChange={e => setCustomer(e.target.value)} disabled={busy} className={field} placeholder="—" />
              </div>
            </div>
            <div>
              <label className={lbl}>Подрядчик</label>
              <input type="text" value={contractor} onChange={e => setContractor(e.target.value)} disabled={busy} className={field} placeholder="—" />
            </div>
            <div>
              <label className={lbl}>Примечание</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={busy} rows={3} className={`${field} resize-none`} placeholder="—" />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-slate-650 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-850 rounded-lg text-sm font-semibold cursor-pointer">Отмена</button>
              <button type="submit" disabled={busy} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md cursor-pointer">
                {busy ? 'Сохранение…' : 'Создать'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
