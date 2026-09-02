/**
 * Кто работает над проектом.
 *
 * Показывается сразу после создания проекта — тем же шагом, каким его и
 * заводят: проект без ответа на вопрос «кто в деле» становится общим, и
 * ограничение, ради которого всё затевалось, не включается никогда.
 *
 * Пустой состав — не ошибка, а состояние: пока в проект никого не позвали, он
 * виден всем. Об этом сказано прямо, а не оставлено человеку на догадки.
 */
import React from 'react';
import { X, Users, Check, Search } from 'lucide-react';
import { ENV_CONFIG, getAuthToken } from '../config/env';
import { useToastStore } from '../store/toastStore';
import { useStore } from '../store/store';
import { Z } from '../lib/layers';

interface Person { id: string; name: string; symbol: string }

const headers = (): Record<string, string> => {
  const t = getAuthToken();
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

export default function ProjectMembers({ projectId, projectName, onClose }: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const me = useStore((s) => s.user);
  const { addToast } = useToastStore();
  const [people, setPeople] = React.useState<Person[]>([]);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [uRes, mRes] = await Promise.all([
          fetch(`${ENV_CONFIG.apiUrl}/users`, { headers: headers() }),
          fetch(`${ENV_CONFIG.apiUrl}/projects/${projectId}/members`, { headers: headers() }),
        ]);
        const uJson = uRes.ok ? await uRes.json() : [];
        const mJson = mRes.ok ? await mRes.json() : { items: [], open: true };
        if (!alive) return;
        const rows = Array.isArray(uJson) ? uJson : uJson?.users || [];
        setPeople(rows.map((u: any) => ({ id: u.id, name: u.name, symbol: u.symbol })));
        setChosen(new Set((mJson.items || []).map((m: any) => m.userId)));
        setOpen(!!mJson.open);
      } catch (_) { /* список людей не пришёл — состав всё равно можно закрыть */ }
    })();
    return () => { alive = false; };
  }, [projectId]);

  const flip = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChosen(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${ENV_CONFIG.apiUrl}/projects/${projectId}/members`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ userIds: Array.from(chosen) }),
      });
      if (!res.ok) throw new Error('не сохранилось');
      addToast(chosen.size
        ? `В проекте ${chosen.size} человек — остальные его не увидят`
        : 'Состав пуст: проект видят все', 'success');
      onClose();
    } catch (_) {
      addToast('Не удалось сохранить состав', 'error');
    } finally { setBusy(false); }
  };

  const shown = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4"
      style={{ zIndex: Z.modal }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Кто работает над проектом"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[84vh] flex flex-col rounded-2xl border border-slate-200 dark:border-dark-border
                   bg-white dark:bg-dark-surface shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-dark-border">
          <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
            Кто работает над «{projectName}»
          </span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} aria-label="Закрыть"
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-slate-200 dark:border-dark-border">
          <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800
                          bg-slate-50 dark:bg-slate-900">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти сотрудника"
              className="flex-1 min-w-0 bg-transparent outline-none text-xs text-slate-800 dark:text-slate-150" />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {shown.map((p) => {
            const on = chosen.has(p.id);
            return (
              <button key={p.id} type="button" onClick={() => flip(p.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer
                           hover:bg-slate-100 dark:hover:bg-slate-850">
                <span className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border
                                  ${on ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 dark:border-slate-700'}`}>
                  {on && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {p.name}{p.id === me?.id ? ' — вы' : ''}
                  </span>
                  <span className="block text-2xs text-slate-400">Таб. {p.symbol}</span>
                </span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">Никого не нашлось.</p>}
        </div>

        <div className="px-4 py-2 border-t border-slate-200 dark:border-dark-border">
          <p className="text-2xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {chosen.size === 0
              ? (open
                ? 'Пока в проект никого не позвали, его видят все. Как только появится первый участник, остальные перестанут видеть и проект, и его файлы.'
                : 'Состав пуст — проект снова станет виден всем.')
              : 'Кто не в списке — не увидит ни проекта, ни его файлов, ни тегов, ни писем. Администратор видит всё.'}
          </p>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-200 dark:border-dark-border
                        bg-slate-50 dark:bg-dark-bg">
          <span className="text-2xs text-slate-500 dark:text-slate-400">Выбрано: {chosen.size}</span>
          <span className="flex-1" />
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer text-slate-600 dark:text-slate-300
                       hover:bg-slate-100 dark:hover:bg-slate-850">
            Потом
          </button>
          <button type="button" onClick={save} disabled={busy}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer bg-emerald-600 text-white
                       hover:bg-emerald-700 disabled:opacity-50">
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
