import React, { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { useNotificationStore } from '../store/notificationStore';
import { dataService, SystemChangeLog } from '../services/dataService';
import { useNavigate } from 'react-router-dom';
import { Bell, X, Globe, UserCircle, Clock } from 'lucide-react';

const catColor: Record<string, string> = {
  СИСТЕМА: 'text-slate-500',
  ОБОРУДОВАНИЕ: 'text-emerald-600',
  ЧАТ: 'text-indigo-500',
  ПРОЕКТЫ: 'text-amber-600',
  ДОСТУП: 'text-rose-600',
};

export default function NotificationsPanel() {
  const { user } = useStore();
  const { panelOpen, setPanelOpen, personal, fetch, markAllRead } = useNotificationStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'global' | 'mine'>('global');
  const [logs, setLogs] = useState<SystemChangeLog[]>([]);

  useEffect(() => {
    if (!panelOpen) return;
    dataService.getLogs().then(l => setLogs(l.slice(0, 50))).catch(() => {});
    if (user?.id) fetch(user.id);
  }, [panelOpen]);

  // При открытии вкладки «Мои» помечаем прочитанными
  useEffect(() => {
    if (panelOpen && tab === 'mine' && user?.id) {
      const t = setTimeout(() => markAllRead(user.id), 800);
      return () => clearTimeout(t);
    }
  }, [panelOpen, tab, user?.id]);

  const fmt = (iso?: string) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const go = (route?: string) => {
    if (route && route !== '#') { navigate(route); setPanelOpen(false); }
  };

  return (
    <aside className={`${panelOpen ? 'w-[360px] opacity-100' : 'w-0 opacity-0 pointer-events-none'} shrink-0 h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 overflow-hidden`}>
      <div className="w-[360px] h-full flex flex-col shrink-0">
        {/* Шапка */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 to-transparent shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Уведомления</h2>
          </div>
          <button onClick={() => setPanelOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer" title="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Вкладки */}
        <div className="flex p-1.5 gap-1 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <button onClick={() => setTab('global')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${tab === 'global' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850'}`}>
            <Globe className="w-3.5 h-3.5" /> По программе
          </button>
          <button onClick={() => setTab('mine')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${tab === 'mine' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850'}`}>
            <UserCircle className="w-3.5 h-3.5" /> Мои
          </button>
        </div>

        {/* Список */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
          {tab === 'global' ? (
            logs.length === 0 ? (
              <Empty text="Изменений пока нет" />
            ) : logs.map(l => (
              <button key={l.id} onClick={() => go(l.targetRoute)} className="w-full text-left p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-800 cursor-pointer">
                <div className="text-xs text-slate-800 dark:text-slate-200 leading-snug">{l.description}</div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">{l.userName}</span>
                  <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{fmt(l.createdAt)}</span>
                </div>
              </button>
            ))
          ) : (
            personal.length === 0 ? (
              <Empty text="Личных уведомлений нет" />
            ) : personal.map(n => (
              <button key={n.id} onClick={() => go(n.targetRoute)} className={`w-full text-left p-2.5 rounded-lg transition-colors border cursor-pointer ${n.isRead ? 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-850' : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40'}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${catColor[n.category] || 'text-slate-500'}`}>{n.category}</span>
                  {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5 leading-snug">{n.title}</div>
                {n.body && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{n.body}</div>}
                <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{fmt(n.createdAt)}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 py-16 text-xs">
      <Bell className="w-8 h-8 mb-2 opacity-40" />
      {text}
    </div>
  );
}
