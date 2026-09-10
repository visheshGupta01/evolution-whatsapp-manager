import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectRealtime, disconnectRealtime, type RealtimeEvent } from '../lib/realtime';
import { sessionsQueryKey } from './use-sessions';
import { chatsQueryKey, messagesQueryKey } from './use-chats';

const SESSION_EVENTS = new Set(['connection.update', 'qrcode.updated', 'application.startup']);
const MESSAGE_EVENTS = new Set(['messages.upsert', 'messages.update', 'messages.delete', 'send.message']);

function remoteJidFrom(event: RealtimeEvent) {
  const data = event.data as any;
  return data?.key?.remoteJid || data?.remoteJid || data?.message?.key?.remoteJid || null;
}

export function useRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleEvent = (event: RealtimeEvent) => {
      if (SESSION_EVENTS.has(event.event)) {
        void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      }

      if (MESSAGE_EVENTS.has(event.event) && event.instance) {
        void queryClient.invalidateQueries({ queryKey: chatsQueryKey(event.instance) });
        const remoteJid = remoteJidFrom(event);
        if (remoteJid) {
          void queryClient.invalidateQueries({ queryKey: messagesQueryKey(event.instance, remoteJid) });
        }
      }
    };

    connectRealtime({ onEvent: handleEvent });
    return () => disconnectRealtime();
  }, [queryClient]);
}
