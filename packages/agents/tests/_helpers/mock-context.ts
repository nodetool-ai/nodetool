/**
 * Shared mock ProcessingContext for unit tests.
 *
 * Backs `set/get/storeStepResult/loadStepResult` with an in-memory Map and
 * mounts a real {@link AgentMemory} so executor code that goes through
 * `context.memory` works against the production class — not a stub.
 */

import { vi } from "vitest";
import { AgentMemory } from "@nodetool-ai/runtime";

export function createMockContext(
  shared: {
    memory?: AgentMemory;
    variables?: Map<string, unknown>;
    userId?: string;
  } = {}
) {
  const variables = shared.variables ?? new Map<string, unknown>();
  let injectedTools: Array<{ name: string }> = [];
  const listeners = new Set<(msg: unknown) => void>();
  const memory = shared.memory ?? new AgentMemory();
  const ctx: Record<string, unknown> = {
    userId: shared.userId ?? "test-user",
    memory,
    signal: new AbortController().signal,
    addMessageListener: vi.fn((listener: (msg: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    // Mirrors ProcessingContext.copy: a child sharing whatever the options say.
    copy: vi.fn((opts?: { shareMemory?: boolean }) =>
      createMockContext({
        memory: opts?.shareMemory ? memory : undefined,
        variables,
        userId: shared.userId
      })
    ),
    setInjectedTools: vi.fn((tools: Array<{ name: string }>) => {
      injectedTools = tools;
    }),
    getInjectedTool: vi.fn(
      (name: string) => injectedTools.find((t) => t.name === name) ?? null
    ),
    workspaceDir: null,
    storeStepResult: vi.fn(async (key: string, value: unknown) => {
      variables.set(key, value);
      return key;
    }),
    loadStepResult: vi.fn(async (key: string) => {
      return variables.get(key);
    }),
    set: vi.fn((key: string, value: unknown) => {
      variables.set(key, value);
    }),
    get: vi.fn((key: string) => {
      return variables.get(key);
    }),
    sandboxToAsset: vi.fn(async (uri: string) => ({ uri: `asset://${uri}` })),
    postMessage: vi.fn(),
    post_message: vi.fn(),
    _store: variables
  };
  ctx.emit = vi.fn((msg: unknown) => {
    for (const listener of listeners) listener(msg);
  });
  return ctx as any;
}
