import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectRealtime, disconnectRealtime, type RealtimeEvent } from '../lib/realtime';
import { sessionsQueryKey } from './use-sessions';
import { chatsQueryKey, messagesQueryKey } from './use-chats';

const SESSION_EVENTS = new Set(['connection.update', 'qrcode.updated', 'application.startup']);
const MESSAGE_EVENTS = new Set(['messages.upsert', 'messages.update', 'messages.delete', 'send.message']);

function messageJids(event: RealtimeEvent) {
  const data = event.data as any;
  const key = data?.key || data?.message?.key || {};
  const message = data?.message || data;
  return [...new Set([
    key?.remoteJid,
    key?.remoteJidAlt,
    message?.remoteJid,
    message?.remoteJidAlt,
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())))];
}

export function useRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleEvent = (event: RealtimeEvent) => {
      if (SESSION_EVENTS.has(event.event)) {
        void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      }

      if (MESSAGE_EVENTS.has(event.event) && event.instance) {
        // Keep the conversation list fresh immediately when Evolution emits
        // an incoming/outgoing message or message-state update.
        void queryClient.invalidateQueries({ queryKey: chatsQueryKey(event.instance) });

        // WhatsApp can represent the same conversation with a LID and a
        // phone JID. Invalidate every JID carried by the event so the active
        // thread refreshes regardless of which identifier Evolution emits.
        for (const remoteJid of messageJids(event)) {
          void queryClient.invalidateQueries({
            queryKey: messagesQueryKey(event.instance, remoteJid),
          });
        }
      }
    };

    connectRealtime({ onEvent: handleEvent });
    return () => disconnectRealtime();
  }, [queryClient]);
}
