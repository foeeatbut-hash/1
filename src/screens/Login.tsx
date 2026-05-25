import React, { useState } from 'react';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { dataService } from '../services/dataService';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, User, Eye, EyeOff, Loader2, AlertCircle, Sun, Moon } from 'lucide-react';

export default function Login() {
  const setUser = useStore((state) => state.setUser);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const { addToast } = useToastStore();
  
  const [remember, setRemember] = useState(() => {
    return localStorage.getItem('login_remember') === 'true';
  });
  const [login, setLogin] = useState(() => {
    const isRemembered = localStorage.getItem('login_remember') === 'true';
    return isRemembered ? localStorage.getItem('login_saved_username') || '' : '';
  });
  const [password, setPassword] = useState(() => {
    const isRemembered = localStorage.getItem('login_remember') === 'true';
    return isRemembered ? localStorage.getItem('login_saved_password') || '' : '';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
 
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
 
    try {
      const data = await dataService.login(login.trim(), password);
      if (data.success) {
        if (remember) {
          localStorage.setItem('login_remember', 'true');
          localStorage.setItem('login_saved_username', login.trim());
          localStorage.setItem('login_saved_password', password);
        } else {
          localStorage.removeItem('login_remember');
          localStorage.removeItem('login_saved_username');
          localStorage.removeItem('login_saved_password');
        }
        setTimeout(() => {
          setUser(data.user);
          setIsLoading(false);
          addToast('Вход выполнен успешно!', 'success');
        }, 400);
      } else {
        const errorMsg = data.message || 'Ошибка входа. Проверьте правильность ввода логина и пароля!';
        setError(errorMsg);
        addToast(errorMsg, 'error');
        setIsLoading(false);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Ошибка подключения к серверу';
      setError(errorMsg);
      addToast(errorMsg, 'error');
      setIsLoading(false);
    }
  };
 
  return (
    <div 
      id="login-screen-root" 
      className="min-h-screen w-full flex flex-col justify-between bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-250 relative p-4"
    >
      {/* Floating theme switcher in upper-right corner */}
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

      {/* Spacing element to align content nicely and push version down */}
      <div className="flex-1 flex items-center justify-center py-12">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl transition-all"
        >
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs mb-5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Ошибка авторизации</p>
                  <p className="mt-0.5 opacity-90">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1.5 label-login">
                Логин
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-600 group-focus-within:text-emerald-650 dark:group-focus-within:text-emerald-400 transition-colors">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="login-input"
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-450 dark:placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans"
                  placeholder="Введите логин"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1.5 label-password">
                Пароль
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-600 group-focus-within:text-emerald-650 dark:group-focus-within:text-emerald-400 transition-colors">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-450 dark:placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans"
                  placeholder="Введите пароль"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-1 select-none">
              <label htmlFor="remember-me-checkbox" className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                <input
                  id="remember-me-checkbox"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded-sm border-slate-300 dark:border-slate-800 text-emerald-600 focus:ring-emerald-500 bg-slate-50 dark:bg-slate-950 accent-emerald-500 transition-all cursor-pointer"
                />
                <span>Запомнить данные для входа</span>
              </label>
            </div>

            <button
              id="submit-button"
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-850 disabled:bg-emerald-800/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-6"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Вход в систему...</span>
                </>
              ) : (
                <span>Войти</span>
              )}
            </button>
          </form>
        </motion.div>
      </div>

      {/* Version info centered cleanly at the very bottom */}
      <div className="w-full text-center py-4 text-xs font-mono text-slate-400 dark:text-slate-600 tracking-wider">
        Версия 0.01
      </div>
    </div>
  );
}
