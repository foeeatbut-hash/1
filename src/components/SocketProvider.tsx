import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ENV_CONFIG } from '../config/env';
import { useToastStore } from '../store/toastStore';
import { useNavigate } from 'react-router-dom';

/**
 * Lightweight mock socket implementation for the isolated local env.
 */
class LocalMockSocket {
  private listeners: Record<string, ((...args: any[]) => void)[]> = {};

  on(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  off(event: string, callback: (...args: any[]) => void) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    return this;
  }

  emit(event: string, ...args: any[]) {
    // Local loopback dispatch inside simulated space
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      eventListeners.forEach(cb => cb(...args));
    }
    return this;
  }

  disconnect() {
    console.log('[MockSocket] Disconnected safely.');
    return this;
  }

  connect() {
    console.log('[MockSocket] Connected safely.');
    return this;
  }
}

interface SocketContextType {
  socket: Socket | LocalMockSocket | null;
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
  const [socket, setSocket] = useState<Socket | LocalMockSocket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  useEffect(() => {
    let activeSocket: any = null;

    if (ENV_CONFIG.isLocalMode) {
      console.log('[RealTimeSync] Running in Local Isolated Environment. Initializing secure mock socket provider.');
      const mock = new LocalMockSocket();
      activeSocket = mock;
      setSocket(mock);
      setIsConnected(true);
    } else {
      console.log('[RealTimeSync] Production Mode. Opening physics connection to:', ENV_CONFIG.socketUrl);
      const realSocket = io(ENV_CONFIG.socketUrl, {
        transports: ['websocket'],
        autoConnect: true
      });

      realSocket.on('connect', () => {
        setIsConnected(true);
      });

      realSocket.on('disconnect', () => {
        setIsConnected(false);
      });

      activeSocket = realSocket;
      setSocket(realSocket);
    }

    // Set up standard subscribers
    const handleTagLinked = (data: { tagId: string; timestamp: string; details?: any }) => {
      console.log('[RealTimeSync] Event received tag:linked', data);
      // Dispatch custom window event so screens can reload data dynamically
      window.dispatchEvent(new CustomEvent('socket:tag:linked', { detail: data }));
    };

    const handleTagUpdated = (data: { tagId: string; timestamp: string; details?: any }) => {
      console.log('[RealTimeSync] Event received tag:updated', data);
      window.dispatchEvent(new CustomEvent('socket:tag:updated', { detail: data }));
    };

    const handleEquipmentConflict = (data: { 
      componentId: string; 
      systemId: string; 
      message: string; 
      changeDetails: string; 
    }) => {
      console.log('[RealTimeSync] Event received equipment:conflict', data);
      window.dispatchEvent(new CustomEvent('socket:equipment:conflict', { detail: data }));

      // Display system message using top-tier dynamic clickable toast
      addToast(
        `🚨 ${data.message || 'Обнаружен конфликт оборудования! Нажмите для перехода к урегулированию.'}`,
        'error',
        () => {
          // Action when clicking the toast: store coordinates and navigate!
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
      if (activeSocket) {
        activeSocket.off('tag:linked', handleTagLinked);
        activeSocket.off('tag:updated', handleTagUpdated);
        activeSocket.off('equipment:conflict', handleEquipmentConflict);
        activeSocket.disconnect();
      }
    };
  }, [addToast, navigate]);

  const emitTagChange = (type: 'linked' | 'updated', tagId: string, details?: any) => {
    if (!socket) return;
    const eventName = type === 'linked' ? 'tag:linked' : 'tag:updated';
    socket.emit(eventName, { tagId, timestamp: new Date().toISOString(), details });
    
    // In local isolated mode, manually run loopbacks so the dispatcher acts internally
    if (ENV_CONFIG.isLocalMode) {
      socket.emit(eventName, { tagId, timestamp: new Date().toISOString(), details });
    }
  };

  const emitEquipmentConflict = (componentId: string, systemId: string, message: string, changeDetails: string) => {
    if (!socket) return;
    socket.emit('equipment:conflict', { componentId, systemId, message, changeDetails });

    if (ENV_CONFIG.isLocalMode) {
      socket.emit('equipment:conflict', { componentId, systemId, message, changeDetails });
    }
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, emitTagChange, emitEquipmentConflict }}>
      {children}
    </SocketContext.Provider>
  );
};
