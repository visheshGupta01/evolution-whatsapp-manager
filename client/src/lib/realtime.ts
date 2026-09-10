import { io, type Socket } from 'socket.io-client';

export type RealtimeEvent = {
  id: string;
  source: 'evolution';
  event: string;
  instance: string | null;
  timestamp: string;
  data: unknown;
};

function resolveSocketUrl() {
  const configured = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

  if (!configured || configured === '/api') return window.location.origin;
  if (/^https?:\/\//i.test(configured) && configured.endsWith('/api')) {
    return configured.slice(0, -4) || window.location.origin;
  }
  if (/^https?:\/\//i.test(configured)) return configured;
  return window.location.origin;
}

const socketUrl = resolveSocketUrl();
let socket: Socket | null = null;

export function connectRealtime(options: {
  onEvent?: (event: RealtimeEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
} = {}) {
  if (!socket) {
    socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  }

  socket.off('evolution:event');
  socket.on('evolution:event', options.onEvent || (() => undefined));
  socket.off('connect');
  socket.on('connect', () => options.onConnectionChange?.(true));
  socket.off('disconnect');
  socket.on('disconnect', () => options.onConnectionChange?.(false));

  return socket;
}

export function subscribeToInstance(instance: string) {
  if (instance.trim()) socket?.emit('subscribe:instance', instance.trim());
}

export function unsubscribeFromInstance(instance: string) {
  if (instance.trim()) socket?.emit('unsubscribe:instance', instance.trim());
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}
