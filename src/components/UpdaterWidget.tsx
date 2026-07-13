import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  Download,
  ArrowUpCircle,
  PlusCircle,
  Settings,
  FileUp,
  Link2
} from 'lucide-react';
import { useToastStore } from '../store/toastStore';
import { useStore } from '../store/store';
import { getServerBaseUrl, getAuthToken } from '../config/env';

// ── Автообновления через сервер ──
// Админ публикует релиз прямо на сервер (загружает exe или даёт прямую ссылку),
// запись попадает в AppUpdate. Сотрудники проверяют /api/updates/latest на том
// сервере, с которым работают (встроенный или сервер компании), качают exe
// оттуда же и портативное приложение подменяет само себя. Никакого стороннего
// хостинга и прямых подключений клиента к базе.

function isNewerVersion(latest: string, current: string): boolean {
  // Суффиксы вида "-beta" дают NaN при Number() — оставляем цифры и точки
  const clean = (v: string) => String(v || '').replace(/[^0-9.]/g, '');
  const latestParts = clean(latest).split('.').map(Number);
  const currentParts = clean(current).split('.').map(Number);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

// Абсолютный адрес файла: относительные ссылки (/api/updates/download/…)
// резолвим на текущий сервер
function toAbsoluteUrl(fileUrl: string): string {
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const base = getServerBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${fileUrl}`;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`;
}

interface LatestInfo {
  version: string;
  changelog: string;
  fileUrl: string;
  size?: number;
}

export default function UpdaterWidget() {
  const { user } = useStore();
  const { addToast } = useToastStore();
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded'>('idle');
  const [latest, setLatest] = useState<LatestInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Публикация релиза (админ)
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [pubVersion, setPubVersion] = useState('');
  const [pubChangelog, setPubChangelog] = useState('');
  const [pubFile, setPubFile] = useState<File | null>(null);
  const [pubFileUrl, setPubFileUrl] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPackaged, setIsPackaged] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>(
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
  );

  const isElectron = typeof window !== 'undefined' && (window as any).electron !== undefined;

  useEffect(() => {
    if (!isElectron) return;
    const elec = (window as any).electron;

    elec.isPackaged?.().then((res: boolean) => setIsPackaged(res)).catch(() => {});
    elec.getAppVersion?.().then((res: string) => res && setCurrentVersion(res)).catch(() => {});

    // Прогресс скачивания и ошибки приходят из главного процесса
    const unsubscribe = elec.onUpdaterStatus?.((state: string, data?: { percent?: number; version?: string }) => {
      if (state === 'downloading') {
        setStatus('downloading');
        setProgress(Math.round(data?.percent || 0));
      } else if (state === 'downloaded') {
        setStatus('downloaded');
        setProgress(100);
      }
    });
    const unsubscribeError = elec.onUpdaterError?.((errMsg: string) => {
      setError(errMsg);
      setStatus('idle');
      addToast(`Ошибка обновления: ${errMsg}`, 'error');
    });

    return () => {
      unsubscribe?.();
      unsubscribeError?.();
    };
  }, [isElectron, addToast]);

  // Проверка последнего релиза на сервере. silent = фоновая (без тостов
  // «обновлений нет»), используется при автопроверке и push-оповещении.
  const checkUpdate = useCallback(async (silent: boolean) => {
    setError(null);
    if (!silent) setStatus('checking');
    try {
      const res = await fetch('/api/updates/latest');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Сервер ответил ${res.status}`);
      if (!data.version) {
        setStatus('idle');
        if (!silent) addToast('Обновления ещё не публиковались.', 'info');
        return;
      }
      if (isNewerVersion(data.version, currentVersion)) {
        setLatest({ version: data.version, changelog: data.changelog || '', fileUrl: data.fileUrl || '', size: data.size });
        setStatus('available');
        setShowModal(true);
        if (!silent) addToast(`Найдена новая версия v${data.version}!`, 'success');
      } else {
        setStatus('idle');
        if (!silent) addToast(`У вас последняя версия (v${currentVersion}).`, 'info');
      }
    } catch (err: any) {
      setStatus('idle');
      if (!silent) {
        setError(err.message);
        addToast(`Ошибка проверки: ${err.message}`, 'error');
      }
    }
  }, [currentVersion, addToast]);

  // Автопроверка при открытии настроек + мгновенная реакция на публикацию
  // (сервер шлёт socket-событие, SocketProvider транслирует его в window)
  useEffect(() => {
    const timer = setTimeout(() => { checkUpdate(true); }, 1200);
    const onPublished = () => checkUpdate(true);
    window.addEventListener('socket:app:update-published', onPublished);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('socket:app:update-published', onPublished);
    };
  }, [checkUpdate]);

  const handleStartDownload = async () => {
    if (!latest) return;
    const absoluteUrl = toAbsoluteUrl(latest.fileUrl);
    if (isElectron) {
      try {
        setStatus('downloading');
        setProgress(0);
        await (window as any).electron.startDownload({
          url: absoluteUrl,
          version: latest.version,
          token: getAuthToken(),
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
        setStatus('idle');
        addToast(`Не удалось скачать обновление: ${errMsg}`, 'error');
      }
    } else {
      // Браузер: качаем через fetch (токен добавит обёртка) и отдаём как файл
      try {
        setStatus('downloading');
        setProgress(0);
        const res = await fetch(absoluteUrl);
        if (!res.ok) throw new Error(`Сервер ответил ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Flux ${latest.version}.exe`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus('idle');
        addToast(`Файл Flux ${latest.version}.exe скачан — замените им текущий exe.`, 'success');
      } catch (err: any) {
        setStatus('idle');
        addToast(`Не удалось скачать: ${err.message}`, 'error');
      }
    }
  };

  const handleRestartToInstall = async () => {
    if (!isElectron) return;
    try {
      addToast('Установка обновления и перезапуск приложения...', 'info');
      const res = await (window as any).electron.quitAndInstall();
      if (res && res.success === false) {
        addToast(`Не удалось запустить установку: ${res.error || 'неизвестная ошибка'}`, 'error');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(`Ошибка установки: ${errMsg}`, 'error');
    }
  };

  const handlePublishRelease = async () => {
    const version = pubVersion.trim();
    if (!version) {
      addToast('Укажите номер версии релиза', 'error');
      return;
    }
    if (!pubFile && !pubFileUrl.trim()) {
      addToast('Выберите файл exe или укажите прямую ссылку', 'error');
      return;
    }

    setIsPublishing(true);
    try {
      // Шаг 1: файл — на сервер (сырыми байтами, минуя JSON-лимиты)
      if (pubFile) {
        const upRes = await fetch(`/api/updates/upload?version=${encodeURIComponent(version)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: pubFile,
        });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok) throw new Error(upData.error || `Загрузка файла: сервер ответил ${upRes.status}`);
      }
      // Шаг 2: запись релиза (ссылка на сервер, если файл загружен)
      const res = await fetch('/api/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, changelog: pubChangelog, fileUrl: pubFileUrl.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Сервер ответил ${res.status}`);

      addToast(`Релиз v${version} опубликован — сотрудники получат оповещение.`, 'success');
      setShowPublishModal(false);
      setPubChangelog('');
      setPubFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(`Ошибка публикации: ${errMsg}`, 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const isAdmin = user?.role === 'ADMIN';
  const isDevSandbox = isElectron && !isPackaged;

  return (
    <div className="bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800/40 text-left font-sans">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Автообновления</span>
        {status !== 'idle' && (
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span>Версия ПО:</span>
          <span className="font-bold text-slate-700 dark:text-slate-300">v{currentVersion}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono pb-1 border-b border-slate-200/50 dark:border-slate-800/50">
          <span>Источник обновлений:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase text-xs tracking-wider">
            {getServerBaseUrl() && !getServerBaseUrl().includes('localhost') ? 'Сервер компании' : 'Встроенный сервер'}
          </span>
        </div>

        {isDevSandbox && (
          <div className="text-center py-1 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Режим разработки — установка обновлений недоступна</span>
          </div>
        )}

        {status === 'idle' && (
          <button
            onClick={() => checkUpdate(false)}
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

        {status === 'available' && latest && (
          <div className="space-y-2">
            <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
              Доступно ПО версии <span className="font-extrabold text-emerald-600 dark:text-emerald-400">v{latest.version}</span>
              {latest.size ? <span className="text-slate-400 font-normal"> · {formatSize(latest.size)}</span> : null}
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

        {status === 'downloaded' && latest && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 justify-center bg-emerald-500/10 py-1 rounded">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span className="text-xs font-bold font-sans">Пакет v{latest.version} скачан!</span>
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

        {error && status === 'idle' && (
          <p className="text-xs text-rose-500 dark:text-rose-400">{error}</p>
        )}

        {/* Публикация релиза — только администратор */}
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

      {/* CHANGELOG И ПОДТВЕРЖДЕНИЕ УСТАНОВКИ */}
      {showModal && latest && (
        <div className="fixed inset-0 bg-slate-950/70 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-950 rounded-lg w-full max-w-lg border border-slate-200 dark:border-slate-850 shadow-2xl overflow-hidden animate-in fade-in duration-200 max-h-[90vh] flex flex-col">
            <div className="bg-slate-50 dark:bg-slate-990 p-4 border-b border-slate-200 dark:border-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-sans uppercase tracking-wide">Доступно обновление Flux</h3>
              </div>
              <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 px-2 py-0.5 rounded text-xs font-bold font-mono">
                v{latest.version}
              </span>
            </div>

            <div className="p-5 flex-1 overflow-y-auto text-left">
              <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800/80 mb-4">
                <h4 className="text-xs font-extrabold text-slate-500 dark:text-slate-450 uppercase mb-2 tracking-wider font-mono">Список изменений релиза:</h4>
                <div className="whitespace-pre-line text-slate-700 dark:text-slate-300 text-xs font-sans leading-relaxed space-y-1">
                  {latest.changelog || 'Описание изменений не указано.'}
                </div>
              </div>

              <div className="text-xs leading-normal bg-blue-500/10 dark:bg-blue-500/5 p-2.5 rounded border border-blue-500/20 text-slate-700 dark:text-blue-300">
                Файл скачивается с вашего сервера Flux. После загрузки приложение закроется,
                обновление подменит exe и программа запустится уже новой версии — данные не затрагиваются.
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

      {/* АДМИН: ПУБЛИКАЦИЯ РЕЛИЗА */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-950 rounded-lg w-full max-w-lg border border-slate-200 dark:border-slate-850 shadow-2xl overflow-hidden animate-in fade-in duration-200 max-h-[90vh] flex flex-col text-left">
            <div className="bg-slate-50 dark:bg-slate-990 p-4 border-b border-slate-200 dark:border-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-500 animate-spin-slow" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-sans uppercase tracking-wide">Публикация обновления (ADMIN)</h3>
              </div>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div className="text-xs leading-normal bg-amber-500/10 dark:bg-amber-500/5 p-2.5 rounded border border-amber-500/20 text-yellow-800 dark:text-yellow-300">
                Файл exe загружается на этот сервер и раздаётся сотрудникам с него же.
                Все, кто сейчас онлайн, получат оповещение мгновенно; остальные — при следующей проверке.
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-slate-400 uppercase">Номер релиза (версия):</label>
                <input
                  type="text"
                  value={pubVersion}
                  onChange={(e) => setPubVersion(e.target.value)}
                  placeholder="Например: 0.25.0"
                  className="w-full text-xs p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-slate-400 uppercase flex items-center gap-1">
                  <FileUp className="w-3.5 h-3.5" /> Файл обновления (exe):
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".exe"
                  onChange={(e) => setPubFile(e.target.files?.[0] || null)}
                  className="w-full text-xs p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-bold file:cursor-pointer"
                />
                {pubFile && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    {pubFile.name} · {formatSize(pubFile.size)} — будет загружен на сервер
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-slate-400 uppercase flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" /> Или прямая ссылка (если файл не загружаете):
                </label>
                <input
                  type="text"
                  value={pubFileUrl}
                  onChange={(e) => setPubFileUrl(e.target.value)}
                  placeholder="https://…/Flux-Setup.exe (необязательно)"
                  className="w-full text-xs p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-slate-400 uppercase">Список изменений (Changelog):</label>
                <textarea
                  rows={4}
                  value={pubChangelog}
                  onChange={(e) => setPubChangelog(e.target.value)}
                  placeholder="• Добавлен конструктор таблиц ...&#10;• Улучшен импорт бланков ..."
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
                <span>{isPublishing ? 'Загрузка на сервер...' : 'Опубликовать релиз'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
