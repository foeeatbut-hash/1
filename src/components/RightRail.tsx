import React, { useEffect } from 'react';
import { useStore } from '../store/store';
import { useAssistantStore } from '../store/assistantStore';
import { useNotificationStore } from '../store/notificationStore';
import { Bell, Sparkles } from 'lucide-react';

// Тонкая правая панель-рельс (зеркало левого меню): разделы Уведомления и ИИ-чат.
export default function RightRail() {
  const { user } = useStore();
  const assistantOpen = useAssistantStore(s => s.isOpen);
  const setAssistantOpen = useAssistantStore(s => s.setOpen);
  const { panelOpen, setPanelOpen, unread, fetch } = useNotificationStore();

  useEffect(() => { if (user?.id) fetch(user.id); }, [user?.id]);

  const openNotif = () => { setAssistantOpen(false); setPanelOpen(!panelOpen); };
  const openAI = () => { setPanelOpen(false); setAssistantOpen(!assistantOpen); };

  const btn = (active: boolean) =>
    `relative w-11 h-11 flex items-center justify-center rounded-xl transition-colors cursor-pointer ${active ? 'bg-emerald-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`;

  return (
    <aside className="shrink-0 w-14 h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col items-center py-3 gap-2">
      <button onClick={openNotif} className={btn(panelOpen)} title="Уведомления" data-tour="notif-btn">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <button onClick={openAI} className={btn(assistantOpen)} title="ИИ-чат (Помощник)" data-tour="assistant-btn">
        <Sparkles className="w-5 h-5" />
      </button>
    </aside>
  );
}
