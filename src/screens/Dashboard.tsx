/**
 * Главный экран — то, что видит человек, войдя в программу.
 *
 * Задача экрана: за один взгляд ответить на три вопроса — «где я
 * остановился», «что изменилось без меня», «куда идти дальше» — и дать одно
 * поле, из которого можно попасть куда угодно. Всё, что на эти вопросы не
 * отвечает, с экрана убрано: раньше половину занимали двенадцать одинаковых
 * плиток разделов и декоративная подложка во весь блок.
 *
 * Порядок разделов не выдуман: он считается по тому, чем пользователь
 * действительно пользуется (счётчик открытий хранится локально).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import ProjectFormModal from '../components/ProjectFormModal';
import { dataService, UserNote, SystemChangeLog, Project, ProjectInput } from '../services/dataService';
import { useWorkspaceStore, sectionUses, recentSections } from '../store/workspaceStore';
import { useShareStore } from '../store/shareStore';
import { useNotificationStore } from '../store/notificationStore';
import { SECTIONS } from '../workspace/sections';
import { countOf } from '../lib/plural';
import { motion } from 'motion/react';
import {
  Search, History, ExternalLink, ArrowRight, Plus, Check,
  FolderKanban, NotebookPen, CornerDownLeft, X, Clock,
  AlertTriangle, CalendarClock, MessageSquareWarning, Bell,
} from 'lucide-react';

type Attention = {
  overdue: number;
  soon: number;
  remarks: number;
  items: { id: string; kind: string; code: string; title: string; revision: string; dueDate: string | null }[];
};

type Hit = {
  kind: 'section' | 'project' | 'note' | 'tag';
  id: string;
  title: string;
  hint?: string;
  open: () => void;
};

const KIND_LABEL: Record<Hit['kind'], string> = {
  section: 'Раздел',
  project: 'Проект',
  note: 'Заметка',
  tag: 'Тег',
};

export default function Dashboard() {
  const { user, activeProject, setActiveProject } = useStore();
  const { addToast } = useToastStore();
  const open = useWorkspaceStore((s) => s.openInActivePane);
  const setFocusTarget = useShareStore((s) => s.setFocusTarget);

  // Открыть найденный тег не «где-то в реестре», а прямо на нём: раздел
  // «Теги» сам центрирует холст на карточке с такой меткой.
  const openTag = (tagId: string, identifier: string) => {
    setFocusTarget({ r: '/registry', f: `tag:${tagId}`, l: identifier, ty: 'el' });
    open('/registry');
  };

  const [logs, setLogs] = useState<SystemChangeLog[]>([]);
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [attention, setAttention] = useState<Attention | null>(null);
  const chatUnread = useNotificationStore((s) => s.chatUnread);
  const unreadNotifications = useNotificationStore((s) => s.unread);

  // ── Данные экрана ──────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const [l, n, p] = await Promise.allSettled([
      dataService.getLogs(),
      dataService.getNotes(),
      dataService.getProjects(),
    ]);
    if (l.status === 'fulfilled') setLogs((l.value || []).slice(0, 6));
    if (n.status === 'fulfilled') setNotes((n.value || []).slice(0, 3));
    if (p.status === 'fulfilled') setProjects(p.value || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Сводка «требует внимания» по документам проекта — одним запросом.
  useEffect(() => {
    let alive = true;
    if (!activeProject?.id) { setAttention(null); return; }
    fetch(`/api/vdr/attention?projectId=${activeProject.id}&userId=${user?.id || ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && !d.error) setAttention(d as Attention); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeProject?.id, user?.id]);

  // Состав открытых разделов: меняется при любой навигации. Главный экран
  // остаётся смонтированным, поэтому списки пересобираем по нему — иначе
  // они показывали бы то, что было при первом входе.
  const panes = useWorkspaceStore((s) => s.panes);

  // ── Разделы: порядок по частоте использования ──────────────────────────────
  const sections = useMemo(() => {
    const uses = sectionUses();
    const list = SECTIONS
      .filter((s) => s.path !== '/' && s.path !== '/logs' && s.path !== '/generator')
      .filter((s) => !s.adminOnly || user?.role === 'ADMIN');
    return [...list].sort((a, b) => (uses[b.path] || 0) - (uses[a.path] || 0));
  }, [user?.role, loading, panes]);

  const recent = useMemo(() => {
    return recentSections()
      .map((path) => SECTIONS.find((s) => s.path === path))
      .filter((s): s is (typeof SECTIONS)[number] => !!s && s.path !== '/')
      .slice(0, 4);
  }, [loading, panes]);

  // ── Поиск по всему сразу ───────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [tags, setTags] = useState<any[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Теги подтягиваем при первом обращении к поиску, а не при входе:
  // на большом проекте их тысячи, и грузить их «на всякий случай» незачем.
  const ensureTags = async () => {
    if (tags !== null || !activeProject) return;
    try {
      const data = await dataService.getTags(activeProject.id);
      setTags(data.tags || []);
    } catch (_) {
      setTags([]);
    }
  };

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Hit[] = [];
    for (const s of sections) {
      if (s.title.toLowerCase().includes(q)) {
        out.push({ kind: 'section', id: s.path, title: s.title, open: () => open(s.path) });
      }
    }
    for (const p of projects) {
      if ((p.name || '').toLowerCase().includes(q)) {
        out.push({
          kind: 'project', id: p.id, title: p.name,
          hint: activeProject?.id === p.id ? 'уже активный' : 'сделать активным',
          open: () => { setActiveProject(p as any); addToast(`Проект «${p.name}» активен`, 'success'); },
        });
      }
    }
    for (const n of notes) {
      if ((n.title || '').toLowerCase().includes(q)) {
        out.push({ kind: 'note', id: n.id, title: n.title || 'Без названия', open: () => open('/notes') });
      }
    }
    for (const t of tags || []) {
      if (out.length > 20) break;
      const ident = (t.identifier || '').toLowerCase();
      const brand = (t.brand || '').toLowerCase();
      if (ident.includes(q) || brand.includes(q)) {
        out.push({ kind: 'tag', id: t.id, title: t.identifier, hint: t.brand || undefined, open: () => openTag(t.id, t.identifier) });
      }
    }
    return out.slice(0, 8);
  }, [query, sections, projects, notes, tags, activeProject?.id]);

  useEffect(() => { setCursor(0); }, [query]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, Math.max(0, hits.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const h = hits[cursor]; if (h) { h.open(); setQuery(''); } }
    else if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur(); }
  };

  // Курсор сразу в поиске: главный экран — это и есть точка входа, откуда
  // человек идёт дальше. Сочетание Ctrl+K не занимаем — оно уже вызывает
  // помощника из любого места программы.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Любая буква, набранная на главном экране, попадает в поиск —
  // не нужно целиться мышью в поле.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as any).isContentEditable);
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1 && /[\p{L}\p{N}-]/u.test(e.key)) {
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Мелочи оформления ──────────────────────────────────────────────────────
  const relTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const mins = Math.floor((Date.now() - d.getTime()) / 60000);
      if (mins < 1) return 'только что';
      if (mins < 60) return `${mins} мин назад`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours} ч назад`;
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch (_) { return ''; }
  };

  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  const openSticker = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    const win = window as any;
    if (win.electron?.ipcRenderer) {
      win.electron.ipcRenderer.send('window:open-sticker', noteId);
      addToast('Заметка откреплена поверх окон', 'success');
    } else {
      window.open(`/#/sticker?id=${noteId}`, `sticker-${noteId}`, 'width=320,height=380,menubar=no,status=no,toolbar=no,resizable=yes');
    }
  };

  const createProject = async (data: ProjectInput) => {
    try {
      const proj = await dataService.createProject(data, user?.id);
      setShowCreate(false);
      addToast('Проект создан', 'success');
      await dataService.createLog({
        userName: user?.name || '',
        userSymbol: user?.symbol || '',
        description: `Создан новый инженерный проект: ${proj.name}`,
        targetRoute: '/projects',
      });
      setProjects(await dataService.getProjects());
    } catch (err: any) {
      addToast(err.message || 'Не удалось создать проект', 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="max-w-6xl mx-auto flex flex-col gap-4 text-slate-800 dark:text-dark-text-main"
    >
      {/* ── Шапка: кто и когда ── */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">
          С возвращением, {(user?.name || 'Инженер').replace(/\s*\(.*\)$/, '')}
        </h1>
        <span className="text-xs text-slate-500 dark:text-dark-text-muted first-letter:uppercase">{today}</span>
      </header>

      {/* ── Поиск: одна дверь во всё ── */}
      <div className="relative">
        <div className="flex items-center gap-2.5 px-3.5 h-12 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface focus-within:border-emerald-600 dark:focus-within:border-emerald-400">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={ensureTags}
            onKeyDown={onSearchKey}
            placeholder={activeProject ? 'Найти тег, заметку, проект или раздел' : 'Найти заметку, проект или раздел'}
            aria-label="Поиск по программе"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400"
          />
          {query ? (
            <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Очистить поиск"
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="hidden sm:inline text-2xs text-slate-400">просто начните печатать</span>
          )}
        </div>

        {query.trim() && (
          <div role="listbox" aria-label="Результаты поиска"
            className="absolute z-30 left-0 right-0 mt-1.5 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-panel shadow-lg overflow-hidden">
            {hits.length === 0 ? (
              <p className="px-3.5 py-3 text-xs text-slate-500 dark:text-dark-text-muted">
                Ничего не нашлось. Попробуйте код тега, название заметки или раздела.
              </p>
            ) : hits.map((h, i) => (
              <button
                key={`${h.kind}-${h.id}`}
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => { h.open(); setQuery(''); }}
                className={`w-full flex items-center gap-3 px-3.5 py-2 text-left cursor-pointer ${
                  i === cursor ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''
                }`}
              >
                <span className="text-2xs font-mono uppercase tracking-wider text-slate-400 w-14 shrink-0">{KIND_LABEL[h.kind]}</span>
                <span className="text-sm font-medium truncate flex-1">{h.title}</span>
                {h.hint && <span className="text-xs text-slate-400 truncate max-w-[30%]">{h.hint}</span>}
                {i === cursor && <CornerDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Требует внимания: показывается, только если есть о чём сказать ── */}
      {(() => {
        const rows: { key: string; tone: 'crit' | 'warn' | 'info'; icon: any; text: string; action: string; go: () => void }[] = [];
        if (attention?.overdue) rows.push({
          key: 'overdue', tone: 'crit', icon: AlertTriangle,
          text: `Просрочен срок: ${countOf(attention.overdue, 'документ')}`,
          action: 'Открыть ВДР', go: () => open('/management'),
        });
        if (attention?.remarks) rows.push({
          key: 'remarks', tone: 'crit', icon: MessageSquareWarning,
          text: `Замечания на вас: ${countOf(attention.remarks, 'документ')}`,
          action: 'Посмотреть', go: () => open('/management'),
        });
        if (attention?.soon) rows.push({
          key: 'soon', tone: 'warn', icon: CalendarClock,
          text: `Срок в ближайшую неделю: ${countOf(attention.soon, 'документ')}`,
          action: 'Открыть ВДР', go: () => open('/management'),
        });
        if (chatUnread) rows.push({
          key: 'chat', tone: 'info', icon: MessageSquareWarning,
          text: `Новые сообщения: ${countOf(chatUnread, 'диалог')}`,
          action: 'Открыть чат', go: () => open('/chat'),
        });
        if (unreadNotifications && !chatUnread) rows.push({
          key: 'notif', tone: 'info', icon: Bell,
          text: `Непрочитанные уведомления: ${unreadNotifications}`,
          action: 'Показать', go: () => open('/logs'),
        });
        if (!rows.length) return null;

        const tones: Record<string, string> = {
          crit: 'border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300',
          warn: 'border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300',
          info: 'border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-slate-700 dark:text-dark-text-main',
        };
        return (
          <section aria-label="Требует внимания">
            <h2 className="text-2xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">Требует внимания</h2>
            <div className="flex flex-col gap-1.5">
              {rows.map((r) => {
                const Icon = r.icon;
                return (
                  <div key={r.key} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${tones[r.tone]}`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-semibold flex-1 min-w-0 truncate">{r.text}</span>
                    <button type="button" onClick={r.go}
                      className="text-xs font-bold underline underline-offset-2 hover:no-underline cursor-pointer shrink-0">
                      {r.action}
                    </button>
                  </div>
                );
              })}
              {!!attention?.items?.length && (
                <ul className="mt-0.5 flex flex-col gap-0.5 pl-1">
                  {attention.items.slice(0, 4).map((it) => (
                    <li key={it.id}>
                      <button type="button" onClick={() => open('/management')}
                        className="w-full text-left text-xs text-slate-500 dark:text-dark-text-muted hover:text-slate-800 dark:hover:text-white cursor-pointer truncate">
                        <span className="font-mono font-semibold">{it.code || '—'}</span>
                        <span className="mx-1.5">·</span>
                        {it.title || 'Без наименования'}
                        {it.dueDate && (
                          <span className={`ml-1.5 ${it.kind === 'overdue' ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-400'}`}>
                            {it.kind === 'overdue' ? 'просрочен ' : 'до '}{new Date(it.dueDate).toLocaleDateString('ru-RU')}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })()}

      {/* ── Продолжить: где человек был в прошлый раз ── */}
      {recent.length > 0 && (
        <section>
          <h2 className="text-2xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">Продолжить</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {recent.map((s) => {
              const Icon = s.icon as any;
              return (
                <button
                  key={s.path}
                  type="button"
                  onClick={() => open(s.path)}
                  data-share-route={s.path}
                  data-share-label={s.title}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-emerald-600 dark:hover:border-emerald-400 transition-ui cursor-pointer text-left"
                >
                  {Icon && <Icon className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />}
                  <span className="text-sm font-semibold truncate">{s.title}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Разделы: часто используемые впереди ── */}
      <section>
        <h2 className="text-2xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">Разделы</h2>
        <div className="flex flex-wrap gap-1.5">
          {sections.map((s) => {
            const Icon = s.icon as any;
            return (
              <button
                key={s.path}
                type="button"
                onClick={() => open(s.path)}
                data-share-route={s.path}
                data-share-label={s.title}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-600 dark:hover:border-emerald-400 transition-ui cursor-pointer"
              >
                {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
                <span className="text-xs font-semibold">{s.title}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Три колонки: изменения, заметки, проекты ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        {/* Последние изменения */}
        <section className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 dark:border-dark-border">
            <h2 className="text-sm font-bold flex items-center gap-2"><History className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> Последние изменения</h2>
            <button type="button" onClick={() => open('/logs')} className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">Все</button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-dark-border">
            {loading && <p className="px-3.5 py-4 text-xs text-slate-400">Загружаю…</p>}
            {!loading && logs.length === 0 && (
              <p className="px-3.5 py-4 text-xs text-slate-500 dark:text-dark-text-muted">Пока ничего не менялось.</p>
            )}
            {logs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => { const r = (log as any).targetRoute; if (r && r !== '#') open(r); }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-dark-panel transition-ui cursor-pointer"
              >
                <p className="text-xs text-slate-700 dark:text-dark-text-main line-clamp-2">{log.description}</p>
                <p className="mt-0.5 text-2xs text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 shrink-0" />
                  {relTime((log as any).createdAt)}
                  <span className="truncate">· {(log.userName || '').replace(/\s*\(.*\)$/, '')}</span>
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Мои заметки */}
        <section className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 dark:border-dark-border">
            <h2 className="text-sm font-bold flex items-center gap-2"><NotebookPen className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> Мои заметки</h2>
            <button type="button" onClick={() => open('/notes')} className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">Все</button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-dark-border">
            {!loading && notes.length === 0 && (
              <div className="px-3.5 py-4">
                <p className="text-xs text-slate-500 dark:text-dark-text-muted mb-2">Заметок пока нет.</p>
                <button type="button" onClick={() => open('/notes')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Создать первую
                </button>
              </div>
            )}
            {notes.map((note) => (
              <div key={note.id} className="px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-dark-panel transition-ui group">
                <button type="button" onClick={() => open('/notes')} className="w-full text-left cursor-pointer">
                  <p className="text-xs font-semibold truncate">{note.title || 'Без названия'}</p>
                  <p className="text-2xs text-slate-500 dark:text-dark-text-muted line-clamp-2 mt-0.5">
                    {(note.content || '').replace(/<[^>]*>/g, ' ').trim() || 'Заметка не заполнена'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={(e) => openSticker(e, note.id)}
                  title="Открыть заметку отдельным окном поверх других"
                  className="mt-1 inline-flex items-center gap-1 text-2xs font-semibold text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-ui cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" /> На экран
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Проекты */}
        <section className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 dark:border-dark-border">
            <h2 className="text-sm font-bold flex items-center gap-2"><FolderKanban className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> Проекты</h2>
            <button type="button" onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Создать
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-dark-border max-h-56 overflow-y-auto scrollbar-thin">
            {!loading && projects.length === 0 && (
              <p className="px-3.5 py-4 text-xs text-slate-500 dark:text-dark-text-muted">
                Проектов пока нет. Создайте первый — без него не работают теги, оборудование и закупки.
              </p>
            )}
            {projects.map((p) => {
              const active = activeProject?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveProject(active ? null : (p as any))}
                  aria-pressed={active}
                  title={active ? 'Снять как активный' : 'Сделать активным'}
                  className={`w-full flex items-center gap-2 px-3.5 py-2 text-left transition-ui cursor-pointer ${
                    active ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'hover:bg-slate-50 dark:hover:bg-dark-panel'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-700 dark:text-emerald-400' : 'opacity-0'}`} />
                  <span className={`text-xs truncate flex-1 ${active ? 'font-bold text-emerald-900 dark:text-emerald-200' : 'font-medium'}`}>{p.name}</span>
                  {active && <span className="text-2xs font-mono uppercase text-emerald-700 dark:text-emerald-400 shrink-0">активный</span>}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => open('/projects')}
            className="w-full px-3.5 py-2 text-xs font-semibold text-slate-500 dark:text-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-panel border-t border-slate-100 dark:border-dark-border flex items-center justify-center gap-1 cursor-pointer">
            Управление проектами <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </section>
      </div>

      {showCreate && (
        <ProjectFormModal
          title="Новый проект"
          onClose={() => setShowCreate(false)}
          onSave={createProject}
        />
      )}
    </motion.div>
  );
}
