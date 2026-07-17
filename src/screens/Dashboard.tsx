import React, { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { useModalStore } from '../store/modalStore';
import { can } from '../lib/permissions';
import ProjectFormModal from '../components/ProjectFormModal';
import { dataService, UserNote, SystemChangeLog, Project, ProjectInput } from '../services/dataService';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Home, Clock, History, FileText, ArrowRight, ExternalLink,
  ChevronRight, Calendar, User, Database, BookmarkCheck,
  Layers, CheckSquare, Square, FolderPlus, Plus,
  MessagesSquare, NotebookPen, FolderKanban, FolderOpen, Tag, Fan, BookOpen, Users, Briefcase, Table2
} from 'lucide-react';

export default function Dashboard() {
  const { user, activeProject, setActiveProject } = useStore();
  const { addToast } = useToastStore();
  const { openPrompt } = useModalStore();
  const navigate = useNavigate();

  const [logs, setLogs] = useState<SystemChangeLog[]>([]);
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Fetch log history and notes preview
  const fetchDashboardData = async () => {
    try {
      setLoadingLogs(true);
      const fetchedLogs = await dataService.getLogs();
      setLogs(fetchedLogs.slice(0, 4)); // Get last 4 rows as requested
    } catch (err) {
      console.error('Failed to load system logs:', err);
    } finally {
      setLoadingLogs(false);
    }

    try {
      setLoadingNotes(true);
      const fetchedNotes = await dataService.getNotes();
      setNotes(fetchedNotes.slice(0, 4)); // Get last 4 notes for elegant preview grid
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setLoadingNotes(false);
    }

    try {
      setLoadingProjects(true);
      const fetchedProjects = await dataService.getProjects();
      setProjects(fetchedProjects);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Format relative time (Russian)
  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'только что';
      if (diffMins < 60) return `${diffMins} мин. назад`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} ч. назад`;
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch (e) {
      return '';
    }
  };

  // Launch electronic floating sticker or window popup fallback
  const handleOpenSticker = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    const win = window as any;
    
    if (win.electron && win.electron.ipcRenderer) {
      win.electron.ipcRenderer.send('window:open-sticker', noteId);
      addToast('Стикер откреплен поверх окон ОС!', 'success');
    } else {
      // Browser popup window simulation
      const popup = window.open(
        `/#/sticker?id=${noteId}`,
        `sticker-${noteId}`,
        'width=320,height=380,menubar=no,status=no,toolbar=no,resizable=yes'
      );
      if (popup) {
        addToast('Стикер открыт во внешнем окне!', 'success');
      } else {
        addToast('Браузер заблокировал всплывающее окно.', 'info');
      }
    }
  };

  // Get current date formatted beautifully
  const getCurrentDateRussian = () => {
    return new Date().toLocaleDateString('ru-RU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleRowClick = (targetRoute: string) => {
    if (targetRoute && targetRoute !== '#') {
      navigate(targetRoute);
      addToast(`Переход по маршруту: ${targetRoute}`, 'info');
    }
  };

  const handleToggleActiveProject = (proj: Project) => {
    if (activeProject?.id === proj.id) {
      setActiveProject(null);
      addToast(`Проект "${proj.name}" деактивирован.`, 'info');
    } else {
      setActiveProject(proj);
      addToast(`Проект "${proj.name}" выбран как активный!`, 'success');
    }
  };

  const handleCreateProjectDirect = async (data: ProjectInput) => {
    try {
      const proj = await dataService.createProject(data, user?.id);
      addToast('Проект успешно создан', 'success');
      await dataService.createLog({
        userName: user?.name || 'Главный Администратор',
        userSymbol: user?.symbol || 'RaupovKhKh',
        description: `Создан новый инженерный проект: ${proj.name}`,
        targetRoute: '/projects'
      });
      setShowCreate(false);
      const fetchedProjects = await dataService.getProjects();
      setProjects(fetchedProjects);
    } catch (err: any) {
      addToast(err.message || 'Не удалось создать проект', 'error');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.25 }}
      className="max-w-6xl mx-auto space-y-6 text-slate-800 dark:text-dark-text-main font-sans select-none"
    >
      {/* WELCOME HEADER BLOCK */}
      <header className="p-6 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-2xl shadow-xs relative overflow-hidden transition-all">
        <div className="absolute top-0 right-0 p-8 opacity-5 text-slate-900 dark:text-white pointer-events-none">
          <Database className="w-48 h-48" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-dark-text-main">
            С возвращением, {user?.name || 'Инженер'}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-dark-text-muted">
            <span className="flex items-center gap-1 bg-slate-100 dark:bg-dark-panel px-2.5 py-1 rounded-md font-mono text-slate-655 font-bold dark:text-dark-text-main">
              <User className="w-3.5 h-3.5" />
              <span>Табельный номер ID: {user?.symbol || 'RaupovKhKh'}</span>
            </span>
            <span className="flex items-center gap-1.5 font-light">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{getCurrentDateRussian()}</span>
            </span>
          </div>
        </div>
      </header>

      {/* БЫСТРЫЙ ДОСТУП К РАЗДЕЛАМ */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border shadow-xs p-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-dark-text-main flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-emerald-600" />
          <span>Разделы</span>
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {[
            { name: 'Проекты', path: '/projects', icon: FolderKanban },
            { name: 'Теги', path: '/registry', icon: Tag },
            { name: 'Оборудование', path: '/equipment', icon: Fan },
            { name: 'Справочник', path: '/directory', icon: BookOpen },
            { name: 'Менеджмент', path: '/management', icon: Briefcase },
            { name: 'ВДР', path: '/management?tab=vdr', icon: Briefcase },
            { name: 'Проводник', path: '/explorer', icon: FolderOpen },
            { name: 'Конструктор', path: '/constructor', icon: Table2 },
            { name: 'Блокнот', path: '/notes', icon: NotebookPen },
            { name: 'Чат', path: '/chat', icon: MessagesSquare },
            ...(user?.role === 'ADMIN' ? [{ name: 'Сотрудники', path: '/users', icon: Users }] : []),
          ].map((s) => (
            <button
              key={s.path}
              onClick={() => navigate(s.path)}
              data-share-route={s.path}
              data-share-focus={`nav:${s.path}`}
              data-share-label={s.name}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border border-slate-150 dark:border-dark-border bg-slate-50 dark:bg-dark-surface/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-400 transition-colors cursor-pointer"
            >
              <s.icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] font-semibold text-slate-700 dark:text-dark-text-main text-center leading-tight">{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* THREE PANEL SECTIONS (slate / zinc design) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PANEL: LAST CHANGES LOG */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border shadow-xs flex flex-col overflow-hidden">
          <div className="border-b border-slate-100 dark:border-dark-border px-5 py-4 bg-slate-50/50 dark:bg-dark-surface/40 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-dark-text-main flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-600" />
              <span>Последние изменения</span>
            </h2>
            <button
              onClick={() => navigate('/logs')}
              className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-650 dark:hover:text-emerald-300 cursor-pointer font-bold flex items-center gap-0.5"
            >
              <span>Посмотреть все</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              {loadingLogs ? (
                <div id="logs-loading-spinner" className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
                  Синхронизация логов SQLite...
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500 flex flex-col items-center gap-1">
                  <Database className="w-6 h-6 text-slate-300 dark:text-slate-700" />
                  <span>История системных записей пуста</span>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    onClick={() => handleRowClick(log.targetRoute)}
                    className="p-3 bg-slate-50 dark:bg-dark-bg/50 hover:bg-slate-100/80 dark:hover:bg-dark-panel/60 border border-slate-200/50 dark:border-dark-border rounded-xl transition-all cursor-pointer flex items-start gap-3 relative group"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-dark-panel flex items-center justify-center font-bold text-xs uppercase text-slate-600 dark:text-dark-text-muted">
                      {log.userSymbol.slice(0, 2)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2.5">
                        <span className="text-xs font-bold text-slate-700 dark:text-dark-text-main truncate">
                          {log.userName} ({log.userSymbol})
                        </span>
                        <span className="text-xs text-slate-400 dark:text-dark-text-muted flex items-center gap-1 font-mono shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>{formatRelativeTime(log.createdAt)}</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-dark-text-muted mt-1 truncate">
                        {log.description}
                      </p>
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0 pr-1">
                      <ChevronRight className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* PANEL: LATEST NOTES PREVIEW GRID */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border shadow-xs flex flex-col overflow-hidden">
          <div className="border-b border-slate-100 dark:border-dark-border px-5 py-4 bg-slate-50/50 dark:bg-dark-surface/40 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-dark-text-main flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Мои заметки</span>
            </h2>
            <button
              onClick={() => navigate('/notes')}
              className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-650 dark:hover:text-emerald-300 cursor-pointer font-bold flex items-center gap-0.5"
            >
              <span>Посмотреть все</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {loadingNotes ? (
                <div id="notes-loading-spinner" className="col-span-2 py-12 text-center text-xs text-slate-400">
                  Загрузка заметок...
                </div>
              ) : notes.length === 0 ? (
                <div className="col-span-2 py-12 text-center text-xs text-slate-400 dark:text-slate-500 flex flex-col items-center gap-1.5">
                  <BookmarkCheck className="w-7 h-7 text-slate-300 dark:text-slate-750" />
                  <span>Панель заметок пуста</span>
                  <button
                    onClick={() => navigate('/notes')}
                    className="text-xs font-bold text-emerald-600 hover:underline mt-1 cursor-pointer"
                  >
                    Перейти и создать
                  </button>
                </div>
              ) : (
                notes.map((note) => {
                  const plainContent = note.content ? note.content.replace(/<[^>]*>/g, '') : '';
                  return (
                    <div
                      key={note.id}
                      className={`p-3.5 rounded-xl border relative flex flex-col justify-between hover:shadow-md transition-all group overflow-hidden ${
                        note.color || 'bg-slate-50 dark:bg-dark-bg/50 dark:border-dark-border'
                      }`}
                    >
                      <div>
                        <h3 className="text-slate-850 dark:text-dark-text-main font-bold text-xs truncate max-w-[170px]">
                          {note.title || 'Инженерная заметка'}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-dark-text-muted line-clamp-3 mt-1.5 leading-relaxed font-light">
                          {plainContent || 'Заметка не заполнена'}
                        </p>
                      </div>

                      <div className="mt-4 pt-2.5 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-2">
                        <button
                          onClick={() => navigate('/notes')}
                          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
                        >
                          Открыть
                        </button>
                        <button
                          onClick={(e) => handleOpenSticker(e, note.id)}
                          className="p-1.5 bg-black/5 dark:bg-dark-panel hover:bg-black/10 dark:hover:bg-dark-panel rounded-lg text-slate-600 dark:text-dark-text-muted hover:text-slate-900 dark:hover:text-dark-text-main cursor-pointer flex items-center gap-1 text-xs transition-all whitespace-nowrap shrink-0"
                          title="Открепить стикер (поверх других приложений ОС)"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span>На экран</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

        {/* PANEL: PROJECTS SELECTION */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border shadow-xs flex flex-col overflow-hidden">
          <div className="border-b border-slate-100 dark:border-dark-border px-5 py-4 bg-slate-50/50 dark:bg-dark-surface/40 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-dark-text-main flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>Проекты</span>
            </h2>
            <div className="flex items-center gap-2">
              {can(user, 'project.manage') && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-xs text-slate-500 dark:text-dark-text-muted hover:text-emerald-600 dark:hover:text-emerald-400 font-bold flex items-center gap-0.5 cursor-pointer"
                  title="Быстрое создание проекта"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Создать</span>
                </button>
              )}
              <button
                onClick={() => navigate('/projects')}
                className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-650 dark:hover:text-emerald-350 cursor-pointer font-bold flex items-center gap-0.5"
              >
                <span>Управление</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-4 flex-grow flex flex-col justify-between overflow-y-auto max-h-[350px]">
            <div className="space-y-2.5">
              {loadingProjects ? (
                <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
                  Загрузка проектов...
                </div>
              ) : projects.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500 flex flex-col items-center gap-1.5">
                  <Layers className="w-7 h-7 text-slate-300 dark:text-slate-755" />
                  <span>Список инженерных проектов пуст</span>
                  {can(user, 'project.manage') && (
                    <button
                      onClick={() => setShowCreate(true)}
                      className="text-xs font-bold text-emerald-600 hover:underline mt-1 cursor-pointer"
                    >
                      Создать проект
                    </button>
                  )}
                </div>
              ) : (
                projects.map((proj) => {
                  const isActive = activeProject?.id === proj.id;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => handleToggleActiveProject(proj)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 relative group ${
                        isActive
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/15 border-emerald-300 dark:border-emerald-800 shadow-xs'
                          : 'bg-slate-50 dark:bg-dark-bg/50 hover:bg-slate-100/80 dark:hover:bg-dark-panel/60 border-slate-200 dark:border-dark-border'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActiveProject(proj);
                        }}
                        className="shrink-0 mt-0.5 cursor-pointer text-slate-400 hover:text-emerald-650 dark:hover:text-emerald-400 focus:outline-none transition-colors"
                      >
                        {isActive ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 dark:text-dark-text-muted" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold leading-tight truncate ${isActive ? 'text-emerald-850 dark:text-emerald-400' : 'text-slate-800 dark:text-dark-text-main'}`}>
                            {proj.name}
                          </span>
                          <span className="text-xs font-mono font-semibold text-slate-400 dark:text-dark-text-muted uppercase shrink-0">
                            {proj.status === 'ACTIVE' ? 'Активен' : 'Архив'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-dark-text-muted mt-1 line-clamp-1 leading-normal font-light">
                          {proj.description || 'Инженерно-проектная документация.'}
                        </p>
                      </div>

                      <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0 pr-1">
                        <ChevronRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

      </div>

      {showCreate && (
        <ProjectFormModal title="Новый проект" onClose={() => setShowCreate(false)} onSave={handleCreateProjectDirect} />
      )}
    </motion.div>
  );
}
