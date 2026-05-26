import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { dataService, UserNote } from '../services/dataService';
import RichTextEditor from '../components/RichTextEditor';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, BookOpen, Calendar, Trash2, ExternalLink, 
  Sparkles, Save, FileText, CheckCircle2, CloudLightning, RefreshCw 
} from 'lucide-react';

const COLORS = [
  { name: 'Желтый', class: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200', btn: 'bg-yellow-400' },
  { name: 'Красный', class: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200', btn: 'bg-rose-400' },
  { name: 'Зеленый', class: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200', btn: 'bg-emerald-400' },
  { name: 'Серый', class: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700', btn: 'bg-slate-400' },
];

export default function NotesManagement() {
  const { user } = useStore();
  const { addToast } = useToastStore();
  
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<UserNote | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Auto-save states
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load all notes
  const loadNotes = async (selectIdAfterLoad?: string) => {
    try {
      setLoading(true);
      const fetched = await dataService.getNotes();
      setNotes(fetched);
      
      if (fetched.length > 0) {
        if (selectIdAfterLoad) {
          const matching = fetched.find(n => n.id === selectIdAfterLoad);
          if (matching) setSelectedNote(matching);
        } else if (!selectedNote) {
          setSelectedNote(fetched[0]);
        } else {
          // Sync currently selected note with updated state
          const current = fetched.find(n => n.id === selectedNote.id);
          if (current) setSelectedNote(current);
        }
      } else {
        setSelectedNote(null);
      }
    } catch (err: any) {
      addToast(err.message || 'Ошибка загрузки заметок', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  // Handle note deletion
  const handleDeleteNote = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Вы действительно хотите удалить эту заметку?')) return;

    try {
      await dataService.deleteNote(id);
      addToast('Заметка удалена', 'success');
      
      // If we are deleting the selected note
      if (selectedNote?.id === id) {
        setSelectedNote(null);
      }
      loadNotes();

      // Log action to SystemChangeLog
      await dataService.createLog({
        userName: user?.name || 'Главный Администратор',
        userSymbol: user?.symbol || 'RaupovKhKh',
        description: `Удалена инженерная заметка`,
        targetRoute: '/notes'
      });
    } catch (err: any) {
      addToast(err.message || 'Не удалось удалить заметку', 'error');
    }
  };

  // Create new note
  const handleCreateNote = async () => {
    try {
      const newNote = await dataService.createNote({
        title: 'Новая заметка',
        content: '<p>Запишите здесь расчеты оборудования или важные детали...</p>',
        color: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200'
      });
      addToast('Заметка создана', 'success');
      await loadNotes(newNote.id);

      // Log action
      await dataService.createLog({
        userName: user?.name || 'Главный Администратор',
        userSymbol: user?.symbol || 'RaupovKhKh',
        description: `Создана новая инженерная заметка: "${newNote.title}"`,
        targetRoute: '/notes'
      });
    } catch (err: any) {
      addToast(err.message || 'Ошибка при создании заметки', 'error');
    }
  };

  // Perform backend update
  const saveNoteToDb = async (noteId: string, updatedFields: Partial<UserNote>) => {
    setSaveStatus('saving');
    try {
      await dataService.updateNote(noteId, updatedFields);
      setSaveStatus('saved');
      
      // Update local notes array so sidebar stays perfectly updated
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...updatedFields, updatedAt: new Date().toISOString() } : n));
    } catch (err) {
      setSaveStatus('error');
    }
  };

  // Triggered when anything is updated in the selected note
  const handleNoteChange = (fields: Partial<UserNote>) => {
    if (!selectedNote) return;

    // Immediately update local UI so there is zero lagging
    const updated = { ...selectedNote, ...fields };
    setSelectedNote(updated);

    // Cancel existing timers
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Debounce backend update by 1000ms
    setSaveStatus('saving');
    autoSaveTimerRef.current = setTimeout(() => {
      saveNoteToDb(selectedNote.id, fields);
    }, 1000);
  };

  // Open sticker window / external link
  const handleOpenSticker = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    const win = window as any;
    
    if (win.electron && win.electron.ipcRenderer) {
      win.electron.ipcRenderer.send('window:open-sticker', noteId);
      addToast('Стикер откреплен на отдельный рабочий экран!', 'success');
    } else {
      // Fallback popup window in web browsers! Height/width are specified beautifully
      const popup = window.open(
        `/#/sticker?id=${noteId}`,
        `sticker-${noteId}`,
        'width=320,height=380,menubar=no,status=no,toolbar=no,location=no,status=no,directories=no,resizable=yes'
      );
      if (popup) {
        addToast('Стикер открыт во внешнем окне!', 'success');
      } else {
        addToast('Браузер заблокировал всплывающее окно. Одобрите всплывающие окна для сайта.', 'info');
      }
    }
  };

  // Cleanup auto-save on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // Filter notes based on search query
  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(search.toLowerCase()) || 
    note.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="h-[calc(100vh-100px)] flex gap-4 font-sans select-none"
    >
      {/* LEFT SIDEBAR: NOTES DIRECTORY */}
      <div id="notes-sidebar" className="w-80 shrink-0 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        {/* Search & Add block */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-bold text-slate-850 dark:text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <span>Инженерный блокнот</span>
            </h2>
            <button
              onClick={handleCreateNote}
              className="p-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg cursor-pointer transition-all flex items-center justify-center shadow-xs"
              title="Создать заметку"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Поиск заметок..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-100/70 dark:bg-slate-950 border border-transparent dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>

        {/* List content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
              <span className="text-xs">Загрузка ваших заметок...</span>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400 dark:text-slate-500 text-center px-4">
              <FileText className="w-8 h-8 text-slate-350 dark:text-slate-750 mb-2" />
              <p className="text-xs font-semibold">Заметок не найдено</p>
              <p className="text-xs mt-0.5 opacity-80">Нажмите «+ Создать», чтобы добавить новую</p>
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isSelected = selectedNote?.id === note.id;
              // strip HTML for text previews
              const cleanContent = note.content ? note.content.replace(/<[^>]*>/g, '') : '';
              
              return (
                <div
                  key={note.id}
                  onClick={() => setSelectedNote(note)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer relative group text-left ${
                    isSelected 
                      ? 'bg-slate-100/85 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 shadow-xs' 
                      : 'bg-white dark:bg-slate-900 border-slate-150 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-white truncate flex-1">
                      {note.title || 'Новая заметка'}
                    </h3>
                    
                    {/* Action buttons appear on hover */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
                      <button
                        onClick={(e) => handleOpenSticker(e, note.id)}
                        className="p-1 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 rounded transition-colors"
                        title="Открепить стикер поверх ОС"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteNote(e, note.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors"
                        title="Удалить заметку"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 font-light leading-relaxed">
                    {cleanContent || 'Нет содержимого'}
                  </p>

                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                    
                    {/* Tiny Color indicator dot */}
                    <div className="flex items-center gap-1.5">
                      {COLORS.map(c => {
                        if (note.color.includes(c.class.split(' ')[0])) {
                          return <div key={c.name} className={`w-2 h-2 rounded-full ${c.btn}`} />;
                        }
                        return null;
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR: WORKSPACE EDITING AREA */}
      <div id="notes-content" className="flex-1 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs relative">
        {selectedNote ? (
          <div className="flex-grow flex flex-col h-full">
            {/* Header / Meta properties */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/20 dark:bg-slate-900/10">
              <div className="flex items-center gap-3">
                {/* Save status notification badge */}
                <div className="flex items-center gap-1.5 text-xs">
                  {saveStatus === 'saving' && (
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-mono text-xs">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Сохранение...</span>
                    </span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="text-emerald-600 dark:text-emerald-450 flex items-center gap-1 font-mono text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Сохранено в SQLite</span>
                    </span>
                  )}
                  {saveStatus === 'idle' && (
                    <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1 font-mono text-xs">
                      <Save className="w-3 h-3" />
                      <span>Ожидание изменений</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Color Preset Palette */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-450 dark:text-slate-400 uppercase tracking-wider mr-1">Палитра:</span>
                {COLORS.map(colorPreset => {
                  const isCurrent = selectedNote.color === colorPreset.class;
                  return (
                    <button
                      key={colorPreset.name}
                      onClick={() => handleNoteChange({ color: colorPreset.class })}
                      className={`w-5 h-5 rounded-full border cursor-pointer transition-all ${colorPreset.btn} ${
                        isCurrent ? 'ring-2 ring-offset-2 ring-emerald-500 dark:ring-offset-slate-950 scale-110' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                      title={colorPreset.name}
                    />
                  );
                })}
              </div>

              {/* Big Otkrepit button */}
              <button
                onClick={(e) => handleOpenSticker(e, selectedNote.id)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 hover:border-slate-350 rounded-lg text-xs text-slate-700 dark:text-slate-300 font-semibold cursor-pointer flex items-center gap-1.5 transition-all shadow-inner"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Открепить стикер</span>
              </button>
            </div>

            {/* Note title editable header */}
            <div className="px-6 pt-5 pb-2">
              <input
                type="text"
                placeholder="Заголовок заметки"
                value={selectedNote.title}
                onChange={(e) => handleNoteChange({ title: e.target.value })}
                className="w-full text-slate-900 dark:text-white text-xl font-bold border-none outline-none focus:outline-none placeholder-slate-300 dark:placeholder-slate-700 bg-transparent"
              />
              <div className="w-full h-[1px] bg-slate-200 dark:bg-slate-800 mt-2" />
            </div>

            {/* WYSIWYG Editor wrapper */}
            <div className="flex-1 px-6 pb-6 overflow-y-auto">
              <RichTextEditor
                value={selectedNote.content}
                onChange={(html) => handleNoteChange({ content: html })}
                className="h-full border-none shadow-none bg-transparent"
              />
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 h-full">
            <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
            <h3 className="text-md font-bold text-slate-800 dark:text-white">Инженерный Блокнот пуст</h3>
            <p className="text-xs text-center max-w-sm mt-1 opacity-75">
              Создайте новую инженерную заметку или выберите существующую из левой панели, чтобы приступить к документированию расчетов и спецификаций оборудования.
            </p>
            <button
              onClick={handleCreateNote}
              className="mt-4 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-md hover:shadow-lg flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Создать первую заметку</span>
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
