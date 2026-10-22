import { parseConsentState, type ConsentState } from "../consent/types.js";
import {
  parseAnonymousIdentity,
  type AnonymousIdentity
} from "../identity/anonymous-id.js";
import type { AnalyticsClientType } from "../schema/clients.js";
import type { AnalyticsEnvelope } from "../schema/envelope.js";
import type { AnalyticsStore } from "../core/store.js";

/** The subset of the Web Storage API the adapter needs. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Storage keys for one client type. The namespace keeps Cloud, local web and
 * desktop consent apart even when they share an origin, and no key contains
 * an account, a host or a port.
 */
export function analyticsStorageKeys(clientType: AnalyticsClientType): {
  consent: string;
  identity: string;
  queue: string;
} {
  const prefix = `nodetool.analytics.${clientType}`;
  return {
    consent: `${prefix}.consent`,
    identity: `${prefix}.identity`,
    queue: `${prefix}.queue`
  };
}

/** A value decoded from storage, before the consent or identity parser checks its shape. */
type StoredJson =
  | string
  | number
  | boolean
  | null
  | StoredJson[]
  | { [key: string]: StoredJson };

const readJson = (storage: KeyValueStorage, key: string): StoredJson => {
  try {
    const raw = storage.getItem(key);
    // SAFETY: JSON.parse only produces JSON values, which is what StoredJson spells out.
    return raw === null ? null : (JSON.parse(raw) as StoredJson);
  } catch {
    return null;
  }
};

const writeJson = (storage: KeyValueStorage, key: string, value: unknown): void => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: the client keeps working from memory.
  }
};

/** A store backed by `localStorage` (or any compatible storage). */
export function createWebStorageAnalyticsStore(
  storage: KeyValueStorage,
  clientType: AnalyticsClientType
): AnalyticsStore {
  const keys = analyticsStorageKeys(clientType);
  return {
    loadConsent: async (): Promise<ConsentState> =>
      parseConsentState(readJson(storage, keys.consent)),
    saveConsent: async (state) => writeJson(storage, keys.consent, state),
    loadIdentity: async (): Promise<AnonymousIdentity | null> =>
      parseAnonymousIdentity(readJson(storage, keys.identity)),
    saveIdentity: async (identity) => {
      if (identity === null) {
        try {
          storage.removeItem(keys.identity);
        } catch {
          // Nothing stored or storage unavailable.
        }
        return;
      }
      writeJson(storage, keys.identity, identity);
    },
    loadQueue: async () => {
      const queue = readJson(storage, keys.queue);
      return Array.isArray(queue) ? queue : [];
    },
    saveQueue: async (queue: readonly AnalyticsEnvelope[]) => {
      if (queue.length === 0) {
        try {
          storage.removeItem(keys.queue);
        } catch {
          // Nothing stored or storage unavailable.
        }
        return;
      }
      writeJson(storage, keys.queue, queue);
    }
  };
}
