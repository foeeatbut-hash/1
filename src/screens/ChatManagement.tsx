import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { useChatStore, ChatMessage } from '../store/chatStore';
import { 
  MessageSquare, 
  Search, 
  Paperclip, 
  Settings, 
  Send, 
  File, 
  Download, 
  ChevronRight, 
  ChevronLeft, 
  User, 
  X, 
  Link as LinkIcon, 
  Clock,
  Camera,
  Brush,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Formatted Message Component to recognize #TAG inline links
interface FormattedMessageProps {
  text: string;
  onTagClick: (tag: string) => void;
}

const FormattedMessage: React.FC<FormattedMessageProps> = ({ text, onTagClick }) => {
  if (!text) return null;
  
  const regex = /#([a-zA-Z0-9А-Яа-я\-]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    const matchText = match[0];
    const tagName = match[1];
    
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }
    
    parts.push(
      <button
        key={matchIndex}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTagClick(tagName);
        }}
        className="inline-flex items-center mx-0.5 px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-850 rounded text-xs font-bold text-indigo-700 dark:text-indigo-400 cursor-pointer hover:underline transition-all font-sans select-none align-baseline shrink-0"
      >
        #{tagName}
      </button>
    );
    
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return <span className="whitespace-pre-wrap leading-relaxed select-text font-sans">{parts.length > 0 ? parts : text}</span>;
};

export default function ChatManagement() {
  const { user, activeProject } = useStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const {
    messages,
    users,
    groups,
    activeReceiverId,
    activeGroupId,
    activeType,
    searchQuery,
    setSearchQuery,
    setActiveReceiverId,
    setActiveGroupId,
    fetchUsers,
    fetchGroups,
    fetchMessages,
    sendMessage,
    uploadFile,
    openFile,
    startPolling,
    stopPolling,
    setupSocket,
    disconnectSocket
  } = useChatStore();

  const [messageText, setMessageText] = useState('');
  const [stagedAttachments, setStagedAttachments] = useState<{ fileName: string; filePath: string; fileSize: number }[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementName, setSelectedElementName] = useState<string | null>(null);

  // Autocomplete suggestions state
  const messageInputRef = useRef<HTMLInputElement>(null);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<Array<{ text: string; description: string; elementId?: string }>>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);
  const [activeTagQuery, setActiveTagQuery] = useState<string | null>(null);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);

  // Helper to find the KKS/BIM tag query being typed at cursor position
  const getActiveTagQuery = (text: string, selectionStart: number | null) => {
    if (selectionStart === null) return null;
    const leftText = text.slice(0, selectionStart);
    const lastSpaceIdx = leftText.lastIndexOf(' ');
    const wordStartIdx = lastSpaceIdx === -1 ? 0 : lastSpaceIdx + 1;
    const word = leftText.slice(wordStartIdx);
    if (word.startsWith('#')) {
      return word.slice(1);
    }
    return null;
  };

  // Replace matched tag substring with actual clicked KKS/BIM tag identifier
  const insertTagAtCursor = (tagText: string) => {
    if (!messageInputRef.current) return;
    const input = messageInputRef.current;
    const selectionStart = input.selectionStart;
    if (selectionStart === null) return;

    const text = messageText;
    const leftText = text.slice(0, selectionStart);
    const rightText = text.slice(selectionStart);

    const lastSpaceIdx = leftText.lastIndexOf(' ');
    const wordStartIdx = lastSpaceIdx === -1 ? 0 : lastSpaceIdx + 1;
    
    const updatedLeft = leftText.slice(0, wordStartIdx) + `#${tagText} `;
    const newText = updatedLeft + rightText;
    
    setMessageText(newText);
    setAutocompleteSuggestions([]);
    setActiveTagQuery(null);
    
    setTimeout(() => {
      input.focus();
      const newCursorPos = updatedLeft.length;
      input.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // UI state
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [projectComponents, setProjectComponents] = useState<any[]>([]);
  const [compSearch, setCompSearch] = useState('');

  // Engineering tag viewer
  const [selectedTagElement, setSelectedTagElement] = useState<any | null>(null);

  // Snapshot Drawing states
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial loading
  useEffect(() => {
    fetchUsers();
    fetchGroups();
  }, []);

  // Debounced tags/components autocomplete search
  useEffect(() => {
    if (activeTagQuery === null) {
      setAutocompleteSuggestions([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        setIsAutocompleteLoading(true);
        let list = [];
        const win = window as any;
        if (win.electron && win.electron.ipcRenderer) {
          list = await win.electron.ipcRenderer.invoke('chat:autocomplete-tags', {
            query: activeTagQuery,
            projectId: activeProject?.id
          });
        } else {
          const url = `/api/chat/autocomplete-tags?query=${encodeURIComponent(activeTagQuery)}&projectId=${activeProject?.id || ''}`;
          const res = await fetch(url);
          if (res.ok) {
            list = await res.json();
          }
        }
        setAutocompleteSuggestions(list || []);
        setAutocompleteIndex(0);
      } catch (e) {
        console.error('[Autocomplete] Error fetching tag matches:', e);
      } finally {
        setIsAutocompleteLoading(false);
      }
    }, 120);

    return () => clearTimeout(delayDebounce);
  }, [activeTagQuery, activeProject?.id]);

  // Sync messaging
  useEffect(() => {
    if (user?.id) {
      setupSocket(user.id);
      startPolling(user.id);
    }
    return () => {
      stopPolling();
      disconnectSocket();
    };
  }, [user?.id, activeReceiverId, activeGroupId]);

  // Scroll on message add: только при новых сообщениях и только если пользователь у низа
  useEffect(() => {
    const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;
    if (lastId === lastMessageIdRef.current) return;
    const isFirstLoad = lastMessageIdRef.current === null;
    lastMessageIdRef.current = lastId;

    const container = messagesContainerRef.current;
    const nearBottom = !container ||
      container.scrollHeight - container.scrollTop - container.clientHeight < 160;
    const lastMsg = messages[messages.length - 1];
    const isOwn = lastMsg && lastMsg.senderId === user?.id;

    if (isFirstLoad || nearBottom || isOwn) {
      chatEndRef.current?.scrollIntoView({ behavior: isFirstLoad ? 'auto' : 'smooth' });
    }
  }, [messages]);

  // При смене собеседника/группы сбрасываем трекер последнего сообщения
  useEffect(() => {
    lastMessageIdRef.current = null;
  }, [activeReceiverId, activeGroupId]);

  // Load project equipment components for dialog picker
  useEffect(() => {
    if (activeProject && isEquipmentModalOpen) {
      fetch(`/api/projects/${activeProject.id}/systems`)
        .then(res => res.json())
        .then(data => {
          if (data.systems) {
            const comps = data.systems.flatMap((sys: any) => 
              (sys.monoblocks || []).flatMap((mono: any) => 
                (mono.components || []).map((c: any) => ({
                  ...c,
                  systemName: sys.name,
                  monoblockName: mono.name
                }))
              )
            );
            setProjectComponents(comps);
          }
        })
        .catch(err => console.error('[Chat] Error loading project components:', err));
    }
  }, [activeProject, isEquipmentModalOpen]);

  // Load screenshot onto canvas and setup standard parameters
  useEffect(() => {
    if (isAnnotating && screenshotData && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = screenshotData;
        img.onload = () => {
          canvas.width = img.naturalWidth || 1280;
          canvas.height = img.naturalHeight || 720;
          ctx.drawImage(img, 0, 0);
          ctx.strokeStyle = '#dc2626'; // engineering red annotation marker
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        };
      }
    }
  }, [isAnnotating, screenshotData]);

  // Filters
  const filteredUsers = users.filter(u => {
    if (u.id === user?.id) return false;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.symbol.toLowerCase().includes(q);
  });

  const activePeer = users.find(u => u.id === activeReceiverId);
  const activeGroup = groups.find(g => g.id === activeGroupId);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      addToast('Загрузка файла во вложение...', 'info');
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const rawResult = reader.result as string;
          const base64Data = rawResult.split(',')[1];
          const uploaded = await uploadFile(file.name, base64Data);
          
          setStagedAttachments(prev => [...prev, {
            fileName: uploaded.fileName,
            filePath: uploaded.filePath,
            fileSize: uploaded.fileSize
          }]);
          addToast(`Файл "${file.name}" успешно прикреплен!`, 'success');
        } catch (uploadErr) {
          addToast('Ошибка заливки файла на сервер', 'error');
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      addToast('Не удалось обработать файл', 'error');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isSendingMessage) return;
    if (!messageText.trim() && stagedAttachments.length === 0 && !selectedElementId) {
      return;
    }

    setIsSendingMessage(true);
    try {
      await sendMessage(
        user.id,
        messageText,
        selectedElementId,
        activeProject?.id || null,
        stagedAttachments
      );

      setMessageText('');
      setStagedAttachments([]);
      setSelectedElementId(null);
      setSelectedElementName(null);
    } catch (err: any) {
      addToast('Ошибка отправки сообщения: ' + err.message, 'error');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleEquipmentClick = (elementId: string) => {
    if (!elementId) return;
    addToast('Переход к узлу MAX-оборудования...', 'success');
    navigate(`/equipment?elementId=${elementId}`);
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const filteredComps = projectComponents.filter(c => 
    c.name.toLowerCase().includes(compSearch.toLowerCase()) || 
    c.itemCode.toLowerCase().includes(compSearch.toLowerCase())
  );

  const allHistoryAttachments = messages.flatMap(m => m.attachments || []);

  // TAG CLICK RESOLVER: Finds component element by Tag name and triggers navigation+highlight in Equipment Tree
  const handleTagClick = async (tag: string) => {
    try {
      addToast(`Инженерный запрос тега #${tag}...`, 'info');
      let foundElement: any = null;
      const win = window as any;
      if (win.electron && win.electron.ipcRenderer) {
        foundElement = await win.electron.ipcRenderer.invoke('chat:search-element', { tag });
      } else {
        const res = await fetch(`/api/chat/search-element?tag=${encodeURIComponent(tag)}`);
        if (res.ok) {
          const data = await res.json();
          foundElement = data.element;
        }
      }

      if (foundElement) {
        addToast(`Открытие элемента в дереве связей: ${foundElement.name}`, 'success');
        navigate(`/equipment?elementId=${foundElement.id}`);
      } else {
        addToast(`Тег #${tag} не зарегистрирован в базе MAX проекта.`, 'error');
      }
    } catch (err: any) {
      addToast('Ошибка поиска инженерного тега: ' + err.message, 'error');
    }
  };

  // CAPTURE SCREENSHOT TRIGGER
  const handleCaptureScreen = async () => {
    const win = window as any;
    try {
      addToast('Захват экрана в процессе...', 'info');
      let dataUrl = '';
      if (win.electron && win.electron.ipcRenderer) {
        dataUrl = await win.electron.ipcRenderer.invoke('desktop:capture');
      } else {
        // Web grid blueprint canvas simulation for cloud environments
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 700;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // grid background
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 1200, 700);

          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1;
          for (let x = 0; x < 1200; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 700);
            ctx.stroke();
          }
          for (let y = 0; y < 700; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(1200, y);
            ctx.stroke();
          }

          // draw mechanical shapes
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3;
          ctx.strokeRect(300, 200, 600, 300);

          ctx.strokeStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(600, 350, 90, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 22px monospace';
          ctx.fillText('MAX ENGINEERING CAPTURE: SCHEMATIC AHU-2', 80, 80);
          ctx.fillStyle = '#64748b';
          ctx.font = '13px monospace';
          ctx.fillText(`Сгенерирован: ${new Date().toLocaleString()} • Web-окружение`, 80, 110);
        }
        dataUrl = canvas.toDataURL('image/png');
      }

      setScreenshotData(dataUrl);
      setIsAnnotating(true);
      addToast('Снимок готов к нанесению аннотаций!', 'success');
    } catch (err: any) {
      addToast('Не удалось совершить захват экрана: ' + err.message, 'error');
    }
  };

  // Drawing mouse handlers for red pen canvas markings
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleClearDrawing = () => {
    if (!canvasRef.current || !screenshotData) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = screenshotData;
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
    }
  };

  const handleSendDrawing = async () => {
    if (!canvasRef.current) return;
    try {
      addToast('Заливка снимка на сетевой сервер...', 'info');
      const canvas = canvasRef.current;
      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      const fileName = `screenshot_${Date.now()}.png`;

      const uploaded = await uploadFile(fileName, base64Data);

      setStagedAttachments(prev => [...prev, {
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        fileSize: uploaded.fileSize
      }]);

      setIsAnnotating(false);
      setScreenshotData(null);
      addToast('Аннотированный скриншот прикреплен к сообщениям!', 'success');
    } catch (err: any) {
      addToast('Ошибка загрузки рисунка с экрана: ' + err.message, 'error');
    }
  };

  return (
    <div className="h-full flex bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-xs border border-slate-200 dark:border-slate-800 transition-colors">
      
      {/* LEFT PANEL: Users List & Automated Project Rooms */}
      <div className="w-80 flex flex-col border-r border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/55 dark:bg-slate-900/40 select-none">
        
        {/* Top Header & Fast Search bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-indigo-650 dark:text-indigo-400" />
            Мессенджер MAX
          </h2>
          <div className="relative">
            <input
              type="text"
              placeholder="Поиск собеседника по ФИО..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-250 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
            />
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        {/* Categories channels scrolling container */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          
          {/* Section 1: Project Rooms (Автоматические проектные комнаты) */}
          <div className="space-y-1">
            <div className="px-3 py-1 text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Проектные группы
            </div>
            {groups.length === 0 ? (
              <p className="text-xs p-3 text-slate-400 italic">Активных проектных групп нет</p>
            ) : (
              groups.map((g) => {
                const active = g.id === activeGroupId;
                return (
                  <button
                    key={g.id}
                    onClick={() => setActiveGroupId(g.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                      active 
                        ? 'bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40 text-indigo-900 dark:text-white' 
                        : 'hover:bg-slate-100/75 dark:hover:bg-slate-800/40 border border-transparent'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-xs font-bold shrink-0 border border-indigo-200 dark:border-indigo-850 text-indigo-700 dark:text-indigo-400">
                      👥
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-850 dark:text-white block truncate leading-tight">
                        {g.name}
                      </span>
                      <span className="text-xs text-slate-400 font-semibold block truncate mt-0.5">
                        Автомод. комната проекта
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Section 2: Direct Messages (Личные диалоги) */}
          <div className="space-y-1">
            <div className="px-3 py-1 text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Личные диалоги
            </div>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                Сотрудники не найдены
              </div>
            ) : (
              filteredUsers.map((u) => {
                const active = u.id === activeReceiverId;
                return (
                  <button
                    key={u.id}
                    onClick={() => setActiveReceiverId(u.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                      active 
                        ? 'bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-250 dark:border-emerald-900/50' 
                        : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-850 flex items-center justify-center text-xs font-bold text-emerald-750 dark:text-emerald-400 shrink-0 border border-slate-300 dark:border-slate-700">
                      {u.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-850 dark:text-white truncate">
                          {u.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400 leading-normal mt-0.5">
                        <span className="truncate">Таб: {u.symbol}</span>
                        <span className="shrink-0 text-slate-500 font-mono bg-slate-100 dark:bg-slate-950 px-1 rounded text-xs">
                          {u.role.replace('ENGINEER_', '')}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

        </div>
      </div>

      {/* CENTRAL PANEL: Messages Area stream */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 relative">
        {(activePeer || activeGroup) ? (
          <>
            {/* Thread Header Info bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 select-none">
              <div className="flex items-center gap-3">
                {activeType === 'DIRECT' && activePeer ? (
                  <>
                    <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950/45 flex items-center justify-center text-sm font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                      {activePeer.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
                        {activePeer.name}
                      </h3>
                      <p className="text-xs text-slate-400 leading-snug mt-0.5">
                        Табельный номер: {activePeer.symbol} • {activePeer.role}
                      </p>
                    </div>
                  </>
                ) : activeGroup ? (
                  <>
                    <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950/45 flex items-center justify-center text-sm font-bold text-indigo-800 dark:text-indigo-300 border border-indigo-205 dark:border-indigo-855">
                      👥
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
                        {activeGroup.name}
                      </h3>
                      <p className="text-xs text-slate-400 leading-snug mt-0.5 truncate max-w-lg">
                        Тип: Комната Проекта • Сквозная синхронизация сотрудников
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
              
              <button
                type="button"
                onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Подробная информация"
              >
                {isRightPanelOpen ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>
            </div>

            {/* Conversation Messages Lists */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/20">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none">
                  <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2 animate-bounce" />
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Напечатайте текст с инженерными тегами вида <span className="font-mono text-indigo-500 font-bold">#бл2.1</span> или привяжите спецификацию
                  </p>
                </div>
              ) : (
                messages.map((msg, msgIndex) => {
                  const isMe = msg.senderId === user?.id;
                  const msgDay = new Date(msg.createdAt).toDateString();
                  const prevDay = msgIndex > 0 ? new Date(messages[msgIndex - 1].createdAt).toDateString() : null;
                  const showDaySeparator = msgDay !== prevDay;
                  const dayLabel = (() => {
                    const d = new Date(msg.createdAt);
                    const today = new Date();
                    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
                    if (d.toDateString() === today.toDateString()) return 'Сегодня';
                    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
                    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
                  })();
                  return (
                    <React.Fragment key={msg.id}>
                    {showDaySeparator && (
                      <div className="flex items-center gap-3 my-2 select-none">
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{dayLabel}</span>
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                      </div>
                    )}
                    <div 
                      className={`flex gap-3 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-150 dark:bg-slate-800 shrink-0 border border-slate-250 dark:border-slate-750 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
                        {(msg.sender?.name || 'С').charAt(0)}
                      </div>

                      <div className="space-y-1 text-left">
                        <div className="flex items-center gap-2 text-xs text-slate-400 select-none">
                          <span className="font-bold text-slate-500 dark:text-slate-450">
                            {isMe ? 'Вы' : msg.sender?.name}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Speech bubble bubble text */}
                        <div className={`p-3 rounded-lg border text-xs shadow-3xs relative overflow-hidden transition-all ${
                          isMe 
                            ? 'bg-indigo-50/90 dark:bg-indigo-950/25 border-indigo-200 dark:border-indigo-900/40 text-slate-900 dark:text-indigo-150 rounded-tr-none' 
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850/60 text-slate-800 dark:text-slate-150 rounded-tl-none'
                        }`}>
                          <FormattedMessage text={msg.content} onTagClick={handleTagClick} />

                          {/* Interactive Equipment Link */}
                          {msg.linkedElement && (
                            <button
                              type="button"
                              onClick={() => handleEquipmentClick(msg.linkedElementId!)}
                              className="mt-2 text-left block w-full p-2 bg-emerald-600/10 dark:bg-emerald-450/15 border border-emerald-500/20 rounded-md hover:bg-emerald-600/15 dark:hover:bg-emerald-450/20 cursor-pointer transition-all shrink-0"
                            >
                              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-0.5 flex items-center gap-1 font-sans">
                                ⚙️ Сквозная ссылка MAX
                              </div>
                              <div className="text-xs font-black text-slate-800 dark:text-slate-200">
                                {msg.linkedElement.name}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                                Код узла: {msg.linkedElement.itemCode}
                              </div>
                            </button>
                          )}

                          {/* Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 space-y-1 shrink-0">
                              {msg.attachments.map((file) => (
                                <button
                                  key={file.id}
                                  type="button"
                                  onClick={() => openFile(file.filePath)}
                                  className="w-full text-left flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200/60 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-md cursor-pointer group transition-all"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <File className="w-3.5 h-3.5 text-indigo-650 dark:text-indigo-400 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-850 dark:text-slate-250 truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-400">
                                        {file.fileName}
                                      </p>
                                      <p className="text-xs text-slate-400 font-mono">
                                        {formatBytes(file.fileSize)}
                                      </p>
                                    </div>
                                  </div>
                                  <Download className="w-3.5 h-3.5 text-slate-400 hover:text-indigo-505 shrink-0 ml-2" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    </React.Fragment>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Form Panel */}
            <form onSubmit={handleSend} className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shrink-0 relative">
              
              {/* Autocomplete suggestions dropdown panel right above input bar */}
              {autocompleteSuggestions.length > 0 && (
                <div id="tag-autocomplete-dropdown" className="absolute bottom-full left-3 right-3 mb-2 max-h-56 bg-white dark:bg-slate-950 border border-slate-200 dark:border-indigo-950 rounded-xl shadow-2xl overflow-y-auto z-50 divide-y divide-slate-100 dark:divide-slate-900 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="p-2 bg-slate-50 dark:bg-slate-900/60 text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center justify-between select-none border-b border-slate-100 dark:border-slate-900">
                    <span>💡 Подходящие к вводу MAX/KKS теги</span>
                    <span className="font-mono text-xs opacity-80">Клавиши ↑ ↓ Enter для ввода</span>
                  </div>
                  {autocompleteSuggestions.map((sug, idx) => {
                    const active = idx === autocompleteIndex;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => insertTagAtCursor(sug.text)}
                        onMouseEnter={() => setAutocompleteIndex(idx)}
                        className={`w-full text-left p-2.5 flex flex-col gap-1 transition-all text-xs border-l-2 outline-hidden cursor-pointer ${
                          active 
                            ? 'bg-indigo-50 dark:bg-indigo-950/25 border-indigo-650 text-slate-900 dark:text-white font-semibold' 
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-900/10 text-slate-700 dark:text-slate-350'
                        }`}
                      >
                        <span className="font-mono text-xs text-indigo-700 dark:text-indigo-400 font-extrabold flex items-center gap-0.5">
                          #{sug.text}
                        </span>
                        <span className="text-xs text-slate-450 dark:text-slate-500 leading-normal truncate">
                          {sug.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Draft additions header */}
              {(stagedAttachments.length > 0 || selectedElementId) && (
                <div className="flex flex-wrap gap-2 py-1 items-center select-none">
                  {selectedElementId && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 dark:bg-emerald-955/20 border border-emerald-250 dark:border-emerald-900 rounded-md text-xs text-emerald-800 dark:text-emerald-400 font-bold shrink-0">
                      <LinkIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Связь: {selectedElementName}</span>
                      <button 
                        type="button" 
                        onClick={() => { setSelectedElementId(null); setSelectedElementName(null); }}
                        className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded cursor-pointer"
                      >
                        <X className="w-3 h-3 text-emerald-600" />
                      </button>
                    </div>
                  )}

                  {stagedAttachments.map((att, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center gap-1.5 px-2 py-1 bg-slate-105 dark:bg-slate-950/45 border border-slate-200 dark:border-slate-850 rounded-md text-xs text-slate-600 dark:text-slate-400 shrink-0"
                    >
                      <File className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="truncate max-w-[120px]">{att.fileName}</span>
                      <button 
                        type="button" 
                        onClick={() => setStagedAttachments(prev => prev.filter((_, i) => i !== idx))}
                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded cursor-pointer"
                      >
                        <X className="w-3 h-3 text-slate-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Controls bar layout */}
              <div className="flex items-center gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
                
                {/* 1. File Upload */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-250 dark:border-slate-850 rounded-lg text-slate-500 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                  title="Прикрепить файл чертежа"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* 2. Link PDM specification */}
                <button
                  type="button"
                  onClick={() => setIsEquipmentModalOpen(true)}
                  className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-250 dark:border-slate-850 rounded-lg text-slate-500 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                  title="Привязать узел оборудования"
                >
                  <LinkIcon className="w-4 h-4" />
                </button>

                {/* 3. Fast Screenshot Capturer button (Camera Icon) */}
                <button
                  type="button"
                  onClick={handleCaptureScreen}
                  className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-250 dark:border-slate-850 rounded-lg text-rose-500 hover:text-rose-700 dark:hover:text-rose-450 transition-colors cursor-pointer"
                  title="Инженерный снимок экрана с разметкой"
                >
                  <Camera className="w-4 h-4" />
                </button>

                {/* Main Text Area Input */}
                <input
                  type="text"
                  ref={messageInputRef}
                  placeholder="Напишите сообщение... (например, введите # и выберите тег)"
                  value={messageText}
                  onKeyDown={(e) => {
                    if (autocompleteSuggestions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setAutocompleteIndex(prev => (prev + 1) % autocompleteSuggestions.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setAutocompleteIndex(prev => (prev - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const chosen = autocompleteSuggestions[autocompleteIndex];
                        if (chosen) {
                          insertTagAtCursor(chosen.text);
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setAutocompleteSuggestions([]);
                        setActiveTagQuery(null);
                      }
                    }
                  }}
                  onKeyUp={(e) => {
                    const el = e.currentTarget;
                    const q = getActiveTagQuery(el.value, el.selectionStart);
                    setActiveTagQuery(q);
                  }}
                  onClick={(e) => {
                    const el = e.currentTarget;
                    const q = getActiveTagQuery(el.value, el.selectionStart);
                    setActiveTagQuery(q);
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMessageText(val);
                    const q = getActiveTagQuery(val, e.target.selectionStart);
                    setActiveTagQuery(q);
                  }}
                  className="flex-1 text-xs px-3 py-2 bg-slate-50 hover:bg-slate-100/50 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-950 transition-all font-sans font-medium"
                />

                <button
                  type="submit"
                  className="p-2 bg-indigo-650 hover:bg-indigo-800 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center shrink-0 shadow-sm"
                  title="Отправить сообщение"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/20 select-none">
            <MessageSquare className="w-12 h-12 text-slate-200 dark:text-slate-800 mb-4 animate-pulse" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
              Выберите чат-комнату
            </h3>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Выберите автоматическую проектную комнату или коллегу из списка слева, чтобы начать переписку, привязку узлов оборудования и отправку файлов.
            </p>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Collapsible Active Peer Profile / Dynamic TAG Card File History list */}
      {(activePeer || activeGroup) && isRightPanelOpen && (
        <div className="w-72 border-l border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-900/40 select-none shrink-0 overflow-y-auto">
          
          {selectedTagElement ? (
            /* DYNAMIC TAG CARD SECTION (ФИЧА 2: Быстрая карточка тега) */
            <div className="flex-1 flex flex-col h-full select-none">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-indigo-50/55 dark:bg-indigo-950/25">
                <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  ⚙️ Карточка тега
                </span>
                <button 
                  onClick={() => setSelectedTagElement(null)}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer transition-colors"
                  title="Вернуться к диалогу"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-left">
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-800 dark:text-white leading-snug">
                    {selectedTagElement.name}
                  </h4>
                  <p className="text-xs font-mono text-slate-400">
                    Код узла: {selectedTagElement.itemCode}
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800/80 space-y-2.5 shadow-3xs text-xs">
                  <div>
                    <span className="text-xs text-slate-400 uppercase block font-extrabold">Тип оборудования</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block mt-0.5">
                      {selectedTagElement.type || 'Спецификация MAX'}
                    </span>
                  </div>

                  {selectedTagElement.monoblock && (
                    <div>
                      <span className="text-xs text-slate-400 uppercase block font-extrabold">Моноблок</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block mt-0.5">
                        📦 {selectedTagElement.monoblock.name}
                      </span>
                    </div>
                  )}

                  {selectedTagElement.monoblock?.system && (
                    <div>
                      <span className="text-xs text-slate-400 uppercase block font-extrabold">Система</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block mt-0.5">
                        🌐 {selectedTagElement.monoblock.system.name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Technical specifications */}
                <div className="space-y-1.5">
                  <h5 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                    Технические параметры
                  </h5>
                  <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-900 overflow-hidden text-xs shadow-3xs">
                    {(() => {
                      try {
                        const specs = typeof selectedTagElement.specs === 'string'
                          ? JSON.parse(selectedTagElement.specs)
                          : selectedTagElement.specs;

                        if (specs && typeof specs === 'object' && Object.keys(specs).length > 0) {
                          return Object.entries(specs).map(([k, v]: [string, any]) => (
                            <div key={k} className="flex justify-between p-2">
                              <span className="text-slate-400">{k}:</span>
                              <span className="font-mono font-bold text-slate-705 dark:text-slate-300 text-xs">{String(v)}</span>
                            </div>
                          ));
                        }
                      } catch (e) {}
                      return (
                        <div className="p-3 text-center text-slate-400 text-xs italic">
                          Спецификации загружены из файла Excel
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Project Explorer switcher */}
                <button
                  onClick={() => {
                    addToast('Перенаправление в Проводник...', 'success');
                    navigate(`/equipment?elementId=${selectedTagElement.id}`);
                  }}
                  className="w-full py-2 bg-indigo-650 hover:bg-indigo-800 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  Открыть в Проводнике
                </button>
              </div>
            </div>
          ) : (
            /* STANDARD PROFILE DIRECT / GROUP SECTION */
            <>
              {activeType === 'DIRECT' && activePeer ? (
                <div className="p-5 text-center border-b border-slate-200 dark:border-slate-800">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-xl font-bold text-emerald-800 dark:text-emerald-400 border border-emerald-250 dark:border-emerald-850/50 mx-auto mb-3">
                    {activePeer.name.charAt(0)}
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-white leading-tight truncate">
                    {activePeer.name}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 font-semibold bg-slate-100 dark:bg-slate-900 py-0.5 px-2 rounded-full inline-block">
                    {activePeer.role}
                  </p>
                  
                  <div className="mt-4 grid grid-cols-2 gap-2 text-left text-xs">
                    <div className="bg-white dark:bg-slate-950/50 p-2 rounded-lg border border-slate-150 dark:border-slate-850">
                      <p className="text-slate-400 text-xs leading-tight mb-0.5">Табель</p>
                      <p className="font-mono font-bold text-slate-700 dark:text-slate-300 truncate">{activePeer.symbol}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-950/50 p-2 rounded-lg border border-slate-150 dark:border-slate-850">
                      <p className="text-slate-400 text-xs leading-tight mb-0.5">Окружение</p>
                      <p className="font-bold text-indigo-700 dark:text-indigo-400 leading-none mt-1 truncate">MAX LOCAL</p>
                    </div>
                  </div>
                </div>
              ) : activeGroup ? (
                <div className="p-5 text-center border-b border-slate-200 dark:border-slate-800">
                  <div className="w-16 h-16 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center text-xl border border-indigo-250 dark:border-indigo-850/50 mx-auto mb-3">
                    👥
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-white leading-tight truncate">
                    {activeGroup.name}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 font-semibold bg-slate-100 dark:bg-slate-900 py-0.5 px-2 rounded-full inline-block">
                    Проектная комната
                  </p>
                  
                  <div className="mt-4 grid grid-cols-2 gap-2 text-left text-xs">
                    <div className="bg-white dark:bg-slate-950/50 p-2 rounded-lg border border-slate-150 dark:border-slate-850">
                      <p className="text-slate-400 text-xs leading-tight mb-0.5">Участники</p>
                      <p className="font-mono font-bold text-slate-700 dark:text-slate-300 truncate">Все сотрудники</p>
                    </div>
                    <div className="bg-white dark:bg-slate-950/50 p-2 rounded-lg border border-slate-150 dark:border-slate-850">
                      <p className="text-slate-400 text-xs leading-tight mb-0.5">Тип канала</p>
                      <p className="font-bold text-indigo-700 dark:text-indigo-400 leading-none mt-1 truncate">Auto ROOM</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Shared Files attachment listings */}
              <div className="flex-1 p-4 text-left">
                <h5 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  История вложений ({allHistoryAttachments.length})
                </h5>

                {allHistoryAttachments.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs italic">
                    Вложения отсутствуют
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
                    {allHistoryAttachments.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => openFile(f.filePath)}
                        className="w-full text-left flex items-center justify-between p-2 hover:bg-slate-100/80 dark:hover:bg-slate-800 border border-slate-100 dark:border-transparent rounded-lg cursor-pointer group transition-all"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <File className="w-3.5 h-3.5 text-slate-450 shrink-0 group-hover:text-indigo-600" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate group-hover:text-slate-950 dark:group-hover:text-indigo-400">
                              {f.fileName}
                            </p>
                            <p className="text-xs text-slate-400 font-mono">
                              {formatBytes(f.fileSize)}
                            </p>
                          </div>
                        </div>
                        <Download className="w-3 h-3 text-slate-400 hover:text-slate-700" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      )}

      {/* EQUIPMENT SELECTION PIE SYSTEM ATTACH DIALOG */}
      <AnimatePresence>
        {isEquipmentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5 font-sans">
                    <Settings className="w-4 h-4 text-indigo-600 animate-spin" style={{ animationDuration: '6s' }} />
                    Привязка узла к сообщению
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Проект: {activeProject?.name || 'все проекты'}
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsEquipmentModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 border-b border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Поиск по наименованию детали в спецификации MAX..."
                    value={compSearch}
                    onChange={(e) => setCompSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-250 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              <div className="flex-1 max-h-80 overflow-y-auto p-2 space-y-1 bg-slate-50/25">
                {filteredComps.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400 italic">
                    Оборудование по спецификации не найдено.
                  </div>
                ) : (
                  filteredComps.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedElementId(c.id);
                        setSelectedElementName(`${c.name} (${c.systemName})`);
                        setIsEquipmentModalOpen(false);
                        addToast(`Выбран узел: ${c.name}`, 'info');
                      }}
                      className="w-full text-left p-2 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/10 border border-slate-100 dark:border-transparent rounded-lg cursor-pointer transition-all flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-805 dark:text-slate-200">
                          ⚙️ {c.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Код: <span className="font-mono text-indigo-500 font-bold">{c.itemCode}</span> • Моноблок: {c.monoblockName}
                        </p>
                      </div>
                      <span className="text-xs bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded font-bold text-slate-500 shadow-3xs">
                        {c.systemName}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className="p-3 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-right shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEquipmentModalOpen(false)}
                  className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SCREENSHOT ANNOTATION CANVAS DIALOG (ФИЧА 3) */}
      <AnimatePresence>
        {isAnnotating && screenshotData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[85vh]"
            >
              {/* Head */}
              <div className="p-4 bg-slate-950 border-b border-slate-850 flex items-center justify-between text-left shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5 font-sans">
                    <Brush className="w-4 h-4 text-rose-500 animate-pulse" />
                    Инженерные аннотации снимка экрана
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-sans">
                    Зажмите и ведите курсор по снимку, чтобы нанести красные пометки карандашом
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAnnotating(false);
                    setScreenshotData(null);
                  }}
                  className="p-1 text-slate-450 hover:text-white rounded-md cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Canvas Area */}
              <div className="flex-1 bg-slate-950 overflow-auto flex items-center justify-center p-4 min-h-0 relative">
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className="max-w-full max-h-full border border-slate-800 shadow-xl cursor-crosshair bg-slate-900 object-contain rounded-lg"
                />
              </div>

              {/* Toolbar Foot */}
              <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={handleClearDrawing}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  Сбросить рисунок
                </button>
                
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAnnotating(false);
                      setScreenshotData(null);
                    }}
                    className="px-4 py-2 bg-slate-900 text-slate-400 hover:text-slate-200 text-xs font-bold rounded-lg cursor-pointer transition-all"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleSendDrawing}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Прикрепить к чату
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
