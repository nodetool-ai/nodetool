import {
  DEFAULT_CONSENT,
  parseConsentState,
  type ConsentState
} from "../consent/types.js";
import {
  parseAnonymousIdentity,
  type AnonymousIdentity
} from "../identity/anonymous-id.js";
import type { AnalyticsEnvelope } from "../schema/envelope.js";

/**
 * Where one client keeps its consent, its anonymous ID and its unsent events.
 * Each client type has its own adapter, so no two surfaces share consent or
 * identity. None of these values is ever keyed by an account.
 */
export interface AnalyticsStore {
  loadConsent(): Promise<ConsentState>;
  saveConsent(state: ConsentState): Promise<void>;
  loadIdentity(): Promise<AnonymousIdentity | null>;
  /** `null` deletes the stored identity. */
  saveIdentity(identity: AnonymousIdentity | null): Promise<void>;
  loadQueue(): Promise<unknown[]>;
  saveQueue(queue: readonly AnalyticsEnvelope[]): Promise<void>;
}

/** The persisted shape shared by the file and web-storage adapters. */
export interface StoredAnalyticsState {
  consent: ConsentState;
  identity: AnonymousIdentity | null;
  queue: unknown[];
}

export function parseStoredState(value: unknown): StoredAnalyticsState {
  const record =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    consent: parseConsentState(record["consent"]),
    identity: parseAnonymousIdentity(record["identity"]),
    queue: Array.isArray(record["queue"]) ? record["queue"] : []
  };
}

/** A store held in memory: for tests and for the backend's operator consent. */
export function createMemoryAnalyticsStore(
  initial: Partial<StoredAnalyticsState> = {}
): AnalyticsStore & { snapshot(): StoredAnalyticsState } {
  let state: StoredAnalyticsState = {
    consent: initial.consent ?? { ...DEFAULT_CONSENT },
    identity: initial.identity ?? null,
    queue: initial.queue ?? []
  };
  return {
    loadConsent: async () => state.consent,
    saveConsent: async (consent) => {
      state = { ...state, consent };
    },
    loadIdentity: async () => state.identity,
    saveIdentity: async (identity) => {
      state = { ...state, identity };
    },
    loadQueue: async () => state.queue,
    saveQueue: async (queue) => {
      state = { ...state, queue: [...queue] };
    },
    snapshot: () => state
  };
}
