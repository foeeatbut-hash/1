import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  CheckCircle2, 
  Download, 
  ArrowUpCircle,
  PlusCircle,
  Settings
} from 'lucide-react';
import { useToastStore } from '../store/toastStore';
import { useStore } from '../store/store';

export default function UpdaterWidget() {
  const { user } = useStore();
  const { addToast } = useToastStore();
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded'>('idle');
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Admin release publisher modal controls
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [pubVersion, setPubVersion] = useState('1.1.0');
  const [pubChangelog, setPubChangelog] = useState('');
  const [pubFileUrl, setPubFileUrl] = useState('https://github.com/myorg/myapp/releases/download/v1.1.0/myapp-setup.exe');
  const [isPublishing, setIsPublishing] = useState(false);

  // Running environment info
  const [isPackaged, setIsPackaged] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('1.0.0-dev');

  // Check if we are running in full Electron
  const isElectron = typeof window !== 'undefined' && (window as any).electron !== undefined;

  useEffect(() => {
    if (isElectron) {
      const elec = (window as any).electron;
      
      // Load current package parameters
      elec.isPackaged().then((res: boolean) => setIsPackaged(res));
      elec.getAppVersion().then((res: string) => setCurrentVersion(res));

      // Bind updater status listeners
      const unsubscribe = elec.onUpdaterStatus((state: string, data?: { percent?: number; version?: string; changelog?: string; releaseNotes?: string }) => {
        if (state === 'checking') {
          setStatus('checking');
          setError(null);
        } else if (state === 'available') {
          setStatus('available');
          if (data) {
            setVersion(data.version || '');
            setChangelog(data.changelog || data.releaseNotes || '');
          }
          setShowModal(true);
        } else if (state === 'downloading') {
          setStatus('downloading');
          if (data) {
            setProgress(Math.round(data.percent || 0));
          }
        } else if (state === 'downloaded') {
          setStatus('downloaded');
          if (data) {
            setVersion(data.version || '');
          }
          setProgress(100);
        }
      });

      const unsubscribeError = elec.onUpdaterError((errMsg: string) => {
        setError(errMsg);
        setStatus('idle');
        addToast(`Ошибка обновления: ${errMsg}`, 'error');
      });

      return () => {
        unsubscribe();
        unsubscribeError();
      };
    } else {
      // Browser environment mock initial parameters
      setIsPackaged(false);
      setCurrentVersion('1.0.0-dev');
    }
  }, [isElectron, addToast]);

  const handleCheckUpdate = async () => {
    setError(null);
    if (isElectron) {
      setStatus('checking');
      try {
        const result = await (window as any).electron.checkUpdates();
        if (result) {
          if (result.isDevelopment) {
            setStatus('idle');
            addToast('Режим изолированной разработки: Автоматические обновления отключены в Portable СУБД SQLite.', 'info');
          } else if (result.available) {
            setStatus('available');
            setVersion(result.version);
            setChangelog(result.changelog);
            setShowModal(true);
            addToast(`Найдена новая версия v${result.version}!`, 'success');
          } else {
            setStatus('idle');
            addToast('Сравнение версий завершено: обновлений не требуется.', 'info');
          }
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
        setStatus('idle');
        addToast(`Ошибка проверки: ${errMsg}`, 'error');
      }
    } else {
      // Simulate check in standard browser UI preview sandbox
      setStatus('checking');
      addToast('Поиск обновлений во внешней СУБД...', 'info');
      setTimeout(() => {
        setStatus('available');
        setVersion('1.3.0');
        setChangelog(
          '### PDM Sync Build v1.3.0\n\n' +
          '• Реализация реальной тихой перезаписи инсталляторов\n' +
          '• Удаленное хранение макетов и дистрибутивов в PostgreSQL\n' +
          '• Изолированный SQLite режим для Portable запусков\n' +
          '• Инженерный журнал логов и новые сокет каналы'
        );
        setShowModal(true);
        addToast('Обнаружено обновление v1.3.0 в СУБД!', 'success');
      }, 1200);
    }
  };

  const handleStartDownload = async () => {
    if (isElectron) {
      try {
        setStatus('downloading');
        setProgress(0);
        await (window as any).electron.startDownload();
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
        setStatus('idle');
        addToast(`Не удалось скачать обновление: ${errMsg}`, 'error');
      }
    } else {
      // Simulate download in Web isolated sandbox
      setStatus('downloading');
      setProgress(0);
      addToast('Началось скачивание дистрибутива...', 'info');
      
      let currentPercent = 0;
      const interval = setInterval(() => {
        currentPercent += 20;
        setProgress(currentPercent);
        if (currentPercent >= 100) {
          clearInterval(interval);
          setStatus('downloaded');
          addToast('Обновление v1.3.0 готово к установке!', 'success');
        }
      }, 400);
    }
  };

  const handleRestartToInstall = async () => {
    if (isElectron) {
      try {
        addToast('Запуск тихого инсталлятора и тихий перезапуск приложения...', 'info');
        await (window as any).electron.quitAndInstall();
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        addToast(`Ошибка автоматического запуска инсталлятора: ${errMsg}`, 'error');
      }
    } else {
      addToast('Перезапуск приложения для установки обновления...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  const handlePublishRelease = async () => {
    if (!pubVersion || !pubFileUrl) {
      addToast('Заполните поле версии и прямую URL ссылку на файл установщика .exe', 'error');
      return;
    }

    setIsPublishing(true);
    try {
      if (isElectron) {
        const res = await (window as any).electron.publishRelease({
          version: pubVersion,
          changelog: pubChangelog,
          fileUrl: pubFileUrl
        });
        if (res && res.success) {
          addToast(`Успешно опубликован релиз v${pubVersion} в удаленной СУБД!`, 'success');
          setShowPublishModal(false);
          setPubChangelog('');
        } else {
          addToast(`Ошибка публикации: ${res.error || 'Неизвестная ошибка'}`, 'error');
        }
      } else {
        addToast(`[Имитация] Успешно опубликован релиз v${pubVersion} в СУБД!`, 'success');
        setShowPublishModal(false);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(`Ошибка отправки релиза: ${errMsg}`, 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800/40 text-left font-sans">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Автообновления</span>
        {status !== 'idle' && (
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
        )}
      </div>

      <div className="space-y-2">
        {/* Environment Badge */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span>Версия ПО:</span>
          <span className="font-bold text-slate-700 dark:text-slate-300">v{currentVersion}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono pb-1 border-b border-slate-200/50 dark:border-slate-800/50">
          <span>Режим:</span>
          {isPackaged ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase text-xs tracking-wider">Установочный (PostgreSQL)</span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400 font-bold uppercase text-xs tracking-wider">Portable (SQLite)</span>
          )}
        </div>

        {/* Action Controls */}
        {!isPackaged && isElectron ? (
          <div className="text-center py-1 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Режим изолированной разработки</span>
          </div>
        ) : (
          <>
            {status === 'idle' && (
              <button
                onClick={handleCheckUpdate}
                className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>Проверить обновления</span>
              </button>
            )}

            {status === 'checking' && (
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-1 text-xs justify-center bg-slate-200/40 dark:bg-slate-800/40 rounded">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500 shrink-0" />
                <span className="font-medium">Сравнение версий...</span>
              </div>
            )}

            {status === 'available' && (
              <div className="space-y-2">
                <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                  Доступно ПО версии <span className="font-extrabold text-emerald-600 dark:text-emerald-400">v{version}</span>
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="w-full py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer font-sans"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5 text-white" />
                  <span>Показать Changelog</span>
                </button>
              </div>
            )}

            {status === 'downloading' && (
              <div className="space-y-1.5 py-1">
                <div className="flex justify-between text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                  <span>Загрузка...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {status === 'downloaded' && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 justify-center bg-emerald-500/10 py-1 rounded">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  <span className="text-xs font-bold font-sans">Пакет v{version} скачан!</span>
                </div>
                <button
                  onClick={handleRestartToInstall}
                  className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Установить & Перезапустить</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* Administrator Actions */}
        {isAdmin && (
          <button
            onClick={() => setShowPublishModal(true)}
            className="w-full mt-1.5 py-1 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-205 rounded text-xs font-bold font-sans transition-all flex items-center justify-center gap-1 cursor-pointer border border-slate-300 dark:border-slate-800"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span>Опубликовать релиз</span>
          </button>
        )}
      </div>

      {/* CHANGELOG & CONFIRM SYSTEM UPDATE OVERLAY */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-950 rounded-lg w-full max-w-lg border border-slate-200 dark:border-slate-850 shadow-2xl overflow-hidden animate-in fade-in duration-200 max-h-[90vh] flex flex-col">
            <div className="bg-slate-50 dark:bg-slate-990 p-4 border-b border-slate-200 dark:border-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-sans uppercase tracking-wide">Доступно обновление Flux</h3>
              </div>
              <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 px-2 py-0.5 rounded text-xs font-bold font-mono">
                v{version}
              </span>
            </div>

            <div className="p-5 flex-1 overflow-y-auto text-left">
              <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800/80 mb-4">
                <h4 className="text-xs font-extrabold text-slate-500 dark:text-slate-450 uppercase mb-2 tracking-wider font-mono">Список изменений релиза:</h4>
                <div className="whitespace-pre-line text-slate-700 dark:text-slate-300 text-xs font-sans leading-relaxed space-y-1">
                  {changelog}
                </div>
              </div>

              <div className="text-xs leading-normal bg-blue-500/10 dark:bg-blue-500/5 p-2.5 rounded border border-blue-500/20 text-slate-700 dark:text-blue-300">
                Загрузка файла выполняется нативными средствами Node.js напрямую в буфер обмена системного процесса, после чего инсталлятор произведет бесшовное перераспределение пакетов.
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-990 border-t border-slate-200 dark:border-slate-850 flex items-center justify-end gap-2 shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 rounded text-xs font-bold transition-all cursor-pointer"
              >
                Закрыть
              </button>
              {status === 'available' && (
                <button
                  onClick={() => {
                    setShowModal(false);
                    handleStartDownload();
                  }}
                  className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/10"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>Скачать & Установить</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADMIN CONTROL: PUBLISH RELEASE MODAL */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-950 rounded-lg w-full max-w-lg border border-slate-200 dark:border-slate-850 shadow-2xl overflow-hidden animate-in fade-in duration-200 max-h-[90vh] flex flex-col text-left">
            <div className="bg-slate-50 dark:bg-slate-990 p-4 border-b border-slate-200 dark:border-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-500 animate-spin-slow" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-sans uppercase tracking-wide">Панель управления обновлениями (ADMIN)</h3>
              </div>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Info Notification */}
              <div className="text-xs leading-normal bg-amber-500/10 dark:bg-amber-500/5 p-2.5 rounded border border-amber-500/20 text-yellow-800 dark:text-yellow-300">
                Публикация запишет метаданные и прямую ссылку в PostgreSQL. Пользователи в Установочном режиме мгновенно получат предложение об автоматическом фоновом обновлении.
              </div>

              {/* Version input */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-slate-400 uppercase">Номер релиза (версия semver):</label>
                <input
                  type="text"
                  value={pubVersion}
                  onChange={(e) => setPubVersion(e.target.value)}
                  placeholder="Например: 1.2.5"
                  className="w-full text-xs p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono"
                />
              </div>

              {/* File url */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-slate-400 uppercase">Прямая ссылка на скачивание (установщик .exe):</label>
                <input
                  type="text"
                  value={pubFileUrl}
                  onChange={(e) => setPubFileUrl(e.target.value)}
                  placeholder="Например: https://yoursite.ru/releases/max-setup.exe"
                  className="w-full text-xs p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono"
                />
              </div>

              {/* Changelog area */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-slate-400 uppercase">Список изменений (Changelog):</label>
                <textarea
                  rows={4}
                  value={pubChangelog}
                  onChange={(e) => setPubChangelog(e.target.value)}
                  placeholder="• Добавлена новая таблица ...&#10;• Повышена стабильность IPC ..."
                  className="w-full text-xs p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-sans resize-none"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-990 border-t border-slate-200 dark:border-slate-850 flex items-center justify-end gap-2 shrink-0">
              <button
                onClick={() => setShowPublishModal(false)}
                disabled={isPublishing}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 rounded text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handlePublishRelease}
                disabled={isPublishing}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/10 font-sans"
              >
                {isPublishing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Опубликовать релиз</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
