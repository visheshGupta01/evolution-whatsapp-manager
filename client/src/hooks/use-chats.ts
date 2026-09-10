import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatsApi } from '../lib/api';

export const chatsQueryKey = (instance: string) => ['chats', instance];
export const messagesQueryKey = (instance: string, remoteJid: string) => ['messages', instance, remoteJid];

export function useChats(instance: string | null) {
  return useQuery({
    queryKey: chatsQueryKey(instance || ''),
    queryFn: () => chatsApi.list(instance as string),
    enabled: Boolean(instance),
    staleTime: 3_000,
    refetchInterval: 15_000,
  });
}

export function useMessages(instance: string | null, remoteJid: string | null) {
  return useQuery({
    queryKey: messagesQueryKey(instance || '', remoteJid || ''),
    queryFn: () => chatsApi.messages(instance as string, remoteJid as string),
    enabled: Boolean(instance && remoteJid),
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

function optimisticMessage(response: any, variables: { remoteJid: string; text: string }) {
  const key = response?.key || response?.message?.key || {};
  const message = response?.message || response;
  const id = String(
    key?.id ||
    response?.id ||
    `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  return {
    id,
    remoteJid: String(key?.remoteJid || response?.remoteJid || variables.remoteJid),
    remoteJidAlt: String(key?.remoteJidAlt || response?.remoteJidAlt || ''),
    fromMe: true,
    text: String(
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      response?.text ||
      variables.text,
    ),
    timestamp: Number(response?.messageTimestamp || response?.timestamp || Math.floor(Date.now() / 1000)),
    status: response?.status || 'PENDING',
    messageType: response?.messageType || 'conversation',
    pushName: null,
  };
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instance, remoteJid, remoteJidAlt, text }: { instance: string; remoteJid: string; remoteJidAlt?: string; text: string }) =>
      chatsApi.send(instance, remoteJid, text, remoteJidAlt),
    onSuccess: async (response, variables) => {
      const messageKey = messagesQueryKey(variables.instance, variables.remoteJid);
      const chatKey = chatsQueryKey(variables.instance);
      const localMessage = optimisticMessage(response, variables);

      // Put the sent message into the active conversation immediately. Do not
      // depend on Evolution's webhook or database persistence for the first
      // paint; v2.3.7 can acknowledge sends before the message is queryable.
      queryClient.setQueryData<any[]>(messageKey, (current = []) => {
        if (current.some((item) => item?.id === localMessage.id)) return current;
        return [...current, localMessage].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
      });

      // Refresh both caches as a background reconciliation step. If Evolution
      // returns the persisted message, the optimistic entry is replaced by the
      // real record on the next successful fetch.
      void queryClient.invalidateQueries({ queryKey: messageKey });
      void queryClient.invalidateQueries({ queryKey: chatKey });

      // Give Evolution a moment to persist the outbound record before the
      // immediate reconciliation request. This avoids wiping the optimistic
      // message with a temporarily stale findMessages response.
      window.setTimeout(() => {
        void queryClient.refetchQueries({ queryKey: messageKey, type: 'active' });
        void queryClient.refetchQueries({ queryKey: chatKey, type: 'active' });
      }, 800);
    },
  });
}
