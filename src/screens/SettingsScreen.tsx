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
  Tag, MousePointerClick, Link2, Archive, PlayCircle, FolderOpen, FileSpreadsheet, X
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  ProcurementStage, StageTemplate, DEFAULT_STAGES, STAGE_ICONS, STAGE_COLORS,
  loadProcurementStages, saveProcurementStages, stageIcon, stageColor,
  loadStageTemplates, saveStageTemplates, emptyRules
} from '../lib/procurementStages';

// ── Раздел «Настройки» ─────────────────────────────────────────────────────────
// Все настройки программы в одном месте: категории слева (как в настройках
// Windows/iOS), содержимое выбранной категории справа. Сюда перенесены
// настройки из профиля и из отдельных разделов.

type SectionId = 'general' | 'management' | 'docflow' | 'equipment' | 'tags' | 'notifications' | 'database' | 'backup' | 'logs' | 'updates';

const SECTIONS: Array<{ id: SectionId; label: string; icon: any; desc: string }> = [
  { id: 'general', label: 'Общие', icon: Settings, desc: 'Тема интерфейса' },
  { id: 'management', label: 'Менеджмент', icon: Briefcase, desc: 'Этапы закупки: названия, значки, цвета' },
  { id: 'docflow', label: 'Документооборот', icon: FileSpreadsheet, desc: 'Стандарты ВДР: коды, сроки, ревизии, типы' },
  { id: 'equipment', label: 'Оборудование', icon: Fan, desc: 'Категории и поведение при новой ревизии' },
  { id: 'tags', label: 'Теги', icon: Tag, desc: 'Холст связей: способ создания связей' },
  { id: 'notifications', label: 'Уведомления', icon: Bell, desc: 'Какие события показывать' },
  { id: 'database', label: 'База данных', icon: Database, desc: 'Локальная SQLite или сетевой PostgreSQL' },
  { id: 'backup', label: 'Резервные копии', icon: Archive, desc: 'Ежедневный архив базы, файлов и данных' },
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

  // Секция может смениться и через URL (туры ассистента, кнопка «Этапы» в
  // Менеджменте): следим за query и переключаемся, а не только при монтировании
  useEffect(() => {
    const fromUrl = searchParams.get('section') as SectionId | null;
    if (fromUrl && SECTIONS.some(s => s.id === fromUrl) && fromUrl !== section) {
      setSection(fromUrl);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {section === 'docflow' && <DocflowSection isAdmin={isAdmin} addToast={addToast} />}
        {section === 'tags' && <TagsSection addToast={addToast} />}
        {section === 'notifications' && (
          <SectionShell title="Уведомления" desc="Какие события показывать в панели уведомлений и как оповещать.">
            <NotificationSettings />
          </SectionShell>
        )}
        {section === 'database' && <DatabaseSection addToast={addToast} />}
        {section === 'backup' && <BackupSection isAdmin={isAdmin} addToast={addToast} />}
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

// ── Менеджмент: редактор этапов закупки и шаблонов ─────────────────────────────
// Стандартный набор этапов — общий по умолчанию. Дополнительно можно завести
// именованные шаблоны со своими этапами и правилами применения: отделы (классы),
// типы оборудования, категории установок, подстроки обозначения. Отдельным
// тегам шаблон назначается вручную в разделе «Менеджмент».

// Переиспользуемый редактор списка этапов (для стандартного набора и шаблонов)
function StageListEditor({ stages, onChange, isAdmin, addToast }: {
  stages: ProcurementStage[];
  onChange: (next: ProcurementStage[]) => void;
  isAdmin: boolean;
  addToast: (msg: string, type?: string) => void;
}) {
  const [editingIconFor, setEditingIconFor] = useState<string | null>(null);

  const update = (id: string, patch: Partial<ProcurementStage>) => {
    onChange(stages.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...stages];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const addStage = () => {
    const id = 'st' + Date.now().toString(36);
    onChange([...stages, { id, label: 'Новый этап', icon: 'Flag', color: 'indigo' }]);
  };

  const removeStage = (id: string) => {
    if (stages.length <= 2) {
      addToast('Должно остаться минимум два этапа', 'error');
      return;
    }
    if (!confirm('Удалить этап? Позиции на этом этапе вернутся на первый этап.')) return;
    onChange(stages.filter(s => s.id !== id));
  };

  return (
    <>
      <div className="space-y-2 mb-3">
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
        <button onClick={addStage} className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer">
          <Plus className="w-4 h-4" /> Добавить этап
        </button>
      )}
    </>
  );
}

// Редактор списка значений правила (через запятую)
function RuleListInput({ label, hint, values, onChange, disabled }: {
  label: string; hint: string; values: string[]; onChange: (v: string[]) => void; disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      <input
        disabled={disabled}
        defaultValue={values.join(', ')}
        placeholder={hint}
        onBlur={(e) => {
          const next = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
          if (JSON.stringify(next) !== JSON.stringify(values)) onChange(next);
        }}
        className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
      />
    </div>
  );
}

function ManagementSection({ isAdmin, addToast }: any) {
  const [stages, setStages] = useState<ProcurementStage[]>([]);
  const [templates, setTemplates] = useState<StageTemplate[]>([]);
  const [activeId, setActiveId] = useState<string>('default'); // 'default' | id шаблона
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([loadProcurementStages(), loadStageTemplates()]).then(([s, t]) => {
      setStages(s); setTemplates(t); setLoading(false);
    });
  }, []);

  const persistStages = async (next: ProcurementStage[]) => {
    setStages(next);
    setSaving(true);
    const ok = await saveProcurementStages(next);
    setSaving(false);
    if (!ok) addToast('Не удалось сохранить этапы', 'error');
  };

  const persistTemplates = async (next: StageTemplate[]) => {
    setTemplates(next);
    setSaving(true);
    const ok = await saveStageTemplates(next);
    setSaving(false);
    if (!ok) addToast('Не удалось сохранить шаблоны', 'error');
  };

  const activeTemplate = templates.find(t => t.id === activeId) || null;

  const updateTemplate = (id: string, patch: Partial<StageTemplate>) => {
    persistTemplates(templates.map(t => t.id === id ? { ...t, ...patch } : t));
  };

  const addTemplate = () => {
    const id = 'tpl' + Date.now().toString(36);
    const tpl: StageTemplate = {
      id,
      name: 'Новый шаблон',
      stages: DEFAULT_STAGES.map(s => ({ ...s, id: `${id}_${s.id}` })),
      rules: emptyRules(),
    };
    persistTemplates([...templates, tpl]);
    setActiveId(id);
  };

  const removeTemplate = (id: string) => {
    if (!confirm('Удалить шаблон? Позиции, использующие его, вернутся на стандартные этапы.')) return;
    persistTemplates(templates.filter(t => t.id !== id));
    setActiveId('default');
  };

  if (loading) return <SectionShell title="Менеджмент" desc="Загрузка…"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></SectionShell>;

  return (
    <SectionShell title="Менеджмент" desc="Этапы закупки. Стандартный набор действует для всех позиций; шаблоны применяются автоматически по правилам (класс, тип оборудования, обозначение) или назначаются тегам вручную в разделе «Менеджмент».">
      {!isAdmin && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-300">
          Изменять этапы и шаблоны может администратор. Вы видите текущую настройку.
        </div>
      )}

      {/* Переключатель: стандартный набор + шаблоны */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setActiveId('default')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all ${activeId === 'default' ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-400'}`}
        >
          Стандартные этапы
        </button>
        {templates.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all ${activeId === t.id ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-400'}`}
          >
            {t.name}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={addTemplate}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Новый шаблон
          </button>
        )}
      </div>

      {activeId === 'default' ? (
        <>
          <StageListEditor stages={stages} onChange={persistStages} isAdmin={isAdmin} addToast={addToast} />
          {isAdmin && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => { if (confirm('Вернуть стандартные 4 этапа?')) persistStages(DEFAULT_STAGES); }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" /> Стандартные этапы
              </button>
              {saving
                ? <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Сохранение…</span>
                : <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Сохраняется автоматически</span>}
            </div>
          )}
        </>
      ) : activeTemplate ? (
        <div className="space-y-5">
          {/* Имя шаблона и удаление */}
          <div className="flex items-center gap-2">
            <input
              disabled={!isAdmin}
              defaultValue={activeTemplate.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== activeTemplate.name) updateTemplate(activeTemplate.id, { name: v }); }}
              className="flex-1 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              placeholder="Название шаблона"
            />
            {isAdmin && (
              <button
                onClick={() => removeTemplate(activeTemplate.id)}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                title="Удалить шаблон"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Правила применения */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Когда применяется (автоматически)</div>
            <div className="grid md:grid-cols-2 gap-3">
              <RuleListInput
                label="Отделы / классы тегов"
                hint="ОВ, ВК, ЭОМ (через запятую)"
                values={activeTemplate.rules.departments}
                onChange={(v) => updateTemplate(activeTemplate.id, { rules: { ...activeTemplate.rules, departments: v } })}
                disabled={!isAdmin}
              />
              <RuleListInput
                label="Типы оборудования"
                hint="КЛАПАН, ФИЛЬТР, ВЕНТИЛЯТОР"
                values={activeTemplate.rules.equipTypes}
                onChange={(v) => updateTemplate(activeTemplate.id, { rules: { ...activeTemplate.rules, equipTypes: v } })}
                disabled={!isAdmin}
              />
              <RuleListInput
                label="Категории установок"
                hint="AHU, FAN, VALVE"
                values={activeTemplate.rules.categories}
                onChange={(v) => updateTemplate(activeTemplate.id, { rules: { ...activeTemplate.rules, categories: v } })}
                disabled={!isAdmin}
              />
              <RuleListInput
                label="Обозначение содержит"
                hint="P-, -EX, AHU (подстроки)"
                values={activeTemplate.rules.identifierIncludes}
                onChange={(v) => updateTemplate(activeTemplate.id, { rules: { ...activeTemplate.rules, identifierIncludes: v } })}
                disabled={!isAdmin}
              />
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Шаблон применится к тегу, если совпало хотя бы одно правило. Приоритет: назначение вручную →
              обозначение → тип оборудования → категория установки → отдел. Назначить шаблон конкретным
              тегам вручную можно в разделе «Менеджмент» (выделите позиции → «Шаблон этапов»).
            </p>
          </div>

          {/* Этапы шаблона */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Этапы шаблона</div>
            <StageListEditor
              stages={activeTemplate.stages}
              onChange={(next) => updateTemplate(activeTemplate.id, { stages: next })}
              isAdmin={isAdmin}
              addToast={addToast}
            />
          </div>

          {saving
            ? <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Сохранение…</span>
            : <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Сохраняется автоматически</span>}
        </div>
      ) : null}
    </SectionShell>
  );
}

// ── Резервные копии ────────────────────────────────────────────────────────────
// Ежедневный «Архив»: копия базы + все файлы Проводника в родных форматах по
// папкам + данные проектов в Excel. Если всё полетит — папка с датой читается
// без программы. Плюс страховочные копии базы при каждом запуске.
function BackupSection({ isAdmin, addToast }: any) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [runningNow, setRunningNow] = useState(false);

  const load = async () => {
    try {
      const r = await fetch('/api/backup/status');
      const d = await r.json();
      if (r.ok) setStatus(d);
    } catch (_) {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunningNow(true);
    try {
      const r = await fetch('/api/backup/run', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Сервер ответил ${r.status}`);
      addToast(`Архив создан: файлов Проводника — ${d.explorerFiles}, книг данных — ${d.dataWorkbooks}`, 'success');
      load();
    } catch (e: any) {
      addToast(`Не удалось создать архив: ${e.message}`, 'error');
    } finally {
      setRunningNow(false);
    }
  };

  const saveSettings = async (patch: any) => {
    try {
      const r = await fetch('/api/backup/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'ошибка');
      setStatus((prev: any) => prev ? { ...prev, settings: d.settings } : prev);
      addToast('Настройки резервных копий сохранены', 'success');
      load();
    } catch (e: any) {
      addToast(`Не удалось сохранить: ${e.message}`, 'error');
    }
  };

  const fmtSize = (bytes: number) => {
    if (!bytes) return '—';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`;
  };

  if (loading) return <SectionShell title="Резервные копии" desc="Загрузка…"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></SectionShell>;

  const settings = status?.settings || { enabled: true, dir: '', keep: 14 };
  const backups = status?.backups || [];

  return (
    <SectionShell title="Резервные копии" desc="Программа каждый день сохраняет полный архив: копию базы, все файлы Проводника в исходных форматах по папкам и данные каждого проекта в Excel. Архив читается обычным Проводником Windows — даже без программы.">
      <div className="space-y-5">
        {/* Статус и ручной запуск */}
        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Папка архивов</div>
              <div className="text-xs font-mono mt-1 text-slate-600 dark:text-slate-300 select-all break-all">{status?.dir || '—'}</div>
            </div>
            {isAdmin && (
              <button
                onClick={runNow}
                disabled={runningNow || status?.running}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                {runningNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                {runningNow ? 'Создание архива…' : 'Создать архив сейчас'}
              </button>
            )}
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            Внутри каждого архива: <span className="font-mono">database.sqlite</span> (вся база),
            папка <span className="font-mono">Проводник</span> (файлы как есть, по проектам и папкам),
            папка <span className="font-mono">Данные</span> (Excel-книги: теги, закупки, оборудование).
            Дополнительно при каждом запуске программы делается быстрая страховочная копия базы (хранятся 5 последних).
          </div>
        </div>

        {/* Настройки */}
        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Расписание</div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={!!settings.enabled}
              onChange={(e) => saveSettings({ enabled: e.target.checked })}
              className="w-4 h-4 accent-emerald-500 cursor-pointer"
            />
            Делать архив автоматически каждый день
          </label>
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span>Хранить архивов:</span>
            <input
              type="number" min={1} max={90}
              disabled={!isAdmin}
              defaultValue={settings.keep}
              onBlur={(e) => { const v = Number(e.target.value); if (v && v !== settings.keep) saveSettings({ keep: v }); }}
              className="w-20 px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-center"
            />
            <span className="text-slate-400">(старые удаляются сами)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="shrink-0">Своя папка:</span>
            <input
              type="text"
              disabled={!isAdmin}
              defaultValue={settings.dir || ''}
              placeholder="пусто = стандартная в папке данных программы"
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (settings.dir || '')) saveSettings({ dir: v }); }}
              className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono"
            />
          </div>
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            Совет: укажите папку на другом диске или сетевом хранилище — тогда архив переживёт даже поломку диска с программой.
          </p>
        </div>

        {/* Список архивов */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" /> Существующие архивы ({backups.length})
          </div>
          {backups.length === 0 ? (
            <p className="text-xs text-slate-400">Архивов ещё нет — первый создастся автоматически в течение часа, или нажмите «Создать архив сейчас».</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {backups.map((b: any) => (
                <div key={b.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-850 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Archive className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-mono font-bold truncate">{b.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 shrink-0">
                    {b.manifest && <span title={`Файлов Проводника: ${b.manifest.explorerFiles}, книг данных: ${b.manifest.dataWorkbooks}`}>{b.manifest.explorerFiles} файлов</span>}
                    <span>{fmtSize(b.size)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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

// Переиспользуемый выбор способа связи «Кликом / Перетаскиванием»
function LinkModeChooser({ value, onChange, clickDesc, dragDesc }: {
  value: 'click' | 'drag'; onChange: (m: 'click' | 'drag') => void; clickDesc: string; dragDesc: string;
}) {
  const opt = (mode: 'click' | 'drag', icon: React.ReactNode, title: string, desc: string) => (
    <button
      onClick={() => onChange(mode)}
      className={`flex-1 p-4 rounded-xl border text-left cursor-pointer transition-colors ${
        value === mode
          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-500/30'
          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${value === mode ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-500'}`}>{icon}</span>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</span>
        {value === mode && <Check className="w-4 h-4 text-emerald-600 ml-auto" />}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
    </button>
  );
  return (
    <div className="flex gap-3 max-w-xl flex-col sm:flex-row">
      {opt('click', <MousePointerClick className="w-4 h-4" />, 'Кликом', clickDesc)}
      {opt('drag', <Link2 className="w-4 h-4" />, 'Перетаскиванием', dragDesc)}
    </div>
  );
}

// ── Раздел «Теги»: подразделы «Холст» и «Дерево» ────────────────────────────
function TagsSection({ addToast }: any) {
  const [canvasMode, setCanvasMode] = useState<'click' | 'drag'>('click');
  const [treeMode, setTreeMode] = useState<'click' | 'drag'>('click');

  useEffect(() => {
    fetch('/api/settings/registry_link_mode').then(r => r.json()).then(d => {
      if (d.global === 'drag' || d.global === 'click') setCanvasMode(d.global);
    }).catch(() => {});
    fetch('/api/settings/tree_link_mode').then(r => r.json()).then(d => {
      if (d.global === 'drag' || d.global === 'click') setTreeMode(d.global);
    }).catch(() => {});
  }, []);

  const save = async (key: 'registry_link_mode' | 'tree_link_mode', m: 'click' | 'drag') => {
    if (key === 'registry_link_mode') setCanvasMode(m); else setTreeMode(m);
    await fetch(`/api/settings/${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: null, value: m }),
    }).catch(() => {});
    try { window.dispatchEvent(new CustomEvent('flux:settings-changed', { detail: { key, value: m } })); } catch (_) {}
    addToast?.('Способ создания связей сохранён', 'success');
  };

  return (
    <SectionShell title="Теги" desc="Настройки раздела «Теги»: способ создания связей на холсте и в дереве.">
      <div className="space-y-5">
        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Холст · подключение связей</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Как соединять теги на интерактивном графе (вкладка «Интерактивный граф»).</p>
          <LinkModeChooser
            value={canvasMode}
            onChange={(m) => save('registry_link_mode', m)}
            clickDesc="Кнопка «связать» на карточке → клик по целевому тегу. Минимум точности, удобно мышью."
            dragDesc="Точки-порты по краям карточки: тянешь линию от одного тега к другому."
          />
        </div>

        <div className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Дерево · подключение связей</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Как соединять теги во вкладке «Дерево связей».</p>
          <LinkModeChooser
            value={treeMode}
            onChange={(m) => save('tree_link_mode', m)}
            clickDesc="Кнопка «связать» у строки → клик по строке-получателю. Она станет дочерней."
            dragDesc="Перетаскиваешь строку тега на другую — перетащенный становится дочерним."
          />
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
              placeholder="mysql://user:password@host:3306/flux или postgresql://user:password@host:5432/flux"
              className="w-full font-mono text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">MariaDB/MySQL — адрес mysql://…, PostgreSQL — postgresql://…</p>
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

// ── Документооборот: глобальные стандарты ВДР ──
// Хранятся в программе один раз, применяются к реестрам любых проектов
// (выбор — в реквизитах реестра). Здесь правятся коды рассмотрения со сроками,
// причины выпуска, спец-ревизии и каталог типов документов.
function DocflowSection({ isAdmin, addToast }: any) {
  const [standards, setStandards] = React.useState<any[]>([]);
  const [selId, setSelId] = React.useState('');
  const [cfg, setCfg] = React.useState<any>(null);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = async () => {
    try {
      const r = await fetch('/api/vdr/standards');
      if (!r.ok) return;
      const list = (await r.json()).standards || [];
      setStandards(list);
      const sel = list.find((s: any) => s.id === selId) || list[0];
      if (sel) { setSelId(sel.id); setCfg(JSON.parse(JSON.stringify(sel.config || {}))); setName(sel.name); }
    } catch (_) {}
  };
  React.useEffect(() => { load(); }, []);

  const pick = (id: string) => {
    const s = standards.find((x: any) => x.id === id);
    if (s) { setSelId(id); setCfg(JSON.parse(JSON.stringify(s.config || {}))); setName(s.name); }
  };

  const save = async () => {
    if (!selId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/vdr/standards/${selId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config: cfg }),
      });
      if (r.ok) { addToast('Стандарт сохранён', 'success'); load(); }
      else addToast('Ошибка сохранения', 'error');
    } finally { setBusy(false); }
  };

  const createStd = async () => {
    const n = window.prompt('Название нового стандарта (например, имя заказчика):', 'Новый стандарт');
    if (!n) return;
    const r = await fetch('/api/vdr/standards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, config: cfg || undefined }),
    });
    if (r.ok) { const d = await r.json(); await load(); pick(d.standard.id); addToast('Стандарт создан (копия текущего)', 'success'); }
  };

  const removeStd = async () => {
    if (!selId || !window.confirm(`Удалить стандарт «${name}»? Реестры перейдут на стандарт по умолчанию.`)) return;
    const r = await fetch(`/api/vdr/standards/${selId}`, { method: 'DELETE' });
    if (r.ok) { setSelId(''); load(); } else addToast('Удалять может администратор', 'error');
  };

  const upd = (path: string, idx: number, key: string, val: any) => {
    setCfg((c: any) => {
      const next = { ...c, [path]: [...(c[path] || [])] };
      next[path][idx] = { ...next[path][idx], [key]: val };
      return next;
    });
  };
  const addRow = (path: string, row: any) => setCfg((c: any) => ({ ...c, [path]: [...(c[path] || []), row] }));
  const delRow = (path: string, idx: number) => setCfg((c: any) => ({ ...c, [path]: (c[path] || []).filter((_: any, i: number) => i !== idx) }));

  const inp = 'px-2 py-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500';

  if (!cfg) return <SectionShell title="Документооборот" desc="Стандарты ВДР."><div className="text-sm text-slate-400">Загрузка…</div></SectionShell>;

  return (
    <SectionShell title="Документооборот" desc="Глобальные стандарты ВДР: применяются к реестрам любых проектов (выбор — в реквизитах реестра).">
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2">
          <select value={selId} onChange={e => pick(e.target.value)} className={inp + ' cursor-pointer font-semibold'}>
            {standards.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={name} onChange={e => setName(e.target.value)} className={inp + ' flex-1'} placeholder="Название стандарта" />
          <button onClick={createStd} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer">+ Новый</button>
          {isAdmin && <button onClick={removeStd} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>

        {/* Коды рассмотрения */}
        <div>
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Коды рассмотрения заказчика (действие и срок новой ревизии)</div>
          <div className="space-y-1">
            {(cfg.reviewCodes || []).map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={c.code} onChange={e => upd('reviewCodes', i, 'code', e.target.value)} className={inp + ' w-12 text-center font-bold'} />
                <input value={c.label} onChange={e => upd('reviewCodes', i, 'label', e.target.value)} className={inp + ' flex-1'} />
                <select value={c.action} onChange={e => upd('reviewCodes', i, 'action', e.target.value)} className={inp + ' cursor-pointer'}>
                  <option value="accept">принят</option>
                  <option value="revise">замечания</option>
                </select>
                <input type="number" value={c.deadlineDays ?? ''} onChange={e => upd('reviewCodes', i, 'deadlineDays', Number(e.target.value) || 0)} className={inp + ' w-16 text-center'} title="Срок новой ревизии, дней" />
                <span className="text-[10px] text-slate-400">дн.</span>
                <button onClick={() => delRow('reviewCodes', i)} className="p-1 text-slate-300 hover:text-rose-500 cursor-pointer"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => addRow('reviewCodes', { code: '', label: '', action: 'revise', deadlineDays: 7 })} className="mt-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer">+ код</button>
        </div>

        {/* Причины выпуска */}
        <div>
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Причины выпуска (буквенные/цифровые ревизии)</div>
          <div className="space-y-1">
            {(cfg.reasons || []).map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={r.code} onChange={e => upd('reasons', i, 'code', e.target.value)} className={inp + ' w-16 text-center font-bold'} />
                <input value={r.label} onChange={e => upd('reasons', i, 'label', e.target.value)} className={inp + ' flex-1'} />
                <select value={r.revKind} onChange={e => upd('reasons', i, 'revKind', e.target.value)} className={inp + ' cursor-pointer'}>
                  <option value="letter">A, B, C…</option>
                  <option value="digit">0, 1, 2…</option>
                </select>
                <button onClick={() => delRow('reasons', i)} className="p-1 text-slate-300 hover:text-rose-500 cursor-pointer"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => addRow('reasons', { code: '', label: '', revKind: 'letter' })} className="mt-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer">+ причина</button>
        </div>

        {/* Маски и спец-ревизии */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Маска имени файла</div>
            <input value={cfg.fileNameMask || ''} onChange={e => setCfg((c: any) => ({ ...c, fileNameMask: e.target.value }))} className={inp + ' w-full'} placeholder="{docNo}_{rev}_{lang}" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Маска номера документа</div>
            <input value={cfg.docNumberMask || ''} onChange={e => setCfg((c: any) => ({ ...c, docNumberMask: e.target.value }))} className={inp + ' w-full'} placeholder="{contract}-{wbs}-{po}-{type}-{seq}" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Ревизия «аннулирован»</div>
            <input value={cfg.specialRevisions?.void || 'V'} onChange={e => setCfg((c: any) => ({ ...c, specialRevisions: { ...c.specialRevisions, void: e.target.value } }))} className={inp + ' w-16 text-center font-bold'} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Ревизия «заменён»</div>
            <input value={cfg.specialRevisions?.superseded || 'S'} onChange={e => setCfg((c: any) => ({ ...c, specialRevisions: { ...c.specialRevisions, superseded: e.target.value } }))} className={inp + ' w-16 text-center font-bold'} />
          </div>
        </div>

        {/* Каталог типов */}
        <div>
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Каталог типов документов (VDR-коды)</div>
          <div className="space-y-1 max-h-56 overflow-auto pr-1">
            {(cfg.vdrTypes || []).map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={t.code} onChange={e => upd('vdrTypes', i, 'code', e.target.value)} className={inp + ' w-16 text-center font-bold'} />
                <input value={t.titleEn} onChange={e => upd('vdrTypes', i, 'titleEn', e.target.value)} className={inp + ' flex-1'} placeholder="English title" />
                <input value={t.titleRu} onChange={e => upd('vdrTypes', i, 'titleRu', e.target.value)} className={inp + ' flex-1'} placeholder="Название" />
                <button onClick={() => delRow('vdrTypes', i)} className="p-1 text-slate-300 hover:text-rose-500 cursor-pointer"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => addRow('vdrTypes', { code: '', titleEn: '', titleRu: '' })} className="mt-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer">+ тип</button>
        </div>

        <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">
          {busy ? 'Сохраняю…' : 'Сохранить стандарт'}
        </button>
      </div>
    </SectionShell>
  );
}
