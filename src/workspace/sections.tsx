/**
 * Реестр разделов программы — единый источник правды о том, какой путь какому
 * экрану соответствует. Используется и роутером, и рабочим столом (Workspace),
 * который держит разделы «живыми» (keep-alive) и раскладывает их по панелям.
 *
 * Каждый раздел лениво подгружается (как и раньше), плюс несёт метаданные:
 *  - scroll: 'auto'  — раздел прокручивается сам (стандартный контент)
 *            'fixed' — раздел занимает всю высоту и управляет прокруткой внутри
 *  - pad: нужен ли внешний отступ p-6 (у таблиц/чатов свой лэйаут)
 */
import React, { lazy } from 'react';
import { Home, FolderKanban, Tag, Fan, BookOpen, Briefcase, FolderOpen, Table2, NotebookPen, MessagesSquare, Wand2, Settings, ClipboardList, Users } from 'lucide-react';

const Dashboard = lazy(() => import('../screens/Dashboard'));
const Explorer = lazy(() => import('../screens/Explorer'));
const Registry = lazy(() => import('../screens/Registry'));
const UniversalGenerator = lazy(() => import('../screens/UniversalGenerator'));
const DictionaryEditor = lazy(() => import('../screens/DictionaryEditor'));
const Equipment = lazy(() => import('../screens/Equipment'));
const UsersManagement = lazy(() => import('../screens/UsersManagement'));
const NotesManagement = lazy(() => import('../screens/NotesManagement'));
const ProjectsManagement = lazy(() => import('../screens/ProjectsManagement'));
const ChatManagement = lazy(() => import('../screens/ChatManagement'));
const LogsManagement = lazy(() => import('../screens/LogsManagement'));
const ProcurementManagement = lazy(() => import('../screens/ProcurementManagement'));
const SettingsScreen = lazy(() => import('../screens/SettingsScreen'));
const ConstructorScreen = lazy(() => import('../screens/ConstructorScreen'));

export interface SectionDef {
  path: string;
  title: string;
  scroll: 'auto' | 'fixed';
  pad: boolean;
  adminOnly?: boolean;
  /** Значок раздела: тот же в левом меню и на вкладке рабочего стола */
  icon?: React.ComponentType<{ className?: string }>;
  Component: React.LazyExoticComponent<React.ComponentType<any>>;
}

export const SECTIONS: SectionDef[] = [
  { path: '/', title: 'Главная', icon: Home, scroll: 'auto', pad: true, Component: Dashboard },
  { path: '/projects', title: 'Проекты', icon: FolderKanban, scroll: 'auto', pad: true, Component: ProjectsManagement },
  { path: '/registry', title: 'Теги', icon: Tag, scroll: 'fixed', pad: true, Component: Registry },
  { path: '/equipment', title: 'Оборудование', icon: Fan, scroll: 'auto', pad: true, Component: Equipment },
  { path: '/directory', title: 'Справочник', icon: BookOpen, scroll: 'fixed', pad: true, Component: DictionaryEditor },
  { path: '/management', title: 'Менеджмент', icon: Briefcase, scroll: 'auto', pad: true, Component: ProcurementManagement },
  { path: '/explorer', title: 'Проводник', icon: FolderOpen, scroll: 'auto', pad: true, Component: Explorer },
  { path: '/constructor', title: 'Конструктор', icon: Table2, scroll: 'auto', pad: true, Component: ConstructorScreen },
  { path: '/notes', title: 'Блокнот', icon: NotebookPen, scroll: 'auto', pad: true, Component: NotesManagement },
  { path: '/chat', title: 'Чат', icon: MessagesSquare, scroll: 'fixed', pad: true, Component: ChatManagement },
  { path: '/generator', title: 'Генератор', icon: Wand2, scroll: 'auto', pad: true, Component: UniversalGenerator },
  { path: '/settings', title: 'Настройки', icon: Settings, scroll: 'auto', pad: true, Component: SettingsScreen },
  { path: '/logs', title: 'Журнал', icon: ClipboardList, scroll: 'auto', pad: true, Component: LogsManagement },
  { path: '/users', title: 'Сотрудники', icon: Users, scroll: 'auto', pad: true, adminOnly: true, Component: UsersManagement },
];

const BY_PATH = new Map(SECTIONS.map((s) => [s.path, s]));

// Раздел по пути ('/registry' и т.п.); неизвестный путь → Главная
export function sectionForPath(pathname: string): SectionDef {
  return BY_PATH.get(pathname) || SECTIONS[0];
}

export function isKnownSection(pathname: string): boolean {
  return BY_PATH.has(pathname);
}
