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
  const { panelOpen, setPanelOpen, unread, chatUnread, startPolling, stopPolling } = useNotificationStore();

  useEffect(() => {
    if (user?.id) startPolling(user.id);
    const onFocus = () => { if (user?.id) useNotificationStore.getState().fetch(user.id); };
    window.addEventListener('focus', onFocus);
    return () => { stopPolling(); window.removeEventListener('focus', onFocus); };
  }, [user?.id]);

  const openNotif = () => { setAssistantOpen(false); setPanelOpen(!panelOpen); };
  const openAI = () => { setPanelOpen(false); setAssistantOpen(!assistantOpen); };

  const btn = (active: boolean) =>
    `relative w-11 h-11 flex items-center justify-center rounded-xl transition-colors cursor-pointer ${active ? 'bg-emerald-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`;

  return (
    <aside className="shrink-0 w-14 h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col items-center py-3 gap-2">
      <button onClick={openNotif} className={`${btn(panelOpen)} ${chatUnread > 0 && !panelOpen ? 'ring-2 ring-emerald-500 text-emerald-600 dark:text-emerald-400' : ''}`} title="Уведомления" data-tour="notif-btn">
        <Bell className={`w-5 h-5 ${chatUnread > 0 && !panelOpen ? 'animate-pulse' : ''}`} />
        {unread > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${chatUnread > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}>
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
