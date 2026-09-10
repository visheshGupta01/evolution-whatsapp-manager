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

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instance, remoteJid, remoteJidAlt, text }: { instance: string; remoteJid: string; remoteJidAlt?: string; text: string }) =>
      chatsApi.send(instance, remoteJid, text, remoteJidAlt),
    onSuccess: async (_message, variables) => {
      const messageKey = messagesQueryKey(variables.instance, variables.remoteJid);
      const chatKey = chatsQueryKey(variables.instance);

      // Invalidate first so React Query knows the cached conversation is stale.
      await queryClient.invalidateQueries({ queryKey: messageKey });
      await queryClient.invalidateQueries({ queryKey: chatKey });

      // Immediately refetch the active conversation instead of waiting for the
      // 5-second polling interval. This is important when Evolution accepts a
      // send but its webhook arrives slightly later (or is not configured on
      // an already-existing Evolution instance).
      await Promise.all([
        queryClient.refetchQueries({ queryKey: messageKey, type: 'active' }),
        queryClient.refetchQueries({ queryKey: chatKey, type: 'active' }),
      ]);
    },
  });
}
