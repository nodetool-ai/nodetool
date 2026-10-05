import { AsyncLocalStorage } from "./async-local-storage.js";

/** Immutable app identity. Secrets are held by ProcessingContext, never serialized. */
export interface AppRunContext {
  readonly userId: string;
  readonly instanceId: string;
  readonly appRunId: string;
  readonly traceId: string;
  readonly origin: "ui" | "agent" | "cli" | "debug" | "public";
}

/** Run-local accounting remains distinct from the node's retry account. */
export interface AppRunCostAccount {
  llmCostUsd: number;
  unpriced: boolean;
}
const costStore = new AsyncLocalStorage<AppRunCostAccount>();

export function inAppRunCostAccount<T>(
  account: AppRunCostAccount | null,
  execute: () => Promise<T>
): Promise<T> {
  return account ? costStore.run(account, execute) : execute();
}

export function recordAppRunLlmCost(cost: number | undefined): void {
  const account = costStore.getStore();
  if (!account) {
    return;
  }
  if (cost === undefined || !Number.isFinite(cost) || cost < 0) {
    account.unpriced = true;
  } else {
    account.llmCostUsd += cost;
  }
}

export interface AppRunDocumentRef {
  readonly kind: "sketch" | "timeline" | "script" | "storyboard";
  readonly id: string;
}
