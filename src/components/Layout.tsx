import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { Database, Folder, Home, LogOut, Settings, FileText, Plus, Book, ChevronDown, ChevronRight, ChevronLeft, Menu, Tag, Sun, Moon, Users, ClipboardList, Layers, MessageSquare, ChevronUp, X, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ToastProvider from './ToastProvider';
import ModalProvider from './ModalProvider';
import UpdaterWidget from './UpdaterWidget';
import { dataService } from '../services/dataService';

export default function Layout() {
  const { user, setUser, activeProject, theme, toggleTheme } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [eqOpen, setEqOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const [dbLocation, setDbLocation] = useState('');
  const [dbDisplayLocation, setDbDisplayLocation] = useState('');

  React.useEffect(() => {
    dataService.getDbConfig()
      .then((config) => {
        setDbLocation(config.databasePath);
        setDbDisplayLocation(config.displayPath || config.databasePath);
      })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    setUser(null);
    navigate('/');
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
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans relative transition-colors duration-250">
      <aside className={`${isSidebarCollapsed ? 'w-0 opacity-0 -translate-x-full pointer-events-none' : 'w-64 opacity-100 translate-x-0'} bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 flex flex-col transition-all duration-300 shrink-0 border-r border-slate-200 dark:border-slate-900`}>
        <div className="p-4 bg-slate-50 dark:bg-slate-950 flex items-center justify-between border-b border-slate-200 dark:border-slate-900">
          <div className="overflow-hidden">
            <h1 className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-white mb-1 truncate">MAX</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Проект: {activeProject?.name || 'Не выбран'}</p>
          </div>
          <button 
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer ml-2 shrink-0"
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
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${
                    active 
                      ? 'bg-emerald-700 text-white font-medium shadow-xs' 
                      : 'hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <item.icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="text-sm font-medium">{item.name}</span>
                </Link>
              );
            })}

            {user && user.role === 'ADMIN' && (
              <Link
                to="/users"
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${
                  location.pathname === '/users'
                    ? 'bg-emerald-700 text-white font-medium shadow-xs hover:text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Users className={`w-4 h-4 ${location.pathname === '/users' ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                <span className="text-sm font-medium">Управление сотрудниками</span>
              </Link>
            )}
            
            <div className="mt-4 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 mb-1">
              Модули
            </div>
            
            <div className="space-y-1">
              <button 
                onClick={() => setEqOpen(!eqOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors"
              >
                <div className="flex items-center gap-3 font-medium">
                  <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Оборудование и материалы
                </div>
                {eqOpen ? <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-550" /> : <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-550" />}
              </button>
              
              {eqOpen && (
                <div className="pl-9 pr-2 space-y-1 mt-1 mb-2">
                  {eqItems.map((item) => {
                    const active = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all ${
                          active 
                            ? 'bg-emerald-50 dark:bg-emerald-990/30 text-emerald-800 dark:text-emerald-400 font-semibold border-l-2 border-emerald-500' 
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
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
        
        <div className="p-4 border-t border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-950 shrink-0 relative">
          <AnimatePresence>
            {isProfileMenuOpen && (
              <>
                {/* Backdrop overlay to close when clicking outside */}
                <div 
                  className="fixed inset-0 z-45 bg-transparent" 
                  onClick={() => setIsProfileMenuOpen(false)} 
                />

                {/* Floating Options Panel (Popover) */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 12 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute bottom-[105%] left-2 right-2 mb-2 z-50 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl p-3 flex flex-col gap-2.5 text-left select-none text-slate-800 dark:text-slate-100 max-h-[calc(100vh-100px)] overflow-y-auto scrollbar-none"
                >
                  {/* Header info */}
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-850">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-sm font-extrabold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 shrink-0">
                      {user?.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0 overflow-hidden">
                      <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate">{user?.name}</span>
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-600 dark:text-emerald-400 leading-normal">{user?.role}</span>
                    </div>
                  </div>

                  {/* Themes Selection controls */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Тема интерфейса:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => { if (theme !== 'light') toggleTheme(); }}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          theme !== 'dark'
                            ? 'bg-emerald-600 text-white border-emerald-700 dark:border-emerald-800'
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850'
                        }`}
                      >
                        <Sun className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>Светлая</span>
                      </button>
                      <button
                        onClick={() => { if (theme === 'light') toggleTheme(); }}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          theme === 'dark'
                            ? 'bg-emerald-605 text-white border-emerald-650 dark:border-emerald-800 bg-emerald-700'
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850'
                        }`}
                      >
                        <Moon className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span>Темная</span>
                      </button>
                    </div>
                  </div>

                  {/* Active Database path display widget */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-150 dark:border-slate-900 text-left">
                    <div className="flex items-center gap-1.2 text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1 font-sans">
                      <Database className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>База данных (SQLite):</span>
                    </div>
                    <p 
                      className="font-mono text-[9px] text-slate-600 dark:text-slate-350 break-all select-all p-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded leading-normal" 
                      title={dbLocation}
                    >
                      {dbDisplayLocation || 'Не настроена'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Сменить размещение базы данных SQLite? Вас перенаправит на экран выбора пути.')) {
                          setUser(null);
                          fetch('/api/db/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ databasePath: dbLocation, isConfigured: false })
                          }).then(() => {
                            window.location.reload();
                          });
                        }
                      }}
                      className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer block"
                    >
                      Сменить файл БД →
                    </button>
                  </div>

                  {/* Auto-Updater System Panel */}
                  <div className="w-full">
                    <UpdaterWidget />
                  </div>

                  {/* Foot Actions: Logout */}
                  <button 
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-1 px-2 py-2 text-xs text-rose-650 hover:text-white hover:bg-rose-600 active:scale-98 border border-rose-500/10 hover:border-transparent rounded-lg transition-all font-bold cursor-pointer mt-0.5"
                  >
                    <LogOut className="w-3 h-3 mr-1 text-rose-500 shrink-0" />
                    Выйти из аккаунта
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Interactive Profile Clickable Button (Trigger) */}
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className={`w-full flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer text-left select-none outline-none group ${
              isProfileMenuOpen 
                ? 'bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800' 
                : 'hover:bg-slate-150 dark:hover:bg-slate-900 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-3 overflow-hidden min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-full bg-slate-200/80 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-emerald-700 dark:text-emerald-400 border border-slate-300 dark:border-slate-700">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-slate-850 dark:text-white leading-tight truncate">{user?.name}</span>
                <span className="text-xs text-slate-550 dark:text-slate-400 leading-tight truncate">{user?.role}</span>
              </div>
            </div>
            {isProfileMenuOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-450 shrink-0 ml-1.5 transition-transform" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-450 shrink-0 ml-1.5 group-hover:text-slate-650 transition-transform" />
            )}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-100 dark:bg-slate-900 relative transition-colors duration-250">
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            className="absolute left-4 top-4 z-40 bg-slate-950 hover:bg-slate-905 text-white p-2.5 rounded-lg shadow-lg border border-slate-850 transition-all flex items-center gap-2 cursor-pointer duration-250 animate-pulse"
            title="Показать боковую панель"
          >
            <Menu className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-bold font-sans">Меню</span>
          </button>
        )}
        <div className={`flex-1 flex flex-col min-h-0 ${location.pathname === '/registry' ? 'overflow-hidden h-full' : 'overflow-y-auto'} ${isSidebarCollapsed ? 'pt-16 p-6' : 'p-6'}`}>
          <Outlet />
        </div>
      </main>
      <ToastProvider />
      <ModalProvider />
    </div>
  );
}
