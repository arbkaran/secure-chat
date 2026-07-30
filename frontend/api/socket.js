import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';
import { getAccessToken } from './authStorage';

let socketInstance = null;

// Idempotent — safe to call from multiple screens on mount.
export async function connectSocket() {
  if (socketInstance?.connected) return socketInstance;

  const token = await getAccessToken();
  if (!token) throw new Error('Cannot connect socket without an access token');

  if (socketInstance) {
    socketInstance.auth = { token };
    socketInstance.connect();
    return socketInstance;
  }

  socketInstance = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  return socketInstance;
}

export function getSocket() {
  return socketInstance;
}

export function disconnectSocket() {
  socketInstance?.disconnect();
  socketInstance = null;
}
