/**
 * Shared mock ProcessingContext for unit tests.
 *
 * Backs `set/get/storeStepResult/loadStepResult` with an in-memory Map and
 * mounts a real {@link AgentMemory} so executor code that goes through
 * `context.memory` works against the production class — not a stub.
 */

import { vi } from "vitest";
import { AgentMemory } from "@nodetool-ai/runtime";

export function createMockContext() {
  const variables = new Map<string, unknown>();
  let injectedTools: Array<{ name: string }> = [];
  return {
    memory: new AgentMemory(),
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
    emit: vi.fn(),
    postMessage: vi.fn(),
    post_message: vi.fn(),
    _store: variables
  } as any;
}
