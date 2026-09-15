import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { getSocket } from '../services/socket';
import { getServerBaseUrl } from '../services/api';

const SocketContext = createContext({ socket: null, isConnected: false, serverUrl: '' });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const instance = getSocket();
    if (!instance) return undefined;

    setSocket(instance);
    setIsConnected(instance.connected);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    instance.on('connect', onConnect);
    instance.on('disconnect', onDisconnect);

    return () => {
      instance.off('connect', onConnect);
      instance.off('disconnect', onDisconnect);
    };
  }, []);

  const value = useMemo(() => ({ socket, isConnected, serverUrl: getServerBaseUrl() }), [socket, isConnected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
