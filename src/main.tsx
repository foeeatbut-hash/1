import {StrictMode} from 'react';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
