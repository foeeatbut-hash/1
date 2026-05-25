import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  ArrowUpCircle,
  Play
} from 'lucide-react';
import { useToastStore } from '../store/toastStore';

export default function UpdaterWidget() {
  const { addToast } = useToastStore();
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded'>('idle');
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Check if we are running in full Electron or Web Isolated mode
  const isElectron = typeof window !== 'undefined' && (window as any).electron !== undefined;

  useEffect(() => {
    if (isElectron) {
      const elec = (window as any).electron;
      
      const unsubscribe = elec.onUpdaterStatus((event: any, state: string, data: any) => {
        if (state === 'checking') {
          setStatus('checking');
          setError(null);
        } else if (state === 'available') {
          setStatus('available');
          setVersion(data.version);
          setChangelog(data.releaseNotes);
          setShowModal(true);
        } else if (state === 'downloading') {
          setStatus('downloading');
          setProgress(Math.round(data.percent || 0));
        } else if (state === 'downloaded') {
          setStatus('downloaded');
          setVersion(data.version);
          setProgress(100);
        }
      });

      const unsubscribeError = elec.onUpdaterError((event: any, errMsg: string) => {
        setError(errMsg);
        setStatus('idle');
        addToast(`Ошибка обновления: ${errMsg}`, 'error');
      });

      return () => {
        unsubscribe();
        unsubscribeError();
      };
    }
  }, [isElectron, addToast]);

  const handleCheckUpdate = () => {
    setError(null);
    if (isElectron) {
      setStatus('checking');
      (window as any).electron.simulateCheck();
    } else {
      // Simulate check in Web isolated sandbox
      setStatus('checking');
      addToast('Поиск обновлений...', 'info');
      setTimeout(() => {
        setStatus('available');
        setVersion('1.2.0');
        setChangelog(
          '### MAX Sync v1.2.0\n\n' +
          '• Добавлен высокоскоростной конвейер Socket.io\n' +
          '• Реализация интерактивного лога изменений specs\n' +
          '• Повышение отказоустойчивости СУБД SQLite/PostgreSQL\n' +
          '• Автонаведение и плавная прокрутка конфликтов\n' +
          '• Оптимизация производительности рендеринга больших BIM систем'
        );
        setShowModal(true);
        addToast('Найдена новая версия v1.2.0!', 'success');
      }, 1200);
    }
  };

  const handleStartDownload = () => {
    if (isElectron) {
      (window as any).electron.simulateDownload();
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
          addToast('Обновление v1.2.0 готово к установке!', 'success');
        }
      }, 500);
    }
  };

  const handleRestartToInstall = () => {
    if (isElectron) {
      (window as any).electron.quitAndInstall();
    } else {
      addToast('Перезапуск приложения для установки обновления...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  return (
    <div className="bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800/40 text-left font-sans">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Автообновления</span>
        {status !== 'idle' && (
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
        )}
      </div>

      {status === 'idle' && (
        <button
          onClick={handleCheckUpdate}
          className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span>Проверить обновления</span>
        </button>
      )}

      {status === 'checking' && (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-1 text-xs">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500 shrink-0" />
          <span className="font-medium">Поиск серверов релиза...</span>
        </div>
      )}

      {status === 'available' && (
        <div className="space-y-2">
          <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">
            Новая версия <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{version}</span> доступна.
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="w-full py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
          >
            <ArrowUpCircle className="w-3.5 h-3.5 text-white" />
            <span>Показать Changelog</span>
          </button>
        </div>
      )}

      {status === 'downloading' && (
        <div className="space-y-1.5 py-1">
          <div className="flex justify-between text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
            <span>Скачивание...</span>
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
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 py-0.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span className="text-xs font-bold font-sans">Пакет v{version || '1.2.0'} готов!</span>
          </div>
          <button
            onClick={handleRestartToInstall}
            className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Установить & Перезагрузить</span>
          </button>
        </div>
      )}

      {/* CHANGELOG & CONFIRM SYSTEM UPDATE OVERLAY */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-950 rounded-lg w-full max-w-lg border border-slate-200 dark:border-slate-850 shadow-2xl overflow-hidden animate-in fade-in duration-200 max-h-[90vh] flex flex-col">
            <div className="bg-slate-50 dark:bg-slate-990 p-4 border-b border-slate-200 dark:border-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-sans uppercase tracking-wide">Доступно обновление ПО MAX</h3>
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

              <div className="text-[11px] text-slate-500 leading-normal bg-amber-500/10 dark:bg-amber-500/5 p-2.5 rounded border border-amber-500/20 text-slate-700 dark:text-amber-200">
                Запущен режим изолированной разработки. Все процессы развертывания, сокет роутинга и загрузки моделируются локальным микроконтроллером в реальном времени.
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
    </div>
  );
}
