import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { dataService } from '../services/dataService';
import { 
  Network, 
  List, 
  Table, 
  Plus, 
  Trash2, 
  Edit2, 
  Link2, 
  X, 
  ChevronRight, 
  ChevronDown, 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Info, 
  HelpCircle, 
  Activity, 
  Sparkles, 
  ZoomIn, 
  ZoomOut, 
  RefreshCw,
  FolderTree,
  FileSpreadsheet,
  Eye,
  ArrowRight,
  ClipboardCheck,
  Check,
  Edit,
  Sliders
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import CustomSelect from '../components/CustomSelect';

const actualitySelectOptions = [
  { value: 'actual', label: '🟢 Актуально' },
  { value: 'warning', label: '🟡 Проверить' },
  { value: 'critical', label: '🔴 Критично' },
  { value: 'info', label: '🔵 В работе' },
  { value: 'draft', label: '⚪ Устарело' }
];

const emojiOptions = [
  { value: 'actual', label: '🟢' },
  { value: 'warning', label: '🟡' },
  { value: 'critical', label: '🔴' },
  { value: 'info', label: '🔵' },
  { value: 'draft', label: '⚪' }
];

interface DescriptionItem {
  id: string;
  text: string;
  comment: string;
  status: 'actual' | 'warning' | 'critical' | 'info' | 'draft';
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

interface ParsedMetadata {
  x: number;
  y: number;
  mainName?: string;
  parentId?: string;
  connections: string[]; // List of tag IDs this tag has peer-connections with
  descriptions: DescriptionItem[];
  dynamicFields?: Record<string, string>;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  tagSegments?: string[];
  markSegments?: string[];
}

interface PortHover {
  tagId: string;
  side: 'left' | 'right';
}

interface ActiveConnectionDrag {
  sourceId: string;
  side: 'left' | 'right';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export default function Registry() {
  const { activeProject, theme, user } = useStore();
  const { addToast } = useToastStore();
  const [tags, setTags] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'board' | 'tree' | 'segments' | 'table' | 'equipment'>('board');
  const [isLoading, setIsLoading] = useState(false);

  // Equipment tree and specs integration
  const [systems, setSystems] = useState<any[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [isSystemsLoading, setIsSystemsLoading] = useState(false);
  const [bindingBlock, setBindingBlock] = useState<{ id: string, name: string, tags: any[] } | null>(null);
  const [tagSearchText, setTagSearchText] = useState('');

  // Board cards expanded states
  const [expandedCardIds, setExpandedCardIds] = useState<{ [tagId: string]: boolean }>({});

  // Sub-description inline editing state
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [modalStatusInput, setModalStatusInput] = useState<string>('actual');
  const [editDescForm, setEditDescForm] = useState<{
    text: string;
    comment: string;
    status: DescriptionItem['status'];
  }>({ text: '', comment: '', status: 'actual' });
  
  // Infinite Canvas Navigation (Zoom & Pan)
  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 80, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggedTagId, setDraggedTagId] = useState<string | null>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  
  // Real-time Dynamo Revit Connection Wires
  const [activeConnectionDrag, setActiveConnectionDrag] = useState<ActiveConnectionDrag | null>(null);
  const [hoveredPort, setHoveredPort] = useState<PortHover | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);

  const [selectedConnection, setSelectedConnection] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<{ sourceId: string; targetId: string } | null>(null);

  // Performance-optimized Refs
  const cardPositionsRef = useRef<Record<string, { x: number, y: number }>>({});
  const activeConnectionDragRef = useRef<any>(null);
  const reconnectingConnectionRef = useRef<{ sourceId: string, targetId: string } | null>(null);
  const animatingRef = useRef<boolean>(false);
  const zoomRef = useRef<number>(0.9);
  const panRef = useRef<{ x: number, y: number }>({ x: 80, y: 50 });

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    const positions: Record<string, { x: number, y: number }> = {};
    for (const t of tags) {
      const meta = parseTagMetadata(t);
      positions[t.id] = { x: meta.x, y: meta.y };
    }
    cardPositionsRef.current = positions;
  }, [tags]);

  // Update direct line positioning during drags
  const updateLinePathDOM = (sourceId: string, targetId: string, sX: number, sY: number, tX: number, tY: number) => {
    const startX = sX + 330;
    const startY = sY + 22;
    const endX = tX;
    const endY = tY + 22;

    const dx = Math.abs(endX - startX);
    const ctrlOffset = Math.max(100, dx * 0.45);
    const pathData = `M ${startX} ${startY} C ${startX + ctrlOffset} ${startY}, ${endX - ctrlOffset} ${endY}, ${endX} ${endY}`;

    const linePath = document.getElementById(`path-${sourceId}-${targetId}`);
    if (linePath) {
      linePath.setAttribute('d', pathData);
    }
    const linePathOverlay = document.getElementById(`path-overlay-${sourceId}-${targetId}`);
    if (linePathOverlay) {
      linePathOverlay.setAttribute('d', pathData);
    }
    const flowDot = document.getElementById(`flow-dot-${sourceId}-${targetId}`);
    if (flowDot) {
      const animateNode = flowDot.querySelector('animateMotion');
      if (animateNode) {
        animateNode.setAttribute('path', pathData);
      }
    }
  };

  // Handle keyboard Delete and Backspace for selected connection path
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedConnection) {
          e.preventDefault();
          handleRemoveConnection(selectedConnection.sourceId, selectedConnection.targetId);
          setSelectedConnection(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedConnection, tags]);

  // Pre-calculate tag positions and connections for high performance
  const tagsById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const t of tags) {
      map[t.id] = t;
    }
    return map;
  }, [tags]);

  // Filter/Search
  const [searchQuery, setSearchQuery] = useState('');

  // Sort state for Table View
  const [sortConfig, setSortConfig] = useState<{key: string; direction: 'asc' | 'desc'}>({ key: 'createdAt', direction: 'desc' });

  // Detail Modal / Sidebar editor
  const [editingTag, setEditingTag] = useState<any | null>(null);

  // Inline comments creation state
  const [quickDescText, setQuickDescText] = useState<{ [tagId: string]: string }>({});
  const [quickCommentText, setQuickCommentText] = useState<{ [tagId: string]: string }>({});
  const [quickStatus, setQuickStatus] = useState<{ [tagId: string]: DescriptionItem['status'] }>({});

  // Tree view expanded states
  const [expandedTagIds, setExpandedTagIds] = useState<{ [tagId: string]: boolean }>({});
  const [showTreeDescriptions, setShowTreeDescriptions] = useState<{ [tagId: string]: boolean }>({});
  const [showTableDescriptions, setShowTableDescriptions] = useState<{ [tagId: string]: boolean }>({});
  const [showOptionalTableColumns, setShowOptionalTableColumns] = useState(false);

  // Quick manually create tag
  const [newTagIdentifier, setNewTagIdentifier] = useState('');
  const [newTagMainName, setNewTagMainName] = useState('');
  const [newTagDepartment, setNewTagDepartment] = useState('Отдел КИПиА');
  const [newTagFluid, setNewTagFluid] = useState('Воздух');
  const [newTagActuality, setNewTagActuality] = useState<'actual' | 'warning' | 'critical' | 'info' | 'draft'>('info');
  const [showAdvancedCreation, setShowAdvancedCreation] = useState(false);
  const [dynamicCategorySelections, setDynamicCategorySelections] = useState<Record<string, string>>({});

  // Brand (Марка) Creation & Editing States
  const [newTagBrand, setNewTagBrand] = useState('');
  const [newTagMarkingSelections, setNewTagMarkingSelections] = useState<Record<string, string>>({});
  const [newTagMarkingSeparator, setNewTagMarkingSeparator] = useState('-');

  const [editTagBrand, setEditTagBrand] = useState('');
  const [editTagMarkingSelections, setEditTagMarkingSelections] = useState<Record<string, string>>({});
  const [editTagMarkingSeparator, setEditTagMarkingSeparator] = useState('-');

  useEffect(() => {
    if (editingTag) {
      setEditTagBrand(editingTag.brand || '');
      setEditTagMarkingSelections({});
      setEditTagMarkingSeparator('-');
    }
  }, [editingTag]);

  const handleDynamicCategoryChange = (catId: string, val: string) => {
    setDynamicCategorySelections(prev => ({
      ...prev,
      [catId]: val
    }));
  };

  // Cyrillic layout warning and char blocker
  const handleTagIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/[а-яА-ЯёЁ]/.test(val)) {
      addToast("Смените раскладку! Ввод тегов разрешен только на латинице.", "error");
      return;
    }
    setNewTagIdentifier(val);
  };

  const matchingSuggestions = useMemo(() => {
    if (!newTagIdentifier) return [];
    const searchVal = newTagIdentifier.trim().toLowerCase();
    const prefix = tags.filter(t => t.identifier.toLowerCase().startsWith(searchVal));
    const sub = tags.filter(t => !t.identifier.toLowerCase().startsWith(searchVal) && t.identifier.toLowerCase().includes(searchVal));
    return [...prefix, ...sub].slice(0, 8);
  }, [newTagIdentifier, tags]);

  // Text Extractor Tool State
  const [pastedDocText, setPastedDocText] = useState('');
  const [extractedTags, setExtractedTags] = useState<{ identifier: string; exists: boolean }[]>([]);

  // Regex splitting utility
  const splitSegments = useCallback((str: string): string[] => {
    if (!str) return [];
    return str.split(/[-.,\/ ]+/).filter(Boolean);
  }, []);

  // Independent segment filters for Tag (left) and Mark (right)
  const [activeTagFilters, setActiveTagFilters] = useState<{ [position: number]: string }>({});
  const [activeMarkFilters, setActiveMarkFilters] = useState<{ [position: number]: string }>({});
  
  const [tagSearchQueries, setTagSearchQueries] = useState<{ [position: number]: string }>({});
  const [markSearchQueries, setMarkSearchQueries] = useState<{ [position: number]: string }>({});

  const [tagDictBindings, setTagDictBindings] = useState<{ [position: number]: string }>({});
  const [markDictBindings, setMarkDictBindings] = useState<{ [position: number]: string }>({});

  const [tagHierarchySelections, setTagHierarchySelections] = useState<{ [position: number]: any }>({});
  const [markHierarchySelections, setMarkHierarchySelections] = useState<{ [position: number]: any }>({});

  const [selectedTagFilterCategoryIds, setSelectedTagFilterCategoryIds] = useState<{ [position: number]: string }>({});
  const [selectedMarkFilterCategoryIds, setSelectedMarkFilterCategoryIds] = useState<{ [position: number]: string }>({});

  const [addedTagSegmentsCount, setAddedTagSegmentsCount] = useState<number>(0);
  const [addedMarkSegmentsCount, setAddedMarkSegmentsCount] = useState<number>(0);

  const [dictionaries, setDictionaries] = useState<any[]>([]);

  const [excludeEmptyWBS, setExcludeEmptyWBS] = useState(false);
  const [onlyWithWarning, setOnlyWithWarning] = useState(false);
  const [exportColumns, setExportColumns] = useState({
    identifier: true,
    brand: true,
    brandParts: true,
    department: true,
    fluid: true,
    parts: true,
    chain: true,
    descriptions: true
  });

  // Load all tags
  const loadTags = async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      const data = await dataService.getTags(activeProject.id);
      const tagsList = data.tags || [];
      const tagsWithParsedMetadata = tagsList.map((t: any) => ({
        ...t,
        parsedMetadata: parseTagMetadata(t)
      }));
      setTags(tagsWithParsedMetadata);
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDictionaries = async () => {
    if (!activeProject) return;
    try {
      const data = await dataService.getDictionaries(activeProject.id);
      setDictionaries(data.dictionaries || []);
    } catch (err) {
      console.error('Failed to load dictionaries:', err);
    }
  };

  useEffect(() => {
    if (dictionaries && dictionaries.length > 0) {
      const configDict = dictionaries.find(d => d.name === '__tag_creation_config__');
      if (configDict) {
        const cats = (configDict.items || [])
          .filter((i: any) => !i.parentId)
          .sort((a: any, b: any) => a.code.localeCompare(b.code));
        const initialSelections: Record<string, string> = {};
        cats.forEach((cat: any) => {
          const options = (configDict.items || [])
            .filter((i: any) => i.parentId === cat.id)
            .sort((a: any, b: any) => a.nameRu.localeCompare(b.nameRu));
          if (options.length > 0) {
            initialSelections[cat.id] = options[0].nameRu;
          } else {
            initialSelections[cat.id] = "";
          }
        });
        setDynamicCategorySelections(initialSelections);
      }
    }
  }, [dictionaries]);

  const loadSystems = async () => {
    if (!activeProject) return;
    setIsSystemsLoading(true);
    try {
      const data = await dataService.getSystems(activeProject.id);
      const loaded = data.systems || [];
      setSystems(loaded);
      if (loaded.length > 0 && !selectedSystemId) {
        setSelectedSystemId(loaded[0].id);
      }
    } catch (err) {
      console.error('Failed to load systems:', err);
    } finally {
      setIsSystemsLoading(false);
    }
  };

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
          descriptions: [{ id: 'auto', text: 'Создан при привязке к спецификации', comment: `Блок: ${bindingBlock?.name}`, status: 'info' }]
        };
        const res = await dataService.createTag(activeProject.id, {
          identifier: identifier.trim(),
          department: 'Отдел КИПиА',
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

  useEffect(() => {
    loadTags();
    loadDictionaries();
    loadSystems();
  }, [activeProject]);

  useEffect(() => {
    if (activeTab === 'equipment') {
      loadSystems();
    }
  }, [activeTab]);

  // Handle Zooming with Mouse Wheel
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();
      const zoomIntensity = 0.05;
      const rect = board.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setZoom((currentZoom) => {
        const newZoom = Math.min(2.5, Math.max(0.15, currentZoom + (e.deltaY < 0 ? 1 : -1) * zoomIntensity * currentZoom));
        
        setPan((currentPan) => {
          const canvasX = (mouseX - currentPan.x) / currentZoom;
          const canvasY = (mouseY - currentPan.y) / currentZoom;
          return {
            x: mouseX - canvasX * newZoom,
            y: mouseY - canvasY * newZoom
          };
        });

        return newZoom;
      });
    };

    board.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      board.removeEventListener('wheel', handleWheelEvent);
    };
  }, []);

  const splitCache = useRef<Record<string, string[]>>({});
  // Split Tag into parts using multiple separators (/ - . \)
  const splitTagIntoParts = useCallback((identifier: string): string[] => {
    if (!identifier) return [];
    if (splitCache.current[identifier]) return splitCache.current[identifier];
    // Split by dash, dot, slash, backslash, underscore
    const result = identifier.split(/[\-\.\/\\_]+/).filter(Boolean);
    splitCache.current[identifier] = result;
    return result;
  }, []);

  // Check if standard tag exists
  const checkTagExists = (identifier: string): boolean => {
    if (!identifier) return false;
    const norm = identifier.trim().toLowerCase();
    return tags.some(t => t.identifier.trim().toLowerCase() === norm);
  };

  // Extract tags from raw documentation text
  const handleExtractTagsText = () => {
    if (!pastedDocText) {
      setExtractedTags([]);
      return;
    }

    // Match patterns that look like components with separators
    // e.g. 3700-C01-HVC-001 or 01/AHU-001 or TE.101 etc.
    // Minimum length 4 characters, containing at least one of the separators
    const regex = /([a-zA-Z0-9А-Яа-яЁё]+(?:[\-\.\/\\_][a-zA-Z0-9А-Яа-яЁё]+)+)/g;
    const matches = pastedDocText.match(regex) || [];
    
    // De-duplicate
    const uniqueMatches: string[] = Array.from(new Set(matches.map(m => m.trim()))) as string[];
    
    const evaluated = uniqueMatches.map((identifier: string) => ({
      identifier,
      exists: checkTagExists(identifier)
    }));
    
    setExtractedTags(evaluated);
  };

  // Fast register extracted tag from text tool
  const handleQuickRegisterExtracted = async (identifier: string) => {
    if (!activeProject || checkTagExists(identifier)) return;
    try {
      const dropX = (300 - pan.x) / zoom;
      const dropY = (250 - pan.y) / zoom;

      const initialMeta: ParsedMetadata = {
        x: dropX,
        y: dropY + (tags.length * 15),
        connections: [],
        descriptions: [
          { id: 'ext1', text: 'Зарегистрирован из текста', comment: 'Быстрый импорт через текстовый инспектор.', status: 'info' }
        ]
      };

      const res = await fetch(`/api/projects/${activeProject.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          department: 'Технологический отдел',
          fluid: 'Автодетект',
          wbs: 'WBS-EXTRACTED',
          metadata: JSON.stringify(initialMeta)
        })
      });

      if (res.ok) {
        await loadTags();
        // Update live extractor checklist
        setExtractedTags(prev => prev.map(t => t.identifier === identifier ? { ...t, exists: true } : t));
      }
    } catch (err) {
      console.error('Failed to quick register tag:', err);
    }
  };

  // Safe parse metadata
  const parseTagMetadata = (tag: any): ParsedMetadata => {
    if (!tag) {
      return {
        x: Math.floor(Math.random() * 550 + 80),
        y: Math.floor(Math.random() * 320 + 80),
        connections: [],
        descriptions: []
      };
    }
    if (tag.parsedMetadata) {
      return tag.parsedMetadata;
    }
    try {
      if (tag.metadata) {
        const parsed = typeof tag.metadata === 'string' ? JSON.parse(tag.metadata) : tag.metadata;
        const res: ParsedMetadata = {
          ...parsed,
          x: parsed.x !== undefined ? parsed.x : Math.floor(Math.random() * 500 + 100),
          y: parsed.y !== undefined ? parsed.y : Math.floor(Math.random() * 300 + 100),
          parentId: parsed.parentId,
          connections: Array.isArray(parsed.connections) ? parsed.connections : [],
          descriptions: Array.isArray(parsed.descriptions) ? parsed.descriptions : []
        };
        tag.parsedMetadata = res;
        return res;
      }
    } catch (e) {
      console.error('Error parsing tag metadata:', e);
    }
    const fallback: ParsedMetadata = {
      x: Math.floor(Math.random() * 550 + 80),
      y: Math.floor(Math.random() * 320 + 80),
      connections: [],
      descriptions: []
    };
    tag.parsedMetadata = fallback;
    return fallback;
  };

  // Get consolidated actuality status of a Tag based on worst-case sub-description status
  const getTagOverallStatus = (tag: any): 'actual' | 'warning' | 'critical' | 'info' | 'draft' => {
    const meta = parseTagMetadata(tag);
    if (!meta.descriptions || meta.descriptions.length === 0) {
      return 'draft';
    }
    if (meta.descriptions.some(d => d.status === 'critical')) return 'critical';
    if (meta.descriptions.some(d => d.status === 'warning')) return 'warning';
    if (meta.descriptions.some(d => d.status === 'info')) return 'info';
    if (meta.descriptions.some(d => d.status === 'actual')) return 'actual';
    return 'draft';
  };

  // Human date formatting with safety check
  const formatDateStr = (isoString?: string): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${day}.${month}.${year} ${hours}:${mins}`;
    } catch {
      return '';
    }
  };

  // Safe save metadata to database
  const saveTagMetadata = async (tagId: string, metadata: ParsedMetadata) => {
    try {
      setTags(prev => prev.map(t => t.id === tagId ? { ...t, parsedMetadata: metadata, metadata: JSON.stringify(metadata) } : t));

      await fetch(`/api/tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: JSON.stringify(metadata)
        })
      });
    } catch (err) {
      console.error('Failed to save tag metadata:', err);
    }
  };

  // Seed demo data loop (using standard separators as requested)
  const handleSeedDemoData = async () => {
    if (!activeProject) return;
    setIsLoading(true);
    try {
      for (const t of tags) {
        await fetch(`/api/tags/${t.id}`, { method: 'DELETE' });
      }

      // 1. Ventilation master
      const ahuMetadata: ParsedMetadata = {
        x: 100,
        y: 180,
        connections: [],
        descriptions: [
          { id: '1', text: 'Приточный вентилятор SF-1', comment: 'Вибрационный контроль в норме.', status: 'actual' },
          { id: '2', text: 'Калорифер водяного нагрева HE-1', comment: 'Выявлен изгиб датчиков крепления.', status: 'warning' }
        ]
      };
      const rAhu = await fetch(`/api/projects/${activeProject.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: '3700-C01-AHU-001',
          department: 'Технологический отдел',
          fluid: 'Воздух',
          wbs: 'WBS-VENT-1',
          metadata: JSON.stringify(ahuMetadata)
        })
      });
      const { tag: tagAhu } = await rAhu.json();

      // 2. Motor Fan Component (the BLM that the user specified)
      const blmMetadata: ParsedMetadata = {
        x: 480,
        y: 120,
        parentId: tagAhu.id,
        connections: [tagAhu.id],
        descriptions: [
          { id: '3', text: 'Асинхронный двигатель вентилятора', comment: 'Маркировка BLM. Измеренная температура подшипников 42C.', status: 'actual' }
        ]
      };
      const rBlm = await fetch(`/api/projects/${activeProject.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: '3700-C01-BLM-001',
          department: 'Электротехнический отдел',
          fluid: 'Электрокабели',
          wbs: 'WBS-VENT-2',
          metadata: JSON.stringify(blmMetadata)
        })
      });
      const { tag: tagBlm } = await rBlm.json();

      // Update Ahu master with BLM reference
      ahuMetadata.connections = [tagBlm.id];
      await saveTagMetadata(tagAhu.id, ahuMetadata);

      // 3. Motor Fan #2 (BLM-002)
      const blm2Metadata: ParsedMetadata = {
        x: 480,
        y: 360,
        parentId: tagAhu.id,
        connections: [tagAhu.id],
        descriptions: [
          { id: '23', text: 'Резервный двигатель вентилятора В-2', comment: 'Шифр BLM. Режим ожидания активен.', status: 'actual' }
        ]
      };
      const rBlm2 = await fetch(`/api/projects/${activeProject.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: '3700-E02-BLM-002',
          department: 'Электротехнический отдел',
          fluid: 'Электрокабели',
          wbs: 'WBS-VENT-3',
          metadata: JSON.stringify(blm2Metadata)
        })
      });
      const { tag: tagBlm2 } = await rBlm2.json();

      // 4. Component Junction Box
      const jbMetadata: ParsedMetadata = {
        x: 880,
        y: 200,
        parentId: tagBlm.id,
        connections: [tagBlm.id],
        descriptions: [
          { id: '4', text: 'Клеммная коробка двигателя JB', comment: 'Пылевлагозащита обеспечена.', status: 'actual' },
          { id: '5', text: 'Кабельные гермовводы', comment: 'Ревизия прокладок успешна.', status: 'actual' }
        ]
      };
      await fetch(`/api/projects/${activeProject.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: '3700-C01-BLM-JB-01',
          department: 'Отдел КИПиА',
          fluid: 'Сигналы',
          wbs: 'WBS-AUTO-5',
          metadata: JSON.stringify(jbMetadata)
        })
      });

      await loadTags();
    } catch (err) {
      console.error('Failed to seed demo tags data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Node Drag Start
  const handleTagMouseDown = (e: React.MouseEvent, tagId: string, currentMeta: ParsedMetadata) => {
    if (e.button !== 0) return; // Left mouse only
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('.no-drag') || target.closest('.connection-port')) return;

    e.preventDefault();
    e.stopPropagation();
    setDraggedTagId(tagId);
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  // Port Drag-to-Connect Wire (includes high performance reconnect/detach)
  const handlePortMouseDown = (e: React.MouseEvent, tagId: string, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();

    const tag = tagsById[tagId];
    if (!tag) return;
    const meta = parseTagMetadata(tag);

    // Detach and reconnect feature for existing incoming connections (left port)
    if (side === 'left' && meta.parentId) {
      const parentId = meta.parentId;
      const parentTag = tagsById[parentId];
      if (parentTag) {
        const parentMeta = parseTagMetadata(parentTag);
        const portX = parentMeta.x + 330;
        const portY = parentMeta.y + 22;

        const rect = boardRef.current?.getBoundingClientRect();
        const mouseX = rect ? e.clientX - rect.left : portX;
        const mouseY = rect ? e.clientY - rect.top : portY;
        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        const canvasX = rect ? (mouseX - currentPan.x) / currentZoom : portX;
        const canvasY = rect ? (mouseY - currentPan.y) / currentZoom : portY;

        const dragData = {
          sourceId: parentId,
          side: 'right', // Start from parent and follow mouse
          startX: portX,
          startY: portY,
          currentX: canvasX,
          currentY: canvasY,
          reconnectTargetId: tagId
        };

        setActiveConnectionDrag(dragData);
        activeConnectionDragRef.current = dragData;
        reconnectingConnectionRef.current = { sourceId: parentId, targetId: tagId };

        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
    }

    const portX = side === 'left' ? meta.x : meta.x + 330;
    const portY = meta.y + 22; 

    const rect = boardRef.current?.getBoundingClientRect();
    const mouseX = rect ? e.clientX - rect.left : portX;
    const mouseY = rect ? e.clientY - rect.top : portY;
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const canvasX = rect ? (mouseX - currentPan.x) / currentZoom : portX;
    const canvasY = rect ? (mouseY - currentPan.y) / currentZoom : portY;

    const dragData = {
      sourceId: tagId,
      side,
      startX: portX,
      startY: portY,
      currentX: canvasX,
      currentY: canvasY
    };

    setActiveConnectionDrag(dragData);
    activeConnectionDragRef.current = dragData;

    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  // Unified MouseMove for Canvas Panning, Node Dragging and Connection Dragging
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!boardRef.current) return;

    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;

    if (draggedTagId) {
      const dx = (e.clientX - lastMousePosRef.current.x) / currentZoom;
      const dy = (e.clientY - lastMousePosRef.current.y) / currentZoom;

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      const pos = cardPositionsRef.current[draggedTagId] || { x: 0, y: 0 };
      const newX = pos.x + dx;
      const newY = pos.y + dy;
      cardPositionsRef.current[draggedTagId] = { x: newX, y: newY };

      // Request animation frame for smooth visual update
      if (!animatingRef.current) {
        animatingRef.current = true;
        requestAnimationFrame(() => {
          animatingRef.current = false;
          
          // 1. Direct card DOM manipulation
          const cardEl = document.getElementById(`tag-card-${draggedTagId}`);
          if (cardEl) {
            cardEl.style.transform = `translate(${newX}px, ${newY}px)`;
          }

          // 2. Direct lines DOM manipulation (all lines connected to this card)
          const targetTag = tagsById[draggedTagId];
          if (targetTag) {
            const tempMeta = parseTagMetadata(targetTag);
            
            // Outgoing lines from this card to its children (Right Port)
            const currentConnections = tempMeta.connections || [];
            currentConnections.forEach((childId: string) => {
              const childTag = tagsById[childId];
              if (childTag) {
                const childPos = cardPositionsRef.current[childId] || parseTagMetadata(childTag);
                updateLinePathDOM(draggedTagId, childId, newX, newY, childPos.x, childPos.y);
              }
            });

            // Incoming line from its parent to this card (Left Port)
            const parentId = tempMeta.parentId;
            if (parentId) {
              const parentTag = tagsById[parentId];
              if (parentTag) {
                const parentPos = cardPositionsRef.current[parentId] || parseTagMetadata(parentTag);
                updateLinePathDOM(parentId, draggedTagId, parentPos.x, parentPos.y, newX, newY);
              }
            }
          }
        });
      }

    } else if (activeConnectionDragRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const canvasX = (mouseX - currentPan.x) / currentZoom;
      const canvasY = (mouseY - currentPan.y) / currentZoom;

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      activeConnectionDragRef.current.currentX = canvasX;
      activeConnectionDragRef.current.currentY = canvasY;

      // Update active connection line in DOM
      requestAnimationFrame(() => {
        const pathEl = document.getElementById('active-drag-path');
        if (pathEl && activeConnectionDragRef.current) {
          const { startX, startY, currentX, currentY, side } = activeConnectionDragRef.current;
          const dx = Math.abs(currentX - startX);
          const ctrlOffset = Math.max(90, dx * 0.45);
          let cp1_x = startX;
          let cp2_x = currentX;

          if (side === 'right') {
            cp1_x = startX + ctrlOffset;
            cp2_x = currentX - ctrlOffset;
          } else {
            cp1_x = startX - ctrlOffset;
            cp2_x = currentX + ctrlOffset;
          }

          const pathData = `M ${startX} ${startY} C ${cp1_x} ${startY}, ${cp2_x} ${currentY}, ${currentX} ${currentY}`;
          pathEl.setAttribute('d', pathData);
          pathEl.style.display = 'block';
        }
      });

    } else if (isPanning) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
  };

  // Unified MouseUp finishing events
  const handleCanvasMouseUp = async () => {
    if (draggedTagId) {
      const finalPos = cardPositionsRef.current[draggedTagId];
      if (finalPos) {
        const tag = tagsById[draggedTagId];
        if (tag) {
          const currentMeta = parseTagMetadata(tag);
          const finalMeta = {
            ...currentMeta,
            x: finalPos.x,
            y: finalPos.y
          };
          await saveTagMetadata(draggedTagId, finalMeta);
        }
      }
      setDraggedTagId(null);
    }

    if (activeConnectionDragRef.current) {
      const { sourceId, reconnectTargetId } = activeConnectionDragRef.current;
      
      if (hoveredPort && hoveredPort.tagId !== sourceId) {
        const destId = hoveredPort.tagId;
        const sourceTag = tagsById[sourceId];
        const destTag = tagsById[destId];

        if (sourceTag && destTag) {
          const sourceMeta = { ...parseTagMetadata(sourceTag) };
          const destMeta = { ...parseTagMetadata(destTag) };

          // If reconnect target exists, let's remove from old target first
          if (reconnectTargetId && reconnectTargetId !== destId) {
            sourceMeta.connections = sourceMeta.connections.filter(id => id !== reconnectTargetId);
            
            const oldTargetTag = tagsById[reconnectTargetId];
            if (oldTargetTag) {
              const oldTargetMeta = { ...parseTagMetadata(oldTargetTag) };
              if (oldTargetMeta.parentId === sourceId) {
                oldTargetMeta.parentId = undefined;
                await saveTagMetadata(reconnectTargetId, oldTargetMeta);
              }
            }
          }

          destMeta.parentId = sourceId;
          if (!sourceMeta.connections.includes(destId)) {
            sourceMeta.connections = [...sourceMeta.connections, destId];
          }

          await saveTagMetadata(sourceId, sourceMeta);
          await saveTagMetadata(destId, destMeta);
        }
      } else {
        // Empty space release
        if (reconnectTargetId) {
          if (window.confirm("Удалить связь или возвратить её в исходное положение? Нажмите ОК для УДАЛЕНИЯ, Отмена для ВОЗВРАТА.")) {
            const sourceTag = tagsById[sourceId];
            if (sourceTag) {
              const sourceMeta = { ...parseTagMetadata(sourceTag) };
              sourceMeta.connections = sourceMeta.connections.filter(id => id !== reconnectTargetId);
              await saveTagMetadata(sourceId, sourceMeta);
            }

            const oldTargetTag = tagsById[reconnectTargetId];
            if (oldTargetTag) {
              const oldTargetMeta = { ...parseTagMetadata(oldTargetTag) };
              if (oldTargetMeta.parentId === sourceId) {
                oldTargetMeta.parentId = undefined;
                await saveTagMetadata(reconnectTargetId, oldTargetMeta);
              }
            }
          }
        }
      }

      // Hide active dragging path
      const pathEl = document.getElementById('active-drag-path');
      if (pathEl) {
        pathEl.style.display = 'none';
        pathEl.setAttribute('d', '');
      }

      reconnectingConnectionRef.current = null;
      setActiveConnectionDrag(null);
      activeConnectionDragRef.current = null;
    }

    setIsPanning(false);
  };

  const handleRemoveConnection = async (sourceId: string, targetId: string) => {
    const tag = tagsById[sourceId];
    if (!tag) return;

    const meta = { ...parseTagMetadata(tag) };
    meta.connections = meta.connections.filter(id => id !== targetId);
    if (meta.parentId === targetId) {
      meta.parentId = undefined;
    }

    await saveTagMetadata(sourceId, meta);
  };

  const fitCanvasToCenter = () => {
    setZoom(0.85);
    setPan({ x: 120, y: 80 });
  };

  // Form description mechanics
  const handleAddDescription = async (tagId: string, text: string, comment: string, status: DescriptionItem['status'] = 'actual') => {
    if (!text) return;
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;

    const meta = parseTagMetadata(tag);
    const newDesc: DescriptionItem = {
      id: Date.now().toString(),
      text,
      comment,
      status,
      createdBy: user?.name || user?.login || 'Пользователь',
      createdAt: new Date().toISOString()
    };
    meta.descriptions = [...meta.descriptions, newDesc];
    meta.updatedBy = user?.name || user?.login || 'Пользователь';
    meta.updatedAt = new Date().toISOString();

    await saveTagMetadata(tagId, meta);

    setQuickDescText(prev => ({ ...prev, [tagId]: '' }));
    setQuickCommentText(prev => ({ ...prev, [tagId]: '' }));
    setQuickStatus(prev => ({ ...prev, [tagId]: 'actual' }));

    if (editingTag && editingTag.id === tagId) {
      setEditingTag({ ...tag, metadata: JSON.stringify(meta) });
    }
  };

  const handleRemoveDescription = async (tagId: string, descId: string) => {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;

    const meta = parseTagMetadata(tag);
    meta.descriptions = meta.descriptions.filter(d => d.id !== descId);
    meta.updatedBy = user?.name || user?.login || 'Пользователь';
    meta.updatedAt = new Date().toISOString();

    await saveTagMetadata(tagId, meta);

    if (editingTag && editingTag.id === tagId) {
      setEditingTag({ ...tag, metadata: JSON.stringify(meta) });
    }
  };

  const handleUpdateMainName = async (tagId: string, name: string) => {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;

    const meta = parseTagMetadata(tag);
    meta.mainName = name;
    meta.updatedBy = user?.name || user?.login || 'Пользователь';
    meta.updatedAt = new Date().toISOString();

    await saveTagMetadata(tagId, meta);

    if (editingTag && editingTag.id === tagId) {
      setEditingTag({ ...tag, metadata: JSON.stringify(meta) });
    }
  };

  const handleUpdateDynamicFields = async (tagId: string, updatedFields: Record<string, string>) => {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;

    const meta = { ...parseTagMetadata(tag) };
    meta.dynamicFields = {
      ...(meta.dynamicFields || {}),
      ...updatedFields
    };

    // Determine if any updated fields affect DB columns department / fluid
    const configDict = dictionaries.find(d => d.name === '__tag_creation_config__');
    const cats = configDict
      ? (configDict.items || [])
          .filter((i: any) => !i.parentId)
          .sort((a: any, b: any) => a.code.localeCompare(b.code))
      : [];

    let updatedDepartment = tag.department;
    let updatedFluid = tag.fluid;

    cats.forEach((cat: any) => {
      const val = meta.dynamicFields?.[cat.nameRu];
      if (val !== undefined) {
        const lowName = cat.nameRu.toLowerCase();
        const lowCode = cat.code.toLowerCase();
        if (lowCode.includes('dep') || lowName.includes('дисциплина') || lowName.includes('отдел')) {
          updatedDepartment = val;
        } else if (lowCode.includes('fluid') || lowName.includes('среда') || lowName.includes('свойство') || lowName.includes('fluid')) {
          updatedFluid = val;
        }
      }
    });

    try {
      setTags(prev => prev.map(t => t.id === tagId ? { 
        ...t, 
        department: updatedDepartment,
        fluid: updatedFluid,
        parsedMetadata: meta, 
        metadata: JSON.stringify(meta) 
      } : t));

      const res = await fetch(`/api/tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: updatedDepartment,
          fluid: updatedFluid,
          metadata: JSON.stringify(meta)
        })
      });

      if (!res.ok) throw new Error("Sync failed");
      const data = await res.json();

      if (editingTag && editingTag.id === tagId) {
        setEditingTag(data.tag ? { ...data.tag, parsedMetadata: meta } : { ...tag, department: updatedDepartment, fluid: updatedFluid, metadata: JSON.stringify(meta), parsedMetadata: meta });
      }
    } catch (err) {
      console.error("Error updating dynamic fields:", err);
    }
  };


  const handleUpdateBrand = async (tagId: string, value: string) => {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;

    try {
      setTags(prev => prev.map(t => t.id === tagId ? { 
        ...t, 
        brand: value
      } : t));

      const res = await fetch(`/api/tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: value
        })
      });

      if (!res.ok) throw new Error("Sync failed");
      const data = await res.json();

      if (editingTag && editingTag.id === tagId) {
        setEditingTag(prev => prev ? { ...prev, brand: value } : null);
      }
    } catch (err) {
      console.error("Error updating brand:", err);
    }
  };

  const handleUpdateDescriptionStatus = async (tagId: string, descId: string, newStatus: DescriptionItem['status']) => {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;

    const meta = parseTagMetadata(tag);
    meta.descriptions = meta.descriptions.map(d => 
      d.id === descId 
        ? { 
            ...d, 
            status: newStatus, 
            updatedBy: user?.name || user?.login || 'Пользователь', 
            updatedAt: new Date().toISOString() 
          } 
        : d
    );
    meta.updatedBy = user?.name || user?.login || 'Пользователь';
    meta.updatedAt = new Date().toISOString();

    await saveTagMetadata(tagId, meta);

    if (editingTag && editingTag.id === tagId) {
      setEditingTag({ ...tag, metadata: JSON.stringify(meta) });
    }
  };

  const handleUpdateDescription = async (tagId: string, descId: string, fields: Partial<DescriptionItem>) => {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;

    const meta = parseTagMetadata(tag);
    meta.descriptions = meta.descriptions.map(d => {
      if (d.id === descId) {
        return {
          ...d,
          ...fields,
          updatedBy: user?.name || user?.login || 'Пользователь',
          updatedAt: new Date().toISOString()
        };
      }
      return d;
    });
    meta.updatedBy = user?.name || user?.login || 'Пользователь';
    meta.updatedAt = new Date().toISOString();

    await saveTagMetadata(tagId, meta);

    if (editingTag && editingTag.id === tagId) {
      setEditingTag({ ...tag, metadata: JSON.stringify(meta) });
    }
  };

  // Manual fast tag create with verification
  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagIdentifier || !newTagBrand.trim() || !activeProject) {
      addToast("Ошибка: Заполните обязательные поля Tag и Mark!", "error");
      return;
    }

    if (checkTagExists(newTagIdentifier)) {
      alert(`⚠️ Тег c идентификатором "${newTagIdentifier}" уже существует в реестре!`);
      return;
    }

    try {
      const dropX = (300 - pan.x) / zoom;
      const dropY = (200 - pan.y) / zoom;

      const configDict = dictionaries.find(d => d.name === '__tag_creation_config__');
      const cats = configDict
        ? (configDict.items || [])
            .filter((i: any) => !i.parentId)
            .sort((a: any, b: any) => a.code.localeCompare(b.code))
        : [];

      let finalDepartment = newTagDepartment;
      let finalFluid = newTagFluid || 'Воздух';
      const finalDynamicFields: Record<string, string> = {};

      cats.forEach((cat: any) => {
        const value = dynamicCategorySelections[cat.id] || '';
        finalDynamicFields[cat.nameRu] = value;

        const lowName = cat.nameRu.toLowerCase();
        const lowCode = cat.code.toLowerCase();
        if (lowCode.includes('dep') || lowName.includes('дисциплина') || lowName.includes('отдел')) {
          finalDepartment = value;
        } else if (lowCode.includes('fluid') || lowName.includes('среда') || lowName.includes('свойство') || lowName.includes('fluid')) {
          finalFluid = value;
        }
      });

      const initialMeta: ParsedMetadata = {
        x: dropX,
        y: dropY,
        connections: [],
        descriptions: [
          {
            id: 'desc-' + Math.random().toString(36).substr(2, 9),
            text: 'Первичный статус',
            comment: 'Установлено при создании тега',
            status: newTagActuality,
            createdBy: user?.name || user?.login || 'Пользователь',
            createdAt: new Date().toISOString()
          }
        ],
        mainName: newTagMainName.trim(),
        dynamicFields: finalDynamicFields,
        createdBy: user?.name || user?.login || 'Пользователь',
        createdAt: new Date().toISOString(),
        tagSegments: splitSegments(newTagIdentifier.trim()),
        markSegments: splitSegments(newTagBrand.trim())
      };

      const res = await fetch(`/api/projects/${activeProject.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: newTagIdentifier.trim(),
          department: finalDepartment,
          fluid: finalFluid,
          wbs: '',
          brand: newTagBrand.trim() || null,
          metadata: JSON.stringify(initialMeta)
        })
      });

      if (res.ok) {
        setNewTagIdentifier('');
        setNewTagMainName('');
        setNewTagBrand('');
        setNewTagMarkingSelections({});
        // reset to default status 'info' (В работе)
        setNewTagActuality('info');
        loadTags();
      }
    } catch (err) {
      console.error('Failed to create tag manually:', err);
    }
  };

  // Delete Node tag completely
  const handleDeleteTag = async (tagId: string) => {
    if (!window.confirm('Вы действительно хотите навсегда удалить этот тег и все его связи?')) return;
    try {
      for (const otherTag of tags) {
        if (otherTag.id === tagId) continue;
        const otherMeta = parseTagMetadata(otherTag);
        let updated = false;
        if (otherMeta.connections.includes(tagId)) {
          otherMeta.connections = otherMeta.connections.filter(id => id !== tagId);
          updated = true;
        }
        if (otherMeta.parentId === tagId) {
          otherMeta.parentId = undefined;
          updated = true;
        }
        if (updated) {
          await saveTagMetadata(otherTag.id, otherMeta);
        }
      }

      await fetch(`/api/tags/${tagId}`, { method: 'DELETE' });
      setEditingTag(null);
      loadTags();
    } catch (err) {
      console.error('Failed to delete tag:', err);
    }
  };

  // Re-assign logical parenting
  const handleUpdateParent = async (tagId: string, parentId: string) => {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;

    const meta = parseTagMetadata(tag);
    const oldParentId = meta.parentId;
    
    if (parentId === 'none') {
      meta.parentId = undefined;
      if (oldParentId) {
        meta.connections = meta.connections.filter(id => id !== oldParentId);
      }
    } else {
      meta.parentId = parentId;
      if (!meta.connections.includes(parentId)) {
        meta.connections.push(parentId);
      }
      if (oldParentId && oldParentId !== parentId) {
        meta.connections = meta.connections.filter(id => id !== oldParentId);
      }
    }

    await saveTagMetadata(tagId, meta);
    
    if (editingTag && editingTag.id === tagId) {
      setEditingTag({ ...tag, metadata: JSON.stringify(meta) });
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortedTags = () => {
    const filtered = tags.filter(t => 
      t.identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.department && t.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.fluid && t.fluid.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.brand && t.brand.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return filtered.sort((a, b) => {
      let valA = a[sortConfig.key] || '';
      let valB = b[sortConfig.key] || '';

      if (sortConfig.key === 'createdAt') {
        valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Build tree logic for dependencies view
  const buildTree = () => {
    const tagMap: { [id: string]: any } = {};
    const rootNodes: any[] = [];

    const matchingTags = tags.filter(t => 
      t.identifier.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (t.department && t.department.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    matchingTags.forEach(t => {
      const meta = parseTagMetadata(t);
      tagMap[t.id] = {
        ...t,
        meta,
        children: []
      };
    });

    matchingTags.forEach(t => {
      const node = tagMap[t.id];
      const pId = node.meta.parentId;
      if (pId && tagMap[pId]) {
        tagMap[pId].children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  };

  const toggleTagExpand = (id: string) => {
    setExpandedTagIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Calculate full lineage chain of tag (from parent down to child list)
  const getParentTraceLineage = (tagId: string): string => {
    const chainList: string[] = [];
    let currentId: string | undefined = tagId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const tag = tags.find(t => t.id === currentId);
      if (tag) {
        chainList.unshift(tag.identifier);
        const meta = parseTagMetadata(tag);
        currentId = meta.parentId;
      } else {
        break;
      }
    }
    return chainList.join(' ➔ ');
  };

  // Extract all unique values at a specific segment/part index across all tags
  const getUniqueTagSegmentValuesForPos = (idx: number): string[] => {
    const values = new Set<string>();
    tags.forEach(t => {
      const parts = splitSegments(t.identifier);
      if (parts[idx]) {
        values.add(parts[idx]);
      }
    });
    return Array.from(values).sort();
  };

  const getUniqueMarkSegmentValuesForPos = (idx: number): string[] => {
    const values = new Set<string>();
    tags.forEach(t => {
      const parts = splitSegments(t.brand || '');
      if (parts[idx]) {
        values.add(parts[idx]);
      }
    });
    return Array.from(values).sort();
  };

  // Find max segment depth across all items
  const getMaximumTagSegmentLength = (): number => {
    let max = 0;
    tags.forEach(t => {
      const parts = splitSegments(t.identifier);
      if (parts.length > max) max = parts.length;
    });
    return max || 3;
  };

  const getMaximumMarkSegmentLength = (): number => {
    let max = 0;
    tags.forEach(t => {
      const parts = splitSegments(t.brand || '');
      if (parts.length > max) max = parts.length;
    });
    return max || 3;
  };

  // Safe mappings to keep existing references happy
  const getUniqueSegmentValuesForPos = getUniqueTagSegmentValuesForPos;
  const getMaximumSegmentLength = getMaximumTagSegmentLength;

  // Perform multi-segment query selection with independent Tag & Mark filter vectors
  const getSegmentMatchedTags = () => {
    return tags.filter(t => {
      const tagParts = splitSegments(t.identifier);
      const markParts = splitSegments(t.brand || '');
      
      // Left-side card filter values check only the data inside the Tag Segments column
      for (const posKey in activeTagFilters) {
        const filterVal = activeTagFilters[posKey];
        if (!filterVal || filterVal === '*') continue;
        
        const partVal = tagParts[Number(posKey)];
        if (!partVal || !partVal.toLowerCase().includes(filterVal.toLowerCase())) {
          return false;
        }
      }

      // Right-side card filter values check only data inside the Mark Segments column
      for (const posKey in activeMarkFilters) {
        const filterVal = activeMarkFilters[posKey];
        if (!filterVal || filterVal === '*') continue;
        
        const partVal = markParts[Number(posKey)];
        if (!partVal || !partVal.toLowerCase().includes(filterVal.toLowerCase())) {
          return false;
        }
      }

      // Supplementary filters
      if (excludeEmptyWBS && !t.wbs) return false;
      if (onlyWithWarning) {
        const meta = parseTagMetadata(t);
        const hasFlags = meta.descriptions.some(d => d.status === 'warning' || d.status === 'critical');
        if (!hasFlags) return false;
      }

      return true;
    });
  };

  const splitBrandIntoParts = (brandStr: string) => {
    if (!brandStr) return [];
    return brandStr.split(/[-/\.\s]+/);
  };

  const getMaximumBrandSegmentLength = () => {
    let max = 0;
    tags.forEach(t => {
      if (t.brand) {
        const len = splitBrandIntoParts(t.brand).length;
        if (len > max) max = len;
      }
    });
    return max;
  };

  // List Virtualization:
  const parentRefSegments = useRef<HTMLDivElement>(null);
  const matchedTagsList = useMemo(() => getSegmentMatchedTags(), [tags, activeTagFilters, activeMarkFilters, excludeEmptyWBS, onlyWithWarning, dictionaries]);
  
  const segmentsVirtualizer = useVirtualizer({
    count: matchedTagsList.length,
    getScrollElement: () => parentRefSegments.current,
    estimateSize: () => 75,
    overscan: 10,
  });

  const parentRefTable = useRef<HTMLDivElement>(null);
  const sortedTagsList = useMemo(() => getSortedTags(), [tags, searchQuery, sortConfig]);

  const tableVirtualizer = useVirtualizer({
    count: sortedTagsList.length,
    getScrollElement: () => parentRefTable.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  // Excel compliant export (CSV with Cyrillic BOM)
  const handleExportSelectedToExcel = () => {
    const matched = getSegmentMatchedTags();
    if (matched.length === 0) {
      alert('Нет данных для экспорта. Измените фильтры.');
      return;
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM indicator so Excel opens Cyrillic letters natively
    
    // Header Line
    const headers: string[] = [];
    if (exportColumns.identifier) headers.push("Код тега (Tag)");
    if (exportColumns.brand) headers.push("Марка");
    if (exportColumns.brandParts) {
      const maxBrandLen = getMaximumBrandSegmentLength();
      for (let i = 0; i < maxBrandLen; i++) {
        headers.push(`Сегмент Марки ${i+1}`);
      }
    }
    if (exportColumns.parts) {
      const maxLen = getMaximumSegmentLength();
      for (let i = 0; i < maxLen; i++) {
        headers.push(`Сегмент ${i+1}`);
      }
    }
    if (exportColumns.department) headers.push("Дисциплина / Отдел");
    if (exportColumns.fluid) headers.push("Тех. Среда / Назначение");
    if (exportColumns.chain) headers.push("Инженерная Цепочка (Parent Chain)");
    if (exportColumns.descriptions) headers.push("Замечания и подописания");

    csvContent += headers.map(h => `"${h}"`).join(';') + "\r\n";

    // Data Lines
    matched.forEach(t => {
      const rowData: string[] = [];
      const parts = splitTagIntoParts(t.identifier);
      const meta = parseTagMetadata(t);

      if (exportColumns.identifier) {
        rowData.push(t.identifier);
      }
      if (exportColumns.brand) {
        rowData.push(t.brand || "");
      }
      if (exportColumns.brandParts) {
        const bp = splitBrandIntoParts(t.brand || "");
        const maxBrandLen = getMaximumBrandSegmentLength();
        for (let i = 0; i < maxBrandLen; i++) {
          rowData.push(bp[i] || "");
        }
      }
      if (exportColumns.parts) {
        const maxLen = getMaximumSegmentLength();
        for (let i = 0; i < maxLen; i++) {
          rowData.push(parts[i] || "");
        }
      }
      if (exportColumns.department) {
        rowData.push(t.department || "");
      }
      if (exportColumns.fluid) {
        rowData.push(t.fluid || "");
      }
      if (exportColumns.chain) {
        const lineage = getParentTraceLineage(t.id);
        rowData.push(lineage || t.identifier);
      }
      if (exportColumns.descriptions) {
        const descTexts = meta.descriptions.map(d => `${d.text} [${d.status.toUpperCase()}]: ${d.comment}`).join(' | ');
        rowData.push(descTexts || "Нет замечаний");
      }

      csvContent += rowData.map(val => `"${val.replace(/"/g, '""')}"`).join(';') + "\r\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `MAX-Реестр-Агрегация_${format(new Date(), 'dd-MM-yyyy')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const statusConfig = {
    actual: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-500 dark:text-emerald-400', border: 'border-emerald-500/20', icon: CheckCircle2, label: 'Актуально' },
    warning: { bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-500 dark:text-amber-400', border: 'border-amber-500/20', icon: AlertTriangle, label: 'Проверить' },
    critical: { bg: 'bg-rose-500/10 dark:bg-rose-500/20', text: 'text-rose-500 dark:text-rose-400', border: 'border-rose-500/20', icon: XCircle, label: 'Критично' },
    info: { bg: 'bg-teal-500/10 dark:bg-teal-500/20', text: 'text-teal-500 dark:text-teal-400', border: 'border-teal-500/20', icon: Info, label: 'В работе' },
    draft: { bg: 'bg-slate-500/10 dark:bg-slate-500/20', text: 'text-slate-500 dark:text-slate-400', border: 'border-slate-500/20', icon: HelpCircle, label: 'Устарело' }
  };

  const isIdentifierUnique = !newTagIdentifier || !checkTagExists(newTagIdentifier);

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl mx-auto p-8 shadow-sm text-center">
        <Database className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4 animate-bounce" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Проект не выбран</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-sm">Выберите технологический проект во вкладке «Дашборд», чтобы открыть его реестр тегов.</p>
      </div>
    );
  }

  return (
    <div id="registry-screen-root" className="h-full flex flex-col min-h-0 text-slate-800 dark:text-slate-100 transition-colors duration-250 animate-fadeIn gap-3">
      
      {/* MODULE HEADER AND TAB SWITCHER */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner shrink-0">
            <Network className="w-5.5 h-5.5" />
          </div>
          <div className="text-left">
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Реестр технологических тегов
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50">
                {tags.length} тегов
              </span>
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'board' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Интерактивный граф (Dynamo)</span>
            </button>
            <button
              onClick={() => setActiveTab('tree')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'tree' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Дерево связей</span>
            </button>
            <button
              onClick={() => setActiveTab('segments')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'segments' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-700 dark:text-emerald-300">Экспорт и импорт</span>
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'table' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Спецификация</span>
            </button>
          </div>
        </div>
      </div>

      {/* QUICK PANEL, REAL-TIME VALIDATION & SEARCH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Manual quick adding with active validation */}
        <form onSubmit={handleCreateTag} className="lg:col-span-10 p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-855 rounded-xl shadow-xs text-left flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block pl-1 mb-1.5">
            Создать новый тег и оборудование:
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-2.5 items-end">
            {/* Tag identifier code */}
            <div className="relative flex flex-col gap-1 lg:col-span-3">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase flex justify-between leading-none truncate">
                <span>Код тега (EN) *</span>
                {newTagIdentifier && !isIdentifierUnique && (
                  <span className="text-[9px] text-rose-550 lowercase font-semibold">Занят</span>
                )}
              </label>
              <div className="relative animate-fadeIn">
                <input
                  type="text"
                  required
                  placeholder="Код тега"
                  value={newTagIdentifier}
                  onChange={handleTagIdentifierChange}
                  className={`w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border text-xs rounded-lg focus:outline-none focus:bg-white dark:focus:bg-slate-950 ${
                    newTagIdentifier 
                      ? isIdentifierUnique 
                        ? 'border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20' 
                        : 'border-rose-500/50 focus:ring-2 focus:ring-rose-550/20'
                      : 'border-slate-200 dark:border-slate-800'
                  } dark:text-slate-100 font-mono`}
                />
                {newTagIdentifier && (
                  <div className="absolute right-2 top-1.5 z-10">
                    {isIdentifierUnique ? (
                      <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-200/40">Свободен</span>
                    ) : (
                      <span className="text-[9px] text-rose-605 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/60 px-1 py-0.5 rounded border border-rose-200/40">Занят</span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Auto Suggestions list */}
              {newTagIdentifier && matchingSuggestions.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-50 p-2 max-h-64 overflow-y-auto">
                  <div className="text-[9px] uppercase font-mono font-bold text-slate-400 dark:text-slate-550 pb-1 mb-1 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center pl-1">
                    <span>Существующие теги</span>
                    <span className="text-[8px] italic font-sans font-normal lowercase text-slate-500">выберите</span>
                  </div>
                  <div className="space-y-0.5">
                    {matchingSuggestions.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setNewTagIdentifier(st.identifier);
                          if (st.department) setNewTagDepartment(st.department);
                          if (st.fluid) setNewTagFluid(st.fluid);
                          const stMeta = parseTagMetadata(st);
                          if (stMeta.mainName) setNewTagMainName(stMeta.mainName);
                          setNewTagActuality(getTagOverallStatus(st));
                        }}
                        className="w-full text-left px-2 py-1 text-xs text-slate-707 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded flex justify-between items-center transition-colors font-mono cursor-pointer"
                      >
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{st.identifier}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans truncate ml-2 max-w-[240px]" title={parseTagMetadata(st).mainName || 'Без наименования'}>
                          {parseTagMetadata(st).mainName || <span className="italic opacity-40 text-[10px]">Без наименования</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Required Mark input field */}
            <div className="flex flex-col gap-1 animate-fadeIn lg:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-555 uppercase leading-none truncate">
                Марка оборудования *
              </label>
              <input
                type="text"
                required
                placeholder="ВИР800-340"
                value={newTagBrand}
                onChange={(e) => setNewTagBrand(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs rounded-lg text-slate-850 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-950 focus:ring-2 focus:ring-emerald-500/20 font-medium"
              />
            </div>

            {/* Main Name string input */}
            <div className="flex flex-col gap-1 lg:col-span-3">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-555 uppercase leading-none truncate">
                Главное наименование
              </label>
              <input
                type="text"
                placeholder="Приточный вентилятор"
                value={newTagMainName}
                onChange={(e) => setNewTagMainName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs placeholder-slate-400 dark:placeholder-slate-550 focus:outline-none focus:bg-white dark:focus:bg-slate-950 text-slate-805 dark:text-slate-100 font-medium"
              />
            </div>

            {/* Actuality Selector */}
            <div className="flex flex-col gap-1 lg:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-555 uppercase leading-none truncate">
                Актуальность
              </label>
              <CustomSelect
                value={newTagActuality}
                onChange={(val) => setNewTagActuality(val as any)}
                options={actualitySelectOptions}
              />
            </div>

            {/* Actions (Buttons) */}
            <div className="flex items-center gap-1.5 lg:col-span-2_fixed_for_flex lg:col-span-2">
              {/* Advanced Toggle button */}
              <button
                type="button"
                onClick={() => setShowAdvancedCreation(!showAdvancedCreation)}
                className={`p-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 h-8 flex-1 ${
                  showAdvancedCreation 
                    ? 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-350 border-slate-300 dark:border-slate-750' 
                    : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-450 border-slate-200 dark:border-slate-850 hover:bg-slate-50'
                }`}
                title="Дополнительные поля спецификации"
              >
                <Sliders className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xl:inline text-[10px]">Доп</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 shrink-0 ${showAdvancedCreation ? 'rotate-180' : ''}`} />
              </button>

              {/* Submit create button */}
              <button
                type="submit"
                disabled={!isIdentifierUnique || !newTagIdentifier || !newTagBrand.trim()}
                className={`p-1.5 rounded-lg text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 h-8 flex-1 border-none ${
                  isIdentifierUnique && newTagIdentifier && newTagBrand.trim()
                    ? 'bg-emerald-700 hover:bg-emerald-600 text-white font-semibold'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5 text-white shrink-0" />
                <span>Создать</span>
              </button>
            </div>
          </div>

          {/* Collapsible advanced details row */}
          {showAdvancedCreation && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'visible' }}
              className="flex flex-wrap items-center gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-900/60 overflow-visible text-left"
            >
              {(() => {
                const configDict = dictionaries.find(d => d.name === '__tag_creation_config__');
                const cats = configDict
                  ? (configDict.items || [])
                      .filter((i: any) => !i.parentId)
                      .sort((a: any, b: any) => a.code.localeCompare(b.code))
                  : [];

                if (cats.length > 0) {
                  return cats.map((cat: any) => {
                    const options = (configDict?.items || [])
                      .filter((i: any) => i.parentId === cat.id)
                      .sort((a: any, b: any) => a.nameRu.localeCompare(b.nameRu));

                    return (
                      <div key={cat.id} className="flex flex-col gap-1 min-w-[160px] md:min-w-[180px] lg:min-w-[200px] flex-1 max-w-[300px]" id={`dynamic-field-${cat.id}`}>
                        <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase leading-none truncate" title={cat.nameRu}>
                          {cat.nameRu}
                        </span>
                        <CustomSelect
                          value={dynamicCategorySelections[cat.id] || ''}
                          onChange={(val) => handleDynamicCategoryChange(cat.id, val)}
                          placeholder="-- выбрать --"
                          options={options.map((opt: any) => ({
                            value: opt.nameRu,
                            label: opt.nameRu
                          }))}
                        />
                      </div>
                    );
                  });
                }
                return <span className="text-xs text-slate-400">Дополнительные поля для ККС не настроены в справочниках.</span>;
              })()}
            </motion.div>
          )}
        </form>

        {/* Small compacted search on the right */}
        <div className="lg:col-span-2 p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs flex flex-col justify-between text-left">
          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase leading-none mb-1">
            Поиск по реестру:
          </label>
          <div className="relative flex-1 flex items-end">
            <input
              type="search"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs placeholder-slate-400 dark:placeholder-slate-550 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white dark:focus:bg-slate-950 text-slate-800 dark:text-slate-100 font-medium h-8"
            />
          </div>
        </div>
      </div>

      {/* TABS INTERFACE */}
      <div className="flex-1 min-h-0 w-full relative">
        <AnimatePresence mode="wait">
          
          {/* INTERACTIVE BOARD (GRAPH CANVAS) */}
          {activeTab === 'board' && (
            <motion.div
              key="canvas-board"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col min-h-0"
            >
              {/* THE GRAPH SPACE WITH OVERLAID CONTROLS */}
              <div 
                ref={boardRef}
                className="w-full flex-1 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-900 border-2 border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-lg relative select-none transition-colors"
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                setIsPanning(true);
                lastMousePosRef.current = { x: e.clientX, y: e.clientY };
              }}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            >
              {/* Overlaid Zoom and Canvas Controls on the top-right */}
              <div className="absolute top-4 right-4 z-40 flex items-center gap-2 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-md">
                <div className="flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-800">
                  <button 
                    onClick={() => setZoom(z => Math.max(0.15, z - 0.1))} 
                    className="p-1 px-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 rounded transition-colors cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400 self-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button 
                    onClick={() => setZoom(z => Math.min(2.5, z + 0.1))}
                    className="p-1 px-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 rounded transition-colors cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800" />

                <button 
                  onClick={fitCanvasToCenter}
                  title="Центрировать область со всеми карточками"
                  className="px-2.5 py-1.5 bg-slate-200/70 dark:bg-slate-850 hover:bg-slate-300 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg font-bold text-[10px] transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3 text-emerald-600" />
                  Центрировать
                </button>
              </div>

              <div 
                className="absolute inset-0 origin-top-left pointer-events-none"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  backgroundImage: theme === 'dark' 
                    ? 'radial-gradient(circle, #334155 1.1px, transparent 1.1px)' 
                    : 'radial-gradient(circle, #cbd5e1 1.1px, transparent 1.1px)',
                  backgroundSize: '24px 24px',
                  width: '3500px',
                  height: '2500px'
                }}
              >
                {/* SVG CONNECTION LAYER */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                  {/* Draw Dynamo Style Connection Wires */}
                  {tags.map((tag) => {
                    const sourceMeta = parseTagMetadata(tag);
                    return sourceMeta.connections.map((targetId) => {
                      const targetTag = tagsById[targetId];
                      if (!targetTag) return null;
                      const targetMeta = parseTagMetadata(targetTag);

                      // If we are currently reconnecting this specific line, do not draw it in the main layer
                      if (reconnectingConnectionRef.current && 
                          reconnectingConnectionRef.current.sourceId === tag.id && 
                          reconnectingConnectionRef.current.targetId === targetId) {
                        return null;
                      }

                      // Source represents Parent Node output (Right Port)
                      const startX = sourceMeta.x + 330;
                      const startY = sourceMeta.y + 22;

                      // Target represents slave (Left Port)
                      const endX = targetMeta.x;
                      const endY = targetMeta.y + 22;

                      // Perfect curves
                      const dx = Math.abs(endX - startX);
                      const ctrlOffset = Math.max(100, dx * 0.45);

                      const pathData = `M ${startX} ${startY} C ${startX + ctrlOffset} ${startY}, ${endX - ctrlOffset} ${endY}, ${endX} ${endY}`;

                      const isSelected = selectedConnection && selectedConnection.sourceId === tag.id && selectedConnection.targetId === targetId;
                      const isHovered = hoveredConnection && hoveredConnection.sourceId === tag.id && hoveredConnection.targetId === targetId;

                      return (
                        <g 
                          key={`${tag.id}-${targetId}`} 
                          className="pointer-events-auto group"
                          onMouseEnter={() => setHoveredConnection({ sourceId: tag.id, targetId })}
                          onMouseLeave={() => setHoveredConnection(null)}
                        >
                          {/* Invisible thick path for easy hovering and clicking */}
                          <path
                            id={`path-overlay-${tag.id}-${targetId}`}
                            d={pathData}
                            fill="none"
                            stroke="transparent"
                            strokeWidth="16"
                            className="cursor-pointer"
                            style={{ pointerEvents: 'stroke' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedConnection({ sourceId: tag.id, targetId });
                            }}
                          />

                          {/* Outer glow aura / highlight line when selected or hovered */}
                          {(isSelected || isHovered) && (
                            <path
                              d={pathData}
                              fill="none"
                              stroke={isSelected ? '#6366f1' : '#10b981'} // Indigo for selected, emerald for hovered
                              strokeOpacity={isSelected ? 0.8 : 0.4}
                              strokeWidth={isSelected ? '6' : '5'}
                              className="transition-all duration-150"
                            />
                          )}

                          {/* Inner line */}
                          <path
                            id={`path-${tag.id}-${targetId}`}
                            d={pathData}
                            fill="none"
                            stroke={isSelected ? '#4f46e5' : (theme === 'dark' ? '#34d399' : '#059669')}
                            strokeOpacity={theme === 'dark' ? 0.8 : 0.9}
                            strokeWidth={isSelected ? "3" : "2.5"}
                            className="cursor-pointer transition-all duration-150"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedConnection({ sourceId: tag.id, targetId });
                            }}
                          />

                          {/* Flow indicator light dot */}
                          <circle id={`flow-dot-${tag.id}-${targetId}`} r="3.5" fill={isSelected ? '#c084fc' : '#34d399'}>
                            <animateMotion path={pathData} dur="6s" repeatCount="indefinite" />
                          </circle>

                          {/* Link Delete Button precisely placed in the mathematical middle */}
                          {(isHovered || isSelected) && (() => {
                            // Calculate midpoint using our cubic bezier formula
                            const cp1_x = startX + ctrlOffset;
                            const cp2_x = endX - ctrlOffset;
                            const midX = 0.125 * startX + 0.375 * cp1_x + 0.375 * cp2_x + 0.125 * endX;
                            const midY = 0.5 * startY + 0.5 * endY;

                            return (
                              <foreignObject 
                                x={midX - 10} 
                                y={midY - 10} 
                                width={20} 
                                height={20}
                                className="overflow-visible"
                              >
                                <button
                                  type="button"
                                  className="w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white flex items-center justify-center text-[10px] font-bold shadow-md hover:scale-110 transition-all border border-white dark:border-slate-900 cursor-pointer"
                                  title="Удалить связь"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Разорвать связь между ${tag.identifier} и ${targetTag.identifier}?`)) {
                                      handleRemoveConnection(tag.id, targetId);
                                      if (isSelected) setSelectedConnection(null);
                                    }
                                  }}
                                >
                                  ×
                                </button>
                              </foreignObject>
                            );
                          })()}
                        </g>
                      );
                    });
                  })}

                  {/* ACTIVE WIRE DRAGGING PREVIEW */}
                  <path
                    id="active-drag-path"
                    d=""
                    fill="none"
                    stroke={theme === 'dark' ? '#10b981' : '#059669'}
                    strokeWidth="2.5"
                    strokeDasharray="4 4"
                    style={{ display: 'none' }}
                  />
                </svg>

                {/* GRAPH CARDS CONTROLLERS */}
                <div className="absolute inset-0">
                  {tags.map((tag) => {
                    const meta = parseTagMetadata(tag);
                    const isSourceOfDrag = activeConnectionDrag?.sourceId === tag.id;
                    const hoveredLeft = hoveredPort?.tagId === tag.id && hoveredPort.side === 'left';
                    const hoveredRight = hoveredPort?.tagId === tag.id && hoveredPort.side === 'right';
                    
                    const isExpanded = !!expandedCardIds[tag.id];
                    const overallStatus = getTagOverallStatus(tag);
                    const statusVal = statusConfig[overallStatus] || statusConfig.draft;

                    return (
                      <div
                        key={tag.id}
                        id={`tag-card-${tag.id}`}
                        className={`absolute pointer-events-auto w-[310px] rounded-2xl border text-left transition-shadow duration-200 select-none ${
                          isSourceOfDrag 
                            ? 'ring-2 ring-emerald-500 border-emerald-500 shadow-xl z-30' 
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 shadow-xs hover:shadow-md z-10 text-slate-900 dark:text-slate-100'
                        }`}
                        style={{ 
                          transform: `translate(${meta.x}px, ${meta.y}px)`,
                          left: 0, 
                          top: 0
                        }}
                        onMouseDown={(e) => handleTagMouseDown(e, tag.id, meta)}
                      >
                        {/* PORT SENSOR DOTS (Permanently placed at top center vertical line of card regardless of expansion height) */}
                        <div 
                          className={`absolute connection-port left-0 top-[22px] -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-slate-300 dark:border-slate-800 transition-all hover:scale-130 cursor-crosshair z-40 ${
                            hoveredLeft 
                              ? 'bg-emerald-500 border-white scale-125 shadow-lg' 
                              : 'bg-slate-200 dark:bg-slate-800'
                          }`}
                          onMouseDown={(e) => handlePortMouseDown(e, tag.id, 'left')}
                          onMouseEnter={() => setHoveredPort({ tagId: tag.id, side: 'left' })}
                          onMouseLeave={() => setHoveredPort(null)}
                          title="Родительский ввод (Left Port)"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-700 dark:bg-slate-200 m-auto mt-[4px]" />
                        </div>

                        <div 
                          className={`absolute connection-port right-0 top-[22px] translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-slate-300 dark:border-slate-800 transition-all hover:scale-130 cursor-crosshair z-40 ${
                            hoveredRight 
                              ? 'bg-emerald-500 border-white scale-125 shadow-lg' 
                              : 'bg-slate-200 dark:bg-slate-800'
                          }`}
                          onMouseDown={(e) => handlePortMouseDown(e, tag.id, 'right')}
                          onMouseEnter={() => setHoveredPort({ tagId: tag.id, side: 'right' })}
                          onMouseLeave={() => setHoveredPort(null)}
                          title="Дочерний выход (Right Port)"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-700 dark:bg-slate-200 m-auto mt-[4px]" />
                        </div>

                        {/* CARD COMPACT HEADER ROW (Always visible) */}
                        <div className="px-4 py-3 cursor-move flex flex-col gap-1 w-full">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              {/* Actuality Color Dot */}
                              <span 
                                className={`w-3.5 h-3.5 rounded-full inline-block shrink-0 border border-slate-200 dark:border-slate-800 ${statusVal.text} bg-current`}
                                title={`Актуальность: ${statusVal.label}`}
                              />
                              <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span className="font-mono font-bold tracking-tight text-xs text-slate-800 dark:text-slate-100 uppercase truncate select-all">
                                {tag.identifier}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 no-drag select-none">
                              {/* Toggle Info / Expand Detailed View */}
                              <button
                                title={isExpanded ? "Свернуть подописания" : "Открыть подописания тега"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedCardIds(prev => ({ ...prev, [tag.id]: !prev[tag.id] }));
                                }}
                                className={`p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center ${
                                  isExpanded 
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' 
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-450 dark:hover:text-slate-200'
                                }`}
                              >
                                <Info className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          {/* Main Name / Title always visible */}
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-350 truncate mt-0.5 pl-5" title={meta.mainName || 'Наименование отсутствует'}>
                            {meta.mainName || <span className="italic opacity-60">Наименование отсутствует</span>}
                          </div>
                        </div>

                        {/* EXPANDED SECTION */}
                        {isExpanded && (
                          <div className="border-t border-slate-105 dark:border-slate-850 animate-fadeIn text-slate-800 dark:text-slate-200">
                            
                            {/* INFO TAG FLUID/DEPT */}
                            <div className="px-4 py-2 bg-slate-50/40 dark:bg-slate-950/20 text-[10px] text-slate-400 flex justify-between border-b border-slate-100 dark:border-slate-900 font-medium">
                              <span className="truncate max-w-[130px]" title={tag.department}>
                                Отд: <strong className="text-slate-700 dark:text-slate-200">{tag.department || 'Комплекс'}</strong>
                              </span>
                              <span className="truncate max-w-[120px]" title={tag.fluid}>
                                Среда: <strong className="text-slate-700 dark:text-slate-200">{tag.fluid || 'Воздух'}</strong>
                              </span>
                            </div>

                            {/* TAG CREATOR / UPDATER TIMESTAMPS BAR */}
                            <div className="px-4 py-1.5 bg-sky-50/10 dark:bg-slate-900/10 text-[8.5px] text-slate-400 dark:text-slate-500 font-mono flex flex-wrap justify-between border-b border-slate-100 dark:border-slate-850">
                              <span>Создан: <strong>{meta.createdBy || 'Система'}</strong> ({formatDateStr(meta.createdAt || tag.createdAt)})</span>
                              {meta.updatedBy && (
                                <span className="text-right">Ред: <strong>{meta.updatedBy}</strong> ({formatDateStr(meta.updatedAt)})</span>
                              )}
                            </div>

                            {/* SUB-DESCRIPTIONS LIST (With full tracking timestamps and inline editing capability!) */}
                            <div className="p-3.5 space-y-2 max-h-[220px] overflow-y-auto no-drag">
                              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase flex items-center justify-between">
                                <span>Подописания ({meta.descriptions.length})</span>
                                <span className="text-[9px] lowercase italic font-normal">клик на карандаш для ред.</span>
                              </div>

                              {meta.descriptions.map((desc) => {
                                const config = statusConfig[desc.status] || statusConfig.draft;
                                const StatusIcon = config.icon;
                                const isEditingThisDesc = editingDescId === desc.id;

                                return (
                                  <div key={desc.id} className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-150/60 dark:border-slate-850 rounded-xl flex flex-col gap-1 text-left">
                                    {isEditingThisDesc ? (
                                      /* INLINE ITEM EDITOR FORM */
                                      <div className="space-y-2 pt-1">
                                        <div className="grid grid-cols-2 gap-1.5">
                                          <div className="space-y-0.5">
                                            <span className="text-[8px] font-bold text-slate-400">Название</span>
                                            <input
                                              type="text"
                                              value={editDescForm.text}
                                              onChange={(e) => setEditDescForm(prev => ({ ...prev, text: e.target.value }))}
                                              className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] text-slate-800 dark:text-slate-100 focus:outline-none"
                                            />
                                          </div>
                                          <div className="space-y-0.5">
                                            <span className="text-[8px] font-bold text-slate-400">Актуальность</span>
                                            <CustomSelect
                                              value={editDescForm.status}
                                              onChange={(val) => setEditDescForm(prev => ({ ...prev, status: val as any }))}
                                              options={actualitySelectOptions}
                                            />
                                          </div>
                                        </div>

                                        <div className="space-y-0.5">
                                          <span className="text-[8px] font-bold text-slate-400">Комментарий</span>
                                          <textarea
                                            value={editDescForm.comment}
                                            onChange={(e) => setEditDescForm(prev => ({ ...prev, comment: e.target.value }))}
                                            className="w-full p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-[11px] text-slate-800 dark:text-slate-100 focus:outline-none"
                                            rows={2}
                                          />
                                        </div>

                                        <div className="flex justify-end gap-1.5 pt-1">
                                          <button
                                            onClick={() => setEditingDescId(null)}
                                            className="px-2 py-0.5 text-[10px] text-slate-450 hover:text-slate-650 transition-colors cursor-pointer"
                                          >
                                            Отмена
                                          </button>
                                          <button
                                            onClick={async () => {
                                              await handleUpdateDescription(tag.id, desc.id, {
                                                text: editDescForm.text,
                                                comment: editDescForm.comment,
                                                status: editDescForm.status
                                              });
                                              setEditingDescId(null);
                                            }}
                                            className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded cursor-pointer"
                                          >
                                            Записать
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      /* STANDARD DISPLAY MODE WITH TIMESTAMPS */
                                      <>
                                        <div className="flex items-start justify-between gap-1.5">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <div className={`w-1.5 h-1.5 rounded-full ${config.text} bg-current shrink-0`} />
                                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{desc.text}</span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <span className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[7.5px] font-semibold border ${config.bg} ${config.text} ${config.border}`}>
                                              <StatusIcon className="w-1.5 h-1.5" />
                                              {config.label}
                                            </span>
                                            
                                            {/* Actions */}
                                            <button
                                              title="Редактировать подописание"
                                              onClick={() => {
                                                setEditingDescId(desc.id);
                                                setEditDescForm({
                                                  text: desc.text,
                                                  comment: desc.comment || '',
                                                  status: desc.status
                                                });
                                              }}
                                              className="p-1 hover:text-emerald-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors text-slate-400 cursor-pointer"
                                            >
                                              <Edit className="w-2.5 h-2.5" />
                                            </button>
                                            <button
                                              title="Удалить подописание"
                                              onClick={() => handleRemoveDescription(tag.id, desc.id)}
                                              className="p-1 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors text-slate-400 cursor-pointer"
                                            >
                                              <Trash2 className="w-2.5 h-2.5" />
                                            </button>
                                          </div>
                                        </div>

                                        {desc.comment && (
                                          <p className="text-[10px] text-slate-500 dark:text-slate-400 pl-2 border-l border-slate-200 dark:border-slate-800 italic leading-snug">
                                            {desc.comment}
                                          </p>
                                        )}

                                        {/* Creator / Updater Tracker Row */}
                                        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.2 text-[7.5px] text-slate-400 dark:text-slate-500 font-mono mt-1 border-t border-slate-100 dark:border-slate-850/40 pt-1 leading-none">
                                          <span>Ср: <strong>{desc.createdBy || 'Система'}</strong> {desc.createdAt && `(${formatDateStr(desc.createdAt)})`}</span>
                                          {desc.updatedBy && (
                                            <>
                                              <span className="text-slate-300 dark:text-slate-755">|</span>
                                              <span>Из: <strong>{desc.updatedBy}</strong> {desc.updatedAt && `(${formatDateStr(desc.updatedAt)})`}</span>
                                            </>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })}

                              {meta.descriptions.length === 0 && (
                                <div className="text-center py-6 text-slate-400 dark:text-slate-600 text-xs italic">
                                  Описания отсутствуют.
                                </div>
                              )}
                            </div>

                            {/* QUICK INLINE COMMENT WORK FORM */}
                            <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-105 dark:border-slate-850 space-y-2 no-drag text-left text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Добавить датчик/компонент:</span>
                              </div>

                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  placeholder="Напр. Вентилятор В-1"
                                  value={quickDescText[tag.id] || ''}
                                  onChange={(e) => setQuickDescText(prev => ({ ...prev, [tag.id]: e.target.value }))}
                                  className="px-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded text-[10px] flex-1 text-slate-800 dark:text-slate-100 focus:outline-none"
                                />
                                <CustomSelect
                                  value={quickStatus[tag.id] || 'actual'}
                                  onChange={(val) => setQuickStatus(prev => ({ ...prev, [tag.id]: val as any }))}
                                  options={emojiOptions}
                                />
                              </div>
                              
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  placeholder="Замечания..."
                                  value={quickCommentText[tag.id] || ''}
                                  onChange={(e) => setQuickCommentText(prev => ({ ...prev, [tag.id]: e.target.value }))}
                                  className="px-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded text-[10px] flex-1 text-slate-800 dark:text-slate-100 focus:outline-none"
                                />
                                <button
                                  onClick={() => handleAddDescription(
                                    tag.id, 
                                    quickDescText[tag.id], 
                                    quickCommentText[tag.id], 
                                    quickStatus[tag.id] || 'actual'
                                  )}
                                  className="px-3.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded text-[10px] cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* BOTTOM CONTROL ACTIONS UTILITIES */}
                            <div className="p-2.5 bg-slate-100/40 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-850 flex items-center justify-between text-xs rounded-b-2xl no-drag">
                              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono">ID: {tag.id.slice(0, 8)}</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  title="Настроить связи / свойства в модали"
                                  onClick={() => setEditingTag(tag)}
                                  className="flex items-center gap-1 px-2 py-1 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors text-[10px] font-semibold cursor-pointer"
                                >
                                  <Edit2 className="w-3 h-3" /> Настройка
                                </button>
                                <button
                                  title="Удалить тег с холста"
                                  onClick={() => handleDeleteTag(tag.id)}
                                  className="p-1 px-2 hover:text-rose-600 text-slate-550 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded transition-colors text-[10px] font-semibold cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" /> Удалить
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TREE VIEW */}
        {activeTab === 'tree' && (
          <motion.div
            key="tree-wood-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="h-full w-full overflow-y-auto space-y-4 text-left pr-1"
          >
            <div className="p-5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs">
              {buildTree().length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Database className="w-12 h-12 mx-auto text-slate-200 dark:text-slate-800 mb-3" />
                  <p className="text-base text-slate-600 font-bold">Теги не найдены</p>
                  <p className="text-xs mt-1">Добавьте хотя бы один тег с кодом или восстановите демонстрационное дерево!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {buildTree().map((node) => renderTreeNode(node, 0))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 4: ADVANCED SEGMENT COLLECTOR & EXPORT PROCESSOR */}
        {activeTab === 'segments' && (
          <motion.div
            key="segment-aggregator-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="h-full w-full overflow-y-auto space-y-4 text-left pr-1"
          >

            {/* SELECTION FILTERS BLOCK */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-sm text-left">
              
              {/* LEFT COLUMN: TAG FILTERING ZONE */}
              <div className="space-y-4 border-r border-slate-100 dark:border-slate-850 pr-0 lg:pr-6">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-850">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                      👈 LEFT SIDE: Tag Filtering Zone
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Фильтрация по сегментам тега KKS (только латиница и цифры).</p>
                  </div>
                  <button
                    onClick={() => setAddedTagSegmentsCount(prev => prev + 1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer border-none"
                  >
                    <Plus className="w-3 h-3" /> Добавить сегмент
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: getMaximumTagSegmentLength() + addedTagSegmentsCount }).map((_, idx) => {
                    const uniqueList = getUniqueTagSegmentValuesForPos(idx);
                    const currentVal = activeTagFilters[idx] || '';

                    const boundDictId = tagDictBindings[idx] || '';
                    const boundDict = dictionaries.find(d => d.id === boundDictId);

                    const selection = tagHierarchySelections[idx] || {};

                    const mainCategories = boundDict ? boundDict.items.filter((i: any) => !i.parentId) : [];
                    const subCategories = boundDict && selection.mainId 
                      ? boundDict.items.filter((i: any) => i.parentId === selection.mainId) 
                      : [];
                    const subSubCategories = boundDict && selection.subId 
                      ? boundDict.items.filter((i: any) => i.parentId === selection.subId) 
                      : [];

                    const handleMainChange = (mainId: string) => {
                      const mainItem = boundDict?.items.find((i: any) => i.id === mainId);
                      setTagHierarchySelections(prev => ({
                        ...prev,
                        [idx]: { mainId, subId: '', subSubId: '' }
                      }));
                      setActiveTagFilters(prev => ({
                        ...prev,
                        [idx]: mainItem ? mainItem.code : '*'
                      }));
                    };

                    const handleSubChange = (subId: string) => {
                      const subItem = boundDict?.items.find((i: any) => i.id === subId);
                      setTagHierarchySelections(prev => ({
                        ...prev,
                        [idx]: { ...prev[idx], subId, subSubId: '' }
                      }));
                      setActiveTagFilters(prev => ({
                        ...prev,
                        [idx]: subItem 
                          ? subItem.code 
                          : (boundDict?.items.find((i: any) => i.id === selection.mainId)?.code || '*')
                      }));
                    };

                    const handleSubSubChange = (subSubId: string) => {
                      const subSubItem = boundDict?.items.find((i: any) => i.id === subSubId);
                      setTagHierarchySelections(prev => ({
                        ...prev,
                        [idx]: { ...prev[idx], subSubId }
                      }));
                      setActiveTagFilters(prev => ({
                        ...prev,
                        [idx]: subSubItem 
                          ? subSubItem.code 
                          : (boundDict?.items.find((i: any) => i.id === selection.subId)?.code || '*')
                      }));
                    };

                    return (
                      <div key={`tag-seg-${idx}`} className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 relative group transition-all text-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-200/40 dark:border-slate-800/45 pb-1 mb-2">
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 uppercase tracking-wider">
                              Segment KKS {idx + 1}
                            </span>
                            {idx >= getMaximumTagSegmentLength() && (
                              <button
                                onClick={() => {
                                  setAddedTagSegmentsCount(prev => Math.max(0, prev - 1));
                                  setActiveTagFilters(prev => {
                                    const clone = { ...prev };
                                    delete clone[idx];
                                    return clone;
                                  });
                                }}
                                className="p-0.5 text-slate-400 hover:text-red-500 rounded transition-colors border-none bg-transparent cursor-pointer"
                                title="Удалить сегмент"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Unified Custom Input */}
                          <div className="space-y-1">
                            <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                              Поиск сегмента:
                            </span>
                            <input
                              type="text"
                              placeholder="Значение..."
                              value={currentVal === '*' ? '' : currentVal}
                              onChange={(e) =>
                                setActiveTagFilters(prev => ({ ...prev, [idx]: e.target.value || '*' }))
                              }
                              className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs rounded-md text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                            />
                          </div>

                          {/* Quick Select from Custom Preset Filter Categories */}
                          {(() => {
                            const presetDict = dictionaries.find(d => d.name === '__tag_presets_config__');
                            const presetItems = presetDict?.items || [];
                            const filterCategories = presetItems.filter((i: any) => !i.parentId);
                            const activeCatId = selectedTagFilterCategoryIds[idx] || '';
                            const categoryOptions = presetItems.filter((i: any) => i.parentId === activeCatId);

                            if (filterCategories.length === 0) return null;

                            return (
                              <div className="space-y-1 border-t border-slate-200/40 dark:border-slate-800/40 mt-2 pt-2">
                                <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                                  Категория фильтра:
                                </span>
                                <CustomSelect
                                  value={activeCatId}
                                  onChange={(val) => setSelectedTagFilterCategoryIds(prev => ({ ...prev, [idx]: val }))}
                                  placeholder="-- Категории справочника --"
                                  options={filterCategories.map((cat: any) => ({
                                    value: cat.id,
                                    label: cat.nameRu
                                  }))}
                                />

                                {activeCatId && (
                                  <div className="bg-white/40 dark:bg-slate-950/20 p-2 rounded border border-slate-200/40 dark:border-slate-800/40 space-y-1">
                                    <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                                      Каталог:
                                    </span>
                                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto style-scrollbar pr-1">
                                      {categoryOptions.map((opt: any) => {
                                        const optVal = opt.code || opt.nameRu;
                                        const isSel = currentVal === optVal;
                                        return (
                                          <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setActiveTagFilters(prev => ({ ...prev, [idx]: optVal }))}
                                            className={`px-1.5 py-0.5 border rounded text-[10px] font-mono transition-all duration-150 cursor-pointer border-none ${
                                              isSel
                                                ? 'bg-emerald-600 border-emerald-600 text-white font-bold'
                                                : 'bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                            }`}
                                          >
                                            {opt.nameRu}
                                          </button>
                                        );
                                      })}
                                      {categoryOptions.length === 0 && (
                                        <span className="text-[8px] text-slate-400 dark:text-slate-600 italic">Варианты отсутствуют</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Base database match list with max-h and scrollbar */}
                          {uniqueList.length > 0 && (
                            <div className="space-y-1 text-left border-t border-slate-200/40 dark:border-slate-800/40 mt-2 pt-2">
                              <span className="block text-[8px] font-bold text-slate-400/80 dark:text-slate-500 uppercase tracking-wide">
                                В базе ({uniqueList.length}):
                              </span>
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto style-scrollbar">
                                {uniqueList.map((val) => {
                                  const isSelected = currentVal === val;
                                  return (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={() => setActiveTagFilters(prev => ({ ...prev, [idx]: val }))}
                                      className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer font-mono font-semibold transition-all duration-150 border-none uppercase tracking-wider ${
                                        isSelected
                                          ? 'bg-emerald-600 text-white font-bold'
                                          : 'bg-white hover:bg-slate-150 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800'
                                      }`}
                                    >
                                      {val}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Dictionary Integration Binding Section */}
                        <div className="space-y-1 border-t border-slate-200/40 dark:border-slate-800/40 mt-2 pt-2">
                          <div className="space-y-1">
                            <span className="block text-[9px] font-semibold text-slate-450 dark:text-slate-500 uppercase tracking-wider">
                              Связать со справочником KKS:
                            </span>
                            <CustomSelect
                              value={boundDictId}
                              onChange={(val) => {
                                setTagDictBindings(prev => ({ ...prev, [idx]: val }));
                                setTagHierarchySelections(prev => ({ ...prev, [idx]: {} }));
                              }}
                              placeholder="-- Без справочника --"
                              options={dictionaries.map((dict) => ({
                                value: dict.id,
                                label: dict.name
                              }))}
                            />
                          </div>

                          {boundDict && (
                            <div className="space-y-1 mt-1 bg-white/40 dark:bg-slate-950/20 p-2 rounded border border-slate-200/40 dark:border-slate-800/40 text-[10px]">
                              {/* Main Category */}
                              <div className="space-y-0.5 animate-fadeIn">
                                <span className="block text-[8px] font-bold text-slate-400 uppercase">1. Главная</span>
                                <CustomSelect
                                  value={selection.mainId || ''}
                                  onChange={(val) => handleMainChange(val)}
                                  placeholder="Не выбрано"
                                  options={mainCategories.map((cat: any) => ({
                                    value: cat.id,
                                    label: `${cat.code} — ${cat.nameRu}`
                                  }))}
                                />
                              </div>

                              {/* Subcategory */}
                              {selection.mainId && subCategories.length > 0 && (
                                <div className="space-y-0.5 animate-fadeIn">
                                  <span className="block text-[8px] font-bold text-slate-400 uppercase">2. Подкатегория</span>
                                  <CustomSelect
                                    value={selection.subId || ''}
                                    onChange={(val) => handleSubChange(val)}
                                    placeholder="Не выбрано"
                                    options={subCategories.map((sub: any) => ({
                                      value: sub.id,
                                      label: `${sub.code} — ${sub.nameRu}`
                                    }))}
                                  />
                                </div>
                              )}

                              {/* Sub-subcategory */}
                              {selection.subId && subSubCategories.length > 0 && (
                                <div className="space-y-0.5 animate-fadeIn">
                                  <span className="block text-[8px] font-bold text-slate-400 uppercase">3. Подподкатегория</span>
                                  <CustomSelect
                                    value={selection.subSubId || ''}
                                    onChange={(val) => handleSubSubChange(val)}
                                    placeholder="Не выбрано"
                                    options={subSubCategories.map((s: any) => ({
                                      value: s.id,
                                      label: `${s.code} — ${s.nameRu}`
                                    }))}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT COLUMN: MARK FILTERING ZONE */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-850">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                      👉 RIGHT SIDE: Mark Filtering Zone
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Фильтрация физического состава марки (поддержка любых языков).</p>
                  </div>
                  <button
                    onClick={() => setAddedMarkSegmentsCount(prev => prev + 1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer border-none"
                  >
                    <Plus className="w-3 h-3" /> Добавить сегмент
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: getMaximumMarkSegmentLength() + addedMarkSegmentsCount }).map((_, idx) => {
                    const uniqueList = getUniqueMarkSegmentValuesForPos(idx);
                    const currentVal = activeMarkFilters[idx] || '';

                    const boundDictId = markDictBindings[idx] || '';
                    const boundDict = dictionaries.find(d => d.id === boundDictId);

                    const selection = markHierarchySelections[idx] || {};

                    const mainCategories = boundDict ? boundDict.items.filter((i: any) => !i.parentId) : [];
                    const subCategories = boundDict && selection.mainId 
                      ? boundDict.items.filter((i: any) => i.parentId === selection.mainId) 
                      : [];
                    const subSubCategories = boundDict && selection.subId 
                      ? boundDict.items.filter((i: any) => i.parentId === selection.subId) 
                      : [];

                    const handleMainChange = (mainId: string) => {
                      const mainItem = boundDict?.items.find((i: any) => i.id === mainId);
                      setMarkHierarchySelections(prev => ({
                        ...prev,
                        [idx]: { mainId, subId: '', subSubId: '' }
                      }));
                      setActiveMarkFilters(prev => ({
                        ...prev,
                        [idx]: mainItem ? mainItem.code : '*'
                      }));
                    };

                    const handleSubChange = (subId: string) => {
                      const subItem = boundDict?.items.find((i: any) => i.id === subId);
                      setMarkHierarchySelections(prev => ({
                        ...prev,
                        [idx]: { ...prev[idx], subId, subSubId: '' }
                      }));
                      setActiveMarkFilters(prev => ({
                        ...prev,
                        [idx]: subItem 
                          ? subItem.code 
                          : (boundDict?.items.find((i: any) => i.id === selection.mainId)?.code || '*')
                      }));
                    };

                    const handleSubSubChange = (subSubId: string) => {
                      const subSubItem = boundDict?.items.find((i: any) => i.id === subSubId);
                      setMarkHierarchySelections(prev => ({
                        ...prev,
                        [idx]: { ...prev[idx], subSubId }
                      }));
                      setActiveMarkFilters(prev => ({
                        ...prev,
                        [idx]: subSubItem 
                          ? subSubItem.code 
                          : (boundDict?.items.find((i: any) => i.id === selection.subId)?.code || '*')
                      }));
                    };

                    return (
                      <div key={`mark-seg-${idx}`} className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 relative group transition-all text-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-200/40 dark:border-slate-800/45 pb-1 mb-2">
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 uppercase tracking-wider">
                              Segment Mark {idx + 1}
                            </span>
                            {idx >= getMaximumMarkSegmentLength() && (
                              <button
                                onClick={() => {
                                  setAddedMarkSegmentsCount(prev => Math.max(0, prev - 1));
                                  setActiveMarkFilters(prev => {
                                    const clone = { ...prev };
                                    delete clone[idx];
                                    return clone;
                                  });
                                }}
                                className="p-0.5 text-slate-400 hover:text-red-500 rounded transition-colors border-none bg-transparent cursor-pointer"
                                title="Удалить сегмент"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Unified Custom Input */}
                          <div className="space-y-1">
                            <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wide">
                              Поиск сегмента:
                            </span>
                            <input
                              type="text"
                              placeholder="Значение..."
                              value={currentVal === '*' ? '' : currentVal}
                              onChange={(e) =>
                                setActiveMarkFilters(prev => ({ ...prev, [idx]: e.target.value || '*' }))
                              }
                              className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-80 style-scrollbar text-xs rounded-md text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                            />
                          </div>

                          {/* Quick Select from Custom Preset Filter Categories */}
                          {(() => {
                            const presetDict = dictionaries.find(d => d.name === '__tag_presets_config__');
                            const presetItems = presetDict?.items || [];
                            const filterCategories = presetItems.filter((i: any) => !i.parentId);
                            const activeCatId = selectedMarkFilterCategoryIds[idx] || '';
                            const categoryOptions = presetItems.filter((i: any) => i.parentId === activeCatId);

                            if (filterCategories.length === 0) return null;

                            return (
                              <div className="space-y-1 border-t border-slate-200/40 dark:border-slate-800/40 mt-2 pt-2">
                                <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wide">
                                  Категория фильтра:
                                </span>
                                <CustomSelect
                                  value={activeCatId}
                                  onChange={(val) => setSelectedMarkFilterCategoryIds(prev => ({ ...prev, [idx]: val }))}
                                  placeholder="-- Категории справочника --"
                                  options={filterCategories.map((cat: any) => ({
                                    value: cat.id,
                                    label: cat.nameRu
                                  }))}
                                />

                                {activeCatId && (
                                  <div className="bg-white/40 dark:bg-slate-950/20 p-2 rounded border border-slate-200/40 dark:border-slate-800/40 space-y-1">
                                    <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                                      Каталог:
                                    </span>
                                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto style-scrollbar pr-1">
                                      {categoryOptions.map((opt: any) => {
                                        const optVal = opt.code || opt.nameRu;
                                        const isSel = currentVal === optVal;
                                        return (
                                          <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setActiveMarkFilters(prev => ({ ...prev, [idx]: optVal }))}
                                            className={`px-1.5 py-0.5 border rounded text-[10px] font-mono transition-all duration-150 cursor-pointer border-none ${
                                              isSel
                                                ? 'bg-amber-600 border-amber-600 text-white font-bold'
                                                : 'bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                            }`}
                                          >
                                            {opt.nameRu}
                                          </button>
                                        );
                                      })}
                                      {categoryOptions.length === 0 && (
                                        <span className="text-[8px] text-slate-400 dark:text-slate-600 italic">Варианты отсутствуют</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Base database match list with max-h and scrollbar */}
                          {uniqueList.length > 0 && (
                            <div className="space-y-1 text-left border-t border-slate-200/40 dark:border-slate-800/40 mt-2 pt-2">
                              <span className="block text-[8px] font-bold text-slate-400/80 dark:text-slate-500 uppercase tracking-wide">
                                В базе ({uniqueList.length}):
                              </span>
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto style-scrollbar">
                                {uniqueList.map((val) => {
                                  const isSelected = currentVal === val;
                                  return (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={() => setActiveMarkFilters(prev => ({ ...prev, [idx]: val }))}
                                      className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer font-mono font-semibold transition-all duration-150 border-none uppercase tracking-wider ${
                                        isSelected
                                          ? 'bg-amber-600 text-white font-bold'
                                          : 'bg-white hover:bg-slate-150 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800'
                                      }`}
                                    >
                                      {val}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Dictionary Integration Binding Section */}
                        <div className="space-y-1 border-t border-slate-200/40 dark:border-slate-800/40 mt-2 pt-2">
                          <div className="space-y-1">
                            <span className="block text-[9px] font-semibold text-slate-455 dark:text-slate-500 uppercase tracking-wider">
                              Связать со справочником Mark:
                            </span>
                            <CustomSelect
                              value={boundDictId}
                              onChange={(val) => {
                                setMarkDictBindings(prev => ({ ...prev, [idx]: val }));
                                setMarkHierarchySelections(prev => ({ ...prev, [idx]: {} }));
                              }}
                              placeholder="-- Без справочника --"
                              options={dictionaries.map((dict) => ({
                                value: dict.id,
                                label: dict.name
                              }))}
                            />
                          </div>

                          {boundDict && (
                            <div className="space-y-1 mt-1 bg-white/40 dark:bg-slate-950/20 p-2 rounded border border-slate-200/40 dark:border-slate-800/40 text-[10px]">
                              {/* Main Category */}
                              <div className="space-y-0.5 animate-fadeIn">
                                <span className="block text-[8px] font-bold text-slate-400 uppercase">1. Главная</span>
                                <CustomSelect
                                  value={selection.mainId || ''}
                                  onChange={(val) => handleMainChange(val)}
                                  placeholder="Не выбрано"
                                  options={mainCategories.map((cat: any) => ({
                                    value: cat.id,
                                    label: `${cat.code} — ${cat.nameRu}`
                                  }))}
                                />
                              </div>

                              {/* Subcategory */}
                              {selection.mainId && subCategories.length > 0 && (
                                <div className="space-y-0.5 animate-fadeIn">
                                  <span className="block text-[8px] font-bold text-slate-400 uppercase">2. Подкатегория</span>
                                  <CustomSelect
                                    value={selection.subId || ''}
                                    onChange={(val) => handleSubChange(val)}
                                    placeholder="Не выбрано"
                                    options={subCategories.map((sub: any) => ({
                                      value: sub.id,
                                      label: `${sub.code} — ${sub.nameRu}`
                                    }))}
                                  />
                                </div>
                              )}

                              {/* Sub-subcategory */}
                              {selection.subId && subSubCategories.length > 0 && (
                                <div className="space-y-0.5 animate-fadeIn">
                                  <span className="block text-[8px] font-bold text-slate-400 uppercase">3. Подподкатегория</span>
                                  <CustomSelect
                                    value={selection.subSubId || ''}
                                    onChange={(val) => handleSubSubChange(val)}
                                    placeholder="Не выбрано"
                                    options={subSubCategories.map((s: any) => ({
                                      value: s.id,
                                      label: `${s.code} — ${s.nameRu}`
                                    }))}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SEPARATOR AND SUPPLEMENTARY CONTROLS */}
              <div className="lg:col-span-2 flex flex-wrap gap-6 pt-3 border-t border-slate-100 dark:border-slate-850 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeEmptyWBS}
                    onChange={(e) => setExcludeEmptyWBS(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Исключить пустые WBS элементы</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyWithWarning}
                    onChange={(e) => setOnlyWithWarning(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Только теги с предупреждениями (Критично/Проверить)</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTagFilters({});
                    setActiveMarkFilters({});
                    setTagDictBindings({});
                    setMarkDictBindings({});
                    setTagHierarchySelections({});
                    setMarkHierarchySelections({});
                    setSelectedTagFilterCategoryIds({});
                    setSelectedMarkFilterCategoryIds({});
                    setAddedTagSegmentsCount(0);
                    setAddedMarkSegmentsCount(0);
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 ml-auto font-bold cursor-pointer border-none bg-transparent"
                >
                  Сбросить все настройки сегментов
                </button>
              </div>
            </div>

            {/* EXPORT COLUMNS SETTINGS */}
            <div className="p-5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    2. Выберите колонки для Экспорта в Excel (.CSV)
                  </h3>
                  <p className="text-[11px] text-slate-500">Управляйте структурой скачиваемого файла в зависимости от потребностей верификации состава всех систем.</p>
                </div>

                <button
                  onClick={handleExportSelectedToExcel}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Экспортировать подборку в Excel</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-4 pt-1 text-xs">
                <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportColumns.identifier}
                    onChange={(e) => setExportColumns(p => ({ ...p, identifier: e.target.checked }))}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Код тега (Identifier)</span>
                </label>
                <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportColumns.parts}
                    onChange={(e) => setExportColumns(p => ({ ...p, parts: e.target.checked }))}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Сегменты отдельно (Segment breakdown)</span>
                </label>
                <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportColumns.department}
                    onChange={(e) => setExportColumns(p => ({ ...p, department: e.target.checked }))}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Технологическая зона / Дисциплина</span>
                </label>
                <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportColumns.fluid}
                    onChange={(e) => setExportColumns(p => ({ ...p, fluid: e.target.checked }))}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Рабочая среда (Fluid)</span>
                </label>
                <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportColumns.chain}
                    onChange={(e) => setExportColumns(p => ({ ...p, chain: e.target.checked }))}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Связи по иерархической цепочке родителей</span>
                </label>
                <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportColumns.brand}
                    onChange={(e) => setExportColumns(p => ({ ...p, brand: e.target.checked }))}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Марка оборудования</span>
                </label>
                <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportColumns.brandParts}
                    onChange={(e) => setExportColumns(p => ({ ...p, brandParts: e.target.checked }))}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Сегменты марки отдельно</span>
                </label>
                <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportColumns.descriptions}
                    onChange={(e) => setExportColumns(p => ({ ...p, descriptions: e.target.checked }))}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Подописания / Контрольные точки КИП</span>
                </label>
              </div>
            </div>

            {/* MATCHED RESULTS PREVIEW TABLE */}
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-150 dark:border-slate-855 flex justify-between items-center bg-slate-50/40 dark:bg-slate-900/40 border-none">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">
                  3. Выходные данные ({matchedTagsList.length} записей подобрано)
                </span>
              </div>

              <div 
                ref={parentRefSegments}
                className="overflow-auto max-h-[600px] style-scrollbar"
              >
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="sticky top-0 bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-250 dark:border-slate-850 text-xs font-semibold uppercase tracking-wider z-10 shadow-xs">
                    <tr>
                      <th className="px-5 py-3.5">Tag Segments (Тег KKS)</th>
                      <th className="px-5 py-3.5">Mark Segments (Характеристики)</th>
                      <th className="px-5 py-3.5">Наименование тега (Name)</th>
                      <th className="px-5 py-3.5 flex items-center justify-between col-span-1">
                        <span>Статус / Актуальность (Status)</span>
                        <button
                          type="button"
                          onClick={() => alert("Дополнительное расширение колонок динамическими справочниками будет доступно в следующем релизе!")}
                          className="p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-905 hover:scale-105 transition-all cursor-pointer font-bold shrink-0 shadow-xs flex items-center justify-center w-5 h-5 ml-2"
                          title="Добавить колонку (Spreadsheet Extension)"
                        >
                          +
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {segmentsVirtualizer.getVirtualItems().length > 0 && (
                      <tr style={{ height: `${segmentsVirtualizer.getVirtualItems()[0].start}px`, border: 'none' }}>
                        <td colSpan={4} style={{ padding: 0, border: 'none' }} />
                      </tr>
                    )}
                    {segmentsVirtualizer.getVirtualItems().map((virtualRow) => {
                      const t = matchedTagsList[virtualRow.index];
                      if (!t) return null;
                      const tMeta = parseTagMetadata(t);
                      const tagParts = tMeta.tagSegments && tMeta.tagSegments.length > 0
                        ? tMeta.tagSegments
                        : splitSegments(t.identifier || '');
                        
                      const markParts = tMeta.markSegments && tMeta.markSegments.length > 0
                        ? tMeta.markSegments
                        : splitSegments(t.brand || '');

                      const overallStatus = getTagOverallStatus(t);
                      const statusCfg = statusConfig[overallStatus] || statusConfig.draft;

                      return (
                        <tr 
                          key={t.id} 
                          ref={segmentsVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-colors"
                        >
                          {/* COLUMN 1: TAG SEGMENTS (KKS) */}
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-1">
                              {tagParts.map((part, idx) => {
                                const isMatched = activeTagFilters[idx] && activeTagFilters[idx] !== '*' && activeTagFilters[idx] === part;
                                return (
                                  <span 
                                    key={`tag-part-${idx}`} 
                                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase transition-all ${
                                      isMatched 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200 border border-green-300 dark:border-green-800 ring-2 ring-green-400/25' 
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/40'
                                    }`}
                                  >
                                    {part}
                                  </span>
                                );
                              })}
                            </div>
                          </td>

                          {/* COLUMN 2: MARK SEGMENTS */}
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-1">
                              {markParts.map((part, idx) => {
                                const isMatched = activeMarkFilters[idx] && activeMarkFilters[idx] !== '*' && activeMarkFilters[idx] === part;
                                return (
                                  <span 
                                    key={`mark-part-${idx}`} 
                                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase transition-all ${
                                      isMatched 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200 border border-green-300 dark:border-green-800 ring-2 ring-green-400/25' 
                                        : 'bg-amber-50 dark:bg-slate-900 text-amber-800 dark:text-amber-400 border border-amber-200/40 dark:border-amber-900/45'
                                    }`}
                                  >
                                    {part}
                                  </span>
                                );
                              })}
                              {markParts.length === 0 && (
                                <span className="text-xs text-slate-400 italic">—</span>
                              )}
                            </div>
                            {t.brand && (
                              <span className="text-[10px] text-slate-450 dark:text-slate-500 block mt-1 font-medium select-all font-mono">
                                {t.brand}
                              </span>
                            )}
                          </td>

                          {/* COLUMN 3: NAME */}
                          <td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            <p className="font-bold text-slate-900 dark:text-white select-all">
                              {tMeta.mainName || <span className="italic opacity-50">Без наименования</span>}
                            </p>
                            <span className="text-[10px] text-slate-400 font-sans block mt-0.5 font-medium leading-relaxed font-mono">
                              {t.identifier}
                            </span>
                          </td>

                          {/* COLUMN 4: STATUS / RELEVANCE */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold border uppercase tracking-wider ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                                {statusCfg.label}
                              </span>
                              {tMeta.descriptions.length > 0 && (
                                <span className="text-[10px] text-rose-500 font-bold bg-rose-50 dark:bg-rose-950/20 px-1.5 py-0.5 rounded border border-rose-100 dark:border-rose-900/30">
                                  Замечаний ({tMeta.descriptions.length})
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {segmentsVirtualizer.getVirtualItems().length > 0 && (
                      <tr style={{ height: `${segmentsVirtualizer.getTotalSize() - segmentsVirtualizer.getVirtualItems()[segmentsVirtualizer.getVirtualItems().length - 1].end}px`, border: 'none' }}>
                        <td colSpan={4} style={{ padding: 0, border: 'none' }} />
                      </tr>
                    )}

                    {matchedTagsList.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center py-16 text-slate-400">
                          Под запрашиваемые критерии Tag или Mark сегментов не подходит ни один тег. Пожалуйста, поменяйте конфигурацию фильтров.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* SPECIFICATION TABLE */}
        {activeTab === 'table' && (
          <motion.div
            key="table-spec-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="h-full w-full flex flex-col min-h-0 text-left pr-1"
          >
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl shadow-xs overflow-hidden border-none flex-1 flex flex-col min-h-0">
              {/* Optional view controls bar */}
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/40 flex justify-between items-center flex-wrap gap-2 border-none shrink-0">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Спецификация и Актуальность систем ({sortedTagsList.length} записей)</span>
                
                <button
                  type="button"
                  onClick={() => setShowOptionalTableColumns(!showOptionalTableColumns)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                    showOptionalTableColumns
                      ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 shadow-xs'
                      : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{showOptionalTableColumns ? 'Скрыть поля Отдел/Среда' : 'Показать поля Отдел/Среда'}</span>
                </button>
              </div>

              <div 
                ref={parentRefTable}
                className="overflow-auto flex-1 min-h-0 style-scrollbar"
              >
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="sticky top-0 bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-850 text-xs font-semibold uppercase tracking-wider z-10 shadow-xs">
                    <tr>
                      <th className="px-5 py-3.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('identifier')}>
                        Тег / Главное наименование {sortConfig.key === 'identifier' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-5 py-3.5 cursor-pointer hover:bg-slate-105 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('brand')}>
                        Марка {sortConfig.key === 'brand' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      {showOptionalTableColumns && (
                        <>
                          <th className="px-5 py-3.5 cursor-pointer hover:bg-slate-105 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('department')}>
                            Зона / Отдел {sortConfig.key === 'department' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-5 py-3.5 cursor-pointer hover:bg-slate-105 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('fluid')}>
                            Тех. Среда {sortConfig.key === 'fluid' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                          </th>
                        </>
                      )}
                      <th className="px-5 py-3.5 font-bold">Распознанные подописания КИПиА</th>
                      <th className="px-5 py-3.5 cursor-pointer hover:bg-slate-105 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('createdAt')}>
                        Регистрация {sortConfig.key === 'createdAt' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-5 py-3.5 font-bold text-right">Управление</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {tableVirtualizer.getVirtualItems().length > 0 && (
                      <tr style={{ height: `${tableVirtualizer.getVirtualItems()[0].start}px`, border: 'none' }}>
                        <td colSpan={showOptionalTableColumns ? 7 : 5} style={{ padding: 0, border: 'none' }} />
                      </tr>
                    )}
                    {tableVirtualizer.getVirtualItems().map((virtualRow) => {
                      const t = sortedTagsList[virtualRow.index];
                      if (!t) return null;
                      const meta = parseTagMetadata(t);
                      return (
                        <tr 
                          key={t.id} 
                          ref={tableVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-colors"
                        >
                          <td className="px-5 py-4">
                            <div className="font-mono font-bold text-slate-900 dark:text-white text-xs select-all">
                              {t.identifier}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {meta.mainName || <span className="italic opacity-50">Без наименования</span>}
                            </div>
                            
                            {/* Optional visual pills shown when separate columns are closed */}
                            {!showOptionalTableColumns && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] text-slate-450 dark:text-slate-500 font-medium">
                                <span className="bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-850 px-1.5 py-0.5 rounded text-[10px]" title="Инженерная Дисциплина">
                                  {t.department || 'Комплексный'}
                                </span>
                                <span>•</span>
                                <span className="font-mono bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-850 px-1.5 py-0.5 rounded" title="Технологическая Среда">
                                  среда: {t.fluid || '-'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {t.brand ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-xs max-w-[150px] truncate" title={t.brand}>
                                {t.brand}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 italic text-xs">—</span>
                            )}
                          </td>
                          {showOptionalTableColumns && (
                            <>
                              <td className="px-5 py-4 text-slate-605 dark:text-slate-300 text-xs font-medium">
                                {t.department || '-'}
                              </td>
                              <td className="px-5 py-4 text-slate-605 dark:text-slate-300 text-xs font-mono">
                                {t.fluid || '-'}
                              </td>
                            </>
                          )}
                          <td className="px-5 py-4">
                            {meta.descriptions.length > 0 ? (
                              <div className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowTableDescriptions(p => ({ ...p, [t.id]: !p[t.id] }));
                                    setTimeout(() => tableVirtualizer.measure(), 20);
                                  }}
                                  className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer text-slate-650 dark:text-slate-300 border border-slate-200 dark:border-slate-805"
                                >
                                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>{showTableDescriptions[t.id] ? 'Скрыть' : 'Показать'} подописания ({meta.descriptions.length})</span>
                                </button>
                                
                                {showTableDescriptions[t.id] && (
                                  <div className="space-y-1.5 max-w-[420px] pt-1.5 animate-fadeIn">
                                    {meta.descriptions.map((d) => {
                                      const config = statusConfig[d.status] || statusConfig.draft;
                                      const Icon = config.icon;
                                      return (
                                        <div key={d.id} className="flex items-start gap-1 p-1 px-2 bg-slate-50 dark:bg-slate-900 rounded text-[11px] text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-850 text-left">
                                          <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${config.text}`} />
                                          <div className="text-left">
                                            <strong className="text-slate-905 dark:text-slate-105">{d.text}: </strong>
                                            <span className="text-slate-500 dark:text-slate-400">{d.comment}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-xs">Нет подописаний</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-slate-500 font-mono text-xs">
                            {t.createdAt ? format(new Date(t.createdAt), 'dd.MM.yyyy HH:mm') : '-'}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingTag(t)}
                                className="p-1 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-500 rounded transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTag(t.id)}
                                className="p-1 hover:text-rose-600 text-slate-500 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {tableVirtualizer.getVirtualItems().length > 0 && (
                      <tr style={{ height: `${tableVirtualizer.getTotalSize() - tableVirtualizer.getVirtualItems()[tableVirtualizer.getVirtualItems().length - 1].end}px`, border: 'none' }}>
                        <td colSpan={showOptionalTableColumns ? 7 : 5} style={{ padding: 0, border: 'none' }} />
                      </tr>
                    )}

                    {tags.length === 0 && (
                      <tr>
                        <td colSpan={showOptionalTableColumns ? 7 : 5} className="text-center py-20 text-slate-400">
                          В данном проекте отсутствуют теги. Создайте первый тег выше!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
      </div>

      {/* DETAIL MODAL DESCRIPTIONS CONTROL DIALOG */}
      <AnimatePresence>
        {editingTag && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl border border-slate-205 dark:border-slate-850 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-5 bg-slate-900 dark:bg-slate-900 text-white flex items-center justify-between border-b dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Database className="w-5 h-5 text-emerald-400 font-bold" />
                  <div className="text-left">
                    <h3 className="text-base font-bold font-mono tracking-tight">{editingTag.identifier}</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Свойства и структура подописаний</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEditingTag(null);
                    loadTags();
                  }}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer animate-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-5 text-left">
                
                {/* UPDATE MAIN NAME FORM */}
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Главное наименование тега</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Напр., Приточная вентиляционная установка"
                      defaultValue={parseTagMetadata(editingTag).mainName || ''}
                      id="modal-main-name-input"
                      className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl text-sm text-slate-850 dark:text-slate-100 focus:outline-none"
                    />
                    <button
                      onClick={async () => {
                        const inputEl = document.getElementById('modal-main-name-input') as HTMLInputElement;
                        if (inputEl) {
                          await handleUpdateMainName(editingTag.id, inputEl.value);
                          alert('Главное наименование успешно записано!');
                        }
                      }}
                      className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer border-none"
                    >
                      Применить
                    </button>
                  </div>
                </div>

                {/* RE-ASSIGN PARENT TAG FORM */}
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Родительский тег (Мастер)</label>
                  <CustomSelect
                    value={parseTagMetadata(editingTag).parentId || 'none'}
                    onChange={(val) => handleUpdateParent(editingTag.id, val)}
                    placeholder="-- Нет родительского тега --"
                    options={[
                      { value: "none", label: "-- Нет родительского тега --" },
                      ...tags
                        .filter(t => t.id !== editingTag.id)
                        .map(t => ({
                          value: t.id,
                          label: `${t.identifier} (${t.department || 'Комплексный'})`
                        }))
                    ]}
                  />
                </div>

                {/* DYNAMIC CATEGORIES FORM SECTION */}
                {(() => {
                  const configDict = dictionaries.find(d => d.name === '__tag_creation_config__');
                  const cats = configDict
                    ? (configDict.items || [])
                        .filter((i: any) => !i.parentId)
                        .sort((a: any, b: any) => a.code.localeCompare(b.code))
                    : [];

                  if (cats.length > 0) {
                    const tagMeta = parseTagMetadata(editingTag);
                    const tagDFields = tagMeta.dynamicFields || {};

                    return (
                      <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Дополнительные параметры</label>
                        <div className="grid grid-cols-2 gap-3.5">
                          {cats.map((cat: any) => {
                            const options = (configDict?.items || [])
                              .filter((i: any) => i.parentId === cat.id)
                              .sort((a: any, b: any) => a.nameRu.localeCompare(b.nameRu));

                            return (
                              <div key={cat.id} className="space-y-1">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{cat.nameRu}</span>
                                <CustomSelect
                                  value={tagDFields[cat.nameRu] || ''}
                                  onChange={(val) => handleUpdateDynamicFields(editingTag.id, { [cat.nameRu]: val })}
                                  placeholder="-- Выберите --"
                                  options={options.map((opt: any) => ({
                                    value: opt.nameRu,
                                    label: opt.nameRu
                                  }))}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* EDIT BRAND (МАРКА) SECTION */}
                <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-left">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Марка оборудования</label>
                  
                  {/* Reference Dropdowns */}
                  {(() => {
                    const markingDict = dictionaries.find(d => d.name === '__tag_marking_config__');
                    const mItems = markingDict?.items || [];
                    const mCats = mItems
                      .filter((i: any) => !i.parentId)
                      .sort((a: any, b: any) => a.code.localeCompare(b.code));

                    if (mCats.length > 0) {
                      return (
                        <div className="space-y-2 pb-2 border-b border-slate-200/50 dark:border-slate-800/50">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Конструктор марки:</p>
                          <div className="grid grid-cols-3 gap-2">
                            {mCats.map((cat: any) => {
                              const options = mItems
                                .filter((i: any) => i.parentId === cat.id)
                                .sort((a: any, b: any) => a.nameRu.localeCompare(b.nameRu));

                              return (
                                <div key={cat.id} className="space-y-1">
                                  <span className="text-[9px] uppercase font-bold text-slate-400">{cat.nameRu}</span>
                                  <CustomSelect
                                    value={editTagMarkingSelections[cat.id] || ''}
                                    onChange={(val) => {
                                      const updatedSelections = { ...editTagMarkingSelections, [cat.id]: val };
                                      setEditTagMarkingSelections(updatedSelections);
                                      
                                      // Compile brand
                                      const parts = mCats
                                        .map((c: any) => updatedSelections[c.id])
                                        .filter(Boolean);
                                      setEditTagBrand(parts.join(editTagMarkingSeparator));
                                    }}
                                    placeholder="-- выбрать --"
                                    options={options.map((opt: any) => ({
                                      value: opt.nameRu,
                                      label: opt.nameRu
                                    }))}
                                  />
                                </div>
                              );
                            })}

                            <div className="space-y-1">
                              <span className="text-[9px] uppercase font-bold text-slate-400">Разделитель</span>
                              <CustomSelect
                                value={editTagMarkingSeparator}
                                onChange={(val) => {
                                  const sep = val;
                                  setEditTagMarkingSeparator(sep);
                                  
                                  const parts = mCats
                                    .map((c: any) => editTagMarkingSelections[c.id])
                                    .filter(Boolean);
                                  setEditTagBrand(parts.join(sep));
                                }}
                                options={[
                                  { value: "-", label: "-" },
                                  { value: "/", label: "/" },
                                  { value: ".", label: "." },
                                  { value: " ", label: "пробел" },
                                  { value: "", label: "без знака" }
                                ]}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Задайте марку (напр: Датчик-К1)"
                      value={editTagBrand}
                      onChange={(e) => setEditTagBrand(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none font-medium"
                    />
                    <button
                      onClick={async () => {
                        await handleUpdateBrand(editingTag.id, editTagBrand);
                        alert('Марка оборудования успешно сохранена!');
                      }}
                      className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer border-none"
                    >
                      Применить
                    </button>
                  </div>
                </div>

                {/* ADD DESCRIPTION FORM */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-slate-750 dark:text-slate-200 uppercase tracking-widest flex items-center gap-1">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    Зафиксировать подописание с комментарием
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500">Заголовок описания</span>
                      <input
                        type="text"
                        placeholder="Напр., Датчик TE-101"
                        id="modal-desc-input"
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500">Статус актуальности</span>
                      <CustomSelect
                        value={modalStatusInput}
                        onChange={(val) => setModalStatusInput(val)}
                        options={actualitySelectOptions}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500">Комментарии / Замечания</span>
                    <input
                      type="text"
                      placeholder="Введите замечания или лог проверки..."
                      id="modal-comment-input"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                    />
                  </div>

                  <button
                    onClick={() => {
                      const textEl = document.getElementById('modal-desc-input') as HTMLInputElement;
                      const commentEl = document.getElementById('modal-comment-input') as HTMLInputElement;
                      if (textEl && textEl.value) {
                        handleAddDescription(editingTag.id, textEl.value, commentEl.value, modalStatusInput as any);
                        textEl.value = '';
                        commentEl.value = '';
                        setModalStatusInput('actual');
                      }
                    }}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors border-none"
                  >
                    Добавить описание в реестр
                  </button>
                </div>

                {/* CURRENT LIST OF DESCRIPTIONS */}
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Подописания тега ({parseTagMetadata(editingTag).descriptions.length})
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {parseTagMetadata(editingTag).descriptions.map((desc) => {
                      const config = statusConfig[desc.status] || statusConfig.draft;
                      const Icon = config.icon;
                      const isEditingThisDesc = editingDescId === desc.id;

                      return (
                        <div key={desc.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg flex flex-col gap-2">
                          {isEditingThisDesc ? (
                            /* DESCRIPTIONS DIALOG INLINE LOADER EDITOR */
                            <div className="space-y-2 text-left w-full">
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={editDescForm.text}
                                  onChange={(e) => setEditDescForm(prev => ({ ...prev, text: e.target.value }))}
                                  className="px-2.5 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                                  placeholder="Название..."
                                />
                                <CustomSelect
                                  value={editDescForm.status}
                                  onChange={(val) => setEditDescForm(prev => ({ ...prev, status: val as any }))}
                                  options={actualitySelectOptions}
                                />
                              </div>
                              <textarea
                                value={editDescForm.comment}
                                onChange={(e) => setEditDescForm(prev => ({ ...prev, comment: e.target.value }))}
                                className="w-full p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs text-slate-800 dark:text-slate-100 focus:outline-none animate-none"
                                placeholder="Комментарий..."
                                rows={2}
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => setEditingDescId(null)}
                                  className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                >
                                  Отмена
                                </button>
                                <button
                                  onClick={async () => {
                                    await handleUpdateDescription(editingTag.id, desc.id, {
                                      text: editDescForm.text,
                                      comment: editDescForm.comment,
                                      status: editDescForm.status
                                    });
                                    setEditingDescId(null);
                                  }}
                                  className="px-3 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold rounded cursor-pointer"
                                >
                                  Сохранить
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* STANDARD MODE VIEW WITH STAMPS */
                            <>
                              <div className="flex items-start justify-between gap-2.5">
                                <div className="flex gap-2 text-left">
                                  <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.text}`} />
                                  <div>
                                    <p className="text-xs font-bold text-slate-850 dark:text-slate-100">{desc.text}</p>
                                    {desc.comment && (
                                      <p className="text-[10px] text-slate-550 dark:text-slate-400 mt-1 pl-1.5 border-l border-slate-200 dark:border-slate-750">
                                        {desc.comment}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[7.5px] font-semibold border ${config.bg} ${config.text} ${config.border}`}>
                                    {config.label}
                                  </span>
                                  <button
                                    title="Редактировать подописание"
                                    onClick={() => {
                                      setEditingDescId(desc.id);
                                      setEditDescForm({
                                        text: desc.text,
                                        comment: desc.comment || '',
                                        status: desc.status
                                      });
                                    }}
                                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-405 hover:text-emerald-600 transition-colors cursor-pointer"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveDescription(editingTag.id, desc.id)}
                                    className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950 rounded text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* TIMESTAMPS FOR CREATOR / UPDATER */}
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[8px] text-slate-450 dark:text-slate-500 font-mono mt-1 border-t border-slate-100 dark:border-slate-800/40 pt-1 leading-none">
                                <span>Ср: <strong>{desc.createdBy || 'Система'}</strong> {desc.createdAt && `(${formatDateStr(desc.createdAt)})`}</span>
                                {desc.updatedBy && (
                                  <>
                                    <span className="text-slate-300 dark:text-slate-755">|</span>
                                    <span>Из: <strong>{desc.updatedBy}</strong> {desc.updatedAt && `(${formatDateStr(desc.updatedAt)})`}</span>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {parseTagMetadata(editingTag).descriptions.length === 0 && (
                      <p className="text-center py-6 text-slate-400 text-xs italic">Описания отсутствуют.</p>
                    )}
                  </div>
                </div>

              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => {
                    setEditingTag(null);
                    loadTags();
                  }}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold cursor-pointer border-none"
                >
                  Готово
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CUSTOM MODAL FOR BINDING TAG TO COMPONENT BLOCKS */}
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
                  <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 font-mono">
                    Элемент: {bindingBlock.name}
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
                <input
                  type="text"
                  placeholder="Введите код или наименование..."
                  value={tagSearchText}
                  onChange={(e) => setTagSearchText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-950"
                />
              </div>

              {/* ACTIVE BINDINGS */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase">Текущие привязки:</span>
                <div className="flex flex-wrap gap-1.5 min-h-[30px] p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-850">
                  {bindingBlock.tags.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">Нет привязанного оборудования</span>
                  ) : (
                    bindingBlock.tags.map((t: any) => (
                      <span key={t.id} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md">
                        <span>{t.identifier}</span>
                        <button
                          onClick={() => handleUnpinTagFromComponent(bindingBlock.id, t.id)}
                          className="hover:text-rose-500 cursor-pointer border-none bg-transparent"
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
                        Подходящих тегов не зарегистрировано
                      </div>
                    );
                  }
                  return filtered.map((t) => {
                    const isAlreadyBound = bindingBlock.tags.some((activeT: any) => activeT.id === t.id);
                    return (
                      <div key={t.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent hover:border-slate-150 dark:hover:border-slate-850 select-none transition-all">
                        <div className="text-left max-w-[70%]">
                          <p className="font-mono text-xs font-bold text-slate-905 dark:text-slate-100">{t.identifier}</p>
                          <p className="text-[10px] text-slate-400 truncate">{parseTagMetadata(t).mainName || 'Без названия'}</p>
                        </div>
                        {isAlreadyBound ? (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 px-2.5 py-1 rounded">
                            Активен
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePinTagToComponent(bindingBlock.id, t.id)}
                            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] font-bold cursor-pointer border-none"
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
                  className="px-3 py-1.5 bg-slate-150 hover:bg-emerald-50 dark:bg-slate-900 dark:hover:bg-emerald-950/30 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-700 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
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
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-705 text-white rounded text-xs font-bold cursor-pointer border-none"
                >
                  Готово
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );

  // TREE VIEW RENDER NODE RECURSIVE FUNCTION
  function renderTreeNode(node: any, level: number) {
    const isExpanded = !!expandedTagIds[node.id];
    const isTreeDescVisible = !!showTreeDescriptions[node.id];
    const hasChildren = node.children && node.children.length > 0;
    const configList = node.meta.descriptions || [];

    return (
      <div key={node.id} className="space-y-1">
        <div 
          className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
          style={{ marginLeft: `${level * 24}px` }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
            <button
              onClick={() => toggleTagExpand(node.id)}
              className={`p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-all shrink-0 ${!hasChildren ? 'opacity-20 cursor-default' : ''}`}
              disabled={!hasChildren}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-600 dark:text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-400" />}
            </button>

            <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            
            <div className="min-w-0 flex flex-col md:flex-row md:items-center gap-1 md:gap-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm select-all">{node.identifier}</span>
                <span className="text-[10px] bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full border border-slate-200/60 dark:border-slate-800 font-semibold shrink-0">
                  {node.department || 'Комплексный'}
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[280px]" title={node.meta.mainName || 'Наименование отсутствует'}>
                {node.meta.mainName ? `— ${node.meta.mainName}` : <span className="italic opacity-60">— (Наименование отсутствует)</span>}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {configList.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTreeDescriptions(prev => ({ ...prev, [node.id]: !prev[node.id] }))}
                  title={isTreeDescVisible ? "Скрыть подописания" : `Показать подописания (${configList.length})`}
                  className={`p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer flex items-center justify-center ${
                    isTreeDescVisible ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 font-bold' : 'text-slate-400'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {configList.length > 0 && <span className="text-[10px] ml-1">{configList.length}</span>}
                </button>
                <div className="flex items-center gap-1">
                  {configList.slice(0, 3).map((d: any, idx: number) => {
                    const s = statusConfig[d.status] || statusConfig.draft;
                    return (
                      <span 
                        key={d.id || idx} 
                        title={`${d.text}: ${d.comment}`}
                        className={`w-2 h-2 rounded-full inline-block ${s.text} bg-current`}
                      />
                    );
                  })}
                  {configList.length > 3 && <span className="text-[9px] font-bold text-slate-400">+{configList.length - 3}</span>}
                </div>
              </div>
            )}

            <div className="flex bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setEditingTag(node)}
                title="Редактировать описания и комментарии тега"
                className="p-1 hover:text-emerald-600 dark:hover:text-emerald-400 rounded text-slate-500 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDeleteTag(node.id)}
                title="Удалить тег"
                className="p-1 hover:text-rose-500 rounded text-slate-550 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {configList.length > 0 && isTreeDescVisible && (
          <div className="space-y-1.5 pb-2 text-left animate-fadeIn" style={{ marginLeft: `${(level * 24) + 38}px` }}>
            {configList.map((desc: any) => {
              const s = statusConfig[desc.status] || statusConfig.draft;
              const Icon = s.icon;
              return (
                <div key={desc.id} className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-lg flex items-start gap-2 max-w-2xl">
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.text}`} />
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{desc.text}</span>
                    <span className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-semibold ml-2 ${s.bg} ${s.text} ${s.border}`}>
                      {s.label}
                    </span>
                    {desc.comment && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic pl-1.5 border-l border-slate-200 dark:border-slate-800 leading-normal">
                        {desc.comment}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {node.children.map((child: any) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  }
}
