/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useStore } from './store/store';
import Layout from './components/Layout';
import Login from './screens/Login';
import DatabaseSetup from './screens/DatabaseSetup';
import Dashboard from './screens/Dashboard';
import Explorer from './screens/Explorer';
import Registry from './screens/Registry';
import UniversalGenerator from './screens/UniversalGenerator';
import DictionaryEditor from './screens/DictionaryEditor';
import Equipment from './screens/Equipment';
import UsersManagement from './screens/UsersManagement';
import NotesManagement from './screens/NotesManagement';
import ProjectsManagement from './screens/ProjectsManagement';
import StickerWindow from './screens/StickerWindow';
import ChatManagement from './screens/ChatManagement';
import LogsManagement from './screens/LogsManagement';
import { dataService } from './services/dataService';
import { Loader2, Database } from 'lucide-react';

import { SocketProvider } from './components/SocketProvider';
import ActionLogWidget from './components/ActionLogWidget';

function AnimatedRoutes() {
  const user = useStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();

  const [dbConfigured, setDbConfigured] = React.useState<boolean | null>(null);
  const [isCheckingDb, setIsCheckingDb] = React.useState<boolean>(true);

  // Check if SQLite database file path is configured on local disk
  React.useEffect(() => {
    async function checkDb() {
      try {
        const config = await dataService.getDbConfig();
        setDbConfigured(config.isConfigured);
      } catch (err) {
        console.warn('Could not query database config, defaulting to configured:', err);
        setDbConfigured(true);
      } finally {
        setIsCheckingDb(false);
      }
    }
    checkDb();
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

  if (isCheckingDb) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-150 transition-colors">
        <div className="flex flex-col items-center gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl animate-pulse">
            <Database className="w-8 h-8" />
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Проверка подключения...</span>
          </div>
        </div>
      </div>
    );
  }

  if (dbConfigured === false) {
    return <DatabaseSetup onConfigured={() => setDbConfigured(true)} />;
  }

  if (!user) {
    return <Login onConfigureDatabase={() => setDbConfigured(false)} />;
  }

  return (
    <AnimatePresence mode="wait">
      <div key={location.pathname} className="w-full h-full flex flex-col overflow-hidden">
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
      </div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <Router>
      <SocketProvider>
        <AnimatedRoutes />
        <ActionLogWidget />
      </SocketProvider>
    </Router>
  );
}
