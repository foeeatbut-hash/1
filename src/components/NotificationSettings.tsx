import React, { useState } from 'react';
import { Bell, Volume2 } from 'lucide-react';
import { getPrefs, savePrefs, NOTIF_CATEGORIES, NotifPrefs } from '../lib/notifPrefs';

// Настройки уведомлений: мастер-тумблеры + по категориям (показ/звук)
export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => getPrefs());

  const update = (next: NotifPrefs) => { setPrefs(next); savePrefs(next); };

  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 cursor-pointer ${on ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Мастер-тумблеры */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-surface">
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-dark-text-main"><Bell className="w-4 h-4 text-amber-500" /> Всплывающие справа</span>
          <Toggle on={prefs.popups} onClick={() => update({ ...prefs, popups: !prefs.popups })} />
        </div>
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-surface">
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-dark-text-main"><Volume2 className="w-4 h-4 text-emerald-500" /> Звук уведомлений</span>
          <Toggle on={prefs.sound} onClick={() => update({ ...prefs, sound: !prefs.sound })} />
        </div>
      </div>

      {/* По категориям */}
      <div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-1 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <span>Категория</span><span>Показ</span><span>Звук</span>
        </div>
        <div className="space-y-1.5">
          {NOTIF_CATEGORIES.map(c => {
            const cur = prefs.categories[c.id] || { show: true, sound: true };
            return (
              <div key={c.id} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center p-2 rounded-lg border border-slate-200 dark:border-dark-border">
                <span className="text-xs text-slate-700 dark:text-dark-text-main truncate">{c.label}</span>
                <Toggle on={cur.show} onClick={() => update({ ...prefs, categories: { ...prefs.categories, [c.id]: { ...cur, show: !cur.show } } })} />
                <Toggle on={cur.sound} onClick={() => update({ ...prefs, categories: { ...prefs.categories, [c.id]: { ...cur, sound: !cur.sound } } })} />
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 mt-2">«Показ» — отображать всплывашку и в разделе уведомлений. Ошибки показываются всегда.</p>
      </div>
    </div>
  );
}
