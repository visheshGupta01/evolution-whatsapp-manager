import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectRealtime, disconnectRealtime, type RealtimeEvent } from '../lib/realtime';
import { sessionsQueryKey } from './use-sessions';

const SESSION_EVENTS = new Set([
  'connection.update',
  'qrcode.updated',
  'application.startup',
]);

const MESSAGE_EVENTS = new Set([
  'messages.upsert',
  'messages.update',
  'messages.delete',
  'send.message',
]);

export function useRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleEvent = (event: RealtimeEvent) => {
      if (SESSION_EVENTS.has(event.event) || MESSAGE_EVENTS.has(event.event)) {
        void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      }
    };

    connectRealtime({ onEvent: handleEvent });
    return () => disconnectRealtime();
  }, [queryClient]);
}
