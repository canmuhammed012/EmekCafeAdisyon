import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { getSocket } from '../services/socket';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initSocket = async () => {
      try {
        const socketInstance = await getSocket();
        
        if (!mounted) return;

        setSocket(socketInstance);
        setIsConnected(socketInstance.connected);

        socketInstance.on('connect', () => {
          if (mounted) {
            setIsConnected(true);
            console.log('✅ Socket context - bağlantı kuruldu');
          }
        });

        socketInstance.on('disconnect', () => {
          if (mounted) {
            setIsConnected(false);
            console.log('❌ Socket context - bağlantı kesildi');
          }
        });
      } catch (error) {
        console.error('❌ Socket başlatılamadı:', error);
        if (mounted) {
          setIsConnected(false);
        }
      }
    };

    initSocket();

    return () => {
      mounted = false;
    };
  }, []);

  const contextValue = useMemo(() => ({
    socket,
    isConnected,
    serverUrl: 'http://localhost:3000' // Varsayılan, dinamik olarak ayarlanabilir
  }), [socket, isConnected]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

