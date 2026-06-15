/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store/store';
import Layout from './components/Layout';
import Login from './screens/Login';

// Ленивые экраны: ускоряют первый запуск — тяжелые модули (граф, чат, Excel-парсер)
// подгружаются только при заходе на соответствующий раздел
const Dashboard = lazy(() => import('./screens/Dashboard'));
const Explorer = lazy(() => import('./screens/Explorer'));
const Registry = lazy(() => import('./screens/Registry'));
const UniversalGenerator = lazy(() => import('./screens/UniversalGenerator'));
const DictionaryEditor = lazy(() => import('./screens/DictionaryEditor'));
const Equipment = lazy(() => import('./screens/Equipment'));
const UsersManagement = lazy(() => import('./screens/UsersManagement'));
const NotesManagement = lazy(() => import('./screens/NotesManagement'));
const ProjectsManagement = lazy(() => import('./screens/ProjectsManagement'));
const StickerWindow = lazy(() => import('./screens/StickerWindow'));
const ChatManagement = lazy(() => import('./screens/ChatManagement'));
const LogsManagement = lazy(() => import('./screens/LogsManagement'));

import { SocketProvider } from './components/SocketProvider';
import ActionLogWidget from './components/ActionLogWidget';
import AssistantPanel from './components/AssistantPanel';
import AssistantSpotlight from './components/AssistantSpotlight';
import { setAssistantNavigator, setAssistantProjectGetter } from './store/assistantStore';

function ScreenLoader() {
  return (
    <div className="w-full h-full flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
    </div>
  );
}

// Кастомная полоса заголовка для Electron: системное меню скрыто (titleBarStyle hidden),
// эта полоса дает область перетаскивания окна; кнопки свернуть/развернуть/закрыть
// рисует сама ОС через titleBarOverlay
function ElectronTitleBar() {
  const location = useLocation();
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
  if (!isElectron || location.pathname === '/sticker') return null;
  return (
    <div
      className="h-9 shrink-0 flex items-center px-3 gap-2 bg-slate-900 border-b border-slate-800 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
      <span className="text-xs font-bold tracking-wider text-slate-300">PDM System</span>
      <span className="text-[10px] text-slate-500 font-mono">инженерная система управления данными</span>
    </div>
  );
}

function AnimatedRoutes() {
  const user = useStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();

  // Регистрируем навигатор и доступ к активному проекту для встроенного ассистента
  React.useEffect(() => {
    setAssistantNavigator((path: string) => navigate(path));
    setAssistantProjectGetter(() => useStore.getState().activeProject?.id || null);
  }, [navigate]);

  // Save the user's active route path when they interact
  React.useEffect(() => {
    if (user && location.pathname !== '/sticker') {
      localStorage.setItem(`pdm_last_path_${user.id}`, location.pathname + location.search);
    }
  }, [location, user]);

  // Restore the user's last visited route on initial load if they are at "/"
  React.useEffect(() => {
    if (user && location.pathname === '/') {
      const lastPath = localStorage.getItem(`pdm_last_path_${user.id}`);
      if (lastPath && lastPath !== '/') {
        navigate(lastPath, { replace: true });
      }
    }
  }, [user]);

  // Окно-стикер открывается отдельным окном Electron: не требуем повторного входа
  if (location.pathname === '/sticker') {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <StickerWindow />
      </Suspense>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <Suspense fallback={<ScreenLoader />}>
        <Routes location={location}>
          {/* Standing standalone route outside the layout to prevent Sidebar/Header replication */}
          <Route path="/sticker" element={<StickerWindow />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<ChatManagement />} />
            <Route path="/notes" element={<NotesManagement />} />
            <Route path="/projects" element={<ProjectsManagement />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/registry" element={<Registry />} />
            <Route path="/equipment" element={<Equipment />} />
            <Route path="/generator" element={<UniversalGenerator />} />
            <Route path="/directory" element={<DictionaryEditor />} />
            <Route path="/logs" element={<LogsManagement />} />
            <Route path="/users" element={user && user.role === 'ADMIN' ? <UsersManagement /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <SocketProvider>
        <div className="w-full h-screen flex flex-col overflow-hidden">
          <ElectronTitleBar />
          <div className="flex-1 min-h-0 overflow-hidden">
            <AnimatedRoutes />
          </div>
        </div>
        <ActionLogWidget />
        <AssistantPanel />
        <AssistantSpotlight />
      </SocketProvider>
    </Router>
  );
}
