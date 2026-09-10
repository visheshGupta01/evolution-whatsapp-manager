import { io, type Socket } from 'socket.io-client';

export type RealtimeEvent = {
  id: string;
  source: 'evolution';
  event: string;
  instance: string | null;
  timestamp: string;
  data: unknown;
};

const url = import.meta.env.VITE_API_URL || window.location.origin;
let socket: Socket | null = null;

export function connectRealtime(options: {
  onEvent?: (event: RealtimeEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
} = {}) {
  if (!socket) {
    socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
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
  socket?.emit('subscribe:instance', instance);
}

export function unsubscribeFromInstance(instance: string) {
  socket?.emit('unsubscribe:instance', instance);
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}
