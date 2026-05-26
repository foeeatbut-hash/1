import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { dataService } from '../services/dataService';
import { 
  FolderTree, 
  Database, 
  RefreshCw, 
  X, 
  Link2, 
  Plus, 
  Search,
  FileText,
  Layers,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  History,
  Check,
  Activity,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DescriptionItem {
  id: string;
  text: string;
  comment: string;
  status: 'actual' | 'warning' | 'critical' | 'info' | 'draft';
  createdBy?: string;
  createdAt?: string;
}

interface ParsedMetadata {
  x: number;
  y: number;
  mainName?: string;
  parentId?: string;
  connections: string[];
  descriptions: DescriptionItem[];
}

const getObjectValueByKeyKeywords = (specsInput: any, keywords: string[]): string | null => {
  if (!specsInput) return null;
  let specs: Record<string, string> = {};
  try {
    specs = typeof specsInput === 'string' ? JSON.parse(specsInput) : specsInput;
  } catch (e) {
    return null;
  }
  if (!specs || typeof specs !== 'object') return null;
  const keys = Object.keys(specs);
  for (const kw of keywords) {
    const matchedKey = keys.find(k => k.toLowerCase().includes(kw.toLowerCase()));
    if (matchedKey) return specs[matchedKey];
  }
  return null;
};

export default function Equipment() {
  const { activeProject, user } = useStore();
  const { addToast } = useToastStore();
  const location = useLocation();

  const [tags, setTags] = useState<any[]>([]);
  const [systems, setSystems] = useState<any[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [isSystemsLoading, setIsSystemsLoading] = useState(false);
  const [bindingBlock, setBindingBlock] = useState<{ id: string, name: string, tags: any[] } | null>(null);
  const [tagSearchText, setTagSearchText] = useState('');
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState('');

  // Conflict focus & resolution states
  const [focusedComponentId, setFocusedComponentId] = useState<string | null>(null);
  const [historyComponent, setHistoryComponent] = useState<any | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const handleDeleteSystem = async () => {
    if (!selectedSystemId) return;
    try {
      const data = await dataService.deleteSystem(selectedSystemId);
      if (data.success) {
        addToast('Установка удалена успешно. Все моноблоки и элементы были удалены.', 'success');
        setShowDeleteConfirm(null);
        setFocusedComponentId(null);
        await loadSystems();
      } else {
        addToast(data.error || 'Не удалось удалить вентиляционную установку', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Ошибка соединения', 'error');
    }
  };

  const parseTagMetadata = (tag: any): ParsedMetadata => {
    if (!tag) {
      return {
        x: Math.floor(Math.random() * 550 + 80),
        y: Math.floor(Math.random() * 320 + 80),
        connections: [],
        descriptions: []
      };
    }
    try {
      if (tag.metadata) {
        const parsed = typeof tag.metadata === 'string' ? JSON.parse(tag.metadata) : tag.metadata;
        return {
          x: parsed.x !== undefined ? parsed.x : Math.floor(Math.random() * 500 + 100),
          y: parsed.y !== undefined ? parsed.y : Math.floor(Math.random() * 300 + 100),
          parentId: parsed.parentId,
          connections: Array.isArray(parsed.connections) ? parsed.connections : [],
          descriptions: Array.isArray(parsed.descriptions) ? parsed.descriptions : [],
          mainName: parsed.mainName || ''
        };
      }
    } catch (e) {
      console.error(e);
    }
    return {
      x: Math.floor(Math.random() * 500 + 100),
      y: Math.floor(Math.random() * 300 + 100),
      connections: [],
      descriptions: [],
      mainName: tag.name || ''
    };
  };

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
      
      if (loaded.length > 0) {
        const files = Array.from(new Set(loaded.map((s: any) => s.fileName || 'Базовые системы (Ввод вручную)'))) as string[];
        
        let newFile = selectedFileName;
        if (!newFile || !files.includes(newFile)) {
          newFile = files[0];
          setSelectedFileName(files[0]);
        }
        
        const fileSystems = loaded.filter((s: any) => (s.fileName || 'Базовые системы (Ввод вручную)') === newFile);
        if (fileSystems.length > 0) {
          const isCurrentInSystems = fileSystems.some((s: any) => s.id === selectedSystemId);
          if (!selectedSystemId || !isCurrentInSystems) {
            setSelectedSystemId(fileSystems[0].id);
          }
        } else {
          setSelectedSystemId(null);
        }
      } else {
        setSelectedFileName(null);
        setSelectedSystemId(null);
      }
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

  // Hook to handle "focusConflict=true" query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('focusConflict') === 'true' && systems.length > 0) {
      // Find components with conflicts
      const conflictingComps = systems
        .flatMap(sys => sys.monoblocks || [])
        .flatMap((mono: any) => mono.components || [])
        .filter((c: any) => c.hasConflict);

      const firstConflictingComp = conflictingComps[0];

      if (firstConflictingComp) {
        setFocusedComponentId(firstConflictingComp.id);
        
        // Find corresponding system ID
        const matchedSystem = systems.find(s => 
          s.monoblocks?.some((mb: any) => 
            mb.components?.some((c: any) => c.id === firstConflictingComp.id)
          )
        );
        
        if (matchedSystem) {
          const matchFile = matchedSystem.fileName || 'Базовые системы (Ввод вручную)';
          setSelectedFileName(matchFile);
          setSelectedSystemId(matchedSystem.id);
          addToast(`Сфокусирован конфликтный элемент: ${firstConflictingComp.name}`, 'info');

          // Scroll to component row
          setTimeout(() => {
            const elementId = `comp-row-${firstConflictingComp.id}`;
            const el = document.getElementById(elementId);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 350);
        }
      } else {
         addToast("В настоящий момент активных конфликтов оборудования в проекте не найдено.", "success");
      }
    }
  }, [location.search, systems]);

  // Hook to handle localStorage focused conflict coordinates from toast clicks
  useEffect(() => {
    const conflictId = localStorage.getItem('focusedConflictId');
    const systemId = localStorage.getItem('focusedConflictSystemId');

    if (conflictId && systemId && systems.length > 0) {
      // Find corresponding system ID
      const matchedSystem = systems.find(s => s.id === systemId);
      if (matchedSystem) {
        const matchFile = matchedSystem.fileName || 'Базовые системы (Ввод вручную)';
        setSelectedFileName(matchFile);
        setSelectedSystemId(matchedSystem.id);
        setFocusedComponentId(conflictId);
        
        addToast(`Фокусировка на конфликте оборудования...`, 'info');

        // Scroll to component row
        setTimeout(() => {
          const elementId = `comp-row-${conflictId}`;
          const el = document.getElementById(elementId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Flash row glow
            el.classList.add('animate-pulse');
            setTimeout(() => {
              el.classList.remove('animate-pulse');
            }, 3000);
          }
        }, 500);

        // Clear coordinates to prevent looping on route changes
        localStorage.removeItem('focusedConflictId');
        localStorage.removeItem('focusedConflictSystemId');
      }
    }
  }, [systems, addToast]);

  // Hook to handle "?elementId=..." link focusing from Messenger
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const elementId = params.get('elementId');
    if (elementId && systems.length > 0) {
      // Find system containing this component element id
      let matchedSystem: any = null;
      let matchedComponent: any = null;

      for (const sys of systems) {
        if (sys.monoblocks) {
          for (const mb of sys.monoblocks) {
            if (mb.components) {
              const comp = mb.components.find((c: any) => c.id === elementId);
              if (comp) {
                matchedSystem = sys;
                matchedComponent = comp;
                break;
              }
            }
          }
        }
        if (matchedSystem) break;
      }

      if (matchedSystem && matchedComponent) {
        const matchFile = matchedSystem.fileName || 'Базовые системы (Ввод вручную)';
        setSelectedFileName(matchFile);
        setSelectedSystemId(matchedSystem.id);
        setFocusedComponentId(elementId);
        addToast(`Фокусировка на элементе: ${matchedComponent.name}`, 'info');

        // Scroll to component row smoothly
        setTimeout(() => {
          const rowId = `comp-row-${elementId}`;
          const el = document.getElementById(rowId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight row temporarily
            el.classList.add('bg-emerald-50', 'dark:bg-emerald-950/30', 'transition-all');
            setTimeout(() => {
              el.classList.remove('bg-emerald-50', 'dark:bg-emerald-950/30');
            }, 3000);
          }
        }, 550);
      }
    }
  }, [location.search, systems]);

  const handlePinTagToComponent = async (componentId: string, tagId: string) => {
    try {
      await dataService.linkTagToComponent(componentId, tagId);
      addToast("Тег успешно привязан к блоку", "success");
      await loadSystems();
      if (bindingBlock) {
        const selectedComponent = tags.find(t => t.id === tagId);
        setBindingBlock(prev => {
          if (!prev) return null;
          const updatedTags = [...prev.tags];
          if (!updatedTags.some(t => t.id === tagId) && selectedComponent) {
            updatedTags.push(selectedComponent);
          }
          return { ...prev, tags: updatedTags };
        });
      }
    } catch (e) {
      console.error(e);
      addToast("Ошибка привязки тега", "error");
    }
  };

  const handleUnpinTagFromComponent = async (componentId: string, tagId: string) => {
    try {
      await dataService.unlinkTagFromComponent(componentId, tagId);
      addToast("Связь с тегом удалена", "success");
      await loadSystems();
      if (bindingBlock) {
        setBindingBlock(prev => {
          if (!prev) return null;
          return {
            ...prev,
            tags: prev.tags.filter(t => t.id !== tagId)
          };
        });
      }
    } catch (e) {
      console.error(e);
      addToast("Ошибка разрыва связи", "error");
    }
  };

  const handleCreateAndPinTag = async (componentId: string) => {
    const identifier = window.prompt("Введите код нового KKS/BIM тега (на латинице):");
    if (!identifier || !identifier.trim()) return;
    if (/[а-яА-ЯёЁ]/.test(identifier)) {
      addToast("Ошибка: Код тега должен быть на латинице!", "error");
      return;
    }
    
    let existing = tags.find(t => t.identifier.toLowerCase() === identifier.trim().toLowerCase());
    if (!existing) {
      try {
        const initialMeta: ParsedMetadata = {
          x: Math.floor(Math.random() * 400 + 100),
          y: Math.floor(Math.random() * 300 + 100),
          connections: [],
          descriptions: [{ id: 'auto', text: 'Создан при привязке к спецификации', comment: `Блок: ${bindingBlock?.name}`, status: 'info', createdBy: user?.name }]
        };
        const res = await dataService.createTag(activeProject.id, {
          identifier: identifier.trim(),
          department: 'Отдел вентиляции',
          fluid: 'Воздух',
          metadata: JSON.stringify(initialMeta)
        });
        existing = res;
        await loadTags();
      } catch (err) {
        console.error(err);
        addToast("Ошибка регистрации", "error");
        return;
      }
    }

    if (existing) {
      await handlePinTagToComponent(componentId, existing.id);
    }
  };

  // Resolve conflict manually
  const handleResolveConflict = async (componentId: string) => {
    try {
      await dataService.resolveConflict(componentId);
      addToast("Конфликт оборудования успешно разрешен!", "success");
      await loadSystems();
      if (focusedComponentId === componentId) {
        setFocusedComponentId(null);
      }
    } catch (err) {
      console.error(err);
      addToast("Ошибка разрешения конфликта", "error");
    }
  };

  // Fetch component change histories logs
  const handleOpenHistory = async (comp: any) => {
    setHistoryComponent(comp);
    setIsHistoryLoading(true);
    try {
      const history = await dataService.getComponentHistory(comp.id);
      setHistoryLogs(history || []);
    } catch (err) {
      console.error(err);
      addToast("Ошибка при чтении логов изменений", "error");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-950">
        <AlertCircle className="w-12 h-12 text-slate-400 mb-4" />
        <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">Проект не выбран</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Пожалуйста, выберите или создайте рабочий проект в Дашборде, чтобы получить доступ к разделу Спецификаций.
        </p>
      </div>
    );
  }

  // Filter systems based on search and selected file
  const uniqueFileNames = Array.from(new Set(systems.map(s => s.fileName || 'Базовые системы (Ввод вручную)'))) as string[];

  const systemsInSelectedFile = systems.filter(
    sys => (sys.fileName || 'Базовые системы (Ввод вручную)') === selectedFileName
  );

  const filteredSystems = systemsInSelectedFile.filter(sys => 
    sys.name.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
    sys.monoblocks?.some((mb: any) => 
      mb.name.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
      mb.components?.some((c: any) => c.name.toLowerCase().includes(equipmentSearchQuery.toLowerCase()))
    )
  );

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-900 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <Database className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            <span>Реестр оборудования</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Инженерное дерево систем, моноблоков и спецификаций оборудования с поддержкой версионирования, логирования изменений и сопоставления тегов.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-550 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Поиск по спецификациям..."
              value={equipmentSearchQuery}
              onChange={(e) => setEquipmentSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
        {/* LEFT PANEL: SYSTEMS TREE LIST */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-4 shadow-2xs">
          <h3 className="font-bold text-xs text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 dark:border-slate-905 pb-2">
            <FolderTree className="w-4 h-4 text-emerald-500" />
            <span>Дерево оборудования ({uniqueFileNames.length} уст.)</span>
          </h3>

          {isSystemsLoading ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
              <span>Загрузка дерева вентиляции...</span>
            </div>
          ) : uniqueFileNames.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 text-xs rounded-lg border border-dashed border-slate-200 dark:border-slate-850 space-y-2">
              <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300" />
              <p>Нет импортированных установок.</p>
              <p className="text-xs text-slate-500">Загрузите конфигурационный файл XLSX / XML в модуле общего "Проводника", чтобы наполнить эту спецификацию.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Dropdown 1: Select Active Installation (File) */}
              <div>
                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Установка (Проектный файл)</span>
                </label>
                <select
                  value={selectedFileName || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedFileName(val);
                    const fileSystems = systems.filter((s: any) => (s.fileName || 'Базовые системы (Ввод вручную)') === val);
                    if (fileSystems.length > 0) {
                      setSelectedSystemId(fileSystems[0].id);
                    } else {
                      setSelectedSystemId(null);
                    }
                    setFocusedComponentId(null);
                  }}
                  className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-850 dark:text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {uniqueFileNames.map((fn) => (
                    <option key={fn} value={fn}>
                      {fn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dropdown 2: Select Flow Direction / Line within this Installation file */}
              {filteredSystems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.55">
                      <Layers className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Поток системы (Раскрывающийся список)</span>
                    </label>
                    <button
                      onClick={() => {
                        if (selectedSystemId) {
                          setShowDeleteConfirm(selectedSystemId);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 transition-all font-semibold flex items-center gap-1 text-xs uppercase cursor-pointer"
                      title="Удалить эту установку"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить</span>
                    </button>
                  </div>
                  
                  {showDeleteConfirm === selectedSystemId && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-red-500/10 dark:bg-red-500/15 border border-red-500/30 rounded-lg p-2.5 space-y-2 text-xs"
                    >
                      <p className="font-semibold text-red-700 dark:text-red-450 leading-snug">
                        Вы действительно хотите удалить установку{' '}
                        <span className="font-mono font-black underline">
                          {systems.find(s => s.id === selectedSystemId)?.name || ''}
                        </span>{' '}
                        и все связанные с ней моноблоки и блоки? Это действие необратимо.
                      </p>
                      <div className="flex justify-end gap-2 text-xs font-bold uppercase pt-1">
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="px-2.5 py-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={handleDeleteSystem}
                          className="px-2.5 py-1 text-white bg-red-500 hover:bg-red-600 rounded cursor-pointer"
                        >
                          Да, удалить
                        </button>
                      </div>
                    </motion.div>
                  )}

                  <select
                    value={selectedSystemId || ""}
                    onChange={(e) => {
                      setSelectedSystemId(e.target.value);
                      setFocusedComponentId(null);
                    }}
                    className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-900 dark:text-slate-100 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    {filteredSystems.map((sys) => {
                      const hasConf = sys.monoblocks?.some((mb: any) => 
                        mb.components?.some((c: any) => c.hasConflict)
                      );
                      
                      let friendlyName = sys.name;
                      if (sys.name.toLowerCase() === 'у1') friendlyName = 'у1 — Подача / Приток';
                      else if (sys.name.toLowerCase() === 'у2') friendlyName = 'у2 — Обратка / Вытяжка';
                      else if (sys.name.toLowerCase() === 'п') friendlyName = 'п — Приточная вентиляция';
                      else if (sys.name.toLowerCase().includes('шум')) friendlyName = `${sys.name} — Уровни шума`;
                      else if (sys.name.toLowerCase().includes('вент')) friendlyName = `${sys.name} — Аэродинамика`;
                      else if (sys.name.toLowerCase().includes('диаг')) friendlyName = `${sys.name} — I-d Диаграмма`;
                      
                      return (
                        <option key={sys.id} value={sys.id}>
                          {friendlyName}{hasConf ? " ⚠️ (Конфликт)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Active System Component Composition Tree */}
              {(() => {
                const activeSystem = systems.find(s => s.id === selectedSystemId);
                if (!activeSystem || !activeSystem.monoblocks || activeSystem.monoblocks.length === 0) return null;
                return (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-900/60">
                    <span className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                      Состав линии ({activeSystem.monoblocks.length} моноблоков)
                    </span>
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {activeSystem.monoblocks.map((mb: any) => (
                        <div key={mb.id} className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-900 rounded-lg p-2.5 flex flex-col gap-1.5">
                          <div className="font-extrabold text-xs text-slate-700 dark:text-slate-300 font-mono truncate" title={mb.name}>
                            📦 {mb.name}
                          </div>
                          <div className="pl-1.5 border-l border-slate-200/60 dark:border-slate-800 space-y-1">
                            {mb.components?.map((c: any) => {
                              const isCompFocused = focusedComponentId === c.id;
                              return (
                                <button
                                  key={c.id}
                                  id={`comp-row-${c.id}`}
                                  onClick={() => {
                                    setFocusedComponentId(c.id);
                                    setTimeout(() => {
                                      const el = document.getElementById(`comp-row-${c.id}`);
                                      if (el) {
                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      }
                                    }, 100);
                                  }}
                                  className={`w-full text-left font-mono text-xs px-2 py-1 rounded-xs transition-all flex items-center justify-between truncate cursor-pointer ${
                                    isCompFocused
                                      ? 'bg-emerald-600 text-white font-extrabold shadow-inner'
                                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  <span className="truncate">▫️ {c.name || c.itemCode}</span>
                                  {c.hasConflict && (
                                    <span className={isCompFocused ? "text-white text-xs" : "text-amber-500 text-xs font-bold"} title="Различие версий">⚠️</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: SELECTED SYSTEM DETAILS */}
        <div className="lg:col-span-8 space-y-4">
          {selectedSystemId ? (
            (() => {
              const currentSystem = systems.find(s => s.id === selectedSystemId);
              if (!currentSystem) return null;
              return (
                <div className="space-y-6">
                  {/* Detailed Passport for focused element */}
                  {focusedComponentId && (() => {
                    // Find the currently selected component inside the loaded systems/monoblocks
                    let activeComp: any = null;
                    let activeMonoName = '';
                    for (const sys of systems) {
                      for (const mb of sys.monoblocks || []) {
                        const match = mb.components?.find((c: any) => c.id === focusedComponentId);
                        if (match) {
                          activeComp = match;
                          activeMonoName = mb.name;
                          break;
                        }
                      }
                    }
                    
                    if (!activeComp) return null;

                    let specsObj: Record<string, string> = {};
                    try {
                      if (activeComp.specs) {
                        specsObj = typeof activeComp.specs === 'string' ? JSON.parse(activeComp.specs) : activeComp.specs;
                      }
                    } catch(e) {}

                    // Parse key properties for direct display
                    const position = getObjectValueByKeyKeywords(specsObj, ["положение", "позиция", "расположение", "position", "размещение"]) || '—';
                    const nameVal = activeComp.name || '—';
                    const actuator = getObjectValueByKeyKeywords(specsObj, ["привод", "тип привода", "электропривод", "actuator"]) || '—';
                    const actuatorCount = getObjectValueByKeyKeywords(specsObj, ["число приводов", "количество приводов", "кол-во приводов", "кол-во", "actuators count"]) || '—';
                    
                    const l = getObjectValueByKeyKeywords(specsObj, ["длина", "l, мм", "длина, мм", "l", "длина сечения", "l (длина)"]);
                    const h = getObjectValueByKeyKeywords(specsObj, ["высота", "h, мм", "высота, мм", "h", "высота сечения", "h (высота)"]);
                    const w = getObjectValueByKeyKeywords(specsObj, ["ширина", "b, мм", "ширина, мм", "b", "ширина сечения", "b (ширина)"]);
                    const d = getObjectValueByKeyKeywords(specsObj, ["диаметр", "d, мм", "d"]);
                    const weight = getObjectValueByKeyKeywords(specsObj, ["масса", "вес", "m, кг", "масса, кг", "m"]) || '—';
                    const maintSideVal = getObjectValueByKeyKeywords(specsObj, ["сторона обслуживания", "обслуживание", "сторона обсл", "maintenance side"]) || '—';

                    let sizeStr = '—';
                    if (d) {
                      sizeStr = `Ø ${d}`;
                    } else if (l || w || h) {
                      sizeStr = `${l || '—'} x ${w || '—'} x ${h || '—'}`;
                    }

                    // Other remaining specs list
                    const primaryKeys = [
                      "положение", "позиция", "расположение", "position", "размещение",
                      "привод", "тип привода", "электропривод", "actuator",
                      "число приводов", "количество приводов", "кол-во приводов", "кол-во", "actuators count",
                      "длина", "l, мм", "длина, мм", "l", "длина сечения", "l (длина)",
                      "высота", "h, мм", "высота, мм", "h", "высота сечения", "h (высота)",
                      "ширина", "b, мм", "ширина, мм", "b", "ширина сечения", "b (ширина)",
                      "масса", "вес", "m, кг", "масса, кг", "m",
                      "сторона обслуживания", "обслуживание", "сторона обсл", "maintenance side"
                    ];
                    const otherSpecs = Object.entries(specsObj).filter(([k]) => {
                      return !primaryKeys.some(pk => k.toLowerCase().includes(pk));
                    });

                    return (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-slate-50/50 dark:bg-slate-900/30 border-2 border-emerald-500/30 rounded-2xl p-5 shadow-xs space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-black bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-300/30">
                                  {activeComp.itemCode || 'Блок'}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">в {activeMonoName}</span>
                              </div>
                              <h3 className="text-sm font-black text-slate-950 dark:text-white leading-none mt-1.5">
                                Технический паспорт: {nameVal}
                              </h3>
                            </div>
                          </div>
                          <button
                            onClick={() => setFocusedComponentId(null)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer w-fit"
                          >
                            Сбросить выбор элемент ×
                          </button>
                        </div>

                        {/* CORE SPECS TILES GRID */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          {/* Name / Position */}
                          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl p-3">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">Положение / Позиция</span>
                            <span className="font-mono text-xs font-extrabold text-slate-850 dark:text-slate-100 mt-1 block">
                              {position}
                            </span>
                          </div>

                          {/* Sizes */}
                          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl p-3">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">Размеры (ДхШхВ / Ø)</span>
                            <span className="font-mono text-xs font-extrabold text-slate-850 dark:text-slate-100 mt-1 block">
                              {sizeStr}
                            </span>
                          </div>

                          {/* Weight */}
                          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl p-3">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">Масса элемента</span>
                            <span className="font-mono text-xs font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">
                              {weight}
                            </span>
                          </div>

                          {/* Maintenance Side */}
                          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl p-3">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">Сторона обслуживания</span>
                            <span className="font-sans text-xs font-extrabold text-slate-800 dark:text-slate-100 mt-1 block truncate" title={maintSideVal}>
                              {maintSideVal}
                            </span>
                          </div>

                          {/* Actuator Type */}
                          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl p-3">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">Привод</span>
                            <span className="font-sans text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 block truncate" title={actuator}>
                              {actuator}
                            </span>
                          </div>

                          {/* Actuator Count */}
                          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl p-3">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">Число приводов</span>
                            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 block">
                              {actuatorCount}
                            </span>
                          </div>

                          {/* Block Code */}
                          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl p-3">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">Код позиции</span>
                            <span className="font-mono text-xs font-black text-slate-500 dark:text-slate-400 mt-1 block">
                              {activeComp.itemCode || '—'}
                            </span>
                          </div>

                          {/* KKS/BIM Tags list */}
                          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-xl p-3">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">BIM/KKS метки</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {activeComp.tags && activeComp.tags.length > 0 ? (
                                activeComp.tags.map((tg: any) => (
                                  <span key={tg.id} className="text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 px-1 py-0.2 rounded font-mono">
                                    {tg.identifier}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400 italic">Связей нет</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ALL OTHER TECHNICAL SPECIFICATIONS EXPANSION */}
                        {otherSpecs.length > 0 && (
                          <div className="border-t border-slate-200/50 dark:border-slate-800/80 pt-3">
                            <span className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                              Дополнительные инженерные характеристики ({otherSpecs.length})
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 bg-slate-50/20 dark:bg-slate-900/10 rounded-xl p-3 border border-slate-150 dark:border-slate-850 max-h-[160px] overflow-y-auto scrollbar-thin">
                              {otherSpecs.map(([field, value]) => (
                                <div key={field} className="flex justify-between items-center text-xs border-b border-slate-100/50 dark:border-slate-800/10 py-1 font-mono">
                                  <span className="text-slate-400 text-left truncate pr-2" title={field}>{field}:</span>
                                  <span className="font-bold text-slate-750 dark:text-slate-250 text-right truncate max-w-[150px]" title={value}>{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })()}

                  <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-5 shadow-2xs space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-900 pb-3">
                    <div>
                      <span className="text-xs uppercase font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/45 border border-emerald-200/50 px-2.5 py-0.5 rounded-full">
                        Выбранная система вентиляции
                      </span>
                      <h2 className="text-xl font-extrabold text-slate-950 dark:text-white font-mono mt-1">
                        {currentSystem.name}
                      </h2>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">
                      Всего моноблоков в системе: {currentSystem.monoblocks?.length || 0}
                    </span>
                  </div>

                  {currentSystem.monoblocks?.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-xs">
                      Для этой вентиляционной системы не найдено моноблоков или элементов.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {currentSystem.monoblocks.map((mono: any) => (
                        <div key={mono.id} className="border border-slate-150 dark:border-slate-850 rounded-xl bg-slate-50/20 dark:bg-slate-900/10 overflow-hidden shadow-2xs">
                          {/* Monoblock Title bar */}
                          <div className="px-4 py-3 bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-150 dark:border-slate-855 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-emerald-500" />
                              <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200 font-mono">
                                Моноблок: {mono.name}
                              </span>
                            </div>
                            <span className="text-xs bg-emerald-500/10 dark:bg-emerald-500/25 border border-emerald-400/20 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full">
                              Блоков: {mono.components?.length || 0}
                            </span>
                          </div>

                          {/* Visual sequence diagram (Квадратики "Состав линии") */}
                          {mono.components && mono.components.length > 0 && (
                            <div className="px-4 py-4 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-850">
                              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Схема состава линии (Клик для выбора блока)</span>
                              </h4>
                              <div className="flex gap-3 items-stretch overflow-x-auto pb-2.5 max-w-full scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                                {mono.components.map((c: any, index: number) => {
                                  const isCompFocused = focusedComponentId === c.id;
                                  
                                  const blockName = c.itemCode || '—';
                                  const blockTitle = c.name || '—';
                                  
                                  const l = getObjectValueByKeyKeywords(c.specs, ["длина", "l, мм", "длина, мм", "l", "длина сечения", "l (длина)"]);
                                  const w = getObjectValueByKeyKeywords(c.specs, ["ширина", "b, мм", "ширина, мм", "b", "ширина сечения", "b (ширина)"]);
                                  const h = getObjectValueByKeyKeywords(c.specs, ["высота", "h, мм", "высота, мм", "h", "высота сечения", "h (высота)"]);
                                  const d = getObjectValueByKeyKeywords(c.specs, ["диаметр", "d, мм", "d"]);
                                  
                                  let dimensions = '';
                                  if (d) {
                                    dimensions = `Ø ${d}`;
                                  } else if (l || w || h) {
                                    dimensions = `${l || '—'}x${w || '—'}x${h || '—'}`;
                                  } else {
                                    dimensions = '—';
                                  }

                                  const maintSide = getObjectValueByKeyKeywords(c.specs, ["сторона обслуживания", "обслуживание", "сторона обсл", "maintenance side"]) || '—';

                                  return (
                                    <React.Fragment key={c.id}>
                                      {/* Block card square */}
                                      <button
                                        onClick={() => {
                                          setFocusedComponentId(c.id);
                                          setTimeout(() => {
                                            const el = document.getElementById(`comp-row-${c.id}`);
                                            if (el) {
                                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            }
                                          }, 100);
                                        }}
                                        className={`min-w-[160px] max-w-[200px] flex-1 border rounded-xl p-3 text-left transition-all duration-150 cursor-pointer relative flex flex-col justify-between ${
                                          isCompFocused
                                            ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500 ring-2 ring-emerald-500/20'
                                            : 'bg-slate-50/50 hover:bg-slate-100/70 dark:bg-slate-900/40 dark:hover:bg-slate-900 border-slate-200/60 dark:border-slate-800'
                                        }`}
                                      >
                                        <div>
                                          <div className="flex items-center justify-between mb-1.5">
                                            <span className="font-mono text-xs font-black bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-350 px-1.5 py-0.5 rounded leading-none border border-slate-300/30">
                                              {blockName}
                                            </span>
                                            {c.hasConflict && (
                                              <span className="text-amber-500 text-xs" title="Конфликт">⚠️</span>
                                            )}
                                          </div>
                                          <div className="font-extrabold text-xs text-slate-800 dark:text-slate-205 line-clamp-2 leading-tight mb-2" title={blockTitle}>
                                            {blockTitle}
                                          </div>
                                        </div>

                                        <div className="border-t border-slate-200/50 dark:border-slate-800/80 pt-1.5 mt-auto space-y-1 text-xs">
                                          <div className="flex justify-between gap-1 text-slate-400 dark:text-slate-500">
                                            <span>Размеры:</span>
                                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300 truncate max-w-[100px]" title={dimensions}>
                                              {dimensions}
                                            </span>
                                          </div>
                                          <div className="flex justify-between gap-1 text-slate-400 dark:text-slate-500">
                                            <span>Обслуживание:</span>
                                            <span className="font-sans font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[85px]" title={maintSide}>
                                              {maintSide}
                                            </span>
                                          </div>
                                        </div>
                                      </button>

                                      {/* Direction arrow helper */}
                                      {index < mono.components.length - 1 && (
                                        <div className="flex items-center justify-center shrink-0 text-slate-300 dark:text-slate-800 px-0.5">
                                          <div className="h-0.5 w-3 bg-slate-200 dark:bg-slate-850 relative">
                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 border-y-4 border-y-transparent border-l-[6px] border-l-slate-300 dark:border-l-slate-800" />
                                          </div>
                                        </div>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Component Elements TABLE under Monoblock */}
                          <div className="p-0 overflow-x-auto">
                            {mono.components?.length === 0 ? (
                              <p className="text-xs text-slate-400 italic text-center py-6">Нет заведённых компонентов спецификации</p>
                            ) : (
                              <table className="w-full text-left border-collapse min-w-[700px] text-xs">
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20 text-xs font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider font-mono">
                                    <th className="py-2.5 px-4 w-[12%]">Позиция</th>
                                    <th className="py-2.5 px-3 w-[25%]">Компонент</th>
                                    <th className="py-2.5 px-3 w-[25%]">Спецификация</th>
                                    <th className="py-2.5 px-3 w-[15%]">Теги KKS/BIM</th>
                                    <th className="py-2.5 px-3 text-center w-[8%]">Версия</th>
                                    <th className="py-2.5 px-4 text-right">Действия</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-900/60">
                                  {mono.components.map((comp: any) => {
                                    const isFocused = focusedComponentId === comp.id;
                                    const hasConflict = comp.hasConflict;
                                    const conflictType = comp.conflictType;

                                    let specsObj: Record<string, string> = {};
                                    try {
                                      if (comp.specs) {
                                        specsObj = typeof comp.specs === 'string' ? JSON.parse(comp.specs) : comp.specs;
                                      }
                                    } catch(e) {}

                                    // Custom description for hover tooltip / warnings panel
                                    const conflictToolTip = conflictType === 'ORPHANED_TAG'
                                      ? "Элемент удален в новом расчете оборудования, но за ним закреплены BIM/KKS теги."
                                      : conflictType === 'TYPE_MISMATCH'
                                      ? "Обнаружено несовпадение типов оборудования при перерасчете для этого кода позиции."
                                      : "Обнаружен конфликт при обновлении спецификации исходного файла.";

                                    return (
                                      <tr 
                                        key={comp.id} 
                                        id={`comp-row-${comp.id}`} 
                                        className={`transition-all ${
                                          isFocused && hasConflict
                                            ? 'bg-red-100/90 dark:bg-red-950/45 border-l-4 border-red-500 animate-pulse text-slate-900 dark:text-red-100 ring-2 ring-red-500/50'
                                            : hasConflict 
                                            ? 'bg-red-50/70 hover:bg-red-50 dark:bg-red-950/15 dark:hover:bg-red-955/20 text-slate-900 dark:text-red-200' 
                                            : isFocused 
                                            ? 'bg-emerald-50/75 dark:bg-emerald-950/25 ring-2 ring-emerald-500/60 dark:ring-emerald-500/30' 
                                            : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/35 text-slate-700 dark:text-slate-200'
                                        }`}
                                      >
                                        {/* POSITION POSITION CODE */}
                                        <td className="py-3 px-4 font-mono font-bold select-all truncate">
                                          {comp.itemCode || '—'}
                                        </td>

                                        {/* NAME COMPONENT */}
                                        <td className="py-3 px-3 font-medium">
                                          <div className="flex flex-col gap-1 text-left">
                                            <span className="font-extrabold text-slate-900 dark:text-slate-50 font-sans">{comp.name}</span>
                                            {hasConflict && (
                                              <span 
                                                className="inline-flex items-center gap-1 text-xs font-bold text-red-700 dark:text-red-400 bg-red-100/50 dark:bg-red-950/40 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900/30 w-fit cursor-help"
                                                title={conflictToolTip}
                                              >
                                                <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                                <span>{conflictType === 'ORPHANED_TAG' ? 'Удален, но остался тег' : (conflictType === 'SPEC_CHANGE_WITH_TAG' ? 'Изменение характеристик' : 'Несовпадение классов')}</span>
                                              </span>
                                            )}
                                            
                                            {comp.conflictLog && (
                                              <div className="mt-1 text-xs font-sans text-red-700 dark:text-red-300 bg-red-100/45 dark:bg-red-950/30 p-2 rounded border border-red-200/40 dark:border-red-900/30 max-w-[280px]">
                                                <div className="font-bold flex items-center gap-1 mb-0.5 text-xs">
                                                  <Activity className="w-3.5 h-3.5 text-red-500 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
                                                  <span>Лог изменений характеристик:</span>
                                                </div>
                                                <p className="leading-normal font-sans font-normal text-xs">{comp.conflictLog}</p>
                                                {comp.updatedAt && (
                                                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500 text-right font-medium">
                                                    Изменено: {new Date(comp.updatedAt).toLocaleString('ru-RU')}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </td>

                                        {/* SPECIFICATIONS LIST COMPACT */}
                                        <td className="py-3 px-3">
                                          {Object.keys(specsObj).length > 0 ? (
                                            <div className="text-xs font-mono leading-tight space-y-0.5 max-h-[85px] overflow-y-auto max-w-[200px] text-left">
                                              {Object.entries(specsObj).slice(0, 3).map(([k, v]) => (
                                                <div key={k} className="truncate" title={`${k}: ${v}`}>
                                                  <span className="text-slate-400 font-medium">{k}:</span> <span className="text-slate-700 dark:text-slate-300 font-extrabold">{v}</span>
                                                </div>
                                              ))}
                                              {Object.keys(specsObj).length > 3 && (
                                                <span className="text-xs text-slate-400 font-bold block mt-0.5">(ещё {Object.keys(specsObj).length - 3} парт.)</span>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="text-slate-400 italic text-xs">Нет характеристик</span>
                                          )}
                                        </td>

                                        {/* PROJECT BIM TAGS BADGES */}
                                        <td className="py-3 px-3 text-left">
                                          <div className="flex flex-wrap gap-1 min-h-[22px] items-center">
                                            {comp.tags && comp.tags.length > 0 ? (
                                              comp.tags.map((tg: any) => (
                                                <span key={tg.id} className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/35 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                                                  <span>{tg.identifier}</span>
                                                  <button
                                                    onClick={() => handleUnpinTagFromComponent(comp.id, tg.id)}
                                                    title="Отвязать тег"
                                                    className="text-emerald-700 dark:text-emerald-400 hover:text-red-500 transition-colors cursor-pointer border-none bg-transparent p-0"
                                                  >
                                                    <X className="w-2.5 h-2.5" />
                                                  </button>
                                                </span>
                                              ))
                                            ) : (
                                              <span className="text-xs text-slate-400 italic">Связей нет</span>
                                            )}
                                          </div>
                                        </td>

                                        {/* CURRENT ELEMENT VERSION */}
                                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-500">
                                          {comp.version || 1}
                                        </td>

                                        {/* ACTIONS INTERACTIVE BLOCK */}
                                        <td className="py-3 px-4 text-right">
                                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                                            {hasConflict && (
                                               <button
                                                 onClick={() => handleResolveConflict(comp.id)}
                                                 className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 hover:scale-105 transition-all text-white text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
                                                 title="Разрешить конфликт и снять индикатор ошибки"
                                               >
                                                 <Check className="w-3 h-3" />
                                                 <span>Решить</span>
                                               </button>
                                            )}

                                            <button
                                              onClick={() => setBindingBlock({ id: comp.id, name: comp.name, tags: comp.tags || [] })}
                                              className="p-1.5 bg-slate-50 hover:bg-emerald-50 dark:bg-slate-900/50 dark:hover:bg-emerald-950/20 text-slate-600 hover:text-emerald-650 dark:text-slate-300 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-800 rounded transition-colors cursor-pointer"
                                              title="Привязать KKS/BIM тег"
                                            >
                                              <Link2 className="w-3.5 h-3.5" />
                                            </button>

                                            <button
                                              onClick={() => handleOpenHistory(comp)}
                                              className="p-1.5 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-900/50 dark:hover:bg-indigo-950/20 text-slate-600 hover:text-indigo-650 dark:text-slate-300 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-800 rounded transition-colors cursor-pointer"
                                              title="История версий и изменений"
                                            >
                                              <History className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
          ) : (
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-12 shadow-2xs text-center text-slate-400 text-xs">
              Выберите вентиляционную систему слева для просмотра спецификации её элементов.
            </div>
          )}
        </div>
      </div>

      {/* MODAL FOR BINDING TAG TO COMPONENT BLOCKS */}
      <AnimatePresence>
        {bindingBlock && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-[999] p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[90vh] text-left space-y-4"
            >
              <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-900 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    Связь тега (BIM/KKS) с блоком
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                    Элемент спецификации: {bindingBlock.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setBindingBlock(null);
                    setTagSearchText('');
                  }}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all cursor-pointer border-none bg-transparent"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* SEARCH INPUT */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Поиск тега в проекте</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Введите код или наименование тегов..."
                    value={tagSearchText}
                    onChange={(e) => setTagSearchText(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none dark:text-slate-100"
                  />
                </div>
              </div>

              {/* ACTIVE BINDINGS */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase">Текущие привязанные теги:</span>
                <div className="flex flex-wrap gap-1.5 min-h-[30px] p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-850">
                  {bindingBlock.tags.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">Связанных тегов нет</span>
                  ) : (
                    bindingBlock.tags.map((t: any) => (
                      <span key={t.id} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md">
                        <span>{t.identifier}</span>
                        <button
                          onClick={() => handleUnpinTagFromComponent(bindingBlock.id, t.id)}
                          className="hover:text-rose-500 cursor-pointer border-none bg-transparent p-0"
                          title="Удалить привязку"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* SEARCH RESULTS & SELECTIONS */}
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[250px] min-h-[140px] border border-slate-100 dark:border-slate-850 rounded-lg p-2 bg-slate-50/20">
                {(() => {
                  const filtered = tags.filter(t => 
                    t.identifier.toLowerCase().includes(tagSearchText.toLowerCase()) ||
                    (parseTagMetadata(t).mainName || '').toLowerCase().includes(tagSearchText.toLowerCase())
                  );
                  if (filtered.length === 0) {
                    return (
                      <div className="py-8 text-center text-slate-400 text-xs italic">
                        Подходящих тегов не найдено
                      </div>
                    );
                  }
                  return filtered.map((t) => {
                    const isAlreadyBound = bindingBlock.tags.some((activeT: any) => activeT.id === t.id);
                    return (
                      <div key={t.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent hover:border-slate-150 dark:hover:border-slate-850 select-none transition-all">
                        <div className="text-left max-w-[70%]">
                          <p className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{t.identifier}</p>
                          <p className="text-xs text-slate-400 truncate">{parseTagMetadata(t).mainName || 'Без названия'}</p>
                        </div>
                        {isAlreadyBound ? (
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 px-2.5 py-1 rounded">
                            Активен
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePinTagToComponent(bindingBlock.id, t.id)}
                            className="px-2.5 py-1 bg-emerald-750 hover:bg-emerald-600 text-white rounded text-xs font-bold cursor-pointer border-none"
                          >
                            Привязать
                          </button>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* MODAL FOOTER ACTION CONTROLS */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-900 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30 -mx-6 -mb-6 p-4 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => handleCreateAndPinTag(bindingBlock.id)}
                  className="px-3 py-1.5 bg-slate-150 hover:bg-emerald-50 dark:bg-slate-900 dark:hover:bg-emerald-950/30 border border-slate-200 dark:border-slate-800 text-slate-755 dark:text-slate-300 hover:text-emerald-700 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-4 h-4 text-emerald-500" />
                  <span>Создать новый тег</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBindingBlock(null);
                    setTagSearchText('');
                  }}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold cursor-pointer border-none"
                >
                  Готово
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL FOR EQUIPMENT HISTORY AND SPEC COMPARISON */}
      <AnimatePresence>
        {historyComponent && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-[999] p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh] text-left space-y-4"
            >
              <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-900 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-500" />
                    <span>История спецификаций элемента</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono leading-relaxed">
                    Элемент: <span className="font-extrabold text-slate-800 dark:text-slate-100">{historyComponent.name}</span> <br/>
                    Код позиции: <span className="font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-xs">{historyComponent.itemCode || 'Отсутствует'}</span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setHistoryComponent(null);
                    setHistoryLogs([]);
                  }}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all cursor-pointer border-none bg-transparent"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {isHistoryLoading ? (
                  <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                    <span>Загрузка истории параметров...</span>
                  </div>
                ) : historyLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs italic border border-dashed border-slate-200 dark:border-slate-850 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-950/20">
                    История изменений этого элемента пуста. Текущая версия (версия {historyComponent.version || 1}) является первоначальной.
                  </div>
                ) : (
                  <div className="relative border-l border-slate-200 dark:border-slate-800 ml-3.5 py-2 space-y-6">
                    {historyLogs.map((log: any) => {
                      let oldSpecsObj: Record<string, string> = {};
                      let newSpecsObj: Record<string, string> = {};
                      try {
                        oldSpecsObj = typeof log.oldSpecs === 'string' ? JSON.parse(log.oldSpecs) : log.oldSpecs || {};
                      } catch(e) {}
                      try {
                        newSpecsObj = typeof log.newSpecs === 'string' ? JSON.parse(log.newSpecs) : log.newSpecs || {};
                      } catch(e) {}

                      // Granular comparison to detect edits, additions, and deletions of properties
                      const specChanges: Array<{ key: string, oldV?: string, newV?: string, mode: 'add' | 'edit' | 'delete' }> = [];
                      const uniqueKeys = Array.from(new Set([...Object.keys(oldSpecsObj), ...Object.keys(newSpecsObj)]));
                      
                      uniqueKeys.forEach((key) => {
                        const ov = oldSpecsObj[key];
                        const nv = newSpecsObj[key];
                        if (ov !== nv) {
                          if (ov === undefined) {
                            specChanges.push({ key, newV: nv, mode: 'add' });
                          } else if (nv === undefined) {
                            specChanges.push({ key, oldV: ov, mode: 'delete' });
                          } else {
                            specChanges.push({ key, oldV: ov, newV: nv, mode: 'edit' });
                          }
                        }
                      });

                      return (
                        <div key={log.id} className="relative pl-6">
                          {/* Timeline dot */}
                          <span className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-950 shadow-xs" />
                          
                          <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-850/80 rounded-xl p-4 space-y-3 shadow-3xs">
                            <div className="flex items-center justify-between text-xs font-sans">
                              <span className="font-extrabold text-slate-900 dark:text-slate-100 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded font-mono">
                                Версия {log.version}
                              </span>
                              <span className="text-slate-400 font-mono font-medium">
                                {new Date(log.changedAt).toLocaleString('ru-RU')}
                              </span>
                            </div>

                            {log.changedBy && (
                              <p className="text-xs text-slate-550 dark:text-slate-400 font-medium">
                                Инженер: <span className="text-slate-700 dark:text-slate-200 font-bold">{log.changedBy}</span>
                              </p>
                            )}

                            {/* COMPARISON RESULTS GRID */}
                            <div className="space-y-1.5">
                              <span className="text-xs uppercase font-bold text-slate-400 tracking-wider block">Изменения параметров:</span>
                              {specChanges.length === 0 ? (
                                <p className="text-xs italic text-slate-400 font-mono pl-1">Нет изменений технических спецификаций на данном шаге.</p>
                              ) : (
                                <div className="space-y-1 mt-1 font-mono text-xs">
                                  {specChanges.map((chg) => (
                                    <div key={chg.key} className="flex flex-wrap items-center gap-x-2 bg-white dark:bg-slate-950/40 p-1.5 px-2.5 rounded border border-slate-100 dark:border-slate-900/60 leading-normal text-left">
                                      <span className="text-slate-500 font-bold">{chg.key}:</span>
                                      
                                      {chg.mode === 'add' && (
                                        <span className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/35 px-1.5 py-0.5 rounded text-xs">
                                          Добавлено ➔ "{chg.newV}"
                                        </span>
                                      )}

                                      {chg.mode === 'delete' && (
                                        <span className="text-red-700 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/35 line-through px-1.5 py-0.5 rounded text-xs">
                                          Удалено (было: "{chg.oldV}")
                                        </span>
                                      )}

                                      {chg.mode === 'edit' && (
                                        <span className="inline-flex items-center gap-1">
                                          <span className="text-slate-405 line-through">"{chg.oldV}"</span>
                                          <span className="text-slate-400">➔</span>
                                          <span className="text-amber-700 dark:text-amber-400 font-bold bg-amber-50/70 dark:bg-amber-950/35 px-1.5 py-0.5 rounded text-xs">
                                            "{chg.newV}"
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-900 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setHistoryComponent(null);
                    setHistoryLogs([]);
                  }}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold cursor-pointer border-none"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
