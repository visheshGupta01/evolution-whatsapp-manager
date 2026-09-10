import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectRealtime, disconnectRealtime, type RealtimeEvent } from '../lib/realtime';
import { sessionsQueryKey } from './use-sessions';
import { chatsQueryKey, messagesQueryKey } from './use-chats';

const SESSION_EVENTS = new Set(['connection.update', 'qrcode.updated', 'application.startup']);
const MESSAGE_EVENTS = new Set(['messages.upsert', 'messages.update', 'messages.delete', 'send.message']);

function messageItems(data: any) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages?.records)) return data.messages.records;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.records)) return data.records;
  return [data];
}

function messageJids(event: RealtimeEvent) {
  const jids = new Set<string>();

  for (const item of messageItems(event.data)) {
    const key = item?.key || item?.message?.key || {};
    const message = item?.message || item;

    for (const value of [
      key?.remoteJid,
      key?.remoteJidAlt,
      message?.remoteJid,
      message?.remoteJidAlt,
    ]) {
      if (typeof value === 'string' && value.trim()) jids.add(value.trim());
    }
  }

  return [...jids];
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

        const jids = messageJids(event);
        if (jids.length) {
          for (const remoteJid of jids) {
            void queryClient.invalidateQueries({
              queryKey: messagesQueryKey(event.instance, remoteJid),
            });
          }
        } else {
          // Some Evolution webhook payloads wrap messages in arrays/records
          // without exposing the JID at the top level. Refresh the active
          // conversation query as a safe fallback.
          void queryClient.invalidateQueries({
            queryKey: ['messages', event.instance],
            exact: false,
          });
        }
      }
    };

    connectRealtime({ onEvent: handleEvent });
    return () => disconnectRealtime();
  }, [queryClient]);
}
