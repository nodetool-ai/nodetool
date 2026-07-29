import { useState, type ReactNode } from 'react';
import { defaultShouldDehydrateQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { trpc, createTrpcLinks } from './client';
import { queryClient, PERSIST_MAX_AGE, isPersistableQueryKey } from '../queryClient';

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'nodetool-query-cache',
  // Serializing the whole cache on every change is expensive on a phone.
  throttleTime: 2_000,
});

/**
 * Bump the cache whenever the app version changes: a release can change the
 * shape of any cached response, and rehydrating an old shape into new screens
 * crashes them. A mismatched buster makes the persister drop the snapshot.
 */
const buster = Constants.expoConfig?.version ?? 'dev';

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [trpcClient] = useState(() =>
    trpc.createClient({ links: createTrpcLinks() })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE,
          buster,
          dehydrateOptions: {
            // Mutations are side effects — replaying them from a cold start is
            // never what the user asked for.
            shouldDehydrateMutation: () => false,
            shouldDehydrateQuery: (query) =>
              defaultShouldDehydrateQuery(query) &&
              isPersistableQueryKey(query.queryKey),
          },
        }}
      >
        {children}
      </PersistQueryClientProvider>
    </trpc.Provider>
  );
}
