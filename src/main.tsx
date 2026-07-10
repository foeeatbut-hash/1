import './config/env'; // должен загружаться первым: ставит fetch-прокси для Electron (file://)
import React, {StrictMode, Component, ErrorInfo, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { useLogStore } from './store/logStore';

// === GLOBAL INTERCEPTORS ===
const originalError = console.error;
const originalWarn = console.warn;
let isLogging = false;

console.error = (...args: any[]) => {
  originalError.apply(console, args);
  if (isLogging) return;
  isLogging = true;
  try {
    const formatConsoleArg = (arg: any) => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack || ''}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (_) {
          return String(arg);
        }
      }
      return String(arg);
    };
    const message = args.map(formatConsoleArg).join(' ');
    if (!message.includes('[vite] failed to connect')) {
      useLogStore.getState().addLog('ERROR', 'Console', message);
    }
  } catch (e) {
    // Avoid crashing if logging fails
  } finally {
    isLogging = false;
  }
};

console.warn = (...args: any[]) => {
  originalWarn.apply(console, args);
  if (isLogging) return;
  isLogging = true;
  try {
    const formatConsoleArg = (arg: any) => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack || ''}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (_) {
          return String(arg);
        }
      }
      return String(arg);
    };
    const message = args.map(formatConsoleArg).join(' ');
    if (!message.includes('[vite] failed to connect')) {
      useLogStore.getState().addLog('WARN', 'Console', message);
    }
  } catch (e) {
    // Avoid crashing
  } finally {
    isLogging = false;
  }
};

// Window runtime errors
window.onerror = (message, source, lineno, colno, error) => {
  const errorMsg = String(message);
  const stack = error?.stack || `at ${source}:${lineno}:${colno}`;
  useLogStore.getState().addLog('ERROR', 'Runtime', `Критическая ошибка: ${errorMsg}`, stack);
  return false;
};

// Unhandled promises
window.onunhandledrejection = (event) => {
  const errorMsg = event.reason?.message || String(event.reason);
  const stack = event.reason?.stack || '';
  useLogStore.getState().addLog('ERROR', 'Promise Rejection', `Unhandled Rejection: ${errorMsg}`, stack);
};

// Initial log
useLogStore.getState().addLog('INFO', 'System', 'Система диагностического логирования успешно запущена');

// Синхронизация адреса сервера между рендерером (localStorage) и главным
// процессом Electron (config.json). Расхождение возможно, если localStorage
// очистили: тогда принимаем значение из config.json и перезагружаемся один раз.
(async () => {
  try {
    const win = window as any;
    if (!win.electron?.ipcRenderer?.invoke) return;
    const fromConfig = String((await win.electron.ipcRenderer.invoke('app:get-server-url')) || '').trim();
    const fromLocal = (localStorage.getItem('flux_server_url') || '').trim();
    if (fromConfig && !fromLocal) {
      localStorage.setItem('flux_server_url', fromConfig);
      window.location.reload();
    } else if (!fromConfig && fromLocal) {
      // config.json потерял настройку (или писался старой версией) — восстановим
      await win.electron.ipcRenderer.invoke('app:set-server-url', fromLocal);
    }
  } catch (_) {}
})();

// Граница ошибок: вместо немого белого экрана показываем причину и пишем crash-лог
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      useLogStore.getState().addLog('ERROR', 'UI Crash', `Сбой интерфейса: ${error.message}`, `${error.stack || ''}\n${info.componentStack || ''}`);
      const win = window as any;
      if (win.electron?.emergencySave) {
        win.electron.emergencySave(`[UI CRASH] ${error.message}\n${error.stack || ''}\n${info.componentStack || ''}`);
      }
    } catch (_) {}
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
          <div style={{ maxWidth: 560, background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 28 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, color: '#f87171' }}>Произошла ошибка интерфейса</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              Приложение столкнулось с непредвиденной ошибкой. Перезапустите программу. Если ошибка повторяется — пришлите текст ниже разработчику.
            </div>
            <pre style={{ fontSize: 12, color: '#fca5a5', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 12, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {String(this.state.error.message)}
            </pre>
            <button
              onClick={() => { try { (window as any).location.reload(); } catch (_) {} }}
              style={{ marginTop: 16, padding: '10px 18px', background: '#059669', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
            >
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('Корневой элемент #root не найден в документе');
  createRoot(rootEl).render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>,
  );
} catch (mountErr: any) {
  // Если даже монтирование упало — показываем текст напрямую, без React
  const rootEl = document.getElementById('root');
  if (rootEl) {
    rootEl.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:24px"><div style="max-width:560px"><div style="font-size:18px;font-weight:700;color:#f87171;margin-bottom:10px">Не удалось запустить приложение</div><pre style="font-size:12px;color:#fca5a5;white-space:pre-wrap">${String(mountErr?.message || mountErr)}</pre></div></div>`;
  }
  try {
    const win = window as any;
    if (win.electron?.emergencySave) win.electron.emergencySave(`[MOUNT CRASH] ${mountErr?.message}\n${mountErr?.stack || ''}`);
  } catch (_) {}
}
