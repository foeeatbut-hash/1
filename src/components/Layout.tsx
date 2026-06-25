import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { Database, Folder, Home, LogOut, Settings, FileText, Plus, Book, ChevronDown, ChevronRight, ChevronLeft, Menu, Tag, Sun, Moon, Users, ClipboardList, Layers, MessageSquare, ChevronUp, X, User, Loader2, Check, Terminal, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ToastProvider from './ToastProvider';
import ModalProvider from './ModalProvider';
import UpdaterWidget from './UpdaterWidget';
import { dataService } from '../services/dataService';
import { useLogStore } from '../store/logStore';
import { useAssistantStore } from '../store/assistantStore';
import AssistantPanel from './AssistantPanel';
import NotificationsPanel from './NotificationsPanel';
import RightRail from './RightRail';
import NotificationSettings from './NotificationSettings';
import { ENV_CONFIG } from '../config/env';

export default function Layout() {
  const { user, setUser, activeProject, theme, toggleTheme, syncStatus } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [eqOpen, setEqOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<'profile' | 'settings' | 'updates'>('profile');

  const [dbLocation, setDbLocation] = useState('');
  const [dbDisplayLocation, setDbDisplayLocation] = useState('');
  const [dbType, setDbType] = useState<'LOCAL' | 'REMOTE' | string>('LOCAL');
  const [activeDbType, setActiveDbType] = useState<'LOCAL' | 'REMOTE' | string>('LOCAL');
  const [crashLogDir, setCrashLogDir] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSavingDb, setIsSavingDb] = useState(false);
  const [dbStatusMessage, setDbStatusMessage] = useState<{ text: string; success: boolean } | null>(null);

  const addLog = useLogStore((state) => state.addLog);
  const toggleAssistant = useAssistantStore((s) => s.toggleOpen);

  React.useEffect(() => {
    dataService.getDbConfig()
      .then((config: any) => {
        setDbLocation(config.databasePath);
        setDbDisplayLocation(config.displayPath || config.databasePath);
        setDbType(config.current_db_type || 'LOCAL');
        setActiveDbType(config.current_db_type || 'LOCAL');
        setRemoteUrl(config.database_url || '');
        setCrashLogDir(config.crash_log_dir || '');
      })
      .catch(() => {});
  }, []);

  const handleDbSwitch = async (targetType: string, urlKey: string, dbPath?: string) => {
    setIsSavingDb(true);
    setDbStatusMessage(null);
    try {
      const resp = await fetch(`${ENV_CONFIG.apiUrl}/db/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_db_type: targetType,
          database_url: urlKey,
          ...(typeof dbPath === 'string' ? { database_path: dbPath } : {})
        })
      });
      const data = await resp.json();
      if (data.success) {
        setDbStatusMessage({ text: data.message, success: true });
        
        // Refresh active state
        const config = await dataService.getDbConfig() as any;
        setDbLocation(config.databasePath);
        setDbDisplayLocation(config.displayPath || config.databasePath);
        setDbType(config.current_db_type || 'LOCAL');
        setActiveDbType(config.current_db_type || 'LOCAL');
        setRemoteUrl(config.database_url || '');
        
        alert(data.message || 'Подключение успешно обновлено!');
        window.location.reload();
      } else {
        setDbStatusMessage({ text: data.message || 'Ошибка подключения!', success: false });
      }
    } catch (err: any) {
      setDbStatusMessage({ text: `Ошибка запроса: ${err.message}`, success: false });
    } finally {
      setIsSavingDb(false);
    }
  };

  // Выбор существующего файла БД (например, созданного другим пользователем)
  const handlePickDbFile = async () => {
    const win = window as any;
    if (!win.electron?.ipcRenderer?.invoke) {
      alert('Выбор файла доступен только в приложении PDM System (Electron).');
      return;
    }
    try {
      const filePath = await win.electron.ipcRenderer.invoke('database:select-file');
      if (filePath) {
        await handleDbSwitch('LOCAL', '', String(filePath));
      }
    } catch (err: any) {
      setDbStatusMessage({ text: `Ошибка выбора файла: ${err.message}`, success: false });
    }
  };

  const handleResetDbPath = async () => {
    if (!confirm('Вернуть стандартное расположение базы данных (папка профиля AppData/pdm-app)?')) return;
    await handleDbSwitch('LOCAL', '', '');
  };

  const saveCrashLogDir = async (dir: string) => {
    try {
      const resp = await fetch(`${ENV_CONFIG.apiUrl}/config/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crash_log_dir: dir })
      });
      const data = await resp.json();
      if (data.success) {
        setCrashLogDir(data.crash_log_dir || '');
        addLog('INFO', 'Система', `Папка для crash-логов изменена: ${data.crash_log_dir || 'по умолчанию (AppData/pdm-app/logs)'}`);
      }
    } catch (err: any) {
      addLog('ERROR', 'Система', `Не удалось сохранить папку crash-логов: ${err.message}`);
    }
  };

  const handlePickCrashLogDir = async () => {
    const win = window as any;
    if (!win.electron?.ipcRenderer?.invoke) {
      alert('Выбор папки доступен только в приложении PDM System (Electron).');
      return;
    }
    try {
      const dirPath = await win.electron.ipcRenderer.invoke('dialog:openDirectory');
      if (dirPath) {
        await saveCrashLogDir(String(dirPath));
      }
    } catch (err: any) {
      addLog('ERROR', 'Система', `Ошибка выбора папки: ${err.message}`);
    }
  };

  const handleDbTest = async () => {
    setIsTestingConnection(true);
    setDbStatusMessage(null);
    try {
      const resp = await fetch(`${ENV_CONFIG.apiUrl}/db/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_db_type: dbType,
          database_url: remoteUrl
        })
      });
      const data = await resp.json();
      if (data.success) {
        setDbStatusMessage({ text: data.message, success: true });
      } else {
        setDbStatusMessage({ text: data.message, success: false });
      }
    } catch (err: any) {
      setDbStatusMessage({ text: `Ошибка при проверке: ${err.message}`, success: false });
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Глобальный перехват событий для детального логирования действий пользователя
  const handleGlobalClick = React.useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target || typeof target.tagName !== 'string') return;

    // Безопасное извлечение атрибутов
    const getAttr = (el: HTMLElement, attr: string): string | null => {
      const val = el.getAttribute(attr);
      return val && val.trim() ? val.trim() : null;
    };

    // Поиск ближайшего интерактивного элемента
    let interactive: HTMLElement | null = null;
    let current: HTMLElement | null = target;

    while (current && current !== document.body && current !== document.documentElement) {
      const tagName = current.tagName.toUpperCase();
      const role = current.getAttribute('role');
      const classes = current.className || '';
      const hasCursorPointer = typeof classes === 'string' && (classes.includes('cursor-pointer') || current.classList.contains('cursor-pointer'));

      if (
        tagName === 'BUTTON' ||
        tagName === 'A' ||
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

    if (!interactive) return;

    // Определение описания элемента по приоритетам
    const labelOrTitle = getAttr(interactive, 'aria-label') || getAttr(interactive, 'title') || getAttr(target, 'aria-label') || getAttr(target, 'title');
    
    let text = '';
    if (interactive.textContent) {
      text = interactive.textContent.replace(/\s+/g, ' ').trim();
      if (text.length > 40) {
        text = text.substring(0, 37) + '...';
      }
    }

    const idOrName = getAttr(interactive, 'id') || getAttr(interactive, 'name') || getAttr(target, 'id') || getAttr(target, 'name');

    let extractedText = '';
    if (labelOrTitle) {
      extractedText = labelOrTitle;
    } else if (text) {
      extractedText = text;
    } else if (idOrName) {
      extractedText = idOrName;
    }

    if (extractedText) {
      addLog('INFO', 'UI_CLICK', `Нажата кнопка/элемент: "${extractedText}"`);
    }
  }, [addLog]);

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
    return () => {
      window.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('blur', handleGlobalBlur, true);
    };
  }, [handleGlobalClick, handleGlobalBlur]);

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

  const navItems = [
    { name: 'Главное', path: '/', icon: Home },
    { name: 'Рабочий чат', path: '/chat', icon: MessageSquare },
    { name: 'Блокнот', path: '/notes', icon: ClipboardList },
    { name: 'Проекты', path: '/projects', icon: Layers },
    { name: 'Проводник', path: '/explorer', icon: Folder },
  ];

  const eqItems = [
    { name: 'Теги', path: '/registry', icon: Tag },
    { name: 'Оборудование', path: '/equipment', icon: Database },
    { name: 'Справочник', path: '/directory', icon: Book },
  ];

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 dark:bg-dark-bg text-slate-800 dark:text-dark-text-main font-sans relative transition-colors duration-250">
      <aside className={`${isSidebarCollapsed ? 'w-0 opacity-0 -translate-x-full pointer-events-none' : 'w-64 opacity-100 translate-x-0'} bg-white dark:bg-dark-surface text-slate-700 dark:text-dark-text-muted flex flex-col transition-all duration-300 shrink-0 border-r border-slate-200 dark:border-dark-border`}>
        <div className="p-4 bg-slate-50 dark:bg-dark-surface flex items-center justify-between border-b border-slate-200 dark:border-dark-border">
          <div className="overflow-hidden">
            <h1 className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-white mb-1 truncate">MAX</h1>
            <p className="text-xs text-slate-500 dark:text-dark-text-muted truncate">Проект: {activeProject?.name || 'Не выбран'}</p>
          </div>
          <button 
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-dark-panel rounded text-slate-500 dark:text-dark-text-muted hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer ml-2 shrink-0"
            title="Скрыть боковую панель"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  data-tour={`nav-${item.path}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${
                    active
                      ? 'bg-emerald-700 text-white font-medium shadow-xs'
                      : 'hover:bg-slate-100 dark:hover:bg-dark-panel text-slate-600 dark:text-dark-text-muted hover:text-slate-900 dark:hover:text-dark-text-main'
                  }`}
                >
                  <item.icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400 dark:text-dark-text-muted'}`} />
                  <span className="text-sm font-medium">{item.name}</span>
                </Link>
              );
            })}

            {user && user.role === 'ADMIN' && (
              <Link
                to="/users"
                data-tour="nav-/users"
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${
                  location.pathname === '/users'
                    ? 'bg-emerald-700 text-white font-medium shadow-xs hover:text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-dark-panel text-slate-600 dark:text-dark-text-muted hover:text-slate-900 dark:hover:text-dark-text-main'
                }`}
              >
                <Users className={`w-4 h-4 ${location.pathname === '/users' ? 'text-white' : 'text-slate-400 dark:text-dark-text-muted'}`} />
                <span className="text-sm font-medium">Управление сотрудниками</span>
              </Link>
            )}
            
            <div className="mt-4 text-xs font-semibold text-slate-400 dark:text-dark-text-muted uppercase tracking-wider px-3 mb-1">
              Модули
            </div>
            
            <div className="space-y-1">
              <button
                onClick={() => setEqOpen(!eqOpen)}
                data-tour="eq-group"
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-600 dark:text-dark-text-muted hover:text-slate-900 dark:hover:text-dark-text-main hover:bg-slate-100 dark:hover:bg-dark-panel rounded-md transition-colors"
              >
                <div className="flex items-center gap-3 font-medium">
                  <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Оборудование и материалы
                </div>
                {eqOpen ? <ChevronDown className="w-4 h-4 text-slate-455 dark:text-dark-text-muted" /> : <ChevronRight className="w-4 h-4 text-slate-455 dark:text-dark-text-muted" />}
              </button>
              
              {eqOpen && (
                <div className="pl-9 pr-2 space-y-1 mt-1 mb-2">
                  {eqItems.map((item) => {
                    const active = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        data-tour={`nav-${item.path}`}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all ${
                          active
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 font-semibold border-l-2 border-emerald-500'
                            : 'text-slate-500 dark:text-dark-text-muted hover:text-slate-800 dark:hover:text-dark-text-main hover:bg-slate-100 dark:hover:bg-dark-panel'
                        }`}
                      >
                        <item.icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm">{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-surface shrink-0 relative">
          {createPortal(
            <AnimatePresence>
            {isProfileMenuOpen && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-md" onClick={() => setIsProfileMenuOpen(false)}>
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

                  {/* Вкладки профиля */}
                  <div className="flex gap-1 bg-slate-100 dark:bg-dark-surface rounded-lg p-1">
                    {([['profile', 'Профиль'], ['settings', 'Настройки'], ['updates', 'Обновления']] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setProfileTab(id)}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${profileTab === id ? 'bg-white dark:bg-dark-panel shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-white'}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {profileTab === 'profile' && (
                    <div className="flex flex-col gap-1.5">
                      {[['ФИО', user?.name], ['Логин', user?.symbol], ['Роль', user?.role]].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-slate-150 dark:border-dark-border bg-slate-50 dark:bg-dark-surface/40 text-xs">
                          <span className="text-slate-400 dark:text-dark-text-muted font-semibold">{k}</span>
                          <span className="text-slate-800 dark:text-dark-text-main font-bold truncate ml-2">{v || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {profileTab === 'settings' && (<>
                  {/* Themes Selection controls */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400 dark:text-dark-text-muted uppercase tracking-wider">Тема интерфейса:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => { if (theme !== 'light') toggleTheme(); }}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          theme !== 'dark'
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-slate-50 dark:bg-dark-surface text-slate-600 dark:text-dark-text-muted border-slate-200 dark:border-dark-border hover:bg-slate-100 dark:hover:bg-dark-panel'
                        }`}
                      >
                        <Sun className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>Светлая</span>
                      </button>
                      <button
                        onClick={() => { if (theme === 'light') toggleTheme(); }}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          theme === 'dark'
                            ? 'bg-emerald-600 text-white border-emerald-500 dark:bg-emerald-600 dark:border-emerald-500 dark:text-white'
                            : 'bg-slate-50 dark:bg-dark-surface text-slate-600 dark:text-dark-text-muted border-slate-200 dark:border-dark-border hover:bg-slate-100 dark:hover:bg-dark-panel'
                        }`}
                      >
                        <Moon className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Темная</span>
                      </button>
                    </div>
                  </div>

                  {/* Active Database path display widget */}
                  <div className="bg-slate-50 dark:bg-dark-surface/40 p-2.5 rounded-xl border border-slate-150 dark:border-dark-border text-left">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-dark-text-muted font-bold uppercase tracking-wider mb-2 font-sans">
                      <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>База данных</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                      <button
                        type="button"
                        onClick={() => setDbType('LOCAL')}
                        className={`py-1 px-1.5 rounded-lg border text-[11px] font-semibold transition text-center cursor-pointer ${
                          dbType === 'LOCAL'
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-white dark:bg-dark-panel text-slate-600 dark:text-dark-text-muted border-slate-200 dark:border-dark-border hover:bg-slate-100 dark:hover:bg-dark-surface'
                        }`}
                      >
                        Локальная
                      </button>
                      <button
                        type="button"
                        onClick={() => setDbType('REMOTE')}
                        className={`py-1 px-1.5 rounded-lg border text-[11px] font-semibold transition text-center cursor-pointer ${
                          dbType === 'REMOTE'
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-white dark:bg-dark-panel text-slate-600 dark:text-dark-text-muted border-slate-200 dark:border-dark-border hover:bg-slate-100 dark:hover:bg-dark-surface'
                        }`}
                      >
                        Сеть / PostgreSQL
                      </button>
                    </div>

                    {dbType === 'LOCAL' ? (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[10px] text-slate-500 dark:text-dark-text-muted leading-tight">
                          База database.sqlite в профиле пользователя. Работает автономно.
                        </p>
                        <p 
                          className="font-mono text-[9px] text-slate-600 dark:text-dark-text-muted bg-white dark:bg-dark-panel p-1.5 border border-slate-200 dark:border-dark-border rounded leading-tight select-all truncate"
                          title={dbLocation}
                        >
                          {dbDisplayLocation || 'database.sqlite'}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            disabled={isSavingDb}
                            onClick={handlePickDbFile}
                            className="bg-slate-100 hover:bg-slate-200 dark:bg-dark-surface dark:hover:bg-dark-panel text-slate-700 dark:text-dark-text-main text-[10px] font-semibold py-1 px-1.5 rounded-lg transition text-center cursor-pointer disabled:opacity-50"
                          >
                            Выбрать файл БД…
                          </button>
                          <button
                            type="button"
                            disabled={isSavingDb}
                            onClick={handleResetDbPath}
                            className="bg-slate-100 hover:bg-slate-200 dark:bg-dark-surface dark:hover:bg-dark-panel text-slate-700 dark:text-dark-text-main text-[10px] font-semibold py-1 px-1.5 rounded-lg transition text-center cursor-pointer disabled:opacity-50"
                          >
                            Стандартный путь
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={isSavingDb}
                          onClick={() => handleDbSwitch('LOCAL', '')}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold py-1 px-3 rounded-lg transition text-center cursor-pointer disabled:opacity-50"
                        >
                          {isSavingDb ? 'Подключение...' : activeDbType === 'LOCAL' ? 'Локальный режим активен ✓' : 'Включить Локальный режим'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[10px] text-slate-500 dark:text-dark-text-muted leading-tight">
                          Адрес удаленного подключения PostgreSQL:
                        </p>
                        <input
                          type="text"
                          value={remoteUrl}
                          onChange={(e) => setRemoteUrl(e.target.value)}
                          placeholder="postgresql://user:password@host:5432/dbname"
                          className="w-full font-mono text-[10px] bg-white dark:bg-dark-panel text-slate-850 dark:text-dark-text-main p-1.5 border border-slate-200 dark:border-dark-border rounded outline-none focus:border-emerald-500"
                        />
                        <div className="grid grid-cols-2 gap-1.5 mt-1">
                          <button
                            type="button"
                            disabled={isTestingConnection}
                            onClick={handleDbTest}
                            className="bg-slate-100 hover:bg-slate-200 dark:bg-dark-surface dark:hover:bg-dark-panel text-slate-700 dark:text-dark-text-main text-[10px] font-semibold py-1 px-1.5 rounded-lg transition text-center cursor-pointer disabled:opacity-50"
                          >
                            {isTestingConnection ? 'Проверка...' : 'Тестировать'}
                          </button>
                          <button
                            type="button"
                            disabled={isSavingDb}
                            onClick={() => handleDbSwitch('REMOTE', remoteUrl)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold py-1 px-1.5 rounded-lg transition text-center cursor-pointer disabled:opacity-50"
                          >
                            {isSavingDb ? 'Загрузка...' : 'Сохранить'}
                          </button>
                        </div>
                      </div>
                    )}

                    {dbStatusMessage && (
                      <div className={`mt-2 p-1 text-[9px] font-bold text-center rounded leading-tight ${
                        dbStatusMessage.success 
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450' 
                          : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450'
                      }`}>
                        {dbStatusMessage.text}
                      </div>
                    )}
                  </div>

                  {/* Crash-log directory settings */}
                  <div className="bg-slate-50 dark:bg-dark-surface/40 p-2.5 rounded-xl border border-slate-150 dark:border-dark-border text-left">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-dark-text-muted font-bold uppercase tracking-wider mb-1.5 font-sans">
                      <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Crash-логи</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-dark-text-muted leading-tight mb-1.5">
                      Папка для аварийных журналов при закрытии приложения:
                    </p>
                    <p
                      className="font-mono text-[9px] text-slate-600 dark:text-dark-text-muted bg-white dark:bg-dark-panel p-1.5 border border-slate-200 dark:border-dark-border rounded leading-tight select-all truncate mb-1.5"
                      title={crashLogDir || 'AppData/pdm-app/logs (по умолчанию)'}
                    >
                      {crashLogDir || 'AppData/pdm-app/logs (по умолчанию)'}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handlePickCrashLogDir}
                        className="bg-slate-100 hover:bg-slate-200 dark:bg-dark-surface dark:hover:bg-dark-panel text-slate-700 dark:text-dark-text-main text-[10px] font-semibold py-1 px-1.5 rounded-lg transition text-center cursor-pointer"
                      >
                        Выбрать папку…
                      </button>
                      <button
                        type="button"
                        onClick={() => saveCrashLogDir('')}
                        className="bg-slate-100 hover:bg-slate-200 dark:bg-dark-surface dark:hover:bg-dark-panel text-slate-700 dark:text-dark-text-main text-[10px] font-semibold py-1 px-1.5 rounded-lg transition text-center cursor-pointer"
                      >
                        По умолчанию
                      </button>
                    </div>
                  </div>

                  {/* Уведомления */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-400 dark:text-dark-text-muted uppercase tracking-wider">Уведомления:</span>
                    <NotificationSettings />
                  </div>
                  </>)}

                  {profileTab === 'updates' && (
                    <div className="w-full">
                      <UpdaterWidget />
                    </div>
                  )}

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

          {/* Interactive Profile Clickable Button (Trigger) */}
          <button
            type="button"
            data-tour="profile-btn"
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className={`w-full flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer text-left select-none outline-none group ${
              isProfileMenuOpen 
                ? 'bg-slate-200/70 dark:bg-dark-surface border border-slate-200 dark:border-dark-border' 
                : 'hover:bg-slate-150 dark:hover:bg-dark-surface border border-transparent'
            }`}
          >
            <div className="flex items-center gap-3 overflow-hidden min-w-0">
              {renderAvatar(true)}
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-slate-850 dark:text-white leading-tight truncate">{user?.name}</span>
                <span className="text-xs text-slate-550 dark:text-dark-text-muted leading-tight truncate">{user?.role}</span>
              </div>
            </div>
            {isProfileMenuOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-455 shrink-0 ml-1.5 transition-transform" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-455 shrink-0 ml-1.5 group-hover:text-slate-650 transition-transform" />
            )}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-100 dark:bg-dark-bg relative transition-colors duration-250">
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            className="absolute left-4 top-4 z-40 bg-slate-950 hover:bg-slate-905 text-white p-2.5 rounded-lg shadow-lg border border-slate-850 transition-all flex items-center gap-2 cursor-pointer duration-250 animate-pulse"
            title="Показать боковую панель"
          >
            <Menu className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-bold font-sans">Menu</span>
          </button>
        )}

        <div className={`flex-1 flex flex-col min-h-0 ${location.pathname === '/registry' || location.pathname === '/chat' || location.pathname === '/directory' ? 'overflow-hidden h-full' : 'overflow-y-auto'} ${isSidebarCollapsed ? 'pt-16 p-6' : 'p-6'}`}>
          <Outlet />
        </div>
      </main>

      {/* Раздвижные панели справа (сдвигают контент) + тонкий правый рельс */}
      <NotificationsPanel />
      <AssistantPanel />
      <RightRail />

      <ToastProvider />
      <ModalProvider />
    </div>
  );
}
