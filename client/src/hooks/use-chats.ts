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
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instance, remoteJid, text }: { instance: string; remoteJid: string; text: string }) =>
      chatsApi.send(instance, remoteJid, text),
    onSuccess: (_message, variables) => {
      void queryClient.invalidateQueries({ queryKey: messagesQueryKey(variables.instance, variables.remoteJid) });
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey(variables.instance) });
    },
  });
}
