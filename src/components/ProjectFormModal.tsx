import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Layers, X } from 'lucide-react';
import type { ProjectInput } from '../services/dataService';
import ProjectFields, { draftOf, trimmed, type ProjectDraft } from './ProjectFields';

interface Props {
  title?: string;
  initial?: ProjectInput;
  onClose: () => void;
  onSave: (data: ProjectInput) => Promise<void> | void;
}

/**
 * Окно создания проекта. Поля берутся из ProjectFields — того же набора, что и
 * в карточке проекта при правке: раньше формы расходились, и код, заказчик и
 * подрядчик, заданные здесь, потом нельзя было исправить.
 */
export default function ProjectFormModal({ title = 'Новый проект', initial, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<ProjectDraft>(() => draftOf(initial));
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(trimmed(draft));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-md" onClick={() => !busy && onClose()} />
      <div className="flex min-h-full items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15 }}
          className="@container relative w-full max-w-lg max-h-[88vh] overflow-y-auto scrollbar-thin rounded-lg bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800"
        >
          <div className="flex items-center justify-between gap-2 mb-5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2 min-w-0 text-emerald-700 dark:text-emerald-400">
              <Layers className="w-5 h-5 shrink-0" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{title}</h3>
            </div>
            <button type="button" title="Закрыть окно" onClick={onClose} disabled={busy} className="p-1 shrink-0 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit}>
            <ProjectFields value={draft} onChange={setDraft} disabled={busy} />

            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-slate-650 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-850 rounded-lg text-sm font-semibold cursor-pointer">Отмена</button>
              <button type="submit" disabled={busy} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md cursor-pointer disabled:opacity-50">
                {busy ? 'Сохранение…' : 'Создать'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
