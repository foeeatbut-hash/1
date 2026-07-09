import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { useLogStore } from '../store/logStore';
import NotificationSettings from '../components/NotificationSettings';
import UpdaterWidget from '../components/UpdaterWidget';
import CustomSelect from '../components/CustomSelect';
import FluxLogo from '../components/FluxLogo';
import { ENV_CONFIG } from '../config/env';
import {
  Settings, Sun, Moon, Database, Terminal, Bell, Briefcase, Fan, DownloadCloud,
  Plus, Trash2, ChevronUp, ChevronDown, RotateCcw, Loader2, Check,
  Tag, MousePointerClick, Link2
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  ProcurementStage, DEFAULT_STAGES, STAGE_ICONS, STAGE_COLORS,
  loadProcurementStages, saveProcurementStages, stageIcon, stageColor
} from '../lib/procurementStages';

// ── Раздел «Настройки» ─────────────────────────────────────────────────────────
// Все настройки программы в одном месте: категории слева (как в настройках
// Windows/iOS), содержимое выбранной категории справа. Сюда перенесены
// настройки из профиля и из отдельных разделов.

type SectionId = 'general' | 'management' | 'equipment' | 'tags' | 'notifications' | 'database' | 'logs' | 'updates';

const SECTIONS: Array<{ id: SectionId; label: string; icon: any; desc: string }> = [
  { id: 'general', label: 'Общие', icon: Settings, desc: 'Тема интерфейса' },
  { id: 'management', label: 'Менеджмент', icon: Briefcase, desc: 'Этапы закупки: названия, значки, цвета' },
  { id: 'equipment', label: 'Оборудование', icon: Fan, desc: 'Категории и поведение при новой ревизии' },
  { id: 'tags', label: 'Теги', icon: Tag, desc: 'Холст связей: способ создания связей' },
  { id: 'notifications', label: 'Уведомления', icon: Bell, desc: 'Какие события показывать' },
  { id: 'database', label: 'База данных', icon: Database, desc: 'Локальная SQLite или сетевой PostgreSQL' },
  { id: 'logs', label: 'Crash-логи', icon: Terminal, desc: 'Папка аварийных журналов' },
  { id: 'updates', label: 'Обновления', icon: DownloadCloud, desc: 'Версия программы и обновления' },
];

export default function SettingsScreen() {
  const { user, theme, toggleTheme } = useStore();
  const { addToast } = useToastStore();
  const addLog = useLogStore((s) => s.addLog);
  const [searchParams, setSearchParams] = useSearchParams();

  const initial = (searchParams.get('section') as SectionId) || 'general';
  const [section, setSection] = useState<SectionId>(SECTIONS.some(s => s.id === initial) ? initial : 'general');

  const pick = (id: SectionId) => {
    setSection(id);
    setSearchParams({ section: id }, { replace: true });
  };

  const isAdmin = user?.role === 'ADMIN';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full flex gap-4 text-slate-800 dark:text-slate-100"
    >
      {/* Категории (левая колонка) */}
      <div className="w-72 shrink-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl shadow-xs overflow-hidden flex flex-col">
        <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-850 flex items-center gap-2">
          <Settings className="w-4.5 h-4.5 text-emerald-600" />
          <h1 className="text-base font-bold text-slate-900 dark:text-white">Настройки</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => pick(s.id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 mt-0.5 shrink-0 ${active ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{s.label}</span>
                  <span className={`block text-[11px] leading-tight mt-0.5 truncate ${active ? 'text-emerald-100' : 'text-slate-400'}`}>{s.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Содержимое категории */}
      <div className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl shadow-xs overflow-y-auto p-6">
        {section === 'general' && <GeneralSection theme={theme} toggleTheme={toggleTheme} />}
        {section === 'management' && <ManagementSection isAdmin={isAdmin} addToast={addToast} />}
        {section === 'equipment' && <EquipmentSection isAdmin={isAdmin} addToast={addToast} />}
        {section === 'tags' && <TagsSection addToast={addToast} />}
        {section === 'notifications' && (
          <SectionShell title="Уведомления" desc="Какие события показывать в панели уведомлений и как оповещать.">
            <NotificationSettings />
          </SectionShell>
        )}
        {section === 'database' && <DatabaseSection addToast={addToast} />}
        {section === 'logs' && <CrashLogsSection addLog={addLog} />}
        {section === 'updates' && (
          <SectionShell title="Обновления" desc="Текущая версия программы и установка обновлений.">
            <div className="max-w-md"><UpdaterWidget /></div>
          </SectionShell>
        )}
      </div>
    </motion.div>
  );
}

function SectionShell({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
      <p className="text-xs text-slate-400 mt-1 mb-5">{desc}</p>
      {children}
    </div>
  );
}

// ── Общие ──────────────────────────────────────────────────────────────────────
function GeneralSection({ theme, toggleTheme }: any) {
  return (
    <SectionShell title="Общие" desc="Внешний вид программы.">
      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Тема интерфейса</div>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <button
              onClick={() => { if (theme === 'dark') toggleTheme(); }}
              className={`py-3 px-4 rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                theme !== 'dark' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-400" /> Светлая
            </button>
            <button
              onClick={() => { if (theme !== 'dark') toggleTheme(); }}
              className={`py-3 px-4 rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                theme === 'dark' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              <Moon className="w-4 h-4 text-emerald-400" /> Тёмная
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">О программе</div>
          <div className="flex items-center gap-3.5">
            <FluxLogo size={46} radius={13} />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                Flux
                <span className="font-mono text-[11px] font-normal text-slate-400 dark:text-slate-500">v{__APP_VERSION__}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Разработка <span className="font-semibold text-slate-600 dark:text-slate-300">Раупова Хусрава</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

// ── Менеджмент: редактор этапов закупки ────────────────────────────────────────
function ManagementSection({ isAdmin, addToast }: any) {
  const [stages, setStages] = useState<ProcurementStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIconFor, setEditingIconFor] = useState<string | null>(null);

  useEffect(() => {
    loadProcurementStages().then(s => { setStages(s); setLoading(false); });
  }, []);

  const persist = async (next: ProcurementStage[]) => {
    setStages(next);
    setSaving(true);
    const ok = await saveProcurementStages(next);
    setSaving(false);
    if (!ok) addToast('Не удалось сохранить этапы', 'error');
  };

  const update = (id: string, patch: Partial<ProcurementStage>) => {
    persist(stages.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...stages];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    persist(next);
  };

  const addStage = () => {
    const id = 'st' + Date.now().toString(36);
    persist([...stages, { id, label: 'Новый этап', icon: 'Flag', color: 'indigo' }]);
  };

  const removeStage = (id: string) => {
    if (stages.length <= 2) {
      addToast('Должно остаться минимум два этапа', 'error');
      return;
    }
    if (!confirm('Удалить этап? Позиции на этом этапе вернутся на первый этап.')) return;
    persist(stages.filter(s => s.id !== id));
  };

  if (loading) return <SectionShell title="Менеджмент" desc="Загрузка…"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></SectionShell>;

  return (
    <SectionShell title="Менеджмент" desc="Этапы закупки: настройте названия, значки, цвета и порядок под свой процесс. Первый этап — начальный (позиция только добавлена).">
      {!isAdmin && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-300">
          Изменять этапы может администратор. Вы видите текущую настройку.
        </div>
      )}

      <div className="space-y-2 mb-4">
        {stages.map((s, idx) => {
          const Icon = stageIcon(s.icon);
          const c = stageColor(s.color);
          return (
            <div key={s.id} className={`p-3 rounded-xl border ${c.border} ${c.bg} flex flex-wrap items-center gap-2.5`}>
              {/* Порядок */}
              <div className="flex flex-col">
                <button disabled={!isAdmin || idx === 0} onClick={() => move(idx, -1)} className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button disabled={!isAdmin || idx === stages.length - 1} onClick={() => move(idx, 1)} className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3.5 h-3.5" /></button>
              </div>

              <span className={`w-6 text-center text-xs font-black ${c.color}`}>{idx + 1}</span>

              {/* Значок */}
              <div className="relative">
                <button
                  disabled={!isAdmin}
                  onClick={() => setEditingIconFor(editingIconFor === s.id ? null : s.id)}
                  className={`w-9 h-9 rounded-full border ${c.border} ${c.color} bg-white/70 dark:bg-slate-950/60 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform`}
                  title="Выбрать значок"
                >
                  <Icon className="w-4.5 h-4.5" />
                </button>
                {editingIconFor === s.id && (
                  <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 grid grid-cols-8 gap-1 w-72">
                    {Object.keys(STAGE_ICONS).map(name => {
                      const I = STAGE_ICONS[name];
                      return (
                        <button
                          key={name}
                          onClick={() => { update(s.id, { icon: name }); setEditingIconFor(null); }}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 ${s.icon === name ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600' : 'text-slate-500'}`}
                          title={name}
                        >
                          <I className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Название */}
              <input
                disabled={!isAdmin}
                defaultValue={s.label}
                onBlur={(e) => { if (e.target.value.trim() && e.target.value !== s.label) update(s.id, { label: e.target.value.trim() }); }}
                className="flex-1 min-w-[140px] px-3 py-2 bg-white/80 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />

              {/* Цвет */}
              <div className="flex items-center gap-1">
                {Object.keys(STAGE_COLORS).map(colorName => (
                  <button
                    key={colorName}
                    disabled={!isAdmin}
                    onClick={() => update(s.id, { color: colorName })}
                    className={`w-5 h-5 rounded-full ${STAGE_COLORS[colorName].solid} cursor-pointer transition-all ${s.color === colorName ? 'ring-2 ring-offset-1 dark:ring-offset-slate-950 ring-slate-500 scale-110' : 'opacity-60 hover:opacity-100'}`}
                    title={colorName}
                  />
                ))}
              </div>

              {/* Удалить (первый этап — базовый, не удаляется) */}
              <button
                disabled={!isAdmin || idx === 0}
                onClick={() => removeStage(s.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-white/60 dark:hover:bg-slate-900 disabled:opacity-20 cursor-pointer"
                title={idx === 0 ? 'Первый (начальный) этап нельзя удалить' : 'Удалить этап'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2">
          <button onClick={addStage} className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer">
            <Plus className="w-4 h-4" /> Добавить этап
          </button>
          <button
            onClick={() => { if (confirm('Вернуть стандартные 4 этапа?')) persist(DEFAULT_STAGES); }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> Стандартные этапы
          </button>
          {saving && <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Сохранение…</span>}
          {!saving && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Сохраняется автоматически</span>}
        </div>
      )}
    </SectionShell>
  );
}

// ── Оборудование ───────────────────────────────────────────────────────────────
function EquipmentSection({ isAdmin, addToast }: any) {
  const [conflictMode, setConflictMode] = useState<'immediate' | 'wait'>('wait');
  const [categories, setCategories] = useState<Array<{ id: string; label: string; composite?: boolean }>>([]);
  const [newCat, setNewCat] = useState('');

  useEffect(() => {
    fetch('/api/settings/equip_conflict_mode').then(r => r.json()).then(d => {
      if (d.global === 'immediate') setConflictMode('immediate');
    }).catch(() => {});
    fetch('/api/equipment/categories').then(r => r.json()).then(d => {
      if (Array.isArray(d.categories)) setCategories(d.categories);
    }).catch(() => {});
  }, []);

  const saveConflictMode = async (m: 'immediate' | 'wait') => {
    setConflictMode(m);
    await fetch('/api/settings/equip_conflict_mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: null, value: m }) }).catch(() => {});
  };

  const saveCategories = async (next: any[]) => {
    setCategories(next);
    await fetch('/api/equipment/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categories: next }) }).catch(() => {});
  };

  return (
    <SectionShell title="Оборудование" desc="Поведение при импорте новых ревизий и категории оборудования. Видимость параметров настраивается в самом разделе (значок шестерёнки).">
      <div className="space-y-5">
        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">При новой ревизии</div>
          <div className="flex gap-2 max-w-md">
            <button onClick={() => saveConflictMode('wait')} className={`flex-1 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${conflictMode === 'wait' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'}`}>Ждать решения (✓/✎)</button>
            <button onClick={() => saveConflictMode('immediate')} className={`flex-1 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${conflictMode === 'immediate' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'}`}>Изменять сразу</button>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Категории оборудования</div>
          <div className="space-y-1 mb-2 max-h-52 overflow-y-auto max-w-md">
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 text-xs">
                <span>{c.label}</span>
                {isAdmin && !['AHU', 'FAN', 'VALVE', 'CURTAIN'].includes(c.id) && (
                  <button onClick={() => saveCategories(categories.filter(x => x.id !== c.id))} className="text-slate-400 hover:text-rose-500 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="flex gap-2 max-w-md">
              <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Новая категория…" className="flex-1 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:border-emerald-500" />
              <button
                onClick={() => {
                  const label = newCat.trim();
                  if (!label) return;
                  saveCategories([...categories, { id: 'C' + Date.now(), label, composite: false }]);
                  setNewCat('');
                  addToast('Категория добавлена', 'success');
                }}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Добавить
              </button>
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}

// ── Раздел «Теги» → подраздел «Холст» ───────────────────────────────────────
function TagsSection({ addToast }: any) {
  const [linkMode, setLinkMode] = useState<'click' | 'drag'>('click');

  useEffect(() => {
    fetch('/api/settings/registry_link_mode').then(r => r.json()).then(d => {
      if (d.global === 'drag' || d.global === 'click') setLinkMode(d.global);
    }).catch(() => {});
  }, []);

  const saveLinkMode = async (m: 'click' | 'drag') => {
    setLinkMode(m);
    await fetch('/api/settings/registry_link_mode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: null, value: m }),
    }).catch(() => {});
    // Открытый холст подхватит новый режим без перезагрузки
    try { window.dispatchEvent(new CustomEvent('flux:settings-changed', { detail: { key: 'registry_link_mode', value: m } })); } catch (_) {}
    addToast?.('Способ создания связей сохранён', 'success');
  };

  const opt = (mode: 'click' | 'drag', icon: React.ReactNode, title: string, desc: string) => (
    <button
      onClick={() => saveLinkMode(mode)}
      className={`flex-1 p-4 rounded-xl border text-left cursor-pointer transition-colors ${
        linkMode === mode
          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-500/30'
          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${linkMode === mode ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-500'}`}>{icon}</span>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</span>
        {linkMode === mode && <Check className="w-4 h-4 text-emerald-600 ml-auto" />}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
    </button>
  );

  return (
    <SectionShell title="Теги" desc="Настройки раздела «Теги» и холста связей.">
      <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Холст · подключение связей</div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Как соединять теги на интерактивном холсте.</p>
        <div className="flex gap-3 max-w-xl flex-col sm:flex-row">
          {opt('click', <MousePointerClick className="w-4 h-4" />, 'Кликом',
            'Кнопка «связать» на карточке → клик по целевому тегу. Минимум точности, удобно мышью.')}
          {opt('drag', <Link2 className="w-4 h-4" />, 'Перетаскиванием',
            'Точки-порты по краям карточки: тянешь линию от одного тега к другому.')}
        </div>
      </div>
    </SectionShell>
  );
}

// ── База данных (перенесено из профиля) ────────────────────────────────────────
function DatabaseSection({ addToast }: any) {
  const [dbLocation, setDbLocation] = useState('');
  const [dbDisplayLocation, setDbDisplayLocation] = useState('');
  const [dbType, setDbType] = useState<'LOCAL' | 'REMOTE' | string>('LOCAL');
  const [activeDbType, setActiveDbType] = useState<'LOCAL' | 'REMOTE' | string>('LOCAL');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; success: boolean } | null>(null);

  const refresh = async () => {
    try {
      const resp = await fetch(`${ENV_CONFIG.apiUrl}/db/config`.replace('/api/api', '/api'));
      const config = await resp.json();
      setDbLocation(config.databasePath);
      setDbDisplayLocation(config.displayPath || config.databasePath);
      setDbType(config.current_db_type || 'LOCAL');
      setActiveDbType(config.current_db_type || 'LOCAL');
      setRemoteUrl(config.database_url || '');
    } catch (_) {}
  };

  useEffect(() => { refresh(); }, []);

  const handleSwitch = async (targetType: string, urlKey: string, dbPath?: string) => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const resp = await fetch(`${ENV_CONFIG.apiUrl}/db/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_db_type: targetType,
          database_url: urlKey,
          ...(typeof dbPath === 'string' ? { database_path: dbPath } : {})
        })
      });
      const data = await resp.json();
      if (data.success) {
        setStatusMessage({ text: data.message, success: true });
        await refresh();
        alert(data.message || 'Подключение успешно обновлено!');
        window.location.reload();
      } else {
        setStatusMessage({ text: data.message || 'Ошибка подключения!', success: false });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Ошибка запроса: ${err.message}`, success: false });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickDbFile = async () => {
    const win = window as any;
    if (!win.electron?.ipcRenderer?.invoke) {
      alert('Выбор файла доступен только в приложении Flux (Electron).');
      return;
    }
    try {
      const filePath = await win.electron.ipcRenderer.invoke('database:select-file');
      if (filePath) await handleSwitch('LOCAL', '', String(filePath));
    } catch (err: any) {
      setStatusMessage({ text: `Ошибка выбора файла: ${err.message}`, success: false });
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setStatusMessage(null);
    try {
      const resp = await fetch(`${ENV_CONFIG.apiUrl}/db/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_db_type: dbType, database_url: remoteUrl })
      });
      const data = await resp.json();
      setStatusMessage({ text: data.message, success: !!data.success });
    } catch (err: any) {
      setStatusMessage({ text: `Ошибка при проверке: ${err.message}`, success: false });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <SectionShell title="База данных" desc="Локальная SQLite (работает автономно) или сетевой PostgreSQL для совместной работы.">
      <div className="max-w-lg space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setDbType('LOCAL')} className={`py-2 rounded-xl border text-sm font-semibold cursor-pointer ${dbType === 'LOCAL' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'}`}>Локальная</button>
          <button onClick={() => setDbType('REMOTE')} className={`py-2 rounded-xl border text-sm font-semibold cursor-pointer ${dbType === 'REMOTE' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'}`}>Сеть / PostgreSQL</button>
        </div>

        {dbType === 'LOCAL' ? (
          <div className="space-y-2">
            <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg select-all break-all" title={dbLocation}>
              {dbDisplayLocation || 'database.sqlite'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={isSaving} onClick={handlePickDbFile} className="py-2 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50">Выбрать файл БД…</button>
              <button disabled={isSaving} onClick={() => { if (confirm('Вернуть стандартное расположение базы (AppData/pdm-app)?')) handleSwitch('LOCAL', '', ''); }} className="py-2 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50">Стандартный путь</button>
            </div>
            <button disabled={isSaving} onClick={() => handleSwitch('LOCAL', '')} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50">
              {isSaving ? 'Подключение…' : activeDbType === 'LOCAL' ? 'Локальный режим активен ✓' : 'Включить локальный режим'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="postgresql://user:password@host:5432/dbname"
              className="w-full font-mono text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-emerald-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <button disabled={isTesting} onClick={handleTest} className="py-2 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50">
                {isTesting ? 'Проверка…' : 'Тестировать'}
              </button>
              <button disabled={isSaving} onClick={() => handleSwitch('REMOTE', remoteUrl)} className="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                {isSaving ? 'Загрузка…' : 'Сохранить и подключить'}
              </button>
            </div>
          </div>
        )}

        {statusMessage && (
          <div className={`p-2 text-xs font-bold text-center rounded-lg ${statusMessage.success ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600'}`}>
            {statusMessage.text}
          </div>
        )}
      </div>
    </SectionShell>
  );
}

// ── Crash-логи ─────────────────────────────────────────────────────────────────
function CrashLogsSection({ addLog }: any) {
  const [crashLogDir, setCrashLogDir] = useState('');

  useEffect(() => {
    fetch(`${ENV_CONFIG.apiUrl}/db/config`).then(r => r.json()).then((config: any) => {
      setCrashLogDir(config.crash_log_dir || '');
    }).catch(() => {});
  }, []);

  const save = async (dir: string) => {
    try {
      const resp = await fetch(`${ENV_CONFIG.apiUrl}/config/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crash_log_dir: dir })
      });
      const data = await resp.json();
      if (data.success) {
        setCrashLogDir(data.crash_log_dir || '');
        addLog('INFO', 'Система', `Папка для crash-логов изменена: ${data.crash_log_dir || 'по умолчанию (AppData/pdm-app/logs)'}`);
      }
    } catch (err: any) {
      addLog('ERROR', 'Система', `Не удалось сохранить папку crash-логов: ${err.message}`);
    }
  };

  const pickDir = async () => {
    const win = window as any;
    if (!win.electron?.ipcRenderer?.invoke) {
      alert('Выбор папки доступен только в приложении Flux (Electron).');
      return;
    }
    try {
      const dirPath = await win.electron.ipcRenderer.invoke('dialog:openDirectory');
      if (dirPath) await save(String(dirPath));
    } catch (err: any) {
      addLog('ERROR', 'Система', `Ошибка выбора папки: ${err.message}`);
    }
  };

  return (
    <SectionShell title="Crash-логи" desc="Папка, куда программа записывает аварийные журналы при закрытии. В журнале видно каждый клик и запрос — по нему легко найти причину ошибки.">
      <div className="max-w-lg space-y-2">
        <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg select-all break-all">
          {crashLogDir || 'AppData/pdm-app/logs (по умолчанию)'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={pickDir} className="py-2 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">Выбрать папку…</button>
          <button onClick={() => save('')} className="py-2 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">По умолчанию</button>
        </div>
      </div>
    </SectionShell>
  );
}
