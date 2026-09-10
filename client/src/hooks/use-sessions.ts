import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '../lib/api';

export const sessionsQueryKey = ['sessions'];

export function useSessions() {
  return useQuery({
    queryKey: sessionsQueryKey,
    queryFn: sessionsApi.list,
    refetchInterval: 8_000,
  });
}

export function useSessionMutation() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: sessionsQueryKey });

  return {
    create: useMutation({ mutationFn: sessionsApi.create, onSuccess: refresh }),
    restart: useMutation({ mutationFn: sessionsApi.restart, onSuccess: refresh }),
    disconnect: useMutation({ mutationFn: sessionsApi.disconnect, onSuccess: refresh }),
    remove: useMutation({ mutationFn: sessionsApi.remove, onSuccess: refresh }),
    sendText: useMutation({
      mutationFn: ({ instance, number, text }: { instance: string; number: string; text: string }) =>
        sessionsApi.sendText(instance, number, text),
    }),
  };
}
