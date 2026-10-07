/**
 * When a workflow run must wait for the Python worker before it starts.
 *
 * A Python node needs the worker to execute. A TypeScript node can need it too:
 * it may select a provider only the worker registers (`huggingface-local`), and
 * the run preflight refuses a provider that is not registered yet.
 */

import {
  collectModelSelectionIssues,
  type GraphValidationNode
} from "@nodetool-ai/node-sdk";

export interface PythonBridgeGateState {
  /** The worker is connected and its node metadata is merged. */
  bridgeReady: boolean;
  /** A worker can be started on this host. */
  bridgeAvailable: boolean;
  /** The type is a Python node: known metadata, no TypeScript executor. */
  isPythonNodeType: (type: string) => boolean;
  /** Provider ids registered right now. */
  providerIds: () => string[];
}

/** Whether `nodes` needs the Python worker before the run can start. */
export function runNeedsPythonBridge(
  nodes: readonly GraphValidationNode[],
  state: PythonBridgeGateState
): boolean {
  if (
    !state.bridgeReady &&
    nodes.some((node) => state.isPythonNodeType(String(node.type ?? "")))
  ) {
    return true;
  }
  if (!state.bridgeAvailable) {
    // Nothing to wait for: the preflight reports the unknown provider.
    return false;
  }
  return collectModelSelectionIssues(
    { nodes: [...nodes] },
    { listProviderIds: state.providerIds }
  ).some((issue) => issue.code === "unknown_provider");
}

/**
 * Share one in-flight provider registration across callers, so a run that
 * arrives mid-registration waits for it instead of racing it. A settled
 * registration is not cached: the next caller lists the worker's providers
 * again, and registration skips ids that already exist.
 */
export function createProviderRegistrar(
  register: () => Promise<string[]>
): () => Promise<string[]> {
  let pending: Promise<string[]> | null = null;
  return () => {
    pending ??= register().finally(() => {
      pending = null;
    });
    return pending;
  };
}
