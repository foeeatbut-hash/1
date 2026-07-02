import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { Database, Folder, Home, LogOut, Settings, FileText, Plus, Book, ChevronDown, ChevronRight, ChevronLeft, Menu, Tag, Sun, Moon, Users, ClipboardList, Layers, MessageSquare, ChevronUp, X, User, Loader2, Check, Terminal, Sparkles, MessagesSquare, NotebookPen, FolderKanban, FolderOpen, Fan, BookOpen, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ToastProvider from './ToastProvider';
import ModalProvider from './ModalProvider';
import { dataService } from '../services/dataService';
import { useLogStore } from '../store/logStore';
import { useAssistantStore } from '../store/assistantStore';
import AssistantPanel from './AssistantPanel';
import NotificationsPanel from './NotificationsPanel';
import RightRail from './RightRail';
import ShareLayer from './ShareLayer';
import { useNotificationStore } from '../store/notificationStore';
import { ENV_CONFIG } from '../config/env';

export default function Layout() {
  const { user, setUser, activeProject, theme, toggleTheme, syncStatus } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [eqOpen, setEqOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // На Главной (/) левой панели нет; в любом разделе она закреплена
  const sidebarHidden = location.pathname === '/';
  const chatUnread = useNotificationStore((s) => s.chatUnread);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const addLog = useLogStore((state) => state.addLog);
  const toggleAssistant = useAssistantStore((s) => s.toggleOpen);

  // Глобальный перехват событий для детального логирования действий пользователя.
  // Пишем КАЖДЫЙ клик (кнопка, поле, строка, пустое место) — чтобы при ошибке
  // по журналу было видно, что именно нажали и что произошло дальше.
  const describeElement = React.useCallback((el: HTMLElement, target?: HTMLElement): string => {
    const getAttr = (node: HTMLElement | undefined, attr: string): string | null => {
      if (!node) return null;
      const val = node.getAttribute(attr);
      return val && val.trim() ? val.trim() : null;
    };
    const labelOrTitle = getAttr(el, 'aria-label') || getAttr(el, 'title') || getAttr(el, 'placeholder')
      || getAttr(target, 'aria-label') || getAttr(target, 'title') || getAttr(target, 'placeholder');
    let text = '';
    if (el.textContent) {
      text = el.textContent.replace(/\s+/g, ' ').trim();
      if (text.length > 40) text = text.substring(0, 37) + '...';
    }
    const idOrName = getAttr(el, 'id') || getAttr(el, 'name') || getAttr(target, 'id') || getAttr(target, 'name');
    const shareLabel = getAttr(el, 'data-share-label');
    return labelOrTitle || shareLabel || text || idOrName || `<${el.tagName.toLowerCase()}>`;
  }, []);

  const handleGlobalClick = React.useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target || typeof target.tagName !== 'string') return;

    const tagName = target.tagName.toUpperCase();

    // 1. Клик в поле ввода — отдельная запись (видно, если поле «не печатает»)
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || (target as any).isContentEditable) {
      const inputEl = target as HTMLInputElement;
      if (inputEl.type === 'password') {
        addLog('INFO', 'UI_CLICK', 'Клик в поле пароля');
        return;
      }
      const state = inputEl.disabled ? ' [ПОЛЕ ОТКЛЮЧЕНО]' : (inputEl.readOnly ? ' [ТОЛЬКО ЧТЕНИЕ]' : '');
      addLog('INFO', 'UI_CLICK', `Клик в поле: "${describeElement(target)}"${state}`);
      return;
    }

    // 2. Ближайший интерактивный элемент (кнопка/ссылка/пункт списка)
    let interactive: HTMLElement | null = null;
    let current: HTMLElement | null = target;
    while (current && current !== document.body && current !== document.documentElement) {
      const tn = current.tagName.toUpperCase();
      const role = current.getAttribute('role');
      const classes = current.className || '';
      const hasCursorPointer = typeof classes === 'string' && (classes.includes('cursor-pointer') || current.classList.contains('cursor-pointer'));
      if (
        tn === 'BUTTON' ||
        tn === 'A' ||
        role === 'button' ||
        role === 'option' ||
        hasCursorPointer ||
        current.closest('[role="listbox"]') ||
        current.getAttribute('aria-haspopup') === 'listbox'
      ) {
        interactive = current;
        break;
      }
      current = current.parentElement;
    }

    if (interactive) {
      const disabledNote = (interactive as HTMLButtonElement).disabled ? ' [КНОПКА ОТКЛЮЧЕНА]' : '';
      addLog('INFO', 'UI_CLICK', `Нажата кнопка/элемент: "${describeElement(interactive, target)}"${disabledNote}`);
      return;
    }

    // 3. Прочие клики (строка, карточка, пустое место) — тоже фиксируем
    const desc = describeElement(target);
    addLog('INFO', 'UI_CLICK', `Клик: ${desc}`);
  }, [addLog, describeElement]);

  // Фокус в поле ввода: фиксируем сам факт входа в поле —
  // если дальше нет записи о вводе, значит поле не принимало текст
  const handleGlobalFocus = React.useCallback((e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target || typeof target.tagName !== 'string') return;
    const tagName = target.tagName.toUpperCase();
    if (tagName !== 'INPUT' && tagName !== 'TEXTAREA' && tagName !== 'SELECT' && !(target as any).isContentEditable) return;
    if (tagName === 'INPUT' && (target as HTMLInputElement).type === 'password') return;
    addLog('INFO', 'UI_FOCUS', `Фокус в поле: "${describeElement(target)}"`);
  }, [addLog, describeElement]);

  const handleGlobalBlur = React.useCallback((e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target || typeof target.tagName !== 'string') return;

    const tagName = target.tagName.toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
      const element = target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

      // Исключаем пароли из соображений безопасности
      if (tagName === 'INPUT' && (element as HTMLInputElement).type === 'password') {
        return;
      }

      // Название поля по приоритетам: placeholder, связанный label, name, id
      let fieldName = '';

      if ('placeholder' in element && element.placeholder) {
        fieldName = element.placeholder;
      }

      if (!fieldName && element.id) {
        const associatedLabel = document.querySelector(`label[for="${element.id}"]`);
        if (associatedLabel && associatedLabel.textContent) {
          fieldName = associatedLabel.textContent.trim();
        }
      }

      if (!fieldName) {
        const surroundingLabel = element.closest('label');
        if (surroundingLabel && surroundingLabel.textContent) {
          fieldName = surroundingLabel.textContent.trim();
        }
      }

      if (!fieldName && element.name) {
        fieldName = element.name;
      }

      if (!fieldName && element.id) {
        fieldName = element.id;
      }

      if (!fieldName) {
        fieldName = `Поле ${tagName.toLowerCase()}`;
      }

      fieldName = fieldName.replace(/\s+/g, ' ').trim();
      if (fieldName.length > 40) {
        fieldName = fieldName.substring(0, 37) + '...';
      }

      // Получаем значение
      let value = element.value;
      if (tagName === 'SELECT') {
        const selectEl = element as HTMLSelectElement;
        if (selectEl.selectedIndex >= 0) {
          const selectedOption = selectEl.options[selectEl.selectedIndex];
          if (selectedOption && selectedOption.text) {
            value = selectedOption.text.trim();
          }
        }
      }

      if (value && value.trim()) {
        addLog('INFO', 'UI_INPUT', `В поле "${fieldName}" введено значение: "${value}"`);
      }
    }
  }, [addLog]);

  React.useEffect(() => {
    window.addEventListener('click', handleGlobalClick, true);
    window.addEventListener('blur', handleGlobalBlur, true);
    window.addEventListener('focus', handleGlobalFocus, true);

    // Ошибки JS и промисов — сразу в журнал, рядом с последним кликом
    const onError = (e: ErrorEvent) => {
      addLog('ERROR', 'JS_ERROR', `${e.message} (${e.filename?.split('/').pop() || ''}:${e.lineno})`, e.error?.stack);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      addLog('ERROR', 'PROMISE', String(reason?.message || reason), reason?.stack);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('blur', handleGlobalBlur, true);
      window.removeEventListener('focus', handleGlobalFocus, true);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [handleGlobalClick, handleGlobalBlur, handleGlobalFocus, addLog]);

  const handleLogout = () => {
    setUser(null);
    navigate('/');
  };

  // Контроль доступа: периодически проверяем, что профиль не отключен и не просрочен.
  // Выбрасываем из сессии только при явном valid === false (а не при недоступности сервера).
  React.useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const verify = async () => {
      try {
        const res = await dataService.checkAuth(user.id);
        if (!cancelled && res && res.valid === false) {
          addLog('WARN', 'Безопасность', `Сессия завершена: ${res.reason || 'доступ отозван администратором'}`);
          alert(res.reason || 'Доступ к системе отозван администратором.');
          handleLogout();
        }
      } catch (e) {}
    };
    verify();
    const interval = setInterval(verify, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.id]);

  const renderAvatar = (isTrigger: boolean = false) => {
    let borderClass = "";
    let bgClass = "";
    
    if (syncStatus === 'saving') {
      borderClass = "border-emerald-500 ring-2 ring-emerald-500/20";
      bgClass = "bg-emerald-50 dark:bg-emerald-950/40";
    } else if (syncStatus === 'success') {
      borderClass = "border-emerald-500 ring-2 ring-emerald-500/20";
      bgClass = "bg-emerald-50 dark:bg-emerald-950/40";
    } else if (syncStatus === 'error') {
      borderClass = "border-rose-500 ring-2 ring-rose-500/20 animate-pulse";
      bgClass = "bg-rose-50 dark:bg-rose-950/20";
    } else {
      if (isTrigger) {
        borderClass = "border-slate-300 dark:border-dark-border";
        bgClass = "bg-slate-200/80 dark:bg-dark-panel";
      } else {
        borderClass = "border-emerald-200 dark:border-emerald-900";
        bgClass = "bg-emerald-100 dark:bg-emerald-950";
      }
    }

    const containerClasses = `w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold text-emerald-700 dark:text-emerald-400 border transition-all duration-350 shrink-0 select-none ${borderClass} ${bgClass}`;

    return (
      <div className={containerClasses} id={isTrigger ? "profile-trigger-avatar" : "profile-popover-avatar"}>
        <AnimatePresence mode="wait">
          {syncStatus === 'idle' && (
            <motion.span
              key="idle"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="block"
            >
              {user?.name?.charAt(0).toUpperCase()}
            </motion.span>
          )}
          
          {syncStatus === 'saving' && (
            <motion.div
              key="saving"
              initial={{ opacity: 0, scale: 0.8, rotate: -180 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.8, rotate: 180 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-center"
            >
              <Loader2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-spin" />
            </motion.div>
          )}
          
          {syncStatus === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="flex items-center justify-center"
            >
              <Check className="w-5 h-5 text-emerald-500" />
            </motion.div>
          )}
          
          {syncStatus === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center relative font-sans text-rose-500"
              title="Ошибка синхронизации"
            >
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full" id="avatar-sync-error" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Единый плоский список разделов (рельс с иконками + подписями)
  const navItems = [
    { name: 'Главная', path: '/', icon: Home },
    { name: 'Чат', path: '/chat', icon: MessagesSquare },
    { name: 'Блокнот', path: '/notes', icon: NotebookPen },
    { name: 'Проекты', path: '/projects', icon: FolderKanban },
    { name: 'Проводник', path: '/explorer', icon: FolderOpen },
    { name: 'Теги', path: '/registry', icon: Tag },
    { name: 'Менеджмент', path: '/management', icon: Briefcase },
    { name: 'Оборудование', path: '/equipment', icon: Fan },
    { name: 'Справочник', path: '/directory', icon: BookOpen },
  ];

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 dark:bg-dark-bg text-slate-800 dark:text-dark-text-main font-sans relative transition-colors duration-250">
      <aside className={`${sidebarHidden ? 'w-0 opacity-0 -translate-x-full pointer-events-none' : 'w-24 opacity-100 translate-x-0'} bg-white dark:bg-dark-surface text-slate-700 dark:text-dark-text-muted flex flex-col transition-all duration-300 shrink-0 border-r border-slate-200 dark:border-dark-border`}>
        <div className="px-1.5 pt-3 pb-2 flex flex-col items-center gap-0.5 border-b border-slate-200 dark:border-dark-border">
          <h1 className="text-lg font-bold font-mono tracking-tight text-slate-900 dark:text-white leading-none">MAX</h1>
          <p className="text-[9px] text-slate-500 dark:text-dark-text-muted text-center leading-tight line-clamp-2 px-1" title={activeProject?.name || 'Проект не выбран'}>
            {activeProject?.name || 'Без проекта'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          <nav className="flex flex-col gap-1 px-1.5">
            {[...navItems, ...(user && user.role === 'ADMIN' ? [{ name: 'Сотрудники', path: '/users', icon: Users }] : [])].map((item) => {
              const active = location.pathname === item.path;
              const chatGlow = item.path === '/chat' && chatUnread > 0 && !active;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  data-tour={`nav-${item.path}`}
                  data-share-route={item.path}
                  data-share-focus={`nav:${item.path}`}
                  data-share-label={item.name}
                  title={item.name}
                  className={`relative flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : chatGlow
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-400'
                        : 'text-slate-500 dark:text-dark-text-muted hover:bg-slate-100 dark:hover:bg-dark-panel hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] font-semibold leading-tight text-center break-words">{item.name}</span>
                  {item.path === '/chat' && chatUnread > 0 && (
                    <span className="absolute top-1 right-2 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{chatUnread}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-surface shrink-0 relative">
          {createPortal(
            <AnimatePresence>
            {isProfileMenuOpen && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md" onClick={() => setIsProfileMenuOpen(false)}>
                {/* Centered profile modal */}
                <motion.div
                  onClick={(e) => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="w-[min(94vw,420px)] bg-white dark:bg-dark-panel rounded-2xl border border-slate-200 dark:border-dark-border shadow-2xl p-4 flex flex-col gap-2.5 text-left select-none text-slate-800 dark:text-dark-text-main max-h-[88vh] overflow-y-auto scrollbar-none"
                >
                  {/* Header info */}
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-dark-border">
                    {renderAvatar(false)}
                    <div className="flex flex-col min-w-0 overflow-hidden">
                      <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate">{user?.name}</span>
                      <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-600 dark:text-emerald-400 leading-normal">{user?.role}</span>
                    </div>
                  </div>

                  {/* Данные профиля */}
                  <div className="flex flex-col gap-1.5">
                    {[['ФИО', user?.name], ['Логин', user?.symbol], ['Роль', user?.role]].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-slate-150 dark:border-dark-border bg-slate-50 dark:bg-dark-surface/40 text-xs">
                        <span className="text-slate-400 dark:text-dark-text-muted font-semibold">{k}</span>
                        <span className="text-slate-800 dark:text-dark-text-main font-bold truncate ml-2">{v || '—'}</span>
                      </div>
                    ))}
                  </div>

                  {/* Все настройки перенесены в раздел «Настройки» (левая панель) */}
                  <button
                    onClick={() => { setIsProfileMenuOpen(false); navigate('/settings'); }}
                    className="flex w-full items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold text-slate-700 dark:text-dark-text-main bg-slate-100 dark:bg-dark-surface hover:bg-slate-200 dark:hover:bg-dark-panel border border-slate-200 dark:border-dark-border rounded-lg transition-all cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-emerald-600" />
                    Настройки программы
                  </button>

                  {/* Foot Actions: Logout */}
                  <button 
                    onClick={handleLogout}
                     className="flex w-full items-center justify-center gap-1 px-2 py-2 text-xs text-rose-650 hover:text-white hover:bg-rose-600 active:scale-98 border border-rose-500/10 hover:border-transparent rounded-lg transition-all font-bold cursor-pointer mt-0.5"
                  >
                    <LogOut className="w-3 h-3 mr-1 text-rose-500 shrink-0" />
                    Выйти из аккаунта
                  </button>
                </motion.div>
              </div>
            )}
            </AnimatePresence>,
            document.body
          )}

          {/* Настройки программы — над профилем (перенесены из окна профиля) */}
          <Link
            to="/settings"
            data-share-route="/settings"
            data-share-label="Настройки"
            title="Настройки программы"
            className={`w-full flex flex-col items-center gap-1 p-2 mb-1.5 rounded-xl transition-all cursor-pointer select-none ${
              location.pathname === '/settings'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 dark:text-dark-text-muted hover:bg-slate-100 dark:hover:bg-dark-panel hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            <span className="text-[10px] font-semibold leading-tight">Настройки</span>
          </Link>

          {/* Interactive Profile Clickable Button (Trigger) */}
          <button
            type="button"
            data-tour="profile-btn"
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            title={`${user?.name || ''} · ${user?.role || ''}`}
            className={`w-full flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer select-none outline-none ${
              isProfileMenuOpen
                ? 'bg-slate-200/70 dark:bg-dark-surface border border-slate-200 dark:border-dark-border'
                : 'hover:bg-slate-150 dark:hover:bg-dark-surface border border-transparent'
            }`}
          >
            {renderAvatar(true)}
            <span className="text-[10px] font-bold text-slate-850 dark:text-white leading-tight truncate max-w-full">{(user?.name || '').split(' ')[0] || 'Профиль'}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200/70 dark:from-dark-bg dark:to-dark-surface relative transition-colors duration-250">

        <div className={`flex-1 flex flex-col min-h-0 ${location.pathname === '/registry' || location.pathname === '/chat' || location.pathname === '/directory' ? 'overflow-hidden h-full' : 'overflow-y-auto'} p-6`}>
          <Outlet />
        </div>
      </main>

      {/* Раздвижные панели справа (сдвигают контент) + тонкий правый рельс */}
      <NotificationsPanel />
      <AssistantPanel />
      <RightRail />

      <ToastProvider />
      <ModalProvider />
      <ShareLayer />
    </div>
  );
}
