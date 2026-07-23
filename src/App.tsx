/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store/store';
import Layout from './components/Layout';
import Login from './screens/Login';

// Стикер открывается отдельным окном Electron — вне рабочего стола
const StickerWindow = lazy(() => import('./screens/StickerWindow'));

import { SocketProvider } from './components/SocketProvider';
import { ServerGate } from './components/BootSplash';
import LicenseGate from './screens/LicenseGate';
import ActionLogWidget from './components/ActionLogWidget';
import AssistantSpotlight from './components/AssistantSpotlight';
import { setAssistantNavigator, setAssistantProjectGetter, useAssistantStore } from './store/assistantStore';

function ScreenLoader() {
  return (
    <div className="w-full h-full flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
    </div>
  );
}

// Кастомная полоса заголовка для Electron (frame:false): без надписи,
// слева компактный логотип MAX, справа красивые кнопки свернуть/развернуть/закрыть.
function ElectronTitleBar() {
  const location = useLocation();
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
  const wc = isElectron ? (window as any).electron?.windowControls : null;
  const [maximized, setMaximized] = React.useState(false);

  React.useEffect(() => {
    if (!wc) return;
    wc.isMaximized?.().then((v: boolean) => setMaximized(!!v)).catch(() => {});
    const off = wc.onMaximizedChange?.((v: boolean) => setMaximized(!!v));
    return () => { off && off(); };
  }, [wc]);

  if (!isElectron || location.pathname === '/sticker') return null;

  const btn = "w-11 h-9 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer";
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

  return (
    <div
      // z-[60] — выше стартовой заставки (#boot-splash, z-50): кнопки окна
      // доступны во время запуска сервера; фон у них одинаковый (#0f172a)
      className="relative z-[60] h-9 shrink-0 flex items-center justify-between bg-slate-900 border-b border-slate-800 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={() => wc?.maximize?.()}
    >
      {/* Компактный логотип слева, без названия */}
      <div className="flex items-center gap-2 pl-3">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
          <span className="text-[9px] font-black text-white tracking-tight">M</span>
        </div>
      </div>

      {/* Кнопки управления окном */}
      <div className="flex items-stretch h-full" style={noDrag}>
        <button onClick={() => wc?.minimize?.()} className={`${btn} hover:bg-slate-800`} title="Свернуть" style={noDrag}>
          <svg width="11" height="11" viewBox="0 0 11 11"><rect x="1" y="5" width="9" height="1.1" fill="currentColor" /></svg>
        </button>
        <button onClick={() => wc?.maximize?.()} className={`${btn} hover:bg-slate-800`} title={maximized ? 'Восстановить' : 'Развернуть'} style={noDrag}>
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1">
              <rect x="2.4" y="1.2" width="6.4" height="6.4" rx="1" />
              <rect x="1.2" y="3.4" width="6.4" height="6.4" rx="1" fill="#0f172a" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1"><rect x="1.4" y="1.4" width="8.2" height="8.2" rx="1.2" /></svg>
          )}
        </button>
        <button onClick={() => wc?.close?.()} className={`${btn} hover:bg-rose-600 rounded-tr-none`} title="Закрыть" style={noDrag}>
          <svg width="11" height="11" viewBox="0 0 11 11" stroke="currentColor" strokeWidth="1.2"><line x1="1.5" y1="1.5" x2="9.5" y2="9.5" /><line x1="9.5" y1="1.5" x2="1.5" y2="9.5" /></svg>
        </button>
      </div>
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

  // Сообщаем ассистенту текущий раздел (для контекстной встречи и подсказок)
  React.useEffect(() => {
    useAssistantStore.getState().setRoute(location.pathname);
  }, [location.pathname]);

  // Сессия API истекла или профиль отключён (401 от сервера) → на экран входа
  React.useEffect(() => {
    const onExpired = () => {
      if (useStore.getState().user) {
        useStore.getState().setUser(null);
      }
    };
    window.addEventListener('flux:auth-expired', onExpired);
    return () => window.removeEventListener('flux:auth-expired', onExpired);
  }, []);

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

  // Разделы держит «живыми» рабочий стол внутри Layout (keep-alive + панели),
  // поэтому здесь один маршрут: Layout сам решает, какой раздел показать по URL.
  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <Suspense fallback={<ScreenLoader />}>
        <Routes location={location}>
          {/* Standing standalone route outside the layout to prevent Sidebar/Header replication */}
          <Route path="/sticker" element={<StickerWindow />} />
          <Route path="*" element={<Layout />} />
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
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {/* Пока встроенный сервер поднимается — анимированная заставка вместо пустого экрана */}
            <ServerGate>
              <LicenseGate>
                <AnimatedRoutes />
              </LicenseGate>
            </ServerGate>
          </div>
        </div>
        <ActionLogWidget />
        <AssistantSpotlight />
      </SocketProvider>
    </Router>
  );
}
