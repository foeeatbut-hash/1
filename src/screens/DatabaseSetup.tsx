import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { useToastStore } from '../store/toastStore';
import { useStore } from '../store/store';
import { motion, AnimatePresence } from 'motion/react';
import { Database, FolderOpen, Loader2, AlertCircle, CheckCircle, Info, Sun, Moon, FileText, PlusCircle } from 'lucide-react';

interface DatabaseSetupProps {
  onConfigured: () => void;
}

export default function DatabaseSetup({ onConfigured }: DatabaseSetupProps) {
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const { addToast } = useToastStore();

  // Режим выбора: 'create' (Вариант А) или 'existing' (Вариант Б)
  const [setupMode, setSetupMode] = useState<'create' | 'existing'>('create');

  // Состояния для Варианта А (Создание новой БД)
  const [directoryPath, setDirectoryPath] = useState('');
  const [newDbFileName, setNewDbFileName] = useState('vostok_project');

  // Состояния для Варианта Б (Выбор существующей БД)
  const [existingDbPath, setExistingDbPath] = useState('');

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; exists: boolean; message: string } | null>(null);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    // Проверка, запущены ли в среде Electron
    const win = window as any;
    if (win.electron && win.electron.ipcRenderer) {
      setIsElectron(true);
    }

    // Загрузка начальной конфигурации из БД
    async function loadConfig() {
      try {
        const config = await dataService.getDbConfig();
        const pathVal = config.databasePath || config.defaultPath;
        setExistingDbPath(pathVal);
        
        // Разделяем директорию и имя по возможности для новой БД по умолчанию
        const separator = pathVal.includes('\\') ? '\\' : '/';
        const lastIndex = pathVal.lastIndexOf(separator);
        if (lastIndex !== -1) {
          setDirectoryPath(pathVal.substring(0, lastIndex));
        } else {
          setDirectoryPath(config.defaultPath.substring(0, config.defaultPath.lastIndexOf(separator)) || '.');
        }
      } catch (err: any) {
        addToast('Не удалось загрузить текущую конфигурацию СУБД', 'error');
      }
    }
    loadConfig();
  }, []);

  // Кнопка из Варианта А: Выбор папки через нативное окно Electron
  const handleBrowseDirectory = async () => {
    const win = window as any;
    if (win.electron && win.electron.ipcRenderer) {
      try {
        const selectedDir = await win.electron.ipcRenderer.invoke('dialog:openDirectory');
        if (selectedDir) {
          setDirectoryPath(selectedDir);
          setSetupMode('create');
          setTestResult(null);
          addToast('Директория выбрана успешно!', 'success');
        }
      } catch (err: any) {
        addToast(`Ошибка открытия Проводника: ${err.message}`, 'error');
      }
    } else {
      // Имитация или ручной ввод в Web-версии
      const dir = prompt('Введите путь к папке вручную:', directoryPath || '/projects/db');
      if (dir) {
        setDirectoryPath(dir);
        setSetupMode('create');
        setTestResult(null);
      }
    }
  };

  // Кнопка из Варианта Б: Выбор существующего файла через нативное окно Electron
  const handleBrowseExistingFile = async () => {
    const win = window as any;
    if (win.electron && win.electron.ipcRenderer) {
      try {
        const selectedFile = await win.electron.ipcRenderer.invoke('dialog:openFile');
        if (selectedFile) {
          setExistingDbPath(selectedFile);
          setSetupMode('existing');
          setTestResult(null);
          addToast('Файл базы данных выбран!', 'success');
        }
      } catch (err: any) {
        addToast(`Ошибка открытия Проводника: ${err.message}`, 'error');
      }
    } else {
      // Ручной ввод в Web-версии
      const file = prompt('Введите полный путь к БД sqlite вручную:', existingDbPath || '/projects/db/database.sqlite');
      if (file) {
        setExistingDbPath(file);
        setSetupMode('existing');
        setTestResult(null);
      }
    }
  };

  // Вычисление итогового пути для Варианта А
  const getCompiledNewDbPath = () => {
    if (!directoryPath) return '';
    const separator = directoryPath.includes('\\') ? '\\' : '/';
    let cleanFileName = newDbFileName.trim();
    if (!cleanFileName) cleanFileName = 'database';
    
    // Автоматически добавляем расширение .sqlite, если его нет
    const extension = '.sqlite';
    if (!cleanFileName.toLowerCase().endsWith(extension)) {
      cleanFileName = `${cleanFileName}${extension}`;
    }
    
    const hasTrailingSlash = directoryPath.endsWith('/') || directoryPath.endsWith('\\');
    return `${directoryPath}${hasTrailingSlash ? '' : separator}${cleanFileName}`;
  };

  // Метод отправки формы - "Подключить и запустить систему"
  const handleConnectAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let pathToSend = '';
    if (setupMode === 'create') {
      if (!directoryPath) {
        addToast('Пожалуйста, выберите директорию для создания базы данных!', 'info');
        return;
      }
      pathToSend = getCompiledNewDbPath();
    } else {
      if (!existingDbPath) {
        addToast('Пожалуйста, укажите существующий файл базы данных!', 'info');
        return;
      }
      pathToSend = existingDbPath.trim();
    }

    setIsSaving(true);
    setTestResult(null);
    try {
      addToast('Инициализация базы данных и применение миграций Prisma...', 'info');
      const res = await dataService.saveDbConfig(pathToSend);
      if (res.success) {
        addToast(res.message || 'СУБД успешно подключена!', 'success');
        // Запуск интерфейса приложения
        onConfigured();
      } else {
        setTestResult({
          success: false,
          exists: false,
          message: res.message || 'Не удалось настроить БД.'
        });
        addToast(res.message || 'Не удалось подключить базу данных.', 'error');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        exists: false,
        message: err.message || 'Ошибка подключения.'
      });
      addToast(`Критическая ошибка: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="db-setup-screen-root"
      className="min-h-screen w-full flex flex-col justify-between bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-250 relative p-4"
    >
      {/* Переключатель темы */}
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

      <div className="flex-1 flex items-center justify-center py-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-xl bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl transition-all"
        >
          {/* Шапка */}
          <div className="flex items-center gap-3.5 mb-6">
            <div className="p-3 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Настройка источников данных СУБД</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Выберите локальный сценарий подключения ККС СУБД SQLite</p>
            </div>
          </div>

          <form onSubmit={handleConnectAndRegister} className="space-y-6">
            {/* Вариант А: Создание новой базы данных */}
            <div 
              onClick={() => setSetupMode('create')}
              className={`p-5 rounded-xl border transition-all cursor-pointer relative ${
                setupMode === 'create'
                  ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-md ring-1 ring-emerald-500/30'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-lg ${setupMode === 'create' ? 'bg-emerald-500/25 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                    <PlusCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Вариант А: Создать новую базу данных</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-450">Инициализация чистой структуры таблиц в указанной директории</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="setupMode"
                  checked={setupMode === 'create'}
                  onChange={() => setSetupMode('create')}
                  className="w-4.5 h-4.5 text-emerald-600 border-slate-300 focus:ring-emerald-500 accent-emerald-500"
                />
              </div>

              {/* Две строки Варианта А */}
              <div className="space-y-3.5 mt-2 ml-1" onClick={(e) => e.stopPropagation()}>
                {/* Строка 1: Выбор директории */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">
                    Строка 1: Путь к директории новой БД
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={directoryPath}
                      onChange={(e) => {
                        setDirectoryPath(e.target.value);
                        setTestResult(null);
                      }}
                      className="flex-1 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-450 focus:outline-none focus:ring-1 focus:ring-emerald-550 focus:border-emerald-550 font-mono"
                      placeholder="Например: D:\PDM_Data"
                      required={setupMode === 'create'}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseDirectory}
                      className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Обзор/Выбрать папку</span>
                    </button>
                  </div>
                </div>

                {/* Строка 2: Название файла */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">
                    Строка 2: Название нового файла базы данных (.sqlite добавится автоматически)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newDbFileName}
                      onChange={(e) => {
                        setNewDbFileName(e.target.value);
                        setTestResult(null);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-450 focus:outline-none focus:ring-1 focus:ring-emerald-555 focus:border-emerald-555 font-semibold"
                      placeholder="Пример: database или vostok_project"
                      required={setupMode === 'create'}
                    />
                    <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 dark:text-slate-600 select-none">
                      .sqlite
                    </span>
                  </div>
                  {directoryPath && (
                    <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">
                      Будет сформирован путь: <span className="text-emerald-600 dark:text-emerald-450 font-semibold">{getCompiledNewDbPath()}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Вариант Б: Выбор существующей базы данных */}
            <div 
              onClick={() => setSetupMode('existing')}
              className={`p-5 rounded-xl border transition-all cursor-pointer relative ${
                setupMode === 'existing'
                  ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-md ring-1 ring-emerald-500/30'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-lg ${setupMode === 'existing' ? 'bg-emerald-500/25 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Вариант Б: Выбрать существующую базу данных</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-450">Использование файла готовой PDM-системы (*.sqlite, *.db)</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="setupMode"
                  checked={setupMode === 'existing'}
                  onChange={() => setSetupMode('existing')}
                  className="w-4.5 h-4.5 text-emerald-600 border-slate-300 focus:ring-emerald-500 accent-emerald-500"
                />
              </div>

              {/* ОДНА СТРОКА ВАРИАНТА Б */}
              <div className="space-y-3 mt-2 ml-1" onClick={(e) => e.stopPropagation()}>
                <div>
                  <label className="block text-[10px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">
                    Строка 3: Файл существующей sqlite базы данных
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={existingDbPath}
                      onChange={(e) => {
                        setExistingDbPath(e.target.value);
                        setTestResult(null);
                      }}
                      className="flex-1 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-450 focus:outline-none focus:ring-1 focus:ring-emerald-555 focus:border-emerald-555 font-mono"
                      placeholder="Пример: C:\pdm_project\database.sqlite"
                      required={setupMode === 'existing'}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseExistingFile}
                      className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <Database className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Выбрать файл базы данных</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Блок результатов */}
            <AnimatePresence mode="wait">
              {testResult && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-start gap-2.5 p-3.5 rounded-lg border bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Сбой подключения</p>
                    <p className="mt-0.5 opacity-90">{testResult.message}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Общая кнопка пуска ККС СУБД */}
            <div className="pt-2">
              <button
                id="connect-and-system-launch"
                type="submit"
                disabled={isSaving}
                className="w-full h-12 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:bg-emerald-800/50 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer font-sans"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin mr-1" />
                    <span>Инициализация СУБД...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4.5 h-4.5 mr-1" />
                    <span>Подключить и запустить систему</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Предупреждение о Web версии */}
          {!isElectron && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-4 text-center leading-normal">
              ⚠️ Вы используете приложение в браузере. Пути к файлам будут обработаны на сервере. При запуске через Electron станет доступен нативный Проводник ОС Windows.
            </p>
          )}
        </motion.div>
      </div>

      <div className="w-full text-center py-4 text-[10px] font-mono text-slate-400 dark:text-slate-600 tracking-wider uppercase">
        Vostok KKS Safe Storage Engine & DB Connector / Версия 1.2.0
      </div>
    </div>
  );
}
