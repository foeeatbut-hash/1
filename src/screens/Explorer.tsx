import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { useModalStore } from '../store/modalStore';
import { 
  Folder, File as FileIcon, ChevronRight, ChevronDown, Plus, Upload, 
  Search, MoreVertical, Copy, Edit2, Trash2, FolderPlus, RefreshCw, 
  ArrowLeft, ArrowRight, ArrowUp, Tag, Shield, PanelRight, LayoutGrid, List,
  Download, Image as ImageIcon, FileText, FileCode, FileSpreadsheet, Info, Boxes, Scissors, ClipboardPaste,
  Grid3X3
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import EquipmentImportPreview from '../components/EquipmentImportPreview';

// Виртуальные корневые разделы проводника: «Общий» и «Личный».
// Они зашиты в программу: их нельзя удалить, переименовать или переместить.
const SEC_SHARED = 'sec:shared';
const personalSecId = (uid: string) => `sec:personal:${uid}`;
const isSectionId = (id: string | null | undefined): boolean => !!id && id.startsWith('sec:');
const parseSection = (id: string): { scope: 'SHARED' | 'PERSONAL'; ownerId: string | null } =>
  id === SEC_SHARED
    ? { scope: 'SHARED', ownerId: null }
    : { scope: 'PERSONAL', ownerId: id.slice('sec:personal:'.length) || null };

const getFileIcon = (item: any, classNameStr: string) => {
  if (item.isSection) {
    return item.id === SEC_SHARED
      ? <Folder className={`${classNameStr} text-emerald-600 fill-emerald-200`} />
      : <Folder className={`${classNameStr} text-sky-600 fill-sky-200`} />;
  }
  if (item.isFolder && item.system) return <Folder className={`${classNameStr} text-emerald-600 fill-emerald-100`} />;
  if (item.isFolder) return <Folder className={`${classNameStr} text-yellow-500 fill-yellow-200`} />;
  if (item.type === 'CONSTRUCTOR') return <FileSpreadsheet className={`${classNameStr} text-emerald-600`} />;
  if (item.type === 'IMAGE' || item.name?.match(/\.(jpe?g|png|gif|webp)$/i)) return <ImageIcon className={`${classNameStr} text-emerald-500`} />;
  if (item.type === 'PDF' || item.name?.match(/\.pdf$/i)) return <FileText className={`${classNameStr} text-red-500`} />;
  if (item.type === 'DOCX' || item.name?.match(/\.(doc|docx)$/i)) return <FileText className={`${classNameStr} text-emerald-600`} />;
  if (item.type === 'TXT' || item.name?.match(/\.(txt|md|csv)$/i)) return <FileText className={`${classNameStr} text-slate-500`} />;
  return <FileIcon className={`${classNameStr} text-slate-400`} />;
};

const formatSize = (bytes: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// ── Статусы документооборота (код A/B/C/D → человекочитаемый поток) ──
// Проводник 2.0 §6.2: вместо безымянной цветной точки — понятный чип.
const FILE_STATUSES: Record<string, { label: string; dot: string; chip: string }> = {
  D: { label: 'Черновик',    dot: 'bg-slate-400',   chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  C: { label: 'На проверке', dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  B: { label: 'Согласован',  dot: 'bg-sky-500',     chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  A: { label: 'Выдан',       dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
};
const STATUS_ORDER = ['D', 'C', 'B', 'A'];
const statusOf = (code: string | undefined) => FILE_STATUSES[code || 'D'] || FILE_STATUSES.D;

const StatusChip = ({ code, onClick }: { code?: string; onClick?: (e: React.MouseEvent) => void }) => {
  const s = statusOf(code);
  return (
    <span
      onClick={onClick}
      title={onClick ? 'Сменить статус документа' : s.label}
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.chip} ${onClick ? 'cursor-pointer hover:brightness-95' : ''}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
    </span>
  );
};

// data:...;base64,<...> → текст в UTF-8 (atob даёт latin1, поэтому через TextDecoder)
const decodeTextContent = (dataUri: string): string => {
  try {
    const comma = dataUri.indexOf(',');
    const meta = dataUri.slice(0, comma);
    const body = dataUri.slice(comma + 1);
    if (/;base64/i.test(meta)) {
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }
    return decodeURIComponent(body);
  } catch (_) {
    return dataUri;
  }
};

export default function Explorer() {
  const { 
    activeProject, 
    explorerHistory, 
    explorerForward, 
    pushHistory, 
    goBack, 
    goForward,
    user
  } = useStore();
  
  const { addToast } = useToastStore();
  const { openPrompt, openConfirm, openSelect } = useModalStore();
  const navigate = useNavigate();
  const currentFolderId = explorerHistory[explorerHistory.length - 1];

  const [folders, setFolders] = useState<any[]>([]);
  const [rootFiles, setRootFiles] = useState<any[]>([]);
  const [projectTags, setProjectTags] = useState<any[]>([]);
  // Главный Администратор видит личные разделы всех пользователей
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [owners, setOwners] = useState<Array<{ id: string; name: string; symbol: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [tagSortConfig, setTagSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });
  const [isLoading, setIsLoading] = useState(false);
  
  // Selection & Renaming
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showPreviewPane, setShowPreviewPane] = useState(false);

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Context Menu
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, targetId?: string, isFile?: boolean, isContainer?: boolean, isSection?: boolean } | null>(null);

  // Clipboard (for Copy/Paste within app)
  const [clipboard, setClipboard] = useState<{ ids: string[], type: 'copy' | 'cut' } | null>(null);

  const [uploadProgress, setUploadProgress] = useState<{current: number, total: number} | null>(null);
  
  const [propertiesModal, setPropertiesModal] = useState<{item: any, isFile: boolean} | null>(null);
  
  const [assignTagModal, setAssignTagModal] = useState<{ fileId: string, mainTags: string[], additionalTags: string[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainPaneRef = useRef<HTMLDivElement>(null);

  // Synchronizing state references for memory-safe and efficient hotkey event listener
  const selectedIdsRef = useRef(selectedIds);
  const lastSelectedIdRef = useRef(lastSelectedId);
  const clipboardRef = useRef(clipboard);
  const allCurrentItemsRef = useRef<any[]>([]);
  const currentFolderIdRef = useRef(currentFolderId);
  const foldersRef = useRef(folders);
  
  const handleDeleteRef = useRef<any>(null);
  const handlePasteRef = useRef<any>(null);
  const navigateToRef = useRef<any>(null);
  const filesRef = useRef<any[]>([]);

  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { lastSelectedIdRef.current = lastSelectedId; }, [lastSelectedId]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => { currentFolderIdRef.current = currentFolderId; }, [currentFolderId]);
  useEffect(() => { foldersRef.current = folders; }, [folders]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const projectId = activeProject?.id || 'default';
      const [fRes, tRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/folders?actorId=${encodeURIComponent(user?.id || '')}`),
        fetch(`/api/projects/${projectId}/tags`)
      ]);
      const fData = await fRes.json();
      const tData = await tRes.json();
      setFolders(fData.folders || []);
      setRootFiles(fData.rootFiles || []);
      setIsMainAdmin(!!fData.isMainAdmin);
      setOwners(fData.owners || []);
      setProjectTags(tData.tags || []);
    } catch (err) {
      console.error("Failed to fetch explorer data:", err);
      setFolders([]);
      setRootFiles([]);
      setProjectTags([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Какие файлы ждут выбора категории для импорта в «Оборудование» (мультивыбор)
  const [importPickerFiles, setImportPickerFiles] = useState<string[] | null>(null);
  const [importPreview, setImportPreview] = useState<{ fileIds: string[]; category: string } | null>(null);
  // Карта загруженных в оборудование файлов: имя файла -> { category, version }
  const [loadedMap, setLoadedMap] = useState<Record<string, { category: string; version: number }>>({});

  const loadEquipMap = useCallback(async () => {
    const projectId = activeProject?.id;
    if (!projectId) { setLoadedMap({}); return; }
    try {
      const r = await fetch(`/api/projects/${projectId}/systems`);
      const d = await r.json();
      const map: Record<string, { category: string; version: number }> = {};
      for (const s of (d.systems || [])) {
        if (!s.fileName) continue;
        let v = 1;
        for (const mb of (s.monoblocks || [])) for (const c of (mb.components || [])) v = Math.max(v, c.version || 1);
        const prev = map[s.fileName];
        map[s.fileName] = { category: s.category, version: Math.max(prev?.version || 1, v) };
      }
      setLoadedMap(map);
    } catch (_) { setLoadedMap({}); }
  }, [activeProject]);

  useEffect(() => { loadEquipMap(); }, [loadEquipMap]);

  // Импорт: категория выбрана → открываем предпросмотр (dry-run) вместо прямой записи
  const importFilesToCategory = (fileIds: string[], category: string) => {
    setImportPickerFiles(null);
    if (!fileIds.length) return;
    setImportPreview({ fileIds, category });
  };

  // Категории оборудования для подменю импорта (с учётом добавленных в настройках)
  const [equipCats, setEquipCats] = useState<{ id: string; label: string }[]>([
    { id: 'AHU', label: 'Центральные кондиционеры' },
    { id: 'FAN', label: 'Радиальные вентиляторы' },
    { id: 'VALVE', label: 'Воздушные клапаны' },
    { id: 'CURTAIN', label: 'Воздушные завесы' },
  ]);
  useEffect(() => {
    fetch('/api/equipment/categories').then(r => r.json()).then(d => { if (Array.isArray(d.categories) && d.categories.length) setEquipCats(d.categories); }).catch(() => {});
  }, []);

  const catLabel = useCallback((id: string) => equipCats.find(c => c.id === id)?.label || id, [equipCats]);

  // Открыть выбор категории для импорта в «Оборудование» по выделенным файлам
  const openImportPicker = (fallbackId?: string) => {
    const fileIds = Array.from(selectedIds).filter(id => {
      const it = allCurrentItemsRef.current.find(i => i.id === id);
      return it && !it.isFolder;
    });
    if (fileIds.length === 0 && fallbackId) fileIds.push(fallbackId);
    if (fileIds.length === 0) { addToast('Выберите хотя бы один файл.', 'error'); return; }
    setImportPickerFiles(fileIds);
  };

  useEffect(() => {
    fetchData();
  }, [activeProject]);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const navigateTo = (folderId: string | null) => {
    pushHistory(folderId);
    setSearchQuery('');
    setSelectedIds(new Set());
  };

  // Раздел (общий/личный), которому принадлежит папка или файл
  const itemSection = useCallback((item: any): string => {
    return item?.scope === 'PERSONAL' && item?.ownerId ? personalSecId(item.ownerId) : SEC_SHARED;
  }, []);

  // Список корневых разделов: «Общий», «Личный» (+ личные всех пользователей у ГлавАдмина)
  const sections = useMemo(() => {
    const list: Array<{ id: string; name: string; ownerId: string | null; isFolder: boolean; isSection: boolean }> = [
      { id: SEC_SHARED, name: 'Общий', ownerId: null, isFolder: true, isSection: true },
      { id: personalSecId(user?.id || ''), name: 'Личный', ownerId: user?.id || null, isFolder: true, isSection: true },
    ];
    if (isMainAdmin) {
      for (const o of owners) {
        if (o.id !== user?.id) {
          list.push({ id: personalSecId(o.id), name: `Личная: ${o.name}`, ownerId: o.id, isFolder: true, isSection: true });
        }
      }
    }
    return list;
  }, [user?.id, isMainAdmin, owners]);

  const sectionName = useCallback((secId: string): string => {
    return sections.find(s => s.id === secId)?.name || (secId === SEC_SHARED ? 'Общий' : 'Личный');
  }, [sections]);

  // Раздел, в котором пользователь находится сейчас (null — на списке разделов)
  const currentSectionId = useMemo(() => {
    if (!currentFolderId) return null;
    if (isSectionId(currentFolderId)) return currentFolderId;
    const folder = folders.find(f => f.id === currentFolderId);
    return folder ? itemSection(folder) : null;
  }, [currentFolderId, folders, itemSection]);

  const handleNavigateUp = () => {
    if (!currentFolderId) return;
    if (isSectionId(currentFolderId)) {
      navigateTo(null);
      return;
    }
    const folder = folders.find(f => f.id === currentFolderId);
    if (folder?.parentId) navigateTo(folder.parentId);
    else navigateTo(folder ? itemSection(folder) : null);
  };

  const createFolder = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentFolderId) {
      addToast('Откройте раздел «Общий» или «Личный», чтобы создать папку.', 'error');
      return;
    }
    const name = await openPrompt("Новая папка", "Имя папки:") || "Новая папка";
    if (!name.trim()) return;
    const inSectionRoot = isSectionId(currentFolderId);
    const sec = inSectionRoot ? parseSection(currentFolderId) : null;
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        projectId: activeProject?.id || 'default',
        parentId: inSectionRoot ? null : currentFolderId,
        ...(sec ? { scope: sec.scope, ownerId: sec.ownerId || user?.id } : {})
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.folder) {
      addToast(`Не удалось создать папку: ${data?.error || res.status}`, 'error');
      return;
    }
    await fetchData();
    setRenamingId(data.folder.id);
    setRenameValue(name);
  };

  const triggerIPCExcelParse = async (file: File) => {
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
    
    const fileContent = await base64Promise;
    
    const win = window as any;
    if (win.electron && win.electron.ipcRenderer) {
      try {
        return await win.electron.ipcRenderer.invoke('excel:parse-and-import', {
          projectId: activeProject?.id || 'default',
          fileName: file.name,
          fileContent
        });
      } catch (err) {
        console.warn("Electron IPC excel:parse-and-import failed, using API:", err);
      }
    }

    const response = await fetch(`/api/projects/${activeProject?.id || 'default'}/excel/parse-and-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileContent, fileName: file.name })
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = { error: 'Unknown parse error' };
      try { parsedErr = JSON.parse(errText); } catch(e) {}
      throw new Error(parsedErr.error || "Error parsing file template");
    }

    return await response.json();
  };

  const uploadFiles = async (files: FileList | File[], targetFolderId: string | null = currentFolderId) => {
    if (!targetFolderId) {
      addToast('Откройте раздел «Общий» или «Личный», чтобы загрузить файлы.', 'error');
      return;
    }
    const inSectionRoot = isSectionId(targetFolderId);
    const sec = inSectionRoot ? parseSection(targetFolderId) : null;
    const realFolderId = inSectionRoot ? null : targetFolderId;

    // Имена, уже занятые в целевой папке (для дедупа при загрузке — B8)
    const existingNames = new Set(
      (realFolderId === null
        ? rootFiles.filter((f: any) => itemSection(f) === targetFolderId)
        : (folders.find((f: any) => f.id === realFolderId)?.files || [])
      ).map((f: any) => String(f.name))
    );
    const uniqueName = (name: string): string => {
      if (!existingNames.has(name)) { existingNames.add(name); return name; }
      const parts = name.split('.');
      const hasExt = parts.length > 1;
      const ext = hasExt ? parts.pop() : '';
      const base = parts.join('.');
      let n = 1, candidate = name;
      do { candidate = hasExt ? `${base} (${n}).${ext}` : `${base} (${n})`; n++; } while (existingNames.has(candidate));
      existingNames.add(candidate);
      return candidate;
    };

    const CONTENT_LIMIT = 5 * 1024 * 1024; // порог хранения содержимого в БД
    setUploadProgress({ current: 0, total: files.length });
    let ok = 0; const failed: string[] = []; const skippedBig: string[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Файл просто сохраняется в проводник. Импорт в «Оборудование» —
        // только вручную: выделить файл(ы) и нажать «В оборудование» на панели.
        let type = 'FILE';
        if (file.name.match(/\.(pdf)$/i)) type = 'PDF';
        else if (file.name.match(/\.(doc|docx)$/i)) type = 'DOCX';
        else if (file.name.match(/\.(txt|md|csv)$/i)) type = 'TXT';
        else if (file.name.match(/\.(png|jpe?g|gif|webp)$/i)) type = 'IMAGE';
        else type = file.name.split('.').pop()?.toUpperCase() || 'FILE';

        let content: any = undefined;
        if (file.size < CONTENT_LIMIT) {
           const reader = new FileReader();
           content = await new Promise((resolve) => {
             reader.onload = (e) => resolve(e.target?.result);
             reader.onerror = () => resolve(undefined);
             reader.readAsDataURL(file);
           });
        } else {
           skippedBig.push(file.name); // содержимое не сохраняем — предупредим (B3)
        }

        const name = uniqueName(file.name);
        const scopeLabel = sec?.scope === 'PERSONAL' ? 'personal' : 'shared';
        try {
          const res = await fetch('/api/files', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name,
                folderId: realFolderId,
                ...(sec ? { scope: sec.scope, ownerId: sec.ownerId || user?.id } : {}),
                filePath: `/${scopeLabel}/${name}`,
                size: file.size,          // реальный размер, без random (B2)
                type,
                department: 'Unassigned',
                content,
                createdById: user?.id,
                updatedById: user?.id
              })
          });
          if (res.ok) ok++; else failed.push(file.name); // честный итог (B10)
        } catch (_) { failed.push(file.name); }
        setUploadProgress(prev => prev ? { ...prev, current: i + 1 } : null);
    }
    setUploadProgress(null);

    if (ok > 0) addToast(`Загружено файлов: ${ok}${failed.length ? `, ошибок: ${failed.length}` : ''}`, failed.length ? 'error' : 'success');
    else if (failed.length) addToast(`Не удалось загрузить: ${failed.length}`, 'error');
    if (skippedBig.length) addToast(`Файлы больше 5 МБ сохранены без предпросмотра/скачивания: ${skippedBig.join(', ')}`, 'info');
    fetchData();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) uploadFiles(event.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const createEmptyFile = async (name: string, type: string, defaultContent: string) => {
     if (!currentFolderId) {
       addToast('Откройте раздел «Общий» или «Личный», чтобы создать документ.', 'error');
       return;
     }
     const inSectionRoot = isSectionId(currentFolderId);
     const sec = inSectionRoot ? parseSection(currentFolderId) : null;
     let uniqueName = name;
     let counter = 1;
     while (files.some((f: any) => f.name === uniqueName)) {
        const parts = name.split('.');
        if (parts.length > 1) {
          const ext = parts.pop();
          const base = parts.join('.');
          uniqueName = `${base} (${counter}).${ext}`;
        } else {
          uniqueName = `${name} (${counter})`;
        }
        counter++;
     }
     
     await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uniqueName,
          folderId: inSectionRoot ? null : currentFolderId,
          ...(sec ? { scope: sec.scope, ownerId: sec.ownerId || user?.id } : {}),
          filePath: `/shared/${uniqueName}`,
          size: defaultContent.length,
          type,
          department: "Unassigned",
          content: defaultContent,
          createdById: user?.id,
          updatedById: user?.id
        })
     });
     fetchData();
  };

  // «Создать → Таблицу/Документ»: новый документ Конструктора нужного типа
  // и сразу в его редактор. Зеркало в Проводнике появится после именования.
  const createConstructorDoc = async (kind: 'DOC' | 'TEXT') => {
    try {
      const res = await fetch('/api/constructor/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject?.id || '', ...(kind !== 'DOC' ? { kind } : {}) }),
      });
      const data = await res.json();
      if (!res.ok || !data?.doc?.id) throw new Error(data?.error || 'Не удалось создать документ');
      navigate(`/constructor?doc=${data.doc.id}`);
    } catch (e: any) {
      addToast(`Не удалось создать документ: ${e.message}`, 'error');
    }
  };
  const createConstructorSheet = () => createConstructorDoc('DOC');

  // «Редактировать копию в Конструкторе»: xlsx/csv → таблица, txt/md/docx → текст.
  // Исходный файл не меняется — редактируется копия-документ студии.
  const editCopyInConstructor = async (fileId: string) => {
    try {
      const res = await fetch('/api/constructor/docs/import-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, projectId: activeProject?.id || '' }),
      });
      const data = await res.json();
      if (!res.ok || !data?.doc?.id) throw new Error(data?.error || 'Не удалось открыть файл');
      addToast('Создана редактируемая копия — исходный файл не изменён', 'success');
      navigate(`/constructor?doc=${data.doc.id}`);
    } catch (e: any) {
      addToast(String(e.message || e), 'error');
    }
  };

  // Файл можно открыть в Конструкторе? (по расширению)
  const canEditInConstructor = (name: string) => /\.(xlsx|xlsm|xls|csv|txt|md|log|json|docx)$/i.test(name || '');

  // Тело запроса перемещения/копирования с учётом виртуальных разделов:
  // при переносе в корень раздела передаём его область видимости
  const buildCopyBody = (ids: string[], target: string | null, isCut: boolean) => {
    const realIds = ids.filter(id => !isSectionId(id));
    if (target && isSectionId(target)) {
      const sec = parseSection(target);
      return { ids: realIds, targetFolderId: null, isCut, targetScope: sec.scope, targetOwnerId: sec.ownerId || user?.id };
    }
    return { ids: realIds, targetFolderId: target, isCut };
  };

  const handleMoveItems = async (ids: string[], targetFolderId: string | null) => {
    const body = buildCopyBody(ids, targetFolderId, true);
    if (body.ids.length === 0) return;
    await fetch('/api/files/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    fetchData();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  };

  // Actions
  const handleRenameSubmit = async (id: string, isFile: boolean, newName: string) => {
    if (!newName.trim()) return setRenamingId(null);
    const endpoint = isFile ? `/api/files/${id}` : `/api/folders/${id}`;
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    setRenamingId(null);
    fetchData();
  };

  const handleDelete = async (id: string, isFile: boolean) => {
    if (isSectionId(id)) {
      addToast('Разделы «Общий» и «Личный» встроены в программу — их нельзя удалить.', 'error');
      return;
    }
    const confirmed = await openConfirm("Подтверждение", "Вы уверены, что хотите удалить этот элемент?");
    if (!confirmed) return;
    const endpoint = isFile ? `/api/files/${id}` : `/api/folders/${id}`;
    await fetch(endpoint, { method: 'DELETE' });
    if (!isFile && currentFolderId === id) navigateTo(null);
    addToast('Удалено успешно', 'success');
    fetchData();
  };

  const handleAssignTag = (fileId: string) => {
    const item = files.find(f => f.id === fileId);
    if (item) {
        setAssignTagModal({
           fileId,
           mainTags: item.mainTags?.map((t:any) => t.id) || [],
           additionalTags: item.additionalTags?.map((t:any) => t.id) || []
        });
    }
  };

  const handleAssignDepartment = async (fileId: string) => {
    const dept = await openSelect("Назначение отдела", "Выберите отдел для этого файла:", [
      { value: '', label: 'Нет отдела' },
      { value: 'КИПиА', label: 'Отдел КИПиА' },
      { value: 'ОВиК', label: 'Отдел ОВиК' },
      { value: 'Менеджеры', label: 'Отдел менеджеров' }
    ]);
    if (dept !== null) {
        await fetch(`/api/files/${fileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ department: dept === '' ? "Unassigned" : dept })
        });
        fetchData();
    }
  }

  // Смена статуса документооборота: применяется к выделению (или к одному файлу)
  const handleChangeStatus = async (fileId: string) => {
    const target = selectedIds.has(fileId) ? Array.from(selectedIds) : [fileId];
    const fileTargets = target.filter(id => {
      const it = allCurrentItemsRef.current.find(i => i.id === id);
      return it && !it.isFolder;
    });
    if (fileTargets.length === 0) return;
    const code = await openSelect('Статус документа', `Новый статус для ${fileTargets.length > 1 ? `${fileTargets.length} файлов` : 'файла'}:`,
      STATUS_ORDER.map(c => ({ value: c, label: FILE_STATUSES[c].label })));
    if (code === null) return;
    await Promise.all(fileTargets.map(id => fetch(`/api/files/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusCode: code }),
    })));
    addToast(`Статус изменён: ${FILE_STATUSES[code].label}${fileTargets.length > 1 ? ` (${fileTargets.length})` : ''}`, 'success');
    fetchData();
  };

  const handlePaste = async () => {
    if (!clipboard || clipboard.ids.length === 0) return;
    if (!currentFolderId) {
      addToast('Вставка возможна только внутри раздела «Общий» или «Личный».', 'error');
      return;
    }
    const body = buildCopyBody(clipboard.ids, currentFolderId, clipboard.type === 'cut');
    if (body.ids.length === 0) return;
    await fetch('/api/files/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    addToast(clipboard.type === 'cut' ? 'Элементы перемещены' : 'Элементы скопированы', 'success');
    if (clipboard.type === 'cut') setClipboard(null);
    fetchData();
  };

  useEffect(() => { handleDeleteRef.current = handleDelete; }, [handleDelete]);
  useEffect(() => { handlePasteRef.current = handlePaste; }, [handlePaste]);
  useEffect(() => { navigateToRef.current = navigateTo; }, [navigateTo]);

  const handleDownload = (id: string, isFolder: boolean) => {
    if (isFolder) return;
    const item = allCurrentItems.find(i => i.id === id);
    if (!item) return;
    
    if (!item.content) {
      addToast("Нет содержимого файла для скачивания.", "error");
      return;
    }
    
    const a = document.createElement("a");
    if (item.content.startsWith("data:")) {
      a.href = item.content;
    } else {
      const blob = new Blob([item.content], { type: "text/plain" });
      a.href = URL.createObjectURL(blob);
    }
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const currentFolder = isSectionId(currentFolderId) ? undefined : folders.find(f => f.id === currentFolderId);
  const files = currentFolderId === null
    ? []
    : isSectionId(currentFolderId)
      ? rootFiles.filter((f: any) => itemSection(f) === currentFolderId)
      : (currentFolder?.files || []);
  filesRef.current = files; // для колбэков (двойной клик по зеркалу Конструктора)

  const allCurrentItems = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();

    // Список разделов (корень проводника): «Общий», «Личный», у ГлавАдмина — личные всех
    if (currentFolderId === null && !searchQuery) {
      return sections.map(s => ({ ...s, type: 'Раздел' }));
    }

    // Папки уровня: в корне раздела — папки без родителя из этого раздела
    const childFolders = isSectionId(currentFolderId)
      ? folders.filter(f => !f.parentId && itemSection(f) === currentFolderId)
      : folders.filter(f => f.parentId === currentFolderId);

    // Поиск ограничен текущим разделом (или всеми доступными, если раздел не открыт)
    const searchScope = (it: any) => !currentSectionId || itemSection(it) === currentSectionId;

    const items = [
      ...(searchQuery
        ? folders.filter(f => searchScope(f) && f.name.toLowerCase().includes(searchLower))
        : childFolders
      ).map(f => ({ ...f, isFolder: true })),
      ...(searchQuery
        ? [...rootFiles, ...folders.flatMap(f => f.files || [])].filter((f: any) => searchScope(f) && f.name.toLowerCase().includes(searchLower))
        : files
      ).map((f: any) => ({ ...f, isFolder: false }))
    ];

    items.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;

      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === 'updatedAt') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return items;
  }, [folders, rootFiles, currentFolderId, currentSectionId, sections, searchQuery, sortConfig]);

  useEffect(() => { allCurrentItemsRef.current = allCurrentItems; }, [allCurrentItems]);

  // Сколько ФАЙЛОВ (не папок) выделено — для контекстных кнопок тулбара
  const selectedFileCount = useMemo(
    () => Array.from(selectedIds).filter(id => { const it = allCurrentItems.find(i => i.id === id); return it && !it.isFolder; }).length,
    [selectedIds, allCurrentItems]
  );

  const [paneWidth, setPaneWidth] = useState(800);

  useEffect(() => {
    if (!mainPaneRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPaneWidth(entry.contentRect.width || 800);
      }
    });
    observer.observe(mainPaneRef.current);
    return () => observer.disconnect();
  }, []);

  const listVirtualizer = useVirtualizer({
    count: allCurrentItems.length,
    getScrollElement: () => mainPaneRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const cols = Math.max(1, Math.floor((paneWidth - 32) / 128) || 5);
  const gridRows = React.useMemo(() => {
    const rows = [];
    for (let i = 0; i < allCurrentItems.length; i += cols) {
      rows.push(allCurrentItems.slice(i, i + cols));
    }
    return rows;
  }, [allCurrentItems, cols]);

  const gridVirtualizer = useVirtualizer({
    count: gridRows.length,
    getScrollElement: () => mainPaneRef.current,
    estimateSize: () => 140, // Height of card row + padding gaps
    overscan: 5,
  });

  useEffect(() => {
    listVirtualizer.measure();
    gridVirtualizer.measure();
  }, [viewMode, allCurrentItems.length, cols]);

  const handleDropOnFolder = useCallback(async (ids: string[], targetFolderId: string | null) => {
    if (ids.includes(targetFolderId || '')) return;
    const body = buildCopyBody(ids, targetFolderId, true);
    if (body.ids.length === 0) return;
    await fetch('/api/files/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    fetchData();
  }, [activeProject, user?.id]);

  const handleDragStart = useCallback((e: React.DragEvent, item: any) => {
    if (item.isSection) {
      e.preventDefault();
      return;
    }
    let currentSelected = selectedIdsRef.current;
    if (!currentSelected.has(item.id)) {
      const newSelected = new Set(currentSelected);
      newSelected.add(item.id);
      setSelectedIds(newSelected);
      currentSelected = newSelected;
    }
    const idsToMove = Array.from(currentSelected);
    e.dataTransfer.setData('text/plain', JSON.stringify({ ids: idsToMove, type: 'app_items' }));
  }, []);

  const handleDropItems = useCallback((e: React.DragEvent, targetFolderId: string | null) => {
    const dataStr = e.dataTransfer.getData('text/plain');
    if (dataStr) {
      try {
        const data = JSON.parse(dataStr);
        if (data.type === 'app_items') {
          handleDropOnFolder(data.ids, targetFolderId);
        }
      } catch (err) {}
    }
  }, [handleDropOnFolder]);

  const handleItemClickClean = useCallback((e: React.MouseEvent, id: string, isFile: boolean) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIdsRef.current);
    if (e.ctrlKey || e.metaKey) {
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
    } else if (e.shiftKey && lastSelectedIdRef.current) {
      const startIdx = allCurrentItemsRef.current.findIndex(i => i.id === lastSelectedIdRef.current);
      const endIdx = allCurrentItemsRef.current.findIndex(i => i.id === id);
      if (startIdx !== -1 && endIdx !== -1) {
        newSelected.clear();
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        for (let i = min; i <= max; i++) {
          newSelected.add(allCurrentItemsRef.current[i].id);
        }
      }
    } else {
      newSelected.clear();
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    setLastSelectedId(id);
  }, []);

  const handleItemDoubleClick = useCallback((id: string, isFolder: boolean) => {
    if (isFolder) { navigateToRef.current(id); return; }
    const f = allCurrentItemsRef.current?.find((x: any) => x.id === id);
    // Зеркало документа Конструктора: открываем сам документ
    if (f?.type === 'CONSTRUCTOR' && f?.refId) { navigate(`/constructor?doc=${f.refId}`); return; }
    // Обычный файл: двойной клик ВСЕГДА что-то делает (B1) — выделяем и
    // открываем панель предпросмотра; при отсутствии содержимого — тост
    setSelectedIds(new Set([id]));
    setLastSelectedId(id);
    setShowPreviewPane(true);
    if (!f?.content) addToast('У файла нет сохранённого содержимого (загружен без предпросмотра).', 'info');
  }, [navigate, addToast]);

  const handleItemContextMenu = useCallback((e: React.MouseEvent, id: string, isFile: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    let currentSelected = selectedIdsRef.current;
    if (!currentSelected.has(id)) {
      setSelectedIds(new Set([id]));
      setLastSelectedId(id);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: id, isFile, isSection: isSectionId(id) });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if writing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const selected = selectedIdsRef.current;
      const currFolderId = currentFolderIdRef.current;
      const items = allCurrentItemsRef.current;
      const clip = clipboardRef.current;

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selected.size > 0) {
        setClipboard({ ids: Array.from(selected), type: 'copy' });
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selected.size > 0) {
        setClipboard({ ids: Array.from(selected), type: 'cut' });
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(items.map(i => i.id)));
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clip) {
        handlePasteRef.current();
      } else if (e.key === 'Delete' && selected.size > 0) {
        const deletable = Array.from(selected).filter(id => !isSectionId(id));
        if (deletable.length === 0) return;
        openConfirm("Удаление", `Удалить ${deletable.length} элементов?`).then(confirmed => {
           if (confirmed) {
             deletable.forEach(id => {
               const item = items.find(i => i.id === id);
               const isFile = item ? !item.isFolder : false;
               handleDeleteRef.current(id, isFile);
             });
             setSelectedIds(new Set());
           }
        });
      } else if (e.key === 'F2' && selected.size === 1) {
        const id = Array.from(selected)[0];
        if (isSectionId(id)) return; // встроенные разделы не переименовываются
        setRenamingId(id);
        const item = items.find(i => i.id === id);
        setRenameValue(item?.name || '');
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const lastSelIdx = lastSelectedIdRef.current;
        const currentIdx = items.findIndex(i => i.id === lastSelIdx);
        if (currentIdx < items.length - 1) {
          const nextId = items[currentIdx + 1].id;
          setSelectedIds(new Set([nextId]));
          setLastSelectedId(nextId);
        } else if (items.length > 0 && currentIdx === -1) {
          const nextId = items[0].id;
          setSelectedIds(new Set([nextId]));
          setLastSelectedId(nextId);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const lastSelIdx = lastSelectedIdRef.current;
        const currentIdx = items.findIndex(i => i.id === lastSelIdx);
        if (currentIdx > 0) {
          const prevId = items[currentIdx - 1].id;
          setSelectedIds(new Set([prevId]));
          setLastSelectedId(prevId);
        } else if (items.length > 0 && currentIdx === -1) {
          const prevId = items[items.length - 1].id;
          setSelectedIds(new Set([prevId]));
          setLastSelectedId(prevId);
        }
      } else if (e.key === 'Enter') {
        if (selected.size === 1) {
          const id = Array.from(selected)[0] as string;
          const item = items.find(i => i.id === id);
          if (item?.isFolder) navigateToRef.current(id);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (!currFolderId) return;
        if (isSectionId(currFolderId)) {
          navigateToRef.current(null);
          return;
        }
        const folder = foldersRef.current.find(f => f.id === currFolderId);
        // Из папки на верхнем уровне возвращаемся в её раздел (Общий/Личный)
        const target = folder?.parentId
          || (folder ? (folder.scope === 'PERSONAL' && folder.ownerId ? personalSecId(folder.ownerId) : SEC_SHARED) : null);
        navigateToRef.current(target);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, targetId?: string, isFile?: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (targetId) {
      if (!selectedIds.has(targetId)) {
        setSelectedIds(new Set([targetId]));
        setLastSelectedId(targetId);
      }
      setContextMenu({ x: e.clientX, y: e.clientY, targetId, isFile });
    } else {
      setSelectedIds(new Set());
      setContextMenu({ x: e.clientX, y: e.clientY, isContainer: true });
    }
  };


  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Breadcrumbs
  const getBreadcrumbs = () => {
    const crumbs = [];
    let curr = currentFolder;
    while (curr) {
      crumbs.unshift(curr);
      curr = folders.find(f => f.id === curr.parentId);
    }
    return crumbs;
  };
  const breadcrumbs = getBreadcrumbs();

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const sortedProjectTags = [...projectTags].sort((a, b) => {
    let valA = a[tagSortConfig.key] || '';
    let valB = b[tagSortConfig.key] || '';

    if (tagSortConfig.key === 'createdAt') {
      valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    }

    if (valA < valB) return tagSortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return tagSortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col bg-white dark:bg-dark-bg border border-slate-205 dark:border-dark-border rounded-xl shadow-xs overflow-hidden text-sm transition-all" 
      onClick={() => setSelectedIds(new Set())}
    >
      
      {/* Explorer Top Bar - Like Windows */}
      <div className="flex flex-col bg-slate-100/95 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800">
        {/* Современный компактный тулбар */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-850">
           <button onClick={createFolder} title="Новая папка"
             className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 shadow-xs cursor-pointer">
              <FolderPlus className="w-4 h-4 text-amber-500" /> Папка
           </button>
           <button onClick={() => fileInputRef.current?.click()} title="Загрузить файлы"
             className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm cursor-pointer">
              <Upload className="w-4 h-4" /> Загрузить
           </button>
           <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />

           {selectedFileCount > 0 && (
             <>
               <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1" />
               <button onClick={() => openImportPicker()} title="Загрузить данные выбранных файлов в «Оборудование»"
                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 cursor-pointer">
                  <Boxes className="w-4 h-4" /> В оборудование
               </button>
               <button onClick={() => handleChangeStatus(Array.from(selectedIds)[0])} title="Сменить статус выделенных"
                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer">
                  <Info className="w-4 h-4" /> Статус
               </button>
               <span className="text-[11px] text-slate-400 ml-1">выбрано: {selectedFileCount}</span>
             </>
           )}

           <div className="ml-auto flex items-center gap-2">
             <div className="flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
               <button onClick={() => setViewMode('list')} className={`p-1.5 cursor-pointer ${viewMode === 'list' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-750'}`} title="Списком">
                 <List className="w-4 h-4" />
               </button>
               <button onClick={() => setViewMode('grid')} className={`p-1.5 cursor-pointer ${viewMode === 'grid' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-750'}`} title="Сеткой">
                 <LayoutGrid className="w-4 h-4" />
               </button>
             </div>
             <button onClick={() => setShowPreviewPane(!showPreviewPane)} title="Панель предпросмотра"
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${showPreviewPane ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'}`}>
               <PanelRight className="w-4 h-4" /> Превью
             </button>
           </div>
        </div>
 
        {/* Address Bar Row */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface">
          <div className="flex items-center gap-1 mr-2 text-slate-500 dark:text-dark-text-muted">
            <button onClick={() => goBack()} disabled={explorerHistory.length <= 1} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dark-panel rounded text-slate-700 dark:text-dark-text-main disabled:opacity-30 cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button onClick={() => goForward()} disabled={explorerForward.length === 0} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dark-panel rounded text-slate-700 dark:text-dark-text-main disabled:opacity-30 cursor-pointer">
              <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={handleNavigateUp} disabled={!currentFolderId} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dark-panel rounded text-slate-700 dark:text-dark-text-main disabled:opacity-30 cursor-pointer">
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
 
          <div className="flex-1 flex items-center bg-white dark:bg-dark-panel border border-slate-250 dark:border-dark-border px-2 py-1 rounded-md flex-wrap gap-1 hover:border-emerald-405 transition-colors">
            <Folder className="w-4 h-4 text-yellow-555 mr-2" />
            <span className="cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-surface text-slate-700 dark:text-dark-text-main px-1.5 py-0.5 rounded hover:underline" onClick={() => navigateTo(null)}>{activeProject?.name || 'Общий проводник'}</span>
            {currentSectionId && (
              <>
                <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-655 mx-0.5" />
                <span className="cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-surface text-slate-700 dark:text-dark-text-main px-1.5 py-0.5 rounded hover:underline font-medium" onClick={() => navigateTo(currentSectionId)}>{sectionName(currentSectionId)}</span>
              </>
            )}
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-655 mx-0.5" />
                <span className="cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-surface text-slate-700 dark:text-dark-text-main px-1.5 py-0.5 rounded hover:underline" onClick={() => navigateTo(crumb.id)}>{crumb.name}</span>
              </React.Fragment>
            ))}
          </div>
 
          <div className="relative w-64 ml-2">
           <Search className="w-4 h-4 absolute left-2.5 top-2 text-slate-400 dark:text-dark-text-muted" />
           <input 
             type="text" 
             placeholder={currentFolder ? `Поиск в ${currentFolder.name}` : "Поиск в проводнике"} 
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="pl-8 pr-4 py-1 w-full border border-slate-255 dark:border-dark-border focus:outline-none focus:border-emerald-500 bg-white dark:bg-dark-panel text-slate-800 dark:text-dark-text-main rounded-lg transition-all focus:ring-1 focus:ring-emerald-500/20"
           />
          </div>
        </div>
      </div>



      <div className="flex flex-1 overflow-hidden">
        {/* Tree Sidebar */}
        <div 
          className="w-56 border-r border-slate-200 dark:border-slate-850 bg-slate-50/60 dark:bg-slate-950/40 overflow-y-auto pt-2 flex-shrink-0 select-none scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
            <div
              className={`flex items-center py-1.5 px-3 mx-2 rounded-lg cursor-pointer transition-colors text-slate-700 dark:text-slate-250 ${currentFolderId === null ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 font-medium' : 'hover:bg-slate-200/50 dark:hover:bg-slate-900'}`}
              onClick={() => navigateTo(null)}
            >
              <FileIcon className="w-4 h-4 mr-2 text-slate-500 shrink-0" />
              <span className="text-sm">Проводник</span>
            </div>
            {sections.map(sec => (
              <div key={sec.id}>
                <div
                  className={`flex items-center py-1.5 px-3 mx-2 mt-1 rounded-lg cursor-pointer transition-colors text-slate-700 dark:text-slate-250 ${currentFolderId === sec.id ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 font-medium' : 'hover:bg-slate-200/50 dark:hover:bg-slate-900'}`}
                  onClick={() => navigateTo(sec.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                     e.preventDefault();
                     e.stopPropagation();
                     if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        uploadFiles(e.dataTransfer.files, sec.id);
                     } else {
                        const dataStr = e.dataTransfer.getData('text/plain');
                        if (dataStr) {
                           try {
                              const data = JSON.parse(dataStr);
                              if (data.type === 'app_items') handleMoveItems(data.ids, sec.id);
                           } catch (err) {}
                        }
                     }
                  }}
                  title={sec.id === SEC_SHARED ? 'Общий раздел: файлы видят все пользователи' : 'Личный раздел: файлы видит только владелец'}
                >
                  {getFileIcon({ isSection: true, id: sec.id }, 'w-4 h-4 mr-2 shrink-0')}
                  <span className="text-sm font-medium truncate">{sec.name}</span>
                </div>
                {folders.filter(f => !f.parentId && itemSection(f) === sec.id).map(folder => (
                  <TreeFolder key={folder.id} folder={folder} allFolders={folders} currentFolderId={currentFolderId} onSelect={navigateTo} onDropFiles={uploadFiles} onMoveItems={handleMoveItems} depth={2} />
                ))}
              </div>
            ))}
        </div>

        {/* Main Pane - Table View */}
        <div 
          ref={mainPaneRef}
          className={`flex-1 overflow-y-auto bg-white dark:bg-dark-bg relative select-none scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-850 ${isDragging ? 'bg-emerald-50/10' : ''}`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onDragOver={handleDragOver}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
          onContextMenu={(e) => handleContextMenu(e)}
        >
            {isDragging && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-emerald-500/10 border-2 border-emerald-500 border-dashed m-2 pointer-events-none">
                 <div className="text-emerald-600 font-medium flex items-center gap-2 bg-white/90 dark:bg-slate-950/90 px-4 py-2 rounded-full shadow-sm">
                   <Upload className="w-5 h-5" /> Копировать файлы...
                 </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.table
                  key="skeleton"
                  className="w-full text-left border-collapse select-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <thead className="sticky top-0 bg-white dark:bg-dark-surface shadow-xs border-b border-slate-200 dark:border-dark-border z-10 text-xs text-slate-500 dark:text-dark-text-muted font-medium">
                    <tr>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-default">Имя</th>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-default">Дата изменения</th>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-default">Статус</th>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-default">Размер</th>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-default">Теги</th>
                      <th className="py-2 px-3 font-medium cursor-default">Отдел</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </tbody>
                </motion.table>
              ) : viewMode === 'list' ? (
                <motion.table 
                  key="list"
                  className="w-full text-left border-collapse"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <thead className="sticky top-0 bg-white dark:bg-dark-surface shadow-xs border-b border-slate-200 dark:border-dark-border z-10 text-xs text-slate-500 dark:text-dark-text-muted font-medium">
                    <tr>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-panel" onClick={() => handleSort('name')}>
                        Имя {sortConfig.key === 'name' && (sortConfig.direction==='asc'?'↑':'↓')}
                      </th>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-panel" onClick={() => handleSort('updatedAt')}>
                        Дата изменения {sortConfig.key === 'updatedAt' && (sortConfig.direction==='asc'?'↑':'↓')}
                      </th>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-panel" onClick={() => handleSort('statusCode')}>
                        Статус {sortConfig.key === 'statusCode' && (sortConfig.direction==='asc'?'↑':'↓')}
                      </th>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-panel" onClick={() => handleSort('size')}>
                        Размер {sortConfig.key === 'size' && (sortConfig.direction==='asc'?'↑':'↓')}
                      </th>
                      <th className="py-2 px-3 border-r border-slate-200 dark:border-dark-border font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-panel">Теги</th>
                      <th className="py-2 px-3 font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-panel">Отдел</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allCurrentItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center">
                           <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
                             <div className="w-16 h-16 bg-slate-50 dark:bg-slate-950/60 rounded-full flex items-center justify-center mb-3 text-slate-400 dark:text-slate-500">
                                  {searchQuery ? <Search className="w-8 h-8" /> : <Folder className="w-8 h-8" />}
                             </div>
                             <p className="text-sm">{searchQuery ? "Нет элементов, соответствующих вашему поиску." : "Эта папка пуста."}</p>
                             {!searchQuery && <p className="text-xs pt-1 text-slate-500 dark:text-slate-600">Перетащите файлы сюда или используйте кнопку 'Загрузить'.</p>}
                           </div>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {listVirtualizer.getVirtualItems().length > 0 && (
                          <tr style={{ height: `${listVirtualizer.getVirtualItems()[0].start}px`, border: 'none' }}>
                            <td colSpan={6} style={{ padding: 0, border: 'none' }} />
                          </tr>
                        )}
                        {listVirtualizer.getVirtualItems().map(virtualRow => {
                          const item = allCurrentItems[virtualRow.index];
                          if (!item) return null;
                          const isSelected = selectedIds.has(item.id);
                          const isRenaming = renamingId === item.id;
                          const isCut = clipboard?.type === 'cut' && clipboard.ids.includes(item.id);

                          return (
                            <FileRowItem
                              key={item.id}
                              item={item}
                              index={virtualRow.index}
                              isSelected={isSelected}
                              isRenaming={isRenaming}
                              isCut={isCut}
                              loaded={!item.isFolder ? loadedMap[item.name] : undefined}
                              catLabel={catLabel}
                              renameValue={renameValue}
                              onRenameValueChange={setRenameValue}
                              onRenameSubmit={handleRenameSubmit}
                              onCancelRename={() => setRenamingId(null)}
                              onClick={(e: React.MouseEvent) => handleItemClickClean(e, item.id, !item.isFolder)}
                              onDoubleClick={() => handleItemDoubleClick(item.id, item.isFolder)}
                              onContextMenu={(e: React.MouseEvent) => handleItemContextMenu(e, item.id, !item.isFolder)}
                              onDragStart={(e: React.DragEvent) => handleDragStart(e, item)}
                              onDropItems={handleDropItems}
                              measureElement={listVirtualizer.measureElement}
                              onChangeStatus={handleChangeStatus}
                              onOpenTag={(ident: string) => navigate(`/registry?tag=${encodeURIComponent(ident)}`)}
                            />
                          );
                        })}
                        {listVirtualizer.getVirtualItems().length > 0 && (
                          <tr style={{ height: `${listVirtualizer.getTotalSize() - listVirtualizer.getVirtualItems()[listVirtualizer.getVirtualItems().length - 1].end}px`, border: 'none' }}>
                            <td colSpan={6} style={{ padding: 0, border: 'none' }} />
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </motion.table>
              ) : (
              <motion.div 
                key="grid"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="w-full h-full animate-in fade-in"
              >
               {allCurrentItems.length === 0 ? (
                  <div className="p-4 flex flex-wrap gap-4 items-start content-start">
                    <div className="w-full text-center flex flex-col items-center justify-center py-20 text-slate-400">
                       <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3 text-slate-300">
                           {searchQuery ? <Search className="w-8 h-8" /> : <Folder className="w-8 h-8" />}
                       </div>
                       <p className="text-sm">{searchQuery ? "Нет элементов, соответствующих вашему поиску." : "Эта папка пуста."}</p>
                       {!searchQuery && <p className="text-xs pt-1 text-slate-400">Перетащите файлы сюда или используйте кнопку 'Загрузить'.</p>}
                    </div>
                  </div>
                ) : (
                  <div style={{ height: `${gridVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                    {gridVirtualizer.getVirtualItems().map(virtualRow => {
                      const rowItems = gridRows[virtualRow.index];
                      if (!rowItems) return null;

                      return (
                        <div
                          key={virtualRow.key}
                          ref={gridVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className="flex gap-4 p-4"
                        >
                          {rowItems.map(item => {
                            const isSelected = selectedIds.has(item.id);
                            const isRenaming = renamingId === item.id;
                            const isCut = clipboard?.type === 'cut' && clipboard.ids.includes(item.id);

                            return (
                              <FileCardItem
                                key={item.id}
                                item={item}
                                isSelected={isSelected}
                                isRenaming={isRenaming}
                                isCut={isCut}
                                loaded={!item.isFolder ? loadedMap[item.name] : undefined}
                                catLabel={catLabel}
                                renameValue={renameValue}
                                onRenameValueChange={setRenameValue}
                                onRenameSubmit={handleRenameSubmit}
                                onCancelRename={() => setRenamingId(null)}
                                onClick={(e: React.MouseEvent) => handleItemClickClean(e, item.id, !item.isFolder)}
                                onDoubleClick={() => handleItemDoubleClick(item.id, item.isFolder)}
                                onContextMenu={(e: React.MouseEvent) => handleItemContextMenu(e, item.id, !item.isFolder)}
                                onDragStart={(e: React.DragEvent) => handleDragStart(e, item)}
                                onDropItems={handleDropItems}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
            </AnimatePresence>
        </div>

        {/* Preview Pane */}
        {showPreviewPane && (
          <div className="w-64 border-l border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-surface overflow-y-auto flex flex-col flex-shrink-0">
             {(() => {
                if (selectedIds.size === 0) return <div className="p-4 text-center text-slate-500 dark:text-dark-text-muted text-xs mt-10">Выберите файл для предпросмотра.</div>;
                if (selectedIds.size > 1) return <div className="p-4 text-center text-slate-500 dark:text-dark-text-muted text-xs mt-10">Выбрано элементов: {selectedIds.size}.</div>;

                const id = Array.from(selectedIds)[0];
                const item = allCurrentItems.find(i => i.id === id);
                if (!item) return null;

                if (item.isFolder) {
                  return (
                     <div className="p-4 flex flex-col items-center mt-10">
                       <Folder className="w-16 h-16 text-yellow-500 fill-yellow-200 mb-4" />
                       <h3 className="font-semibold text-slate-800 dark:text-dark-text-main text-center break-words w-full">{item.name}</h3>
                       <p className="text-xs text-slate-500 dark:text-dark-text-muted mt-2">Папка с файлами</p>
                     </div>
                  );
                }

                const isImage = item.type === 'IMAGE' || item.name.match(/\.(jpeg|jpg|gif|png|webp)$/i);
                const isPdf = item.type === 'PDF' || item.name.match(/\.(pdf)$/i);
                const isText = item.type === 'TXT' || item.name.match(/\.(txt|md|json|csv)$/i);

                return (
                  <div className="p-4 flex flex-col">
                     <div className="flex-1 flex items-center justify-center min-h-[240px] max-h-[300px] bg-white dark:bg-dark-panel border border-slate-200 dark:border-dark-border rounded mb-4 overflow-hidden relative shadow-sm">
                        {isImage && item.content ? (
                          <img src={item.content} alt={item.name} className="max-w-full max-h-full object-contain" />
                        ) : isText && item.content ? (
                          // Текст декодируем как UTF-8 в <pre> — iframe с data:text
                          // без charset давал кракозябры на кириллице
                          <pre className="w-full h-full overflow-auto text-left text-[11px] leading-relaxed p-3 text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words font-mono">{decodeTextContent(item.content)}</pre>
                        ) : isPdf && item.content ? (
                          // B5: пустой sandbox ломал встроенный PDF-вьюер
                          <iframe src={item.content} className="w-full h-full border-0 bg-white dark:bg-dark-panel" title={item.name} sandbox="allow-scripts allow-same-origin" />
                        ) : (
                          <div className="text-center text-slate-400 flex flex-col items-center">
                             {getFileIcon(item, "w-12 h-12 mb-2")}
                             <span className="text-xs">{item.type} Файл</span>
                          </div>
                        )}
                     </div>
                     
                     <h3 className="font-semibold text-slate-800 dark:text-dark-text-main mb-2 break-words text-sm">{item.name}</h3>
                     
                     <div className="space-y-2 text-xs mt-2">
                       <div className="flex justify-between border-b border-slate-100 pb-1">
                         <span className="text-slate-500 dark:text-dark-text-muted">Размер</span>
                         <span className="text-slate-800 dark:text-dark-text-main">{formatSize(item.size)}</span>
                       </div>
                       <div className="flex justify-between border-b border-slate-100 pb-1">
                         <span className="text-slate-500 dark:text-dark-text-muted">Тип</span>
                         <span className="text-slate-800 dark:text-dark-text-main flex-1 text-right truncate ml-2">{item.type}</span>
                       </div>
                       <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                         <span className="text-slate-500 dark:text-dark-text-muted">Статус</span>
                         <StatusChip code={item.statusCode} onClick={(e) => { e.stopPropagation(); handleChangeStatus(item.id); }} />
                       </div>
                       <div className="flex justify-between border-b border-slate-100 pb-1">
                         <span className="text-slate-500 dark:text-dark-text-muted">Ревизия</span>
                         <span className="text-slate-800 dark:text-dark-text-main">v{item.revision || '1'}</span>
                       </div>
                       <div className="flex justify-between border-b border-slate-100 pb-1">
                         <span className="text-slate-500 dark:text-dark-text-muted">Дата изменения</span>
                         <span className="text-slate-800 dark:text-dark-text-main">{item.updatedAt ? format(new Date(item.updatedAt), 'dd.MM.yyyy HH:mm') : ''}</span>
                       </div>
                       {item.department && item.department !== "Unassigned" && (
                       <div className="flex justify-between border-b border-slate-100 pb-1">
                         <span className="text-slate-500 dark:text-dark-text-muted">Отдел</span>
                         <span className="text-slate-800 font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-1.5 py-0.5 rounded">{item.department}</span>
                       </div>
                       )}
                       {((item.mainTags && item.mainTags.length > 0) || (item.additionalTags && item.additionalTags.length > 0)) && (
                       <div className="flex flex-col border-b border-slate-100 pb-1 pt-1">
                         <span className="text-slate-500 dark:text-dark-text-muted mb-1.5">Назначенные теги</span>
                         <div className="flex flex-wrap gap-1">
                           {item.mainTags?.map((t:any) => <span key={t.id} className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-xs font-bold font-mono border border-yellow-200" title="Основной тег">{t.identifier}</span>)}
                           {item.additionalTags?.map((t:any) => <span key={t.id} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-xs font-mono border border-slate-200" title="Дополнительный тег">{t.identifier}</span>)}
                         </div>
                       </div>
                       )}
                     </div>
                  </div>
                );
             })()}
          </div>
        )}
      </div>

      {/* StatusBar */}
      <div className="h-6 bg-[#F3F4F6] dark:bg-dark-surface border-t border-slate-300 dark:border-dark-border flex items-center px-4 text-xs text-slate-600 dark:text-dark-text-muted gap-4 flex-shrink-0">
          <span>{allCurrentItems.length} элементов</span>
          {selectedIds.size > 0 && <span>выбрано: {selectedIds.size}</span>}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#F2F2F2] dark:bg-dark-panel border border-slate-300 dark:border-dark-border shadow-md py-1 min-w-[220px] text-xs text-slate-800 dark:text-dark-text-main rounded-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isSection ? (
            <>
              <MenuItem icon={<Folder />} label="Открыть" onClick={() => { navigateTo(contextMenu.targetId!); setContextMenu(null); }} />
              <MenuItem icon={<RefreshCw />} label="Обновить" onClick={() => { fetchData(); setContextMenu(null); }} />
              <div className="h-px bg-slate-300 dark:bg-dark-border my-1 mx-2" />
              <div className="px-6 py-1 text-[10px] text-slate-400 select-none">Встроенный раздел: нельзя удалить или переименовать</div>
            </>
          ) : contextMenu.isContainer ? (
            <>
              {/* «Создать» — как в Windows: правый клик по пустому месту */}
              <div className="px-6 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">Создать</div>
              <MenuItem icon={<FolderPlus />} label="Папку" onClick={() => { createFolder(); setContextMenu(null); }} />
              <MenuItem icon={<Grid3X3 />} label="Таблицу (Excel)" onClick={() => { createConstructorDoc('DOC'); setContextMenu(null); }} />
              <MenuItem icon={<FileText />} label="Документ (Word)" onClick={() => { createConstructorDoc('TEXT'); setContextMenu(null); }} />
              <MenuItem icon={<FileIcon />} label="Текстовый файл (.txt)" onClick={() => { createEmptyFile("Новый документ.txt", "TXT", ""); setContextMenu(null); }} />
              <div className="h-px bg-slate-300 dark:bg-dark-border my-1 mx-2" />
              <MenuItem icon={<Upload />} label="Загрузить" onClick={() => { fileInputRef.current?.click(); setContextMenu(null); }} />
              {clipboard && (
                 <MenuItem icon={<Copy />} label="Вставить" onClick={() => { handlePaste(); setContextMenu(null); }} />
              )}
              <MenuItem icon={<RefreshCw />} label="Обновить" onClick={() => { fetchData(); setContextMenu(null); }} />
            </>
          ) : (
            <>
              {contextMenu.targetId && currentFolderId !== contextMenu.targetId && !contextMenu.isFile && (
                <MenuItem icon={<Folder />} label="Открыть" onClick={() => { navigateTo(contextMenu.targetId!); setContextMenu(null); }} />
              )}
              {contextMenu.isFile && (
                <>
                  {canEditInConstructor(allCurrentItems.find(i => i.id === contextMenu.targetId)?.name || '') && (
                    <MenuItem
                      icon={<Grid3X3 />}
                      label="Редактировать копию в Конструкторе"
                      onClick={() => { editCopyInConstructor(contextMenu.targetId!); setContextMenu(null); }}
                    />
                  )}
                  <MenuItem icon={<Boxes />} label="В оборудование…" onClick={() => { openImportPicker(contextMenu.targetId!); setContextMenu(null); }} />
                  <div className="h-px bg-slate-300 dark:bg-dark-border my-1 mx-2" />
                  <MenuItem icon={<Download />} label="Скачать" onClick={() => { handleDownload(contextMenu.targetId!, false); setContextMenu(null); }} />
                  <MenuItem icon={<Tag />} label="Назначить теги..." onClick={() => { handleAssignTag(contextMenu.targetId!); setContextMenu(null); }} />
                  <MenuItem icon={<Shield />} label="Назначить отдел..." onClick={() => { handleAssignDepartment(contextMenu.targetId!); setContextMenu(null); }} />
                  <MenuItem icon={<Info />} label="Статус документа..." onClick={() => { handleChangeStatus(contextMenu.targetId!); setContextMenu(null); }} />
                </>
              )}
              <div className="h-px bg-slate-300 dark:bg-dark-border my-1 mx-2" />
              <MenuItem icon={<Scissors />} label="Вырезать" onClick={() => { setClipboard({ ids: Array.from(selectedIds), type: 'cut' }); setContextMenu(null); }} />
              <MenuItem icon={<Copy />} label="Копировать" onClick={() => { setClipboard({ ids: Array.from(selectedIds), type: 'copy' }); setContextMenu(null); }} />
              {clipboard && !contextMenu.isFile && (
                <MenuItem icon={<ClipboardPaste />} label="Вставить" onClick={() => { handlePaste(); setContextMenu(null); }} />
              )}
              <MenuItem icon={<Edit2 />} label="Переименовать" onClick={() => { 
                const isF = contextMenu.isFile;
                setRenamingId(contextMenu.targetId!); 
                const item = isF ? files.find(f=>f.id===contextMenu.targetId) : folders.find(f=>f.id===contextMenu.targetId);
                setRenameValue(item?.name || ''); 
                setContextMenu(null); 
              }} />
              <MenuItem icon={<Info />} label="Свойства" onClick={() => {
                const isF = contextMenu.isFile;
                const item = isF ? files.find(f=>f.id===contextMenu.targetId) : folders.find(f=>f.id===contextMenu.targetId);
                if (item) setPropertiesModal({ item, isFile: !!isF });
                setContextMenu(null);
              }} />
              <MenuItem icon={<Trash2 />} label="Удалить" onClick={() => { 
                handleDelete(contextMenu.targetId!, !!contextMenu.isFile); setContextMenu(null); 
              }} />
            </>
          )}
        </div>
      )}

      {uploadProgress && (
        <div className="absolute bottom-10 right-6 bg-white rounded-lg shadow-xl border border-slate-200 w-80 overflow-hidden z-50">
           <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
             <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
               <Upload className="w-4 h-4 text-emerald-500 animate-bounce" /> Загрузка файлов
             </h3>
             <span className="text-xs font-medium text-slate-500">{uploadProgress.current} из {uploadProgress.total}</span>
           </div>
           <div className="p-4">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                 <div 
                    className="bg-emerald-600 h-2 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
                 />
              </div>
              <p className="text-xs text-slate-500 mt-2 text-right">{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</p>
           </div>
        </div>
      )}

      {propertiesModal && (
        <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-md flex items-center justify-center z-50" onClick={() => setPropertiesModal(null)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-lg shadow-xl border border-slate-200 w-[420px] max-w-full overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
              {getFileIcon(propertiesModal.item, "w-6 h-6")}
              <h2 className="text-base font-semibold text-slate-900">Свойства</h2>
            </div>
            
            <form onSubmit={async (e: any) => {
              e.preventDefault();
              const newName = e.target.name.value;
              const newRevision = e.target.revision ? e.target.revision.value : undefined;
              const endpoint = propertiesModal.isFile ? `/api/files/${propertiesModal.item.id}` : `/api/folders/${propertiesModal.item.id}`;
              
              await fetch(endpoint, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  name: newName, 
                  ...(propertiesModal.isFile && newRevision !== undefined ? { revision: newRevision } : {}),
                  updatedById: user?.id
                })
              });
              
              setPropertiesModal(null);
              fetchData();
              addToast('Свойства обновлены', 'success');
            }} className="flex-1 overflow-y-auto p-5 space-y-4">
              
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Имя</label>
                <input type="text" name="name" defaultValue={propertiesModal.item.name} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" required />
              </div>

              {propertiesModal.isFile && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Ревизия</label>
                  <input type="text" name="revision" defaultValue={propertiesModal.item.revision || "1"} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                </div>
              )}

              <div className="h-px bg-slate-100 my-2" />

              <div className="space-y-2 text-sm">
                {!propertiesModal.isFile && (
                  <div className="flex">
                    <span className="w-32 text-slate-500">Тип:</span>
                    <span className="text-slate-900">Папка с файлами</span>
                  </div>
                )}
                
                {propertiesModal.isFile && (
                  <>
                    <div className="flex">
                      <span className="w-32 text-slate-500">Тип файла:</span>
                      <span className="text-slate-900">{propertiesModal.item.type}</span>
                    </div>
                    <div className="flex">
                      <span className="w-32 text-slate-500">Приложение:</span>
                      <span className="text-slate-900">
                        {propertiesModal.item.type === 'PDF' ? 'PDF Reader' : 
                         propertiesModal.item.type === 'TXT' ? 'Блокнот' : 
                         propertiesModal.item.type === 'IMAGE' ? 'Фотографии' : 'Неизвестно'}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-32 text-slate-500">Размер:</span>
                      <span className="text-slate-900">{formatSize(propertiesModal.item.size)}</span>
                    </div>
                  </>
                )}
                
                <div className="h-px bg-slate-50 my-2" />

                <div className="flex">
                  <span className="w-32 text-slate-500">Создан:</span>
                  <span className="text-slate-900">{propertiesModal.item.createdAt ? format(new Date(propertiesModal.item.createdAt), 'dd.MM.yyyy HH:mm:ss') : 'Неизвестно'}</span>
                </div>
                <div className="flex">
                  <span className="w-32 text-slate-500">Изменен:</span>
                  <span className="text-slate-900">{propertiesModal.item.updatedAt ? format(new Date(propertiesModal.item.updatedAt), 'dd.MM.yyyy HH:mm:ss') : 'Неизвестно'}</span>
                </div>
                
                <div className="h-px bg-slate-50 my-2" />

                <div className="flex">
                  <span className="w-32 text-slate-500">Создатель:</span>
                  <span className="text-slate-900">{propertiesModal.item.createdBy?.name || 'Неизвестно'}</span>
                </div>
                <div className="flex">
                  <span className="w-32 text-slate-500">Изменил:</span>
                  <span className="text-slate-900">{propertiesModal.item.updatedBy?.name || 'Неизвестно'}</span>
                </div>

              </div>

              <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setPropertiesModal(null)} className="px-4 py-2 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-sm cursor-pointer">
                  Отмена
                </button>
                <button type="submit" className="px-4 py-2 text-white bg-emerald-600 rounded hover:bg-emerald-700 text-sm cursor-pointer">
                  Применить
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {assignTagModal && (
        <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-md flex items-center justify-center z-50" onClick={() => setAssignTagModal(null)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-lg shadow-xl border border-slate-200 w-[500px] max-w-full overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-805 bg-slate-50 dark:bg-slate-950 flex items-center gap-3">
              <Tag className="w-5 h-5 text-emerald-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Назначение тегов</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-sm text-slate-600 mb-2">Выберите основные и дополнительные теги для файла из реестра тегов проекта.</p>
              
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Сортировка</span>
                <div className="flex bg-slate-100 rounded p-0.5">
                  <button onClick={() => setTagSortConfig({ key: 'createdAt', direction: tagSortConfig.key === 'createdAt' && tagSortConfig.direction === 'desc' ? 'asc' : 'desc'})} className={`px-2 py-1 text-xs rounded transition-colors ${tagSortConfig.key === 'createdAt' ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'}`}>
                    По дате {tagSortConfig.key === 'createdAt' && (tagSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </button>
                  <button onClick={() => setTagSortConfig({ key: 'identifier', direction: tagSortConfig.key === 'identifier' && tagSortConfig.direction === 'asc' ? 'desc' : 'asc'})} className={`px-2 py-1 text-xs rounded transition-colors ${tagSortConfig.key === 'identifier' ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'}`}>
                    По имени {tagSortConfig.key === 'identifier' && (tagSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </button>
                  <button onClick={() => setTagSortConfig({ key: 'department', direction: tagSortConfig.key === 'department' && tagSortConfig.direction === 'asc' ? 'desc' : 'asc'})} className={`px-2 py-1 text-xs rounded transition-colors ${tagSortConfig.key === 'department' ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'}`}>
                    По отделу {tagSortConfig.key === 'department' && (tagSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded p-2 space-y-1">
                {sortedProjectTags.length === 0 ? <p className="text-sm text-slate-500 py-2 text-center">Нет тегов в реестре.</p> : (
                  sortedProjectTags.map(tag => (
                    <div key={tag.id} className="flex items-center justify-between text-sm py-1 hover:bg-slate-50 px-2 rounded">
                      <div>
                        <span className="font-medium text-slate-800 block">{tag.identifier}</span>
                        {tag.department && <span className="text-xs text-slate-500">{tag.department}</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={assignTagModal.mainTags.includes(tag.id)}
                            onChange={(e) => {
                              setAssignTagModal(prev => {
                                if (!prev) return prev;
                                const newMain = e.target.checked ? [...prev.mainTags, tag.id] : prev.mainTags.filter(id => id !== tag.id);
                                const newAdd = e.target.checked ? prev.additionalTags.filter(id => id !== tag.id) : prev.additionalTags;
                                return { ...prev, mainTags: newMain, additionalTags: newAdd };
                              });
                            }}
                          />
                          <span>Основной</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={assignTagModal.additionalTags.includes(tag.id)}
                            onChange={(e) => {
                              setAssignTagModal(prev => {
                                if (!prev) return prev;
                                const newAdd = e.target.checked ? [...prev.additionalTags, tag.id] : prev.additionalTags.filter(id => id !== tag.id);
                                const newMain = e.target.checked ? prev.mainTags.filter(id => id !== tag.id) : prev.mainTags;
                                return { ...prev, mainTags: newMain, additionalTags: newAdd };
                              });
                            }}
                          />
                          <span>Дополнит.</span>
                        </label>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
              <button type="button" onClick={() => setAssignTagModal(null)} className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 text-sm">
                Отмена
              </button>
              <button 
                type="button" 
                onClick={async () => {
                  await fetch(`/api/files/${assignTagModal.fileId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                       mainTagIds: assignTagModal.mainTags, 
                       additionalTagIds: assignTagModal.additionalTags,
                       updatedById: user?.id
                    })
                  });
                  setAssignTagModal(null);
                  fetchData();
                  addToast('Теги обновлены', 'success');
                }}
                className="px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 rounded text-sm cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Выбор категории оборудования для импорта выделенных файлов */}
      {importPreview && (
        <EquipmentImportPreview
          fileIds={importPreview.fileIds}
          category={importPreview.category}
          categoryLabel={catLabel(importPreview.category)}
          projectId={activeProject?.id || 'default'}
          onClose={() => { setImportPreview(null); Promise.all([fetchData(), loadEquipMap()]); }}
          onDone={({ files, conflicts }) => {
            setImportPreview(null);
            Promise.all([fetchData(), loadEquipMap()]);
            if (conflicts > 0) addToast(`Импортировано (файлов: ${files}). Расхождений значений: ${conflicts} — нажмите для разрешения.`, 'error', () => navigate('/equipment'));
            else addToast(`Данные импортированы в оборудование (файлов: ${files}).`, 'success');
          }}
        />
      )}

      {importPickerFiles && (
        <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-md flex items-center justify-center z-[70]" onClick={() => setImportPickerFiles(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-dark-panel rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border w-[min(94vw,460px)] max-h-[88vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 dark:border-dark-border bg-slate-50 dark:bg-dark-surface flex items-center gap-3">
              <Boxes className="w-5 h-5 text-emerald-600" />
              <div className="flex flex-col">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Загрузить в оборудование</h2>
                <span className="text-xs text-slate-500 dark:text-dark-text-muted">Выбрано файлов: {importPickerFiles.length}. Выберите категорию:</span>
              </div>
            </div>
            <div className="p-3 overflow-y-auto scrollbar-thin grid grid-cols-1 gap-1.5">
              {equipCats.map(c => (
                <button
                  key={c.id}
                  onClick={() => importFilesToCategory(importPickerFiles, c.id)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-400 transition-colors text-left cursor-pointer"
                >
                  <span className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
                    <Boxes className="w-5 h-5 text-emerald-600 dark:text-emerald-300" />
                  </span>
                  <span className="text-sm font-medium text-slate-800 dark:text-dark-text-main">{c.label}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-dark-border bg-slate-50 dark:bg-dark-surface">
              <button type="button" onClick={() => setImportPickerFiles(null)} className="px-4 py-2 text-slate-700 dark:text-slate-300 bg-white dark:bg-dark-panel border border-slate-300 dark:border-dark-border rounded-lg hover:bg-slate-50 dark:hover:bg-dark-surface text-sm cursor-pointer">
                Отмена
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

// Subcomponents

const MenuItem = ({ icon, label, onClick, className = '' }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-6 py-1 hover:bg-[#91C9F7] dark:hover:bg-dark-surface/80 transition-colors text-slate-800 dark:text-dark-text-main focus:outline-none ${className}`}>
    {React.cloneElement(icon, { className: 'w-4 h-4 text-slate-600 dark:text-dark-text-muted' })}
    <span>{label}</span>
  </button>
);

const TreeFolder = ({ folder, allFolders, currentFolderId, onSelect, depth = 1, onDropFiles, onMoveItems }: any) => {
  const children = allFolders.filter((f: any) => f.parentId === folder.id);
  const [expanded, setExpanded] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const isSelected = currentFolderId === folder.id;

  return (
    <div>
      <div 
        onClick={() => onSelect(folder.id)}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
        onDrop={async (e) => {
           e.preventDefault();
           e.stopPropagation();
           setIsDragOver(false);
           if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              onDropFiles(e.dataTransfer.files, folder.id);
           } else {
             const dataStr = e.dataTransfer.getData('text/plain');
             if (dataStr) {
               try {
                 const data = JSON.parse(dataStr);
                 if (data.type === 'app_items') {
                   if (data.ids.includes(folder.id)) return;
                   onMoveItems(data.ids, folder.id);
                 }
               } catch (err) {}
             }
           }
        }}
        className={`flex items-center py-1.5 px-2 mx-2 rounded-lg cursor-pointer transition-colors text-slate-700 dark:text-slate-300 ${isDragOver ? 'bg-emerald-200 dark:bg-emerald-950/45' : isSelected ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 font-medium' : 'hover:bg-slate-200/50 dark:hover:bg-slate-900'}`}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <div 
           className="w-4 h-4 flex items-center justify-center hover:bg-slate-300/50"
           onClick={(e) => { if(children.length) { e.stopPropagation(); setExpanded(!expanded); } }}
        >
          {children.length > 0 ? (expanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />) : <span className="w-3 h-3" />}
        </div>
        <Folder className={`w-4 h-4 mr-2 flex-shrink-0 ${isSelected ? 'text-yellow-600 fill-yellow-200' : 'text-yellow-500 fill-yellow-100'}`} />
        <span className="truncate text-xs select-none">{folder.name}</span>
      </div>
      {expanded && children.map((child: any) => (
        <TreeFolder key={child.id} folder={child} allFolders={allFolders} currentFolderId={currentFolderId} onSelect={onSelect} depth={depth + 1} onDropFiles={onDropFiles} onMoveItems={onMoveItems} />
      ))}
    </div>
  );
};

const SkeletonRow = () => (
  <tr className="animate-pulse border-b border-slate-100 dark:border-slate-800">
    <td className="py-2.5 px-3 flex items-center gap-2">
      <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-40 animate-pulse" />
    </td>
    <td className="py-2.5 px-3">
      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-28 animate-pulse" />
    </td>
    <td className="py-2.5 px-3">
      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-20 animate-pulse" />
    </td>
    <td className="py-2.5 px-3">
      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-16 animate-pulse" />
    </td>
    <td className="py-2.5 px-3">
      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-24 animate-pulse" />
    </td>
    <td className="py-2.5 px-3">
      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-16 animate-pulse" />
    </td>
  </tr>
);

const FileRowItem = React.memo(({
  item,
  index,
  isSelected,
  isRenaming,
  isCut,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onCancelRename,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDropItems,
  measureElement,
  loaded,
  catLabel,
  onChangeStatus,
  onOpenTag
}: any) => {
  return (
    <tr
      ref={measureElement}
      data-index={index}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (item.isFolder) {
           e.preventDefault();
           e.currentTarget.classList.add('bg-emerald-100');
        }
      }}
      onDragLeave={(e) => {
         if (item.isFolder) e.currentTarget.classList.remove('bg-emerald-100');
      }}
      onDrop={(e) => {
         if (!item.isFolder) return;
         e.preventDefault();
         e.stopPropagation();
         e.currentTarget.classList.remove('bg-emerald-100');
         onDropItems(e, item.id);
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`cursor-default transition-colors ${isSelected ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100' : 'hover:bg-slate-100 dark:hover:bg-dark-panel/65'} ${isCut ? 'opacity-50' : ''}`}
    >
      <td className="py-1.5 px-3 flex items-center gap-2">
        <div className="relative shrink-0">
           {getFileIcon(item, "w-5 h-5")}
           {!item.isFolder && item.statusCode && (
              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-dark-bg ${statusOf(item.statusCode).dot}`} title={statusOf(item.statusCode).label} />
           )}
        </div>
        {isRenaming ? (
          <input
            type="text"
            autoFocus
            value={renameValue}
            onChange={e => onRenameValueChange(e.target.value)}
            onBlur={() => onRenameSubmit(item.id, !item.isFolder, renameValue)}
            onKeyDown={e => {
              if (e.key === 'Enter') onRenameSubmit(item.id, !item.isFolder, renameValue);
              if (e.key === 'Escape') onCancelRename();
            }}
            onClick={e => e.stopPropagation()}
            className="border border-emerald-405 px-1 py-0 text-sm outline-none w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white select-text"
          />
        ) : (
          <span className="truncate max-w-[200px] text-slate-800 dark:text-slate-100">{item.name}</span>
        )}
        {loaded && !isRenaming && (
          <span
            className="ml-1 inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
            title={`Данные загружены в оборудование: ${catLabel(loaded.category)} (ревизия v${loaded.version})`}
          >
            <Boxes className="w-3 h-3" /> v{loaded.version}
          </span>
        )}
      </td>
      <td className="py-1.5 px-3 text-sm text-slate-500 dark:text-dark-text-muted whitespace-nowrap">{item.updatedAt ? format(new Date(item.updatedAt), 'dd.MM.yyyy HH:mm') : ''}</td>
      <td className="py-1.5 px-3 text-sm">{!item.isFolder ? <StatusChip code={item.statusCode} onClick={onChangeStatus ? (e) => { e.stopPropagation(); onChangeStatus(item.id); } : undefined} /> : <span className="text-slate-400 text-xs">Папка</span>}</td>
      <td className="py-1.5 px-3 text-sm text-slate-500 dark:text-dark-text-muted text-right whitespace-nowrap">{!item.isFolder ? formatSize(item.size) : ''}</td>
      <td className="py-1.5 px-3">
         <div className="flex flex-wrap gap-1">
           {!item.isFolder && (item.mainTags || []).map((t: any) => (
             <span key={t.id} onClick={onOpenTag ? (e) => { e.stopPropagation(); onOpenTag(t.identifier); } : undefined}
               className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 ${onOpenTag ? 'cursor-pointer hover:brightness-95' : ''}`} title={`Основной тег ${t.identifier}`}>{t.identifier}</span>
           ))}
           {!item.isFolder && (item.additionalTags || []).map((t: any) => (
             <span key={t.id} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" title={`Доп. тег ${t.identifier}`}>{t.identifier}</span>
           ))}
         </div>
      </td>
      <td className="py-1.5 px-3 text-xs text-slate-500 dark:text-dark-text-muted">{!item.isFolder && item.department !== 'Unassigned' ? item.department : ''}</td>
    </tr>
  );
});

const FileCardItem = React.memo(({
  item,
  isSelected,
  isRenaming,
  isCut,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onCancelRename,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDropItems,
  loaded,
  catLabel
}: any) => {
  const isImage = item.type === 'IMAGE' || (item.name && item.name.match(/\.(jpeg|jpg|gif|png|webp)$/i));
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (item.isFolder) {
          e.preventDefault();
          e.currentTarget.classList.add('bg-emerald-100');
        }
      }}
      onDragLeave={(e) => {
          if (item.isFolder) e.currentTarget.classList.remove('bg-emerald-150');
      }}
      onDrop={(e) => {
         if (!item.isFolder) return;
         e.preventDefault();
         e.stopPropagation();
         e.currentTarget.classList.remove('bg-emerald-100');
         onDropItems(e, item.id);
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`w-28 flex flex-col items-center gap-2 p-2 rounded border border-transparent cursor-default transition-all ${isSelected ? 'bg-emerald-105 dark:bg-emerald-950/35 border-emerald-300 dark:border-emerald-800' : 'hover:bg-slate-100 dark:hover:bg-dark-panel hover:border-slate-200 dark:hover:border-dark-border'} ${isCut ? 'opacity-50' : ''}`}
    >
       <div className="w-16 h-16 flex items-center justify-center relative select-none">
         {item.isFolder ? (
           <Folder className="w-16 h-16 text-yellow-500 fill-yellow-250 shrink-0" />
         ) : isImage && item.content ? (
           <img src={item.content} alt={item.name} className="max-w-full max-h-full object-cover rounded shadow-xs border border-slate-200" referrerPolicy="no-referrer" />
         ) : (
           getFileIcon(item, "w-12 h-12")
         )}
         {!item.isFolder && item.statusCode && (
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white dark:ring-dark-bg ${statusOf(item.statusCode).dot}`} title={statusOf(item.statusCode).label} />
         )}
         {loaded && (
            <span
              className="absolute -top-1 -right-1 inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded-full bg-emerald-600 text-white shadow"
              title={`Данные загружены в оборудование: ${catLabel(loaded.category)} (ревизия v${loaded.version})`}
            >
              <Boxes className="w-2.5 h-2.5" />v{loaded.version}
            </span>
         )}
       </div>
       
       {isRenaming ? (
         <input 
           type="text"
           autoFocus
           value={renameValue}
           onChange={e => onRenameValueChange(e.target.value)}
           onBlur={() => onRenameSubmit(item.id, !item.isFolder, renameValue)}
           onKeyDown={e => {
             if (e.key === 'Enter') onRenameSubmit(item.id, !item.isFolder, renameValue);
             if (e.key === 'Escape') onCancelRename();
           }}
           onClick={e => e.stopPropagation()}
           className="border border-emerald-405 px-1 py-0 text-sm outline-none w-full text-center mt-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-white select-text"
         />
       ) : (
         <span className="text-sm font-medium text-slate-700 dark:text-slate-200 text-center line-clamp-2 break-all">{item.name}</span>
       )}
    </div>
  );
});
