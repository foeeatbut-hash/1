import React, { useEffect } from 'react';
import { useStore } from '../store/store';
import { useAssistantStore } from '../store/assistantStore';
import { useNotificationStore } from '../store/notificationStore';
import { Bell, MessageCircleQuestion, LifeBuoy } from 'lucide-react';
import { WorkspaceRailControls } from './Workspace';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useNavigate } from 'react-router-dom';

/**
 * Тонкая правая панель-рельс (зеркало левого меню): Уведомления, ИИ-чат,
 * внизу — управление раскладкой рабочего стола (1/2/4 панели, вынос в окно).
 *
 * Ширина повторяет левое меню и переключается той же кнопкой сжатия. Раньше
 * рельс был жёстко 56 px против 96 у меню: зеркалом он назывался, но зеркалом
 * не был — рабочее поле оказывалось смещено на 40 px влево от середины окна,
 * и на пустых разделах это било в глаза. Заодно кнопки получили подписи:
 * «колокольчик» и «вопрос в кружке» без подписи угадывались только наведением.
 */
export default function RightRail() {
  const { user, sidebarCompact } = useStore();
  const navigate = useNavigate();
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

  /**
   * Справка по тому разделу, где человек стоит, — то же, что F1.
   * Помощник отвечает на вопрос словами, руководство объясняет раздел целиком;
   * это разные нужды, поэтому и кнопки разные.
   */
  const openHandbook = () => {
    const ws = useWorkspaceStore.getState();
    const pane = ws.panes.find((p) => p.id === ws.activePaneId);
    const path = pane ? (pane.stack.includes(pane.active) ? pane.active : pane.stack[pane.stack.length - 1]) : '/';
    if (path === '/handbook') return;
    const href = `/handbook?for=${encodeURIComponent(path)}`;
    ws.setFrozenHref(ws.activePaneId, '/handbook', href);
    ws.openInActivePane('/handbook');
    navigate(href);
  };

  // Та же геометрия, что у пунктов левого меню: в сжатом виде квадрат со
  // значком, в развёрнутом — значок с подписью под ним
  const btn = (active: boolean) =>
    `relative flex items-center cursor-pointer select-none transition-colors duration-[120ms] ${
      sidebarCompact ? 'justify-center w-11 h-11 rounded-xl' : 'flex-col justify-center gap-0.5 w-full py-1.5 rounded-xl'
    } ${
      active
        ? 'bg-emerald-600 text-white'
        : 'text-slate-500 dark:text-dark-text-muted hover:bg-slate-100 dark:hover:bg-dark-panel hover:text-slate-900 dark:hover:text-white'
    }`;

  return (
    <aside className={`shrink-0 ${sidebarCompact ? 'w-14' : 'w-24'} h-full bg-white dark:bg-dark-surface border-l border-slate-200 dark:border-dark-border flex flex-col items-center py-3 gap-2 px-1.5 transition-[width] duration-[240ms]`}>
      <button
        type="button"
        onClick={openNotif}
        className={`${btn(panelOpen)} ${chatUnread > 0 && !panelOpen ? 'ring-2 ring-emerald-500 text-emerald-600 dark:text-emerald-400' : ''}`}
        title="Уведомления"
        data-tour="notif-btn"
      >
        <Bell className={`w-5 h-5 shrink-0 ${chatUnread > 0 && !panelOpen ? 'animate-pulse' : ''}`} />
        {!sidebarCompact && <span className="text-2xs font-semibold leading-none">Уведомления</span>}
        {unread > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-white text-2xs font-bold flex items-center justify-center ${chatUnread > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <button type="button" onClick={openAI} className={btn(assistantOpen)} title="Помощник: вопросы по проекту" data-tour="assistant-btn">
        <MessageCircleQuestion className="w-5 h-5 shrink-0" />
        {!sidebarCompact && <span className="text-2xs font-semibold leading-none">Помощник</span>}
      </button>

      <button type="button" onClick={openHandbook} className={btn(false)} title="Руководство по этому разделу (F1)">
        <LifeBuoy className="w-5 h-5 shrink-0" />
        {!sidebarCompact && <span className="text-2xs font-semibold leading-none">Справка</span>}
      </button>

      <div className="mt-auto pt-2 border-t border-slate-200 dark:border-dark-border w-full flex justify-center">
        <WorkspaceRailControls />
      </div>
    </aside>
  );
}
