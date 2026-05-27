/**
 * Global Environment Configuration
 * Dual-mode Support: Strict local mock mode for development/sandbox,
 * and transparent physical network mode for packaged production.
 */

// Detect standard electron environment variables or sandbox environments
export const isLocalMode = (() => {
  if (typeof window !== 'undefined') {
    // If running in browser/preview and not on the specific production office IP, default to local relative API
    if (window.location.hostname !== '192.168.1.100') {
      return true;
    }
  }
  if (typeof process !== 'undefined') {
    if (process.env.NODE_ENV === 'development' || !process.env.IS_PRODUCTION || !process.env.NODE_ENV) {
      return true;
    }
  }
  return false;
})();

export const ENV = {
  isProduction: false, // Флаг для будущего переключения на боевой сервер компании
  serverUrl: 'http://192.168.1.100:5000', // Будущий IP-адрес офисного сервера
};

export const ENV_CONFIG = {
  isLocalMode,
  apiUrl: isLocalMode ? 'http://localhost:3000/api' : 'http://192.168.1.100:5000/api',
  socketUrl: isLocalMode ? 'ws://localhost:3000' : 'ws://192.168.1.100:5000',
  updatesUrl: 'http://192.168.1.100/updates/'
};
