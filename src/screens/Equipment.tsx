import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { dataService } from '../services/dataService';
import { 
  FolderTree, 
  Database, 
  RefreshCw, 
  FileText,
  AlertTriangle,
  History,
  Check,
  Plus,
  Trash2,
  Sliders,
  Eye,
  EyeOff,
  Settings,
  ChevronRight,
  Info,
  Calendar,
  Layers,
  CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type CategoryType = 'AHU' | 'FAN' | 'VALVE' | 'CURTAIN';

const CATEGORIES: { value: CategoryType; label: string; icon: string }[] = [
  { value: 'AHU', label: 'Центральные кондиционеры', icon: '🏢' },
  { value: 'FAN', label: 'Радиальные вентиляторы', icon: '🌀' },
  { value: 'VALVE', label: 'Воздушные клапаны', icon: '🚪' },
  { value: 'CURTAIN', label: 'Воздушные завесы', icon: '🌬️' }
];

export default function Equipment() {
  const { activeProject, user } = useStore();
  const { addToast } = useToastStore();
  const location = useLocation();

  // Core data states
  const [systems, setSystems] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [isSystemsLoading, setIsSystemsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryType>('AHU');

  // Selected element states
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [focusedComponentId, setFocusedComponentId] = useState<string | null>(null);

  // Field visibility states (saved in localStorage)
  const [visibleFields, setVisibleFields] = useState<Record<CategoryType, Record<string, boolean>>>(() => {
    try {
      const saved = localStorage.getItem('vent_equipment_field_visibility');
      return saved ? JSON.parse(saved) : { AHU: {}, FAN: {}, VALVE: {}, CURTAIN: {} };
    } catch (e) {
      return { AHU: {}, FAN: {}, VALVE: {}, CURTAIN: {} };
    }
  });

  // Manual edits input values in Conflict Arbiter
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});

  // History / logs modal / panel state
  const [historyComponent, setHistoryComponent] = useState<any | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Delete systems confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Load essential database assets
  const loadTags = async () => {
    if (!activeProject) return;
    try {
      const data = await dataService.getTags(activeProject.id);
      setTags(data.tags || []);
    } catch (err) {
      console.error('Failed to load project tags:', err);
    }
  };

  const loadSystems = async () => {
    if (!activeProject) return;
    setIsSystemsLoading(true);
    try {
      const data = await dataService.getSystems(activeProject.id);
      const loaded = data.systems || [];
      setSystems(loaded);
    } catch (err) {
      console.error('Failed to load systems:', err);
    } finally {
      setIsSystemsLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
    loadSystems();
  }, [activeProject]);

  // Sync default selectors when category change or systems load
  useEffect(() => {
    const systemsInCategory = systems.filter(s => s.category === activeCategory);
    if (systemsInCategory.length > 0) {
      const files = Array.from(new Set(systemsInCategory.map((s: any) => s.fileName || 'Ввод вручную'))) as string[];
      
      let nextFile = selectedFileName;
      if (!nextFile || !files.includes(nextFile)) {
        nextFile = files[0];
        setSelectedFileName(files[0]);
      }

      const fileSystems = systemsInCategory.filter((s: any) => (s.fileName || 'Ввод вручную') === nextFile);
      if (fileSystems.length > 0) {
        const isCurrentActive = fileSystems.some((s: any) => s.id === selectedSystemId);
        if (!selectedSystemId || !isCurrentActive) {
          setSelectedSystemId(fileSystems[0].id);
        }
      } else {
        setSelectedSystemId(null);
      }
    } else {
      setSelectedFileName(null);
      setSelectedSystemId(null);
    }
  }, [systems, activeCategory]);

  // Handle focusing from query parameters (for deep-linking from conflicts)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('focusConflict') === 'true' && systems.length > 0) {
      // Find any conflict component
      let foundComp: any = null;
      let foundSystem: any = null;

      for (const sys of systems) {
        for (const mb of sys.monoblocks || []) {
          const matching = mb.components?.find((c: any) => c.hasConflict);
          if (matching) {
            foundComp = matching;
            foundSystem = sys;
            break;
          }
        }
        if (foundComp) break;
      }

      if (foundComp && foundSystem) {
        setActiveCategory(foundSystem.category as CategoryType);
        setSelectedFileName(foundSystem.fileName || 'Ввод вручную');
        setSelectedSystemId(foundSystem.id);
        setFocusedComponentId(foundComp.id);
        addToast(`Сфокусирован элемент с конфликтом расчетов: ${foundComp.name}`, 'info');

        setTimeout(() => {
          const el = document.getElementById(`comp-card-${foundComp.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [location.search, systems]);

  // Persist Visibility Map to LocalStorage
  const saveVisibility = (newVisibility: typeof visibleFields) => {
    setVisibleFields(newVisibility);
    localStorage.setItem('vent_equipment_field_visibility', JSON.stringify(newVisibility));
  };

  // Extract all unique spec keys for the selected Category to build visibility list
  const uniqueSpecKeys = useMemo(() => {
    const keysSet = new Set<string>();
    systems
      .filter(s => s.category === activeCategory)
      .forEach(sys => {
        sys.monoblocks?.forEach((mb: any) => {
          mb.components?.forEach((c: any) => {
            try {
              if (c.specs) {
                const parsed = typeof c.specs === 'string' ? JSON.parse(c.specs) : c.specs;
                Object.keys(parsed).forEach(k => keysSet.add(k));
              }
            } catch (e) {}
          });
        });
      });
    return Array.from(keysSet).sort();
  }, [systems, activeCategory]);

  // Find conflicts quantity by category
  const conflictsCountByCategory = useMemo(() => {
    const results: Record<CategoryType, number> = { AHU: 0, FAN: 0, VALVE: 0, CURTAIN: 0 };
    systems.forEach(sys => {
      const cat = (sys.category || 'AHU') as CategoryType;
      sys.monoblocks?.forEach((mb: any) => {
        mb.components?.forEach((c: any) => {
          if (c.hasConflict) {
            results[cat] = (results[cat] || 0) + 1;
          }
        });
      });
    });
    return results;
  }, [systems]);

  // Active items calculations
  const activeSystem = useMemo(() => {
    return systems.find(s => s.id === selectedSystemId);
  }, [systems, selectedSystemId]);

  const activeComponent = useMemo(() => {
    if (!focusedComponentId || !activeSystem) return null;
    for (const mb of activeSystem.monoblocks || []) {
      const comp = mb.components?.find((c: any) => c.id === focusedComponentId);
      if (comp) return comp;
    }
    return null;
  }, [activeSystem, focusedComponentId]);

  // Delete installation system handling
  const handleDeleteSystem = async () => {
    if (!selectedSystemId) return;
    try {
      const data = await dataService.deleteSystem(selectedSystemId);
      if (data.success) {
        addToast('Система успешно удалена из реестра вентиляционного завода.', 'success');
        setShowDeleteConfirm(null);
        setFocusedComponentId(null);
        await loadSystems();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      addToast(err.message || 'Ошибка удаления установки', 'error');
    }
  };

  // Conflict Resolution Action creators
  const handleAcceptField = async (componentId: string, fieldName: string) => {
    try {
      const res = await fetch(`/api/components/${componentId}/accept-field`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      addToast(`Расчет из опросного листа по полю "${fieldName}" успешно принят!`, 'success');
      await loadSystems();
    } catch (e: any) {
      addToast(`Ошибка утверждения поля: ${e.message}`, 'error');
    }
  };

  const handleManualEditField = async (componentId: string, fieldName: string) => {
    const value = manualInputs[fieldName];
    if (value === undefined || value.trim() === '') {
      addToast(`Введите корректное значение для ручного изменения поля "${fieldName}"`, 'error');
      return;
    }

    try {
      const res = await fetch(`/api/components/${componentId}/manual-edit-field`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldName, newValue: value.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      addToast(`Поле "${fieldName}" успешно заменено на ручное значение: "${value}"`, 'success');
      setManualInputs(prev => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
      await loadSystems();
    } catch (e: any) {
      addToast(`Ошибка ручного изменения: ${e.message}`, 'error');
    }
  };

  const handleOpenHistory = async (comp: any) => {
    setHistoryComponent(comp);
    setIsHistoryLoading(true);
    try {
      const history = await dataService.getComponentHistory(comp.id);
      setHistoryLogs(history || []);
    } catch (err) {
      addToast("Ошибка загрузки журнала изменений спецификаций", "error");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // Toggle field visibility inside Constructor
  const toggleFieldVisibility = (fieldName: string) => {
    const nextScope = { ...visibleFields[activeCategory] };
    const currentStatus = nextScope[fieldName] !== false; // default true
    nextScope[fieldName] = !currentStatus;
    saveVisibility({
      ...visibleFields,
      [activeCategory]: nextScope
    });
  };

  const setAllFieldsVisibility = (visible: boolean) => {
    const nextScope: Record<string, boolean> = {};
    uniqueSpecKeys.forEach(k => {
      nextScope[k] = visible;
    });
    saveVisibility({
      ...visibleFields,
      [activeCategory]: nextScope
    });
  };

  if (!activeProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-950">
        <AlertTriangle className="w-12 h-12 text-slate-400 mb-4" />
        <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 font-mono">Проект не выбран</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Пожалуйста, выберите рабочий проект на Дашборде, чтобы получить доступ к спецификациям вентиляционных систем.
        </p>
      </div>
    );
  }

  // Categories counts and filtered items
  const installationsInCategory = Array.from(
    new Set(
      systems
        .filter(s => s.category === activeCategory)
        .map(s => s.fileName || 'Ввод вручную')
    )
  ) as string[];

  const filteredSystemsList = systems.filter(
    s => s.category === activeCategory && (s.fileName || 'Ввод вручную') === selectedFileName
  );

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-dark-bg p-6 space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-dark-border pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <Database className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            <span>Реестр вентиляционного оборудования</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-dark-text-muted mt-1">
            Двухрежимная система распределения по категориям, интерактивный конфигуратор ТТХ и построчный арбитр конфликтов расчетов.
          </p>
        </div>
      </div>

      {/* ZONE 1: TOP CATEGORIES NAVIGATION BAR */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.value;
          const confs = conflictsCountByCategory[cat.value];
          return (
            <button
              key={cat.value}
              onClick={() => {
                setActiveCategory(cat.value);
                setFocusedComponentId(null);
              }}
              className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all duration-250 hover:scale-[1.01] cursor-pointer ${
                isActive 
                  ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-md shadow-emerald-500/5' 
                  : 'bg-white dark:bg-dark-panel border-slate-200 dark:border-dark-border text-slate-700 dark:text-dark-text-main hover:bg-slate-100 dark:hover:bg-dark-surface'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-dark-text-muted">
                    {cat.value}
                  </h3>
                  <p className="text-xs font-extrabold truncate max-w-[150px]">
                    {cat.label}
                  </p>
                </div>
              </div>
              {confs > 0 && (
                <div className="relative flex h-5 w-5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 text-[10px] font-black text-white items-center justify-center">
                    {confs}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* CORE EXPERIENCE GRID: ZONE 2 & ZONE 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: ACTIVE CATEGORY STRUCTURE & VISIBILITY CONSTRUCTOR (4 Span) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* CATEGORY SYSTEMS TREE */}
          <div className="bg-white dark:bg-dark-panel border border-slate-200 dark:border-dark-border rounded-2xl p-4 shadow-sm space-y-4">
            <h3 className="font-extrabold text-xs text-slate-400 dark:text-dark-text-muted uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 dark:border-dark-border pb-2">
              <FolderTree className="w-4 h-4 text-emerald-500" />
              <span>Дерево по категории</span>
            </h3>

            {isSystemsLoading ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-emerald-500" />
                <span>Загрузка оборудования...</span>
              </div>
            ) : installationsInCategory.length === 0 ? (
              <div className="py-12 px-4 text-center text-slate-400 text-xs rounded-lg border border-dashed border-slate-200 dark:border-dark-border space-y-2">
                <Info className="w-8 h-8 mx-auto text-slate-300" />
                <p>Нет оборудования в этой категории.</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Зайдите в раздел "Проводник", нажмите правой кнопкой на технический XLSX или XML файл расчета и выберите <b>"Добавить в оборудование..."</b>, а затем выберите <b>"{CATEGORIES.find(c => c.value === activeCategory)?.label}"</b>.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Selector: Project Installation Source File */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-dark-text-muted uppercase tracking-widest mb-1">
                    Установка / Опросный лист
                  </label>
                  <select
                    value={selectedFileName || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedFileName(val);
                      const matched = systems.filter(s => s.category === activeCategory && (s.fileName || 'Ввод вручную') === val);
                      if (matched.length > 0) {
                        setSelectedSystemId(matched[0].id);
                      } else {
                        setSelectedSystemId(null);
                      }
                      setFocusedComponentId(null);
                    }}
                    className="w-full bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-dark-text-main font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    {installationsInCategory.map(fn => (
                      <option key={fn} value={fn}>{fn}</option>
                    ))}
                  </select>
                </div>

                {/* Flow Lines inside Installation */}
                {filteredSystemsList.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-dark-text-muted uppercase tracking-widest">
                        Магистральная линия / Линия
                      </label>
                      <button
                        onClick={() => {
                          if (selectedSystemId) {
                            setShowDeleteConfirm(selectedSystemId);
                          }
                        }}
                        className="text-red-500 hover:text-red-400 transition-colors py-0.5 px-1.5 rounded text-[10px] font-bold uppercase cursor-pointer"
                      >
                        Удалить
                      </button>
                    </div>

                    {showDeleteConfirm === selectedSystemId && (
                      <div className="bg-red-50/15 border border-red-500/30 rounded-lg p-2.5 text-xs text-left space-y-2">
                        <p className="text-red-400 font-extrabold text-[11px]">
                          Удалить линию {systems.find(s => s.id === selectedSystemId)?.name || ''} вместе со всеми моноблоками и характеристиками?
                        </p>
                        <div className="flex justify-end gap-2 text-[10px] tracking-wide uppercase font-bold">
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            className="bg-slate-200 dark:bg-dark-surface px-2 py-1 text-slate-700 dark:text-white rounded"
                          >
                            Отмена
                          </button>
                          <button
                            onClick={handleDeleteSystem}
                            className="bg-red-500 hover:bg-red-650 px-2 py-1 text-white rounded"
                          >
                            Да, удалить
                          </button>
                        </div>
                      </div>
                    )}

                    <select
                      value={selectedSystemId || ""}
                      onChange={(e) => {
                        setSelectedSystemId(e.target.value);
                        setFocusedComponentId(null);
                      }}
                      className="w-full bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-dark-text-main focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                    >
                      {filteredSystemsList.map(sys => {
                        const countConflicts = sys.monoblocks?.reduce((acc: number, mb: any) => 
                          acc + (mb.components?.filter((c: any) => c.hasConflict).length || 0), 0
                        );
                        return (
                          <option key={sys.id} value={sys.id}>
                            {sys.name} {countConflicts > 0 ? `⚠️ (${countConflicts} конфл.)` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Line Components Composition List */}
                {activeSystem && activeSystem.monoblocks && activeSystem.monoblocks.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 dark:border-dark-border">
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-dark-text-muted uppercase tracking-widest mb-2">
                      Технические блоки ({activeSystem.monoblocks.length} моноблоков)
                    </span>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {activeSystem.monoblocks.map((mb: any) => (
                        <div key={mb.id} className="bg-slate-50/50 dark:bg-dark-surface/30 border border-slate-150 dark:border-dark-border/40 rounded-lg p-2 flex flex-col gap-1.5">
                          <div className="font-black text-[11px] text-slate-600 dark:text-dark-text-main font-mono truncate">
                            📦 {mb.name}
                          </div>
                          
                          <div className="pl-2 border-l border-slate-200 dark:border-dark-border space-y-1">
                            {mb.components?.map((c: any) => {
                              const isSelected = focusedComponentId === c.id;
                              return (
                                <button
                                  key={c.id}
                                  id={`comp-card-${c.id}`}
                                  onClick={() => setFocusedComponentId(c.id)}
                                  className={`w-full text-left font-mono text-[11px] px-2 py-1 rounded transition-all flex items-center justify-between gap-1 cursor-pointer ${
                                    isSelected
                                      ? 'bg-emerald-600 text-white font-extrabold shadow-sm'
                                      : 'hover:bg-slate-100 dark:hover:bg-dark-surface text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  <span className="truncate">▫️ {c.name || c.itemCode}</span>
                                  {c.hasConflict && (
                                    <span className={`text-[10px] font-black px-1 rounded ${
                                      isSelected ? 'text-white' : 'text-amber-500'
                                    }`}>⚠️</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ZONE 3: TECHNICAL SPECIFICATIONS VISIBILITY CONSTRUCTOR */}
          <div className="bg-white dark:bg-dark-panel border border-slate-200 dark:border-dark-border rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="font-extrabold text-xs text-slate-400 dark:text-dark-text-muted uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 dark:border-dark-border pb-2">
              <Sliders className="w-4 h-4 text-emerald-500" />
              <span>Конструктор видимости ТТХ</span>
            </h3>
            
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Отмечайте чекбоксы, чтобы скрывать второстепенные характеристики из инженерного паспорта вент-оборудования данной категории.
            </p>

            {uniqueSpecKeys.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs italic">
                Нет полей для настройки в данной категории.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                  <button 
                    onClick={() => setAllFieldsVisibility(true)}
                    className="hover:text-emerald-500 transition-colors uppercase cursor-pointer"
                  >
                    Сделать все видимыми
                  </button>
                  <button 
                    onClick={() => setAllFieldsVisibility(false)}
                    className="hover:text-amber-500 transition-colors uppercase cursor-pointer"
                  >
                    Скрыть все поля
                  </button>
                </div>

                <div className="border border-slate-150 dark:border-dark-border rounded-xl max-h-[220px] overflow-y-auto divide-y divide-slate-100 dark:divide-dark-border pr-1">
                  {uniqueSpecKeys.map(keyName => {
                    const isVisible = visibleFields[activeCategory]?.[keyName] !== false;
                    return (
                      <div 
                        key={keyName} 
                        onClick={() => toggleFieldVisibility(keyName)}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-dark-surface cursor-pointer text-[11px] font-mono group"
                      >
                        <span className="text-slate-600 dark:text-dark-text-main truncate group-hover:text-emerald-500 transition-colors">
                          {keyName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isVisible ? (
                            <Eye className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-350" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: TECHNICAL PASSPORT & REVISION CONFLICT ARBITER (8 Span) */}
        <div className="lg:col-span-8 space-y-6">
          
          {focusedComponentId && activeComponent ? (
            <div className="space-y-6">
              
              {/* ZONE 2: ELEMENT TECHNICAL PASSPORT */}
              <div className="bg-white dark:bg-dark-panel border border-slate-200 dark:border-dark-border rounded-2xl p-5 shadow-sm space-y-4 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-dark-border pb-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0 mt-0.5">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-500 dark:text-dark-text-muted px-2 py-0.5 rounded">
                          Код позиции: {activeComponent.itemCode || 'Блок'}
                        </span>
                        <span className="text-xs text-slate-400">в моноблоке {activeSystem?.monoblocks?.find((m: any) => m.components?.some((c: any) => c.id === focusedComponentId))?.name || 'мн'}</span>
                      </div>
                      <h2 className="text-sm font-black text-slate-900 dark:text-white mt-1">
                        Технический паспорт: {activeComponent.name}
                      </h2>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleOpenHistory(activeComponent)}
                      className="text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 border border-slate-200 dark:border-dark-border rounded-lg px-2.5 py-1 text-xs font-semibold flex items-center gap-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-dark-surface"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Лог версий</span>
                    </button>
                    <button
                      onClick={() => setFocusedComponentId(null)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-dark-text-main hover:bg-slate-50 dark:hover:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-lg px-2.5 py-1 text-xs cursor-pointer"
                    >
                      Сбросить ×
                    </button>
                  </div>
                </div>

                {/* PASSPORT SPECS GRID */}
                {(() => {
                  let specsObj: Record<string, string> = {};
                  try {
                    if (activeComponent.specs) {
                      specsObj = typeof activeComponent.specs === 'string' ? JSON.parse(activeComponent.specs) : activeComponent.specs;
                    }
                  } catch(e) {}

                  // Filter spec keys based on Visibility Constructor map
                  const displayedSpecs = Object.entries(specsObj).filter(([field]) => {
                    const isVisible = visibleFields[activeCategory]?.[field] !== false;
                    return isVisible;
                  });

                  if (displayedSpecs.length === 0) {
                    return (
                      <div className="py-12 bg-slate-50/50 dark:bg-dark-surface/10 rounded-xl border border-dashed border-slate-200 dark:border-dark-border text-center text-slate-400 text-xs font-sans leading-relaxed">
                        Все инженерные характеристики скрыты в Конструкторе видимости ТТХ слева. <br/>
                        <button 
                          onClick={() => setAllFieldsVisibility(true)}
                          className="text-emerald-500 font-extrabold hover:underline mt-1 cursor-pointer"
                        >
                          Сделать все поля видимыми
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {displayedSpecs.map(([field, value]) => (
                        <div key={field} className="bg-slate-50/50 dark:bg-dark-surface/20 border border-slate-150 dark:border-dark-border/60 rounded-xl p-3 text-left">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-dark-text-muted uppercase tracking-wide block truncate" title={field}>
                            {field}
                          </span>
                          <span className="font-mono text-xs font-extrabold text-slate-800 dark:text-dark-text-main mt-1 block truncate" title={String(value)}>
                            {String(value) || '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* ASSOCIATED BIM/KKS TAGS */}
                <div className="border-t border-slate-100 dark:border-dark-border pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-dark-text-muted uppercase tracking-widest flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-emerald-500" />
                      <span>BIM / KKS Теговые ассоциации проекта</span>
                    </span>
                  </div>

                  {activeComponent.tags && activeComponent.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {activeComponent.tags.map((tg: any) => (
                        <div key={tg.id} className="text-xs font-bold font-mono bg-emerald-500/10 border border-emerald-550/20 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded flex items-center gap-2">
                          <span>{tg.identifier}</span>
                          <span className="text-[10px] text-emerald-400 font-normal">({tg.department || 'Проводка'})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">
                      Нет ассоциированных BIM/KKS тегов у данного вентиляционного блока.
                    </div>
                  )}
                </div>
              </div>

              {/* ZONE 3: SYSTEM CALCULATIONS REVISION CONFLICT ARBITER */}
              {activeComponent.hasConflict && activeComponent.conflictLog ? (
                <div className="bg-amber-500/5 border-2 border-amber-500/30 rounded-2xl p-5 space-y-4 text-left">
                  <div className="flex items-center gap-2.5 border-b border-amber-500/10 pb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />
                    <div>
                      <h3 className="text-sm font-black text-amber-700 dark:text-amber-500">
                        Построчный арбитр конфликтов расчетов: {activeComponent.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                        Повторный расчет выявил отклонения от опросного листа. Утвердите корректное значение построчно.
                      </p>
                    </div>
                  </div>

                  {/* Conflict rows list */}
                  {(() => {
                    let conflictLogObj: Record<string, { old: string; new: string }> = {};
                    try {
                      conflictLogObj = typeof activeComponent.conflictLog === 'string' 
                        ? JSON.parse(activeComponent.conflictLog) 
                        : activeComponent.conflictLog;
                    } catch(e) {}

                    const conflictFields = Object.keys(conflictLogObj);

                    return (
                      <div className="space-y-4">
                        {conflictFields.map(field => {
                          const oldVal = conflictLogObj[field].old;
                          const newVal = conflictLogObj[field].new;
                          const userVal = manualInputs[field] || '';

                          return (
                            <div key={field} className="bg-white dark:bg-dark-panel border border-slate-200 dark:border-dark-border rounded-xl p-4 space-y-3 shadow-inner">
                              <div className="flex justify-between items-center border-b border-slate-50 dark:border-dark-border/40 pb-1.5">
                                <span className="font-mono text-xs font-black text-slate-800 dark:text-dark-text-main flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                                  {field}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Left cell: Old Spec */}
                                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs">
                                  <span className="block text-[10px] font-bold text-rose-500 dark:text-rose-450 uppercase tracking-widest mb-1.5">
                                    Текущая база (Предыдущий расчет)
                                  </span>
                                  <span className="font-mono text-xs font-extrabold text-slate-800 dark:text-slate-200 block truncate" title={oldVal}>
                                    {oldVal || '—'}
                                  </span>
                                </div>

                                {/* Right cell: New Spec */}
                                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex flex-col justify-between">
                                  <div>
                                    <span className="block text-[10px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-widest mb-1.5">
                                      Новый импорт (Изменения)
                                    </span>
                                    <span className="font-mono text-xs font-extrabold text-slate-800 dark:text-slate-100 block truncate" title={newVal}>
                                      {newVal || '—'}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleAcceptField(activeComponent.id, field)}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 transition-colors text-white font-extrabold text-[10px] tracking-wider uppercase py-1.5 px-3 rounded-lg mt-3 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Утвердить расчет</span>
                                  </button>
                                </div>
                              </div>

                              {/* Manual edit fallback row */}
                              <div className="pt-2 border-t border-slate-100 dark:border-dark-border/60 flex items-center gap-2">
                                <div className="relative flex-1">
                                  <input
                                    type="text"
                                    placeholder="Ручной ввод характеристики..."
                                    value={userVal}
                                    onChange={(e) => setManualInputs({ ...manualInputs, [field]: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-lg pl-3 pr-3 py-1.5 text-xs focus:outline-none text-slate-850 dark:text-dark-text-main"
                                  />
                                </div>
                                <button
                                  onClick={() => handleManualEditField(activeComponent.id, field)}
                                  className="bg-slate-700 hover:bg-slate-650 text-white font-bold text-[10px] tracking-wider uppercase py-2 px-3.5 rounded-lg shrink-0 cursor-pointer transition-colors"
                                >
                                  Сохранить ввод
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="bg-white dark:bg-dark-panel border border-slate-200 dark:border-dark-border rounded-2xl p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
              <Eye className="w-12 h-12 text-slate-300" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-dark-text-main font-mono">Элемент вент-линии не выбран</h4>
              <p className="max-w-md leading-relaxed text-[11px] text-slate-500">
                Выберите конкретный технический блок ("бл...") в древовидной структуре системы слева, чтобы открыть его детальный паспорт для контроля характеристик и разрешения конфликтов расчетов.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* LOG HISTORY MODAL COMPONENT */}
      <AnimatePresence>
        {historyComponent && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-dark-panel border border-slate-300 dark:border-dark-border rounded-2xl max-w-2xl w-full shadow-2xl p-6 relative flex flex-col max-h-[85vh]"
            >
              <button
                onClick={() => setHistoryComponent(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-surface cursor-pointer"
              >
                ×
              </button>

              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-dark-border pb-3 text-left font-mono">
                <History className="w-5 h-5 text-emerald-500" />
                <span>Журнал версий и ревизий: {historyComponent.name || historyComponent.itemCode}</span>
              </h3>

              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                {isHistoryLoading ? (
                  <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-emerald-500" />
                    <span>Чтение истории изменений спецификации...</span>
                  </div>
                ) : historyLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs italic font-sans">
                    Истории ревизий для данной спецификации в системе не зарегистрировано.
                  </div>
                ) : (
                  <div className="relative border-l border-slate-200 dark:border-dark-border ml-3 space-y-6 text-left">
                    {historyLogs.map((log, index) => {
                      let parsedSpecs: Record<string, string> = {};
                      try {
                        if (log.newSpecs) {
                          parsedSpecs = typeof log.newSpecs === 'string' ? JSON.parse(log.newSpecs) : log.newSpecs;
                        }
                      } catch (e) {}

                      return (
                        <div key={log.id || index} className="relative pl-6">
                          {/* Dot marker */}
                          <span className="absolute -left-[6.5px] top-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-dark-panel"></span>
                          
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 font-mono">
                              <Calendar className="w-3.5 h-3.5" />
                              <span>Ревизия #{log.version}</span>
                              <span>•</span>
                              <span>{new Date(log.changedAt).toLocaleString('ru-RU')}</span>
                            </div>
                            
                            <div className="text-xs font-black text-slate-800 dark:text-dark-text-main mt-1">
                              Режим: {log.changeType === 'CREATE' ? '🚀 Первичная заливка' : '✏️ Интеллектуальное обновление/расчет'}
                            </div>

                            <div className="mt-2 bg-slate-50 dark:bg-dark-surface rounded-xl p-3 border border-slate-150 dark:border-dark-border/60 max-h-[140px] overflow-y-auto">
                              <span className="block text-[10px] font-bold text-slate-400 dark:text-dark-text-muted uppercase tracking-wider mb-1">
                                Сохранено полей ТТХ ({Object.keys(parsedSpecs).length})
                              </span>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
                                {Object.entries(parsedSpecs).map(([fk, fv]) => (
                                  <div key={fk} className="flex justify-between border-b border-slate-100/50 dark:border-dark-border/10 py-0.5 truncate">
                                    <span className="text-slate-400 truncate pr-1">{fk}:</span>
                                    <span className="text-slate-700 dark:text-dark-text-main font-bold truncate">{String(fv)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-dark-border text-left">
                <button
                  onClick={() => setHistoryComponent(null)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs tracking-wider uppercase px-4 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Закрыть журнал
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
