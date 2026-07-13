import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ENV_CONFIG, getAuthToken } from '../config/env';
import { useToastStore } from '../store/toastStore';
import { useStore } from '../store/store';
import { useNavigate } from 'react-router-dom';

// ── Реальное соединение socket.io — всегда ──
// Раньше в «локальном режиме» подключалась мок-заглушка с локальным эхом,
// из-за чего события между пользователями не ходили вовсе. Теперь клиент
// всегда соединяется с сервером (встроенным localhost или сервером компании) —
// сервер ретранслирует события остальным (socket.broadcast/io.emit).

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  emitTagChange: (type: 'linked' | 'updated', tagId: string, details?: any) => void;
  emitEquipmentConflict: (componentId: string, systemId: string, message: string, changeDetails: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  emitTagChange: () => {},
  emitEquipmentConflict: () => {}
});

export const useRealTimeSync = () => useContext(SocketContext);

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const { addToast } = useToastStore();
  const userId = useStore((s) => s.user?.id);
  const navigate = useNavigate();

  useEffect(() => {
    // Сервер пускает по токену сессии — подключаемся только после входа
    if (!userId) {
      setSocket(null);
      setIsConnected(false);
      return;
    }

    console.log('[RealTimeSync] Подключение socket.io к серверу:', ENV_CONFIG.socketUrl);
    const activeSocket = io(ENV_CONFIG.socketUrl, {
      auth: { token: getAuthToken() },
      // websocket в приоритете, polling — запасной транспорт (строгие прокси)
      transports: ['websocket', 'polling'],
      autoConnect: true,
      // Встроенный сервер стартует параллельно с окном — соединение
      // молча переподключается, пока порт не откроется
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
    });

    activeSocket.on('connect', () => setIsConnected(true));
    activeSocket.on('disconnect', () => setIsConnected(false));

    setSocket(activeSocket);

    // Стандартные подписчики: транслируем события в window, чтобы экраны
    // могли динамически перезагружать данные
    const handleTagLinked = (data: { tagId: string; timestamp: string; details?: any }) => {
      window.dispatchEvent(new CustomEvent('socket:tag:linked', { detail: data }));
    };

    const handleTagUpdated = (data: { tagId: string; timestamp: string; details?: any }) => {
      window.dispatchEvent(new CustomEvent('socket:tag:updated', { detail: data }));
    };

    const handleEquipmentConflict = (data: {
      componentId: string;
      systemId: string;
      message: string;
      changeDetails: string;
    }) => {
      window.dispatchEvent(new CustomEvent('socket:equipment:conflict', { detail: data }));

      // Кликабельный тост: переход к урегулированию конфликта
      addToast(
        `🚨 ${data.message || 'Обнаружен конфликт оборудования! Нажмите для перехода к урегулированию.'}`,
        'error',
        () => {
          localStorage.setItem('focusedConflictId', data.componentId);
          localStorage.setItem('focusedConflictSystemId', data.systemId);
          navigate('/equipment');
        }
      );
    };

    activeSocket.on('tag:linked', handleTagLinked);
    activeSocket.on('tag:updated', handleTagUpdated);
    activeSocket.on('equipment:conflict', handleEquipmentConflict);

    return () => {
      activeSocket.off('tag:linked', handleTagLinked);
      activeSocket.off('tag:updated', handleTagUpdated);
      activeSocket.off('equipment:conflict', handleEquipmentConflict);
      activeSocket.disconnect();
    };
  }, [addToast, navigate, userId]);

  const emitTagChange = (type: 'linked' | 'updated', tagId: string, details?: any) => {
    if (!socket) return;
    const eventName = type === 'linked' ? 'tag:linked' : 'tag:updated';
    // Сервер ретранслирует остальным (socket.broadcast.emit); свой экран
    // обновляется локально по факту действия
    socket.emit(eventName, { tagId, timestamp: new Date().toISOString(), details });
  };

  const emitEquipmentConflict = (componentId: string, systemId: string, message: string, changeDetails: string) => {
    if (!socket) return;
    socket.emit('equipment:conflict', { componentId, systemId, message, changeDetails });
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, emitTagChange, emitEquipmentConflict }}>
      {children}
    </SocketContext.Provider>
  );
};
