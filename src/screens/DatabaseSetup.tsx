import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { useToastStore } from '../store/toastStore';
import { useStore } from '../store/store';
import { motion, AnimatePresence } from 'motion/react';
import { Database, FolderOpen, Loader2, AlertCircle, CheckCircle, Info, Sun, Moon } from 'lucide-react';

interface DatabaseSetupProps {
  onConfigured: () => void;
}

export default function DatabaseSetup({ onConfigured }: DatabaseSetupProps) {
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const { addToast } = useToastStore();

  const [dbPath, setDbPath] = useState('');
  const [defaultPath, setDefaultPath] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; exists: boolean; message: string } | null>(null);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    // Detect if we are running inside Electron
    const win = window as any;
    if (win.electron && win.electron.ipcRenderer) {
      setIsElectron(true);
    }

    // Fetch current dynamic config
    async function loadConfig() {
      try {
        const config = await dataService.getDbConfig();
        setDbPath(config.databasePath || config.defaultPath);
        setDefaultPath(config.defaultPath);
      } catch (err: any) {
        addToast('Не удалось загрузить текущую конфигурацию СУБД', 'error');
      }
    }
    loadConfig();
  }, []);

  const handleBrowse = async () => {
    const win = window as any;
    if (win.electron && win.electron.ipcRenderer) {
      try {
        const selectedPath = await win.electron.ipcRenderer.invoke('database:select-file');
        if (selectedPath) {
          setDbPath(selectedPath);
          setTestResult(null);
          addToast('Файл выбран из Проводника!', 'info');
        }
      } catch (err: any) {
        addToast(`Ошибка открытия Проводника: ${err.message}`, 'error');
      }
    } else {
      addToast('Выбор проводника доступен только при запуске в приложении Electron!', 'info');
    }
  };

  const handleTestConnection = async () => {
    if (!dbPath.trim()) {
      addToast('Пожалуйста, укажите путь к файлу базы данных!', 'info');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await dataService.testDbConnection(dbPath.trim());
      setTestResult({
        success: res.success,
        exists: res.exists,
        message: res.message
      });
      if (res.success) {
        addToast('Проверка пути завершена успешно!', 'success');
      } else {
        addToast(res.message || 'Ошибка проверки пути.', 'error');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        exists: false,
        message: err.message || 'Ошибка подключения.'
      });
      addToast(`Ошибка: ${err.message}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbPath.trim()) {
      addToast('Пожалуйста, укажите путь к файлу базы данных!', 'info');
      return;
    }
    setIsSaving(true);
    try {
      const res = await dataService.saveDbConfig(dbPath.trim());
      if (res.success) {
        addToast(res.message || 'Конфигурация успешно применена!', 'success');
        // Notify the parent component that setup is successfully configured
        onConfigured();
      } else {
        addToast(res.message || 'Не удалось сохранить конфигурацию.', 'error');
      }
    } catch (err: any) {
      addToast(`Ошибка при сохранении: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="db-setup-screen-root"
      className="min-h-screen w-full flex flex-col justify-between bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-250 relative p-4"
    >
      {/* Floating theme switcher */}
      <div className="absolute top-4 right-4 z-40">
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-650 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer flex items-center justify-center font-bold"
          title="Переключить тему"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-emerald-600" />}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-lg bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl transition-all"
        >
          {/* Header */}
          <div className="flex items-center gap-3.5 mb-6">
            <div className="p-3 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Конфигурация СУБД</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Укажите размещение файла базы данных SQLite</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Context Notice info */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-xl text-xs text-slate-600 dark:text-slate-400 leading-relaxed flex gap-2 w-full">
              <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                Вы запускаете программу локально. Для синхронизации чертежей и тегов, выберите или укажите путь к файлу БД. Если указанного файла не существует, система создаст его автоматически.
              </div>
            </div>

            {/* Path Form Input */}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                  Путь к файлу базы данных (.sqlite / .db)
                </label>
                <div className="flex gap-2">
                  <input
                    id="db-path-input"
                    type="text"
                    value={dbPath}
                    onChange={(e) => {
                      setDbPath(e.target.value);
                      setTestResult(null);
                    }}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-450 dark:placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                    placeholder="Пример: C:\pdm\database.sqlite"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="px-3.5 bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-sm"
                    title={isElectron ? "Выбрать расположение через Проводник Windows" : "Проводник доступен только в приложении Electron"}
                  >
                    <FolderOpen className="w-4 h-4 text-emerald-600" />
                    <span>Проводник</span>
                  </button>
                </div>
                {!isElectron && (
                  <p className="text-[10px] text-amber-650 dark:text-amber-400 mt-1 font-semibold">
                    * Запустите программу в Electron, чтобы выбирать файл кликом через Проводник Windows.
                  </p>
                )}
              </div>

              {/* Status Connection Indicator */}
              <AnimatePresence mode="wait">
                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className={`flex items-start gap-2.5 p-3.5 rounded-lg border text-xs leading-normal ${
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-semibold">{testResult.success ? 'Путь проверен!' : 'Ошибка проверки'}</p>
                      <p className="mt-0.5 opacity-90">{testResult.message}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Useful Copy Templates */}
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Шаблоны размещения для копирования:</p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDbPath(defaultPath);
                      setTestResult(null);
                    }}
                    className="p-2.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg text-left text-xs font-mono text-slate-600 dark:text-slate-300 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    <p className="text-[10px] font-sans font-bold text-emerald-600 mb-0.5">Внутренняя папка программы (по умолчанию):</p>
                    {defaultPath}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDbPath('C:\\pdm\\pdm_database.sqlite');
                      setTestResult(null);
                    }}
                    className="p-2.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg text-left text-xs font-mono text-slate-600 dark:text-slate-300 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    <p className="text-[10px] font-sans font-bold text-emerald-600 mb-0.5">Локальная папка диска C:</p>
                    C:\pdm\pdm_database.sqlite
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDbPath('//NAS-SERVER/SharedFolder/database.sqlite');
                      setTestResult(null);
                    }}
                    className="p-2.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg text-left text-xs font-mono text-slate-600 dark:text-slate-300 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    <p className="text-[10px] font-sans font-bold text-emerald-600 mb-0.5">Сетевой сервер / Общая папка NAS:</p>
                    {"\\\\NAS-SERVER\\SharedFolder\\database.sqlite"}
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-150 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isTesting || isSaving}
                  onClick={handleTestConnection}
                  className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-slate-800 text-sm font-semibold rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>Проверка пути...</span>
                    </>
                  ) : (
                    <span>Проверить путь</span>
                  )}
                </button>

                <button
                  id="save-db-button"
                  type="submit"
                  disabled={isTesting || isSaving}
                  className="flex-1 h-11 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-850 disabled:bg-emerald-800/50 text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Подключение...</span>
                    </>
                  ) : (
                    <span>Подключить СУБД</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>

      <div className="w-full text-center py-4 text-xs font-mono text-slate-400 dark:text-slate-600 tracking-wider">
        KKS Database Engine / Версия 1.10
      </div>
    </div>
  );
}
