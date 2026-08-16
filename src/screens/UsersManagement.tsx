import React, { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import SignatureEditor from '../components/SignatureEditor';
import { useToastStore } from '../store/toastStore';
import { dataService, User } from '../services/dataService';
import { FEATURES, parsePermissions, PermMap } from '../lib/permissions';
import { Check } from 'lucide-react';
import NameFields, { NameValue, EMPTY_NAME } from '../components/NameFields';
import { Role, loadRoles, roleByCode, roleColorClass, isTopAdmin } from '../lib/roles';
import { fullNameOf } from '../lib/declension';
import RoleIcon from '../components/RoleIcon';
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
  Briefcase,
  PenLine
} from 'lucide-react';
import { useModalStore } from '../store/modalStore';

// Диалоги программы вместо системных окон Windows
const { openConfirm } = useModalStore.getState();

export default function UsersManagement() {
  const { user } = useStore();
  const { addToast } = useToastStore();
  
  const [usersList, setUsersList] = useState<User[]>([]);
  // Кому правим подпись; null — окно закрыто
  const [signFor, setSignFor] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // New User Form State
  const [roles, setRoles] = useState<Role[]>([]);
  const [nameValue, setNameValue] = useState<NameValue>(EMPTY_NAME);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('ENGINEER_VENT');
  const [validUntil, setValidUntil] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Редактирование существующего сотрудника
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editNameValue, setEditNameValue] = useState<NameValue>(EMPTY_NAME);
  const [editName, setEditName] = useState('');
  const [editSymbol, setEditSymbol] = useState('');
  const [editRole, setEditRole] = useState('ENGINEER_VENT');
  const [editPassword, setEditPassword] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editValidUntil, setEditValidUntil] = useState('');
  const [editPerms, setEditPerms] = useState<PermMap>({});
  const [editError, setEditError] = useState('');
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // дата+время для input[type=datetime-local]
  const toDateTimeInput = (value: any): string => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const togglePerm = (feature: string, enabled: boolean) => {
    setEditPerms((prev) => ({ ...prev, [feature]: { enabled, until: prev[feature]?.until ?? null } }));
  };
  const setPermUntil = (feature: string, value: string) => {
    setEditPerms((prev) => ({
      ...prev,
      [feature]: { enabled: prev[feature]?.enabled ?? true, until: value ? new Date(value).toISOString() : null },
    }));
  };

  const toDateInputValue = (value: any): string => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const presetDate = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return toDateInputValue(d);
  };

  const toDateOnly = (v: any): string => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  useEffect(() => {
    let alive = true;
    loadRoles().then((list) => { if (alive) setRoles(list); });
    const onChanged = () => loadRoles(true).then((list) => { if (alive) setRoles(list); });
    window.addEventListener('flux:roles-changed', onChanged);
    return () => { alive = false; window.removeEventListener('flux:roles-changed', onChanged); };
  }, []);

  const openEdit = (emp: User) => {
    setEditUser(emp);
    // У профилей, заведённых до раздельного хранения, частей может не быть —
    // разбираем единую строку, чтобы форма не открылась пустой.
    const w = String(emp.name || '').replace(/\s*\(.*\)\s*$/, '').split(/\s+/).filter(Boolean);
    setEditNameValue({
      lastName: emp.lastName || w[0] || '',
      firstName: emp.firstName || w[1] || '',
      middleName: emp.middleName || w.slice(2).join(' ') || '',
      gender: emp.gender || '',
      birthDate: toDateOnly(emp.birthDate),
    });
    setEditName(emp.name);
    setEditSymbol(emp.symbol);
    setEditRole(emp.role);
    setEditPassword('');
    setEditActive(emp.isActive !== false);
    setEditValidUntil(toDateInputValue(emp.validUntil));
    setEditPerms(parsePermissions(emp.permissions));
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditError('');
    setIsEditSubmitting(true);
    if (!editSymbol.trim()) { setEditError('Укажите табельный номер (логин)'); setIsEditSubmitting(false); return; }
    // оставляем только включённые права, чтобы не копить мусор
    const cleanPerms: PermMap = {};
    for (const f of FEATURES) {
      const e = editPerms[f.id];
      if (e && e.enabled) cleanPerms[f.id] = { enabled: true, until: e.until ?? null };
    }
    try {
      const res = await dataService.updateUser(editUser.id, {
        lastName: editNameValue.lastName.trim(),
        firstName: editNameValue.firstName.trim(),
        middleName: editNameValue.middleName.trim(),
        gender: editNameValue.gender,
        birthDate: editNameValue.birthDate || null,
        symbol: editSymbol.trim(),
        role: editRole,
        ...(editPassword.trim() ? { password: editPassword.trim() } : {}),
        isActive: editActive,
        validUntil: editValidUntil ? new Date(`${editValidUntil}T23:59:59`).toISOString() : null,
        permissions: Object.keys(cleanPerms).length ? JSON.stringify(cleanPerms) : null,
      });
      if (!res || res.success !== true) {
        throw new Error((res && res.message) || 'Сервер недоступен — изменения не сохранены');
      }
      addToast('Профиль сотрудника обновлен', 'success');
      setEditUser(null);
      await loadUsers();
    } catch (err: any) {
      setEditError(err.message || 'Не удалось сохранить изменения');
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!editUser) return;
    if (!await openConfirm(`Удалить профиль «${editUser.name}»?`, 'Сообщения и файлы этого сотрудника останутся, но потеряют автора. Действие необратимо.', { confirmLabel: 'Удалить профиль', tone: 'danger' })) return;
    setIsEditSubmitting(true);
    try {
      const res = await dataService.deleteUser(editUser.id);
      if (!res || res.success !== true) {
        throw new Error((res && res.message) || 'Сервер недоступен — профиль не удален');
      }
      addToast('Профиль удален', 'success');
      setEditUser(null);
      await loadUsers();
    } catch (err: any) {
      setEditError(err.message || 'Не удалось удалить профиль');
    } finally {
      setIsEditSubmitting(false);
    }
  };

  // Бейдж статуса доступа: активен / отключен / истекает / истек
  const getAccessBadge = (emp: User) => {
    if (emp.isActive === false) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">Отключен</span>;
    }
    if (emp.validUntil) {
      const until = new Date(emp.validUntil);
      const expired = until.getTime() < Date.now();
      const dateStr = until.toLocaleDateString('ru-RU');
      if (expired) {
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">Истек {dateStr}</span>;
      }
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40"><Clock className="w-3 h-3 shrink-0" />до {dateStr}</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">Активен</span>;
  };

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

    const trimmedName = fullNameOf(nameValue);
    const trimmedSymbol = symbol.trim();
    const trimmedPassword = password.trim();

    if (!nameValue.lastName.trim() || !nameValue.firstName.trim()) {
      setFormError('Укажите фамилию и имя сотрудника');
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
        lastName: nameValue.lastName.trim(),
        firstName: nameValue.firstName.trim(),
        middleName: nameValue.middleName.trim(),
        gender: nameValue.gender,
        birthDate: nameValue.birthDate || null,
        symbol: trimmedSymbol,
        password: trimmedPassword,
        role: role,
        validUntil: validUntil ? new Date(`${validUntil}T23:59:59`).toISOString() : null
      });
      addToast('Сотрудник успешно добавлен в базу данных!', 'success');
      
      // Close modal and reset fields
      setIsModalOpen(false);
      setNameValue(EMPTY_NAME);
      setName('');
      setSymbol('');
      setPassword('');
      setRole('ENGINEER_VENT');
      setValidUntil('');

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
    const r = roleByCode(userRole, roles);
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${roleColorClass(r.color)}`}>
        <RoleIcon name={r.icon} className="w-3.5 h-3.5" />
        {r.name}
        {r.level <= 1 && <span className="text-2xs opacity-70">· 1 уровень</span>}
      </span>
    );
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
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-ui cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Добавить сотрудника
          </button>
        </div>
      </div>

      {/* Основная таблица / Содержимое списка пользователей */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800  overflow-hidden transition-colors">
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
                  <th className="flux-cell text-left whitespace-nowrap">ФИО сотрудника</th>
                  <th className="flux-cell text-left whitespace-nowrap">Табельный номер (Логин)</th>
                  <th className="flux-cell text-left whitespace-nowrap">Роль в системе</th>
                  <th className="flux-cell text-left whitespace-nowrap">Доступ</th>
                  <th className="flux-cell text-left whitespace-nowrap">Дата регистрации</th>
                  <th className="flux-cell text-right whitespace-nowrap">Управление</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-850">
                {usersList.map((emp) => (
                  <tr 
                    key={emp.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors text-slate-800 dark:text-slate-205"
                  >
                    <td className="flux-cell">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {emp.name}
                      </div>
                    </td>
                    <td className="flux-cell font-mono text-sm font-semibold tracking-wider text-emerald-700 dark:text-emerald-400">
                      {emp.symbol}
                    </td>
                    <td className="flux-cell">
                      {getRoleBadge(emp.role)}
                    </td>
                    <td className="flux-cell">
                      {getAccessBadge(emp)}
                    </td>
                    <td className="flux-cell text-xs text-slate-400 font-mono whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        {new Date(emp.createdAt || Date.now()).toLocaleDateString('ru-RU', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </td>
                    <td className="flux-cell text-right">
                      <div className="inline-flex items-center gap-2">
                        {/* Подпись прямо в строке: сразу видно, у кого она есть,
                            и не надо открывать карточку, чтобы это узнать */}
                        <button
                          type="button"
                          onClick={() => setSignFor(emp)}
                          title={(emp as any).hasSignature ? 'Подпись сотрудника' : 'Подписи нет — задать'}
                          className="h-7 min-w-[54px] px-2 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          {(emp as any).hasSignature
                            ? <PenLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            : <span className="text-2xs text-slate-400">подпись</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(emp)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Изменить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Подпись сотрудника — своё окно, вне AnimatePresence */}
      {signFor && (
        <SignatureEditor
          userId={signFor.id}
          userName={signFor.name || signFor.symbol}
          nameParts={{ lastName: signFor.lastName, firstName: signFor.firstName, middleName: signFor.middleName, name: signFor.name }}
          value={signFor.hasSignature ? 'есть' : null}
          heightMm={signFor.signatureHeightMm ?? 8}
          canEdit={user?.id === signFor.id || user?.role === 'ADMIN'}
          onSaved={(sig, mm) => setUsersList((prev) => prev.map((u: any) =>
            u.id === signFor.id ? { ...u, hasSignature: !!sig, signatureHeightMm: mm } : u))}
          onClose={() => setSignFor(null)}
        />
      )}

      {/* Модальное окно добавления нового пользователя */}
      <AnimatePresence>
      {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
            {/* Overlay */}
            <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-md transition-opacity" onClick={() => !isSubmitting && setIsModalOpen(false)} />

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
                  <NameFields value={nameValue} onChange={setNameValue} disabled={isSubmitting} />

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
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-ui font-mono"
                      placeholder="Например, 4519"
                    />
                    <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
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
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-ui"
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
                      className="w-full h-[38px] px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-850 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-ui cursor-pointer"
                    >
                      {roles.map((r) => (
                        <option key={r.code} value={r.code}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">
                      Срок действия профиля (опционально)
                    </label>
                    <input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-ui"
                    />
                    <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">
                      После этой даты сотрудник не сможет войти в систему. Пусто — бессрочный доступ.
                    </p>
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

      {/* Модальное окно управления профилем сотрудника */}
      <AnimatePresence>
        {editUser && (
          <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
            <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-md transition-opacity" onClick={() => !isEditSubmitting && setEditUser(null)} />
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.15 }}
                className="relative w-full max-w-md transform rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800 transition-colors"
              >
                <div className="flex items-center justify-between mb-5 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Управление доступом
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditUser(null)}
                    disabled={isEditSubmitting}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-650 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Сотрудник: <span className="font-semibold text-slate-800 dark:text-white">{editUser.name}</span>
                  {' '}<span className="font-mono text-emerald-700 dark:text-emerald-400">({editUser.symbol})</span>
                </p>

                {editError && (
                  <div className="p-3 mb-4 rounded bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-450 text-xs font-medium border border-rose-200 dark:border-rose-900">
                    {editError}
                  </div>
                )}

                <form onSubmit={handleSaveEdit} className="space-y-4">
                  <NameFields value={editNameValue} onChange={setEditNameValue} disabled={isEditSubmitting} />

                  <div>
                    <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1 font-mono">Табельный номер (логин)</label>
                    <input
                      type="text"
                      value={editSymbol}
                      onChange={(e) => setEditSymbol(e.target.value)}
                      disabled={isEditSubmitting}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-ui font-mono"
                    />
                    <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">Логин для входа. Должен быть уникальным, без символа @.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">Роль</label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        disabled={isEditSubmitting}
                        className="w-full h-[38px] px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-850 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-ui cursor-pointer"
                      >
                        {roles.map((r) => (
                          <option key={r.code} value={r.code}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">Новый пароль</label>
                      <input
                        type="text"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        disabled={isEditSubmitting}
                        placeholder="Не менять"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-ui"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-1">
                      Доступ действует до
                    </label>
                    <input
                      type="date"
                      value={editValidUntil}
                      onChange={(e) => setEditValidUntil(e.target.value)}
                      disabled={isEditSubmitting}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-ui"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button type="button" disabled={isEditSubmitting} onClick={() => setEditValidUntil(presetDate(30))} className="px-2 py-1 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">+30 дней</button>
                      <button type="button" disabled={isEditSubmitting} onClick={() => setEditValidUntil(presetDate(90))} className="px-2 py-1 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">+90 дней</button>
                      <button type="button" disabled={isEditSubmitting} onClick={() => setEditValidUntil(presetDate(365))} className="px-2 py-1 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">+1 год</button>
                      <button type="button" disabled={isEditSubmitting} onClick={() => setEditValidUntil('')} className="px-2 py-1 text-xs font-semibold rounded border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer">Бессрочно</button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      disabled={isEditSubmitting}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                    <span className="text-sm font-semibold text-slate-800 dark:text-white">Профиль активен</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">(снимите, чтобы мгновенно заблокировать вход)</span>
                  </label>

                  {/* Права доступа по функциям */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-550 dark:text-slate-400 uppercase tracking-widest mb-2">Права доступа</label>
                    {editRole === 'ADMIN' ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 text-sm font-semibold">
                        <ShieldCheck className="w-4 h-4" /> Полный доступ (администратор)
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {FEATURES.map((f) => {
                          const e = editPerms[f.id];
                          const on = !!e?.enabled;
                          const isExpired = !!e?.until && new Date(e.until).getTime() < Date.now();
                          // Что уже даёт должность: иначе админ выдаёт лично то,
                          // что у человека и так есть, и потом не понимает,
                          // почему снятие галочки ничего не изменило.
                          const fromRole = !!parsePermissions((editUser as any)?.rolePermissions)[f.id]?.enabled;
                          return (
                            <div key={f.id} className={`rounded-lg border p-2.5 transition-colors ${on ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'}`}>
                              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={(ev) => togglePerm(f.id, ev.target.checked)}
                                  disabled={isEditSubmitting}
                                  className="w-4 h-4 mt-0.5 accent-emerald-600 cursor-pointer shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-slate-800 dark:text-white">{f.label}</span>
                                    <span className="text-2xs font-mono text-slate-400">{f.group}</span>
                                    {fromRole && !on && (
                                      <span className="text-2xs px-1.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-900/60">
                                        уже даёт роль
                                      </span>
                                    )}
                                    {f.risky && <span className="text-2xs font-bold text-amber-600 dark:text-amber-400">осторожно</span>}
                                    {on && isExpired && <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 font-semibold">истекло</span>}
                                  </div>
                                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{f.desc}</p>
                                </div>
                              </label>
                              {on && (
                                <div className="mt-2 pl-7 flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">действует до:</span>
                                  <input
                                    type="datetime-local"
                                    value={toDateTimeInput(e?.until)}
                                    onChange={(ev) => setPermUntil(f.id, ev.target.value)}
                                    disabled={isEditSubmitting}
                                    className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500"
                                  />
                                  {e?.until
                                    ? <button type="button" onClick={() => setPermUntil(f.id, '')} className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">бессрочно</button>
                                    : <span className="text-xs text-slate-400">бессрочно</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">Администратор всегда имеет полный доступ независимо от этих галочек.</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
                    <button
                      type="button"
                      disabled={isEditSubmitting}
                      onClick={handleDeleteUser}
                      className="px-3 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                    >
                      Удалить профиль
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={isEditSubmitting}
                        onClick={() => setEditUser(null)}
                        className="px-4 py-2 text-slate-650 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-850 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        disabled={isEditSubmitting}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg text-sm font-semibold shadow-md transition-colors cursor-pointer"
                      >
                        {isEditSubmitting ? 'Сохранение...' : 'Сохранить'}
                      </button>
                    </div>
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
