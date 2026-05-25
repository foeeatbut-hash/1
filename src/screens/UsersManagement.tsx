import React, { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { dataService, User } from '../services/dataService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Plus, 
  X, 
  Lock, 
  ShieldCheck, 
  UserPlus, 
  Cpu, 
  Airplay, 
  UserCheck, 
  Calendar, 
  FileText,
  Clock,
  Briefcase
} from 'lucide-react';

export default function UsersManagement() {
  const { user } = useStore();
  const { addToast } = useToastStore();
  
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // New User Form State
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('ENGINEER_VENT');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // 1. Load users list from database
  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await dataService.getUsers();
      setUsersList(data || []);
    } catch (err: any) {
      console.error(err);
      addToast('Ошибка при загрузке списка сотрудников', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // 2. Validate and handle user registration
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = name.trim();
    const trimmedSymbol = symbol.trim();
    const trimmedPassword = password.trim();

    if (!trimmedName) {
      setFormError('Укажите ФИО сотрудника');
      return;
    }
    if (!trimmedSymbol) {
      setFormError('Укажите табельный номер / логин');
      return;
    }
    if (!trimmedPassword) {
      setFormError('Укажите пароль доступа');
      return;
    }

    // Checking for special chars like logic symbols to avoid messy names or SQL-likes
    if (trimmedSymbol.includes('@')) {
      setFormError('Табельный номер должен быть обычными цифрами или буквами без символа @');
      return;
    }

    setIsSubmitting(true);
    try {
      await dataService.createUser({
        name: trimmedName,
        symbol: trimmedSymbol,
        password: trimmedPassword,
        role: role
      });
      addToast('Сотрудник успешно добавлен в базу данных!', 'success');
      
      // Close modal and reset fields
      setIsModalOpen(false);
      setName('');
      setSymbol('');
      setPassword('');
      setRole('ENGINEER_VENT');
      
      // Reload users list
      await loadUsers();
    } catch (err: any) {
      console.error(err);
      const isDuplicate = err.message?.includes('P2002') || err.message?.includes('уже внесен') || err.message?.includes('exist');
      const errorMsg = isDuplicate 
        ? 'Ошибка: сотрудник с таким табельным номером уже внесен в базу данных!'
        : (err.message || 'Не удалось зарегистрировать нового сотрудника');
      setFormError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. User-friendly role localization names with customized icon visual tags
  const getRoleBadge = (userRole: string) => {
    switch (userRole) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
            <ShieldCheck className="w-3.5 h-3.5" />
            Администратор
          </span>
        );
      case 'MANAGER':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
            <Briefcase className="w-3.5 h-3.5" />
            Менеджер проектов
          </span>
        );
      case 'ENGINEER_VENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-850">
            <Airplay className="w-3.5 h-3.5" />
            Инженер ОВиК
          </span>
        );
      case 'ENGINEER_AUTO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
            <Cpu className="w-3.5 h-3.5" />
            Инженер КИПиА
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded">
            {userRole}
          </span>
        );
    }
  };

  return (
    <motion.div 
      id="users-management-root"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="max-w-6xl mx-auto space-y-6 pb-12"
    >
      {/* Шапка страницы */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 md:p-0">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-450 mb-1">
            <Users className="w-6 h-6" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Панель управления персоналом
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Администрирование прав доступа, добавление новых сотрудников и назначение ролей инженеров.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Добавить сотрудника
          </button>
        </div>
      </div>

      {/* Основная таблица / Содержимое списка пользователей */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-650 dark:text-emerald-400" />
            Зарегистрированные сотрудники ({usersList.length})
          </h3>
          <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-mono">
            База: SQLite
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-500">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-sm">Загрузка данных персонала...</p>
          </div>
        ) : usersList.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Users className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-350">Нет добавленных сотрудников</p>
            <p className="text-xs text-slate-400 mt-1">Используйте кнопку выше для регистрации первого инженера.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-405 dark:text-slate-500 text-xs font-bold uppercase font-mono tracking-wider bg-slate-50/30 dark:bg-slate-950/10">
                  <th className="px-6 py-3.5">ФИО сотрудника</th>
                  <th className="px-6 py-3.5">Табельный номер (Логин)</th>
                  <th className="px-6 py-3.5">Роль в системе</th>
                  <th className="px-6 py-3.5">Дата регистрации</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-850">
                {usersList.map((emp) => (
                  <tr 
                    key={emp.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors text-slate-800 dark:text-slate-205"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {emp.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm font-semibold tracking-wider text-emerald-700 dark:text-emerald-400">
                      {emp.symbol}
                    </td>
                    <td className="px-6 py-4">
                      {getRoleBadge(emp.role)}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(emp.createdAt || Date.now()).toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модальное окно добавления нового пользователя */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
            {/* Overlay */}
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity" onClick={() => !isSubmitting && setIsModalOpen(false)} />

            {/* Container for centering */}
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.15 }}
                className="relative w-full max-w-md transform rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 transition-colors"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-5 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <UserPlus className="w-5 h-5" />
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Регистрация сотрудника
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={isSubmitting}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-650 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Form Error Feedback */}
                {formError && (
                  <div className="p-3 mb-4 rounded bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-450 text-xs font-medium border border-rose-200 dark:border-rose-900">
                    {formError}
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">
                      ФИО сотрудника
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="Фрузенко Анатолий Петрович"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1 font-mono">
                      Табельный номер (ID)
                    </label>
                    <input
                      type="text"
                      required
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                      placeholder="Например, 4519"
                    />
                    <p className="text-[10px] text-slate-400 mt-1 dark:text-slate-500">
                      Используется как логин для входа. Не может содержать символ @ и должен быть уникальным.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">
                      Пароль доступа в систему
                    </label>
                    <input
                      type="text"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="Задайте надежный пароль"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">
                      Роль в системе
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-850 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
                    >
                      <option value="ENGINEER_VENT">ENGINEER_VENT (Инженер вентиляции)</option>
                      <option value="ENGINEER_AUTO">ENGINEER_AUTO (Инженер автоматики)</option>
                      <option value="MANAGER">MANAGER (Менеджер проектов)</option>
                      <option value="ADMIN">ADMIN (Администратор)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-slate-650 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-850 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg text-sm font-semibold shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          <span>Создание...</span>
                        </>
                      ) : (
                        <span>Зарегистрировать</span>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
