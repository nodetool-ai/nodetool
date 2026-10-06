import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ProcessingContext } from "../src/context.js";
import { AgentMemory } from "../src/agent-memory.js";
import { BaseProvider } from "../src/providers/base-provider.js";
import type { Message, ProviderStreamItem } from "../src/providers/types.js";
import {
  createLocalWorkspace,
  createWorkspace
} from "../src/storage-workspace.js";
import { observeWorkspace } from "../src/workspace.js";

class ImageProvider extends BaseProvider {
  constructor() {
    super("fake");
  }

  override async textToImage(): Promise<Uint8Array> {
    return new Uint8Array([1, 2, 3]);
  }

  async generateMessage(): Promise<Message> {
    throw new Error("not used");
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("not used");
  }
}

const SHARED = new Set([
  "workspace",
  "_generationLifecycle",
  "_appRunDocuments",
  "appRunCostAccount",
  "runTraceContext",
  "_resolvedSecrets",
  "cache",
  "storage",
  "assetStorage",
  "workspaceStorage",
  "signal",
  "_providerResolver",
  "_modelInterfaces",
  "_sendControlEvent",
  "_injectedTools",
  "_secretResolver",
  "_fetch",
  "_tempUrlResolver",
  "sandboxModuleCatalog",
  "triggerEvent"
]);

const COPIED = new Set([
  "jobId",
  "workflowId",
  "threadId",
  "userId",
  "workspaceDir",
  "projectId",
  "assetOutputMode",
  "persistOutputAssets",
  "authToken",
  "appRunContext",
  "_retainMessageQueue",
  "_totalCost",
  "_variables",
  "environment",
  "_providers",
  "_operationCosts",
  "_messageListeners"
]);

const FRESH = new Set([
  "_messages",
  "_messageWaiters",
  "_nodeStatuses",
  "_edgeStatuses",
  "memory",
  "_memory",
  "_channels",
  "_channelWriters",
  "_providerPromises",
  "_providerCost",
  "_normalizedOutputAssets",
  // Q1: preserve current resolver reset behavior. Reproduce copied sub-graph
  // execution before deciding whether these host dependencies should carry over.
  "_resolveExecutor",
  "_resolveNodeType"
]);

describe("ProcessingContext.copy", () => {
  it("preserves a virtual workspace and its storage prefix", async () => {
    const storage = new InMemoryStorageAdapter();
    const workspace = createWorkspace(storage, { prefix: "ws-1" });
    const parent = new ProcessingContext({ jobId: "job", workspace });
    const child = parent.copy();

    expect(child.workspace).toBe(parent.workspace);
    expect(child.workspaceDir).toBeNull();
    expect(child.workspaceStorage).toBeNull();
    await child.workspace!.write("notes.txt", "child output");
    expect(await parent.workspace!.readText("notes.txt")).toBe("child output");
    expect(await storage.exists("memory://ws-1/notes.txt")).toBe(true);
    expect(await storage.exists("memory://notes.txt")).toBe(false);
  });

  it("keeps local workspace observers on child writes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "context-copy-"));
    try {
      const onChange = vi.fn();
      const workspace = observeWorkspace(createLocalWorkspace(dir), onChange);
      const parent = new ProcessingContext({ jobId: "job", workspace });
      const child = parent.copy();

      await child.workspace!.write("notes.txt", "child output");
      expect(await parent.workspace!.readText("notes.txt")).toBe(
        "child output"
      );
      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        kind: "write",
        path: "notes.txt"
      });
      expect(child.workspace).toBe(workspace);
      expect(child.workspaceDir).toBe(await realpath(dir));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs the host generation lifecycle from the child", async () => {
    const onGenerationAccepted = vi.fn().mockResolvedValue({ durable: true });
    const onGenerationTerminal = vi.fn();
    const parent = new ProcessingContext({
      jobId: "job",
      generationLifecycle: { onGenerationAccepted, onGenerationTerminal }
    });
    parent.registerProvider("fake", new ImageProvider());
    const child = parent.copy();
    const request = {
      id: "copy-generation",
      provider: "fake",
      capability: "text_to_image",
      model: "fake-image",
      params: { prompt: "test" }
    } as const;

    const result = await child.runGeneration(request);

    expect(child.jobId).toBe(parent.jobId);
    expect(onGenerationAccepted).toHaveBeenCalledExactlyOnceWith({
      generationId: request.id,
      request
    });
    expect(onGenerationTerminal).toHaveBeenCalledExactlyOnceWith({
      generationId: request.id,
      request,
      status: "completed",
      output: result.output,
      receipt: null,
      assetIds: []
    });
  });

  it("classifies every own field and enforces its copy policy", () => {
    const storage = new InMemoryStorageAdapter();
    const parent = new ProcessingContext({
      jobId: "job",
      workflowId: "workflow",
      threadId: "thread",
      userId: "user",
      appRunContext: {
        userId: "user",
        instanceId: "i".repeat(32),
        appRunId: "a".repeat(32),
        traceId: "b".repeat(32),
        origin: "ui"
      },
      runTraceContext: {
        userId: "user",
        runId: "a".repeat(32),
        traceId: "b".repeat(32),
        origin: "ui",
        secretValues: new Set(["run-secret"]),
        policy: { contentSuppressed: false }
      },
      projectId: "project",
      authToken: "token",
      assetOutputMode: "raw",
      persistOutputAssets: false,
      retainMessageQueue: false,
      workspace: createWorkspace(storage, { prefix: "ws-1" }),
      storage,
      assetStorage: storage,
      workspaceStorage: storage,
      variables: { input: { value: 1 } },
      environment: { COPY_TEST: "parent" },
      secretResolver: async () => "secret",
      tempUrlResolver: (uri) => uri,
      modelInterfaces: {},
      generationLifecycle: {
        onGenerationAccepted: vi.fn(),
        onGenerationTerminal: vi.fn()
      },
      triggerEvent: {
        node_id: "node",
        input_id: "input",
        payload: { value: 1 }
      },
      onMessage: vi.fn()
    });
    parent.registerProvider("fake", new ImageProvider());
    parent.setProviderResolver(() => new ImageProvider());
    parent.setSendControlEvent(async (_nodeId, properties) => properties);
    parent.setInjectedTools([
      {
        name: "test_tool",
        description: "Test tool",
        process: async () => "result"
      }
    ]);
    parent.trackOperationCost("generation", 1.25);
    parent.memory.set({ key: "shared:parent", kind: "shared", value: 1 });

    const probe = {};
    // The requested field audit deliberately inspects private own properties.
    // Seed resettable fields so accidental sharing or copying cannot pass empty.
    for (const key of FRESH) {
      const value: unknown = Reflect.get(parent, key);
      if (Array.isArray(value)) {
        value.push({ parent: true });
      } else if (value instanceof Map) {
        value.set("parent", { parent: true });
      } else if (value instanceof Set) {
        value.add("parent");
      } else if (value instanceof WeakMap) {
        value.set(probe, new Map());
      } else if (value === null) {
        Reflect.set(parent, key, vi.fn());
      }
    }
    const child = parent.copy();
    const keys = Reflect.ownKeys(parent);
    expect(keys.length).toBeGreaterThan(40);
    expect(Reflect.ownKeys(child)).toEqual(keys);
    const classified = [...SHARED, ...COPIED, ...FRESH];
    expect(new Set(classified).size).toBe(classified.length);
    expect(classified.toSorted()).toEqual(keys.map(String).toSorted());

    for (const key of keys) {
      const name = String(key);
      const original: unknown = Reflect.get(parent, key);
      const value: unknown = Reflect.get(child, key);
      if (SHARED.has(name)) {
        expect(value, name).toBe(original);
      } else if (COPIED.has(name)) {
        expect(value, name).toEqual(original);
        if (original !== null && typeof original === "object") {
          expect(value, name).not.toBe(original);
        }
      } else if (FRESH.has(name)) {
        expect(value, name).not.toBe(original);
        if (Array.isArray(value)) {
          expect(value, name).toEqual([]);
        } else if (value instanceof Map || value instanceof Set) {
          expect(value.size, name).toBe(0);
        } else if (value instanceof AgentMemory) {
          expect(value.size(), name).toBe(0);
        } else if (value instanceof WeakMap) {
          expect(value.has(probe), name).toBe(false);
        } else {
          expect(value, name).toBeNull();
        }
      } else {
        throw new Error(`Unclassified ProcessingContext field: ${name}`);
      }
    }

    expect(child.getOperationCosts()[0]).not.toBe(
      parent.getOperationCosts()[0]
    );
    child.addToTotalCost(2);
    expect(parent.getTotalCost()).toBe(1.25);
    expect(child.getTotalCost()).toBe(3.25);
  });
});
