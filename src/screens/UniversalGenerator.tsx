import React, { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import { motion, Reorder } from 'motion/react';
import { Settings, TagIcon, Plus, X, ArrowRight, Type, AlignLeft, Hash, Book, ChevronDown, CheckCircle2, Database } from 'lucide-react';
import { useToastStore } from '../store/toastStore';

type BlockType = 'static' | 'delimiter' | 'number' | 'dictionary';

interface TemplateBlock {
  id: string;
  type: BlockType;
  value?: string; // used for static and delimiter
  length?: number; // used for number
  dictId?: string; // used for dictionary
  label?: string; // used for dictionary
}

const DELIMITERS = ["-", "_", ".", "/", ":", " "];

export default function UniversalGenerator() {
  const { activeProject } = useStore();
  const { addToast } = useToastStore();

  const [dictionaries, setDictionaries] = useState<any[]>([]);
  const [template, setTemplate] = useState<TemplateBlock[]>([]);
  
  const [isSetupMode, setIsSetupMode] = useState(false);
  
  // Generation state
  const [genValues, setGenValues] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (activeProject) {
      fetchDictionaries();
      fetchTemplate();
    }
  }, [activeProject]);

  const fetchDictionaries = async () => {
    try {
      const res = await fetch(`/api/projects/${activeProject?.id || 'default'}/dictionaries`);
      const data = await res.json();
      setDictionaries(data.dictionaries);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTemplate = async () => {
    try {
      const res = await fetch(`/api/projects/${activeProject?.id || 'default'}/tag-template`);
      const data = await res.json();
      if (data.template && data.template.schemaJson) {
        setTemplate(JSON.parse(data.template.schemaJson));
      } else {
        setTemplate([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveTemplate = async () => {
    try {
      const res = await fetch(`/api/projects/${activeProject?.id || 'default'}/tag-template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaJson: JSON.stringify(template) })
      });
      if (!res.ok) throw new Error('Failed to save');
      addToast('Формула тега сохранена', 'success');
      setIsSetupMode(false);
    } catch (e) {
      console.error(e);
      addToast('Ошибка сохранения', 'error');
    }
  };

  const addBlock = (type: BlockType) => {
    const newBlock: TemplateBlock = { id: Math.random().toString(), type };
    if (type === 'delimiter') newBlock.value = '-';
    if (type === 'static') newBlock.value = 'WBS';
    if (type === 'number') newBlock.length = 3;
    if (type === 'dictionary') {
      newBlock.label = 'Выберите параметр';
      if (dictionaries.length > 0) newBlock.dictId = dictionaries[0].id;
    }
    setTemplate([...template, newBlock]);
  };

  const removeBlock = (id: string) => {
    setTemplate(template.filter(b => b.id !== id));
  };

  const updateBlock = (id: string, updates: Partial<TemplateBlock>) => {
    setTemplate(template.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const generatePreview = () => {
    return template.map(b => {
      if (b.type === 'static' || b.type === 'delimiter') return b.value || '';
      if (b.type === 'number') return 'X'.repeat(b.length || 3);
      if (b.type === 'dictionary') {
        const val = genValues[b.id];
        if (val) return val;
        // fallback
        const dict = dictionaries.find(d => d.id === b.dictId);
        return dict ? dict.name.substring(0,3).toUpperCase() : '???';
      }
      return '';
    }).join('');
  };

  const generatePrefixSuffix = () => {
    let prefix = '';
    let suffix = '';
    let sequenceLength = 3;
    let foundNumber = false;
    
    for (const b of template) {
      if (b.type === 'number') {
        foundNumber = true;
        sequenceLength = b.length || 3;
        continue;
      }
      
      const val = b.type === 'static' || b.type === 'delimiter' ? b.value || '' : genValues[b.id] || '';
      if (!foundNumber) {
        prefix += val;
      } else {
        suffix += val;
      }
    }

    return { prefix, suffix, sequenceLength };
  };

  const handleGenerateTag = async () => {
    if (!activeProject) return;
    
    // Validate required dictionary fields
    const missing = template.filter(b => b.type === 'dictionary' && !genValues[b.id]);
    
    if (missing.length > 0) {
      addToast('Заполните все параметры', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const { prefix, suffix } = generatePrefixSuffix();
      
      const metadataStr = JSON.stringify(genValues);

      const res = await fetch('/api/tags/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
           projectId: activeProject.id, 
           prefix,
           suffix,
           metadata: metadataStr
        })
      });

      if (!res.ok) throw new Error('Generate failed');
      const data = await res.json();
      
      addToast(`Тег ${data.tag.identifier} успешно создан`, 'success');
      // Reset form slightly? we usually keep values so user can generate many
    } catch (e) {
      console.error(e);
      addToast('Ошибка генерации тега', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="max-w-6xl mx-auto space-y-6"
    >
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Рабочее место инженера</h1>
          {/* Removed heading description as requested */}
        </div>
        <button 
          onClick={() => setIsSetupMode(!isSetupMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded font-semibold text-sm transition-colors border cursor-pointer ${isSetupMode ? 'border-amber-205 bg-amber-50 dark:bg-amber-955/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-955/40' : 'border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm'}`}
        >
          <Settings className="w-4 h-4" />
          {isSetupMode ? 'Закрыть настройку' : 'Настроить формулу тега'}
        </button>
      </div>

      {isSetupMode && (
        <div className="bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-850 shadow-inner p-6 animate-in fade-in slide-in-from-top-4 duration-300">
           <div className="flex items-center justify-between mb-6">
             <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2"><Settings className="w-5 h-5 text-slate-500" /> Конструктор структуры</h2>
             <div className="flex flex-wrap items-center gap-2">
               <span className="text-xs text-slate-500 dark:text-slate-400 font-bold mr-2">Добавить:</span>
               <button onClick={() => addBlock('dictionary')} className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded border border-emerald-200 dark:border-emerald-900 flex items-center gap-1 font-semibold shadow-xs cursor-pointer"><Book className="w-3.5 h-3.5"/> Справочник</button>
               <button onClick={() => addBlock('static')} className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 flex items-center gap-1 font-semibold shadow-xs cursor-pointer"><Type className="w-3.5 h-3.5"/> Свой Текст</button>
               <button onClick={() => addBlock('delimiter')} className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 flex items-center gap-1 font-semibold shadow-xs cursor-pointer"><AlignLeft className="w-3.5 h-3.5"/> Разд.</button>
               <button onClick={() => addBlock('number')} className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-955/20 text-amber-700 dark:text-amber-400 rounded border border-amber-200 dark:border-amber-900 flex items-center gap-1 font-semibold shadow-xs cursor-pointer"><Hash className="w-3.5 h-3.5"/> Номер</button>
             </div>
           </div>

           <Reorder.Group axis="y" values={template} onReorder={setTemplate} className="space-y-3">
             {template.map((block, index) => (
                <Reorder.Item key={block.id} value={block} className="flex items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-4 shadow-sm cursor-grab active:cursor-grabbing transition-colors">
                  <div className="w-6 h-6 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded text-xs font-bold text-slate-400 shrink-0">{index + 1}</div>
                  
                  <div className="w-32 shrink-0">
                    <span className={`text-xs font-bold uppercase tracking-wider block ${block.type === 'dictionary' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                       {block.type === 'static' ? 'Константа' :
                        block.type === 'delimiter' ? 'Знак' :
                        block.type === 'number' ? 'Авто-Счетчик' : 'Справочник'}
                    </span>
                  </div>

                  <div className="flex-1 flex items-center gap-3">
                    {block.type === 'static' && (
                      <input type="text" value={block.value || ''} onChange={e => updateBlock(block.id, { value: e.target.value.toUpperCase() })} className="w-full text-sm px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white" placeholder="Текст..." />
                    )}
                    {block.type === 'delimiter' && (
                      <select value={block.value} onChange={e => updateBlock(block.id, { value: e.target.value })} className="w-32 text-sm px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded focus:border-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
                        {DELIMITERS.map(d => <option key={d} value={d}>"{d}"</option>)}
                      </select>
                    )}
                    {block.type === 'number' && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Кол-во символов:</span>
                        <input type="number" min="1" max="10" value={block.length || 3} onChange={e => updateBlock(block.id, { length: parseInt(e.target.value) || 1 })} className="w-20 text-sm px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded focus:border-emerald-500 outline-none text-center bg-white dark:bg-slate-950 text-slate-900 dark:text-white" />
                      </div>
                    )}
                    {block.type === 'dictionary' && (
                      <div className="flex items-center gap-3 w-full">
                        <input type="text" value={block.label || ''} onChange={e => updateBlock(block.id, { label: e.target.value })} className="w-1/3 text-sm px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded focus:border-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white" placeholder="Название поля..." />
                        <span className="text-slate-400">→</span>
                        <select value={block.dictId || ''} onChange={e => updateBlock(block.id, { dictId: e.target.value })} className="flex-1 text-sm px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded focus:border-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
                          {dictionaries.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          {dictionaries.length === 0 && <option value="">Сначала загрузите справочники</option>}
                        </select>
                      </div>
                    )}
                  </div>

                  <button onClick={() => removeBlock(block.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded transition-colors shrink-0 cursor-pointer"><X className="w-4 h-4" /></button>
                </Reorder.Item>
             ))}
             {template.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center text-center text-sm text-slate-500 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg bg-white/50 dark:bg-slate-900/50">
                  <Settings className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-3" />
                  Формула пуста.<br/>Добавьте блоки для настройки генератора.
                </div>
             )}
           </Reorder.Group>

           <div className="mt-6 flex justify-end">
             <button onClick={saveTemplate} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow-sm transition-colors cursor-pointer">
               <CheckCircle2 className="w-4 h-4" />
               Применить и Сохранить
             </button>
           </div>
        </div>
      )}

      {/* Execution Mode */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm p-6 transition-colors">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
              <TagIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Параметры нового тега
            </h3>
            
            <div className="space-y-5">
              {template.filter(b => b.type === 'dictionary').map(block => {
                const dict = dictionaries.find(d => d.id === block.dictId);
                return (
                  <div key={block.id} className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {block.label || 'Параметр'}
                    </label>
                    <select 
                      value={genValues[block.id] || ''} 
                      onChange={e => setGenValues({...genValues, [block.id]: e.target.value})}
                      className="w-full text-base px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-950 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-sm"
                    >
                      <option value="">-- Выберите значение --</option>
                      {dict?.items.map((item: any) => (
                        <option key={item.id} value={item.code}>{item.code} — {item.nameRu}</option>
                      ))}
                    </select>
                  </div>
                );
              })}

              {template.filter(b => b.type === 'dictionary').length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400 italic py-4 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-850 px-4 text-center">
                  Формула не содержит справочников для заполнения.<br/> 
                  <button onClick={() => setIsSetupMode(true)} className="text-emerald-600 hover:underline mt-1 font-semibold cursor-pointer">Перейти к настройке</button>
                </div>
              )}
            </div>
            
            {template.length > 0 && template.filter(b => b.type === 'dictionary').length > 0 && (
              <button 
                onClick={handleGenerateTag}
                disabled={isGenerating}
                className="w-full mt-10 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-bold transition-all shadow-sm flex items-center justify-center gap-2 text-lg cursor-pointer"
              >
                {isGenerating ? 'Резервирование...' : 'Сгенерировать и получить номер'} <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-xl shadow-lg p-8 pl-10 text-white relative overflow-hidden flex flex-col justify-center min-h-[220px]">
            <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-emerald-500 to-teal-400"></div>
            
            {/* Removed label as requested */}
            
            <div className="text-4xl md:text-5xl font-mono tracking-tight font-bold break-all text-emerald-400 drop-shadow-md">
              {generatePreview() || <span className="opacity-20 text-slate-500">FORMAT_EMPTY</span>}
            </div>
            
            <p className="text-slate-500 text-xs mt-6 max-w-sm leading-relaxed">
              *Счетчик (X) будет автоматически заменен на следующий доступный порядковый номер при сохранении в базу данных.
            </p>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
