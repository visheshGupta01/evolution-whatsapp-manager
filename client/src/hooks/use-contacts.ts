import { useQuery } from '@tanstack/react-query';
import { contactsApi, type Contact } from '../lib/api';

export const contactsQueryKey = (instance: string) => ['contacts', instance];

export function useContacts(instance: string | null) {
  return useQuery<Contact[]>({
    queryKey: contactsQueryKey(instance || ''),
    queryFn: () => contactsApi.list(instance as string),
    enabled: Boolean(instance),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
