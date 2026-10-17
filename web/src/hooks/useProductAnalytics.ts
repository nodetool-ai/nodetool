import { useCallback, useSyncExternalStore } from "react";
import type {
  AnalyticsClient,
  AnalyticsEnvelope,
  ConsentState
} from "@nodetool-ai/analytics";
import { getProductAnalytics } from "../lib/analytics";

export interface ProductAnalyticsState {
  /** Null before init, or when this browser blocks storage. */
  client: AnalyticsClient | null;
  consent: ConsentState | null;
  /** Events recorded this session, newest last, exactly as sent. */
  recentEvents: readonly AnalyticsEnvelope[];
}

const EMPTY: readonly AnalyticsEnvelope[] = [];
const noopUnsubscribe = (): void => {};

/**
 * Re-renders when consent or the recent-events list changes. Each snapshot is
 * read from the client, which returns stable references between changes.
 */
export const useProductAnalytics = (): ProductAnalyticsState => {
  const client = getProductAnalytics();
  const subscribe = useCallback(
    (onChange: () => void) => (client ? client.subscribe(onChange) : noopUnsubscribe),
    [client]
  );
  const consent = useSyncExternalStore(subscribe, () => client?.getConsent() ?? null);
  const recentEvents = useSyncExternalStore(
    subscribe,
    () => client?.recentEvents() ?? EMPTY
  );
  return { client, consent, recentEvents };
};
