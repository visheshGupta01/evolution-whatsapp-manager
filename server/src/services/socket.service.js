import { Server } from 'socket.io';
import { config } from '../config.js';

let io;

export function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: config.clientOrigin === '*' ? true : config.clientOrigin,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    socket.emit('realtime:ready', { ok: true, timestamp: new Date().toISOString() });
    socket.on('subscribe:instance', (instance) => {
      if (typeof instance === 'string' && instance.trim()) socket.join(`instance:${instance.trim()}`);
    });
    socket.on('unsubscribe:instance', (instance) => {
      if (typeof instance === 'string' && instance.trim()) socket.leave(`instance:${instance.trim()}`);
    });
  });

  return io;
}

export function broadcastRealtime(event) {
  if (!io) return;
  io.emit('evolution:event', event);
  if (event.instance) io.to(`instance:${event.instance}`).emit('evolution:event', event);
}

export function getSocketServer() {
  return io;
}
