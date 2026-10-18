// The BL-1 editor's store, provided per instance so two bass tracks can show
// two editors at once.

import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { BassStore, BassStoreApi } from './store';

const BassStoreContext = createContext<BassStoreApi | null>(null);

export function BassStoreProvider({ store, children }: { store: BassStoreApi; children: ReactNode }) {
  return <BassStoreContext.Provider value={store}>{children}</BassStoreContext.Provider>;
}

export function useBassStoreApi(): BassStoreApi {
  const store = useContext(BassStoreContext);
  if (!store) throw new Error('useBassStore must be used inside a BassStoreProvider');
  return store;
}

export function useBassStore<T>(selector: (state: BassStore) => T): T {
  return useStore(useBassStoreApi(), selector);
}
