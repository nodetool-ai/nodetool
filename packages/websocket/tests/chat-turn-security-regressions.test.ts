import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb, Project, Thread } from "@nodetool-ai/models";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { HydratedGraphData } from "@nodetool-ai/protocol";
import type { ToolBridge } from "../src/websocket-client-session.js";
import { FakeClientSession } from "./fake-client-session.js";

vi.mock("../src/credit-gate.js", async (orig) => ({
  ...(await orig<typeof import("../src/credit-gate.js")>()),
  admitSpend: vi.fn()
}));

const { admitSpend } = await import("../src/credit-gate.js");
const { ChatTurnHandler } = await import("../src/session/chat-turn.js");

function makeStubBridge(): ToolBridge {
  return {
    createWaiter: vi.fn(async () => ({})),
    resolveResult: vi.fn(),
    resolveScope: vi.fn(),
    rejectResult: vi.fn(),
    cancelAll: vi.fn(),
    cancelScope: vi.fn(),
    cancelAllExcept: vi.fn()
  } as unknown as ToolBridge;
}

function makeHandler(options: {
  userId?: string;
  resolveProvider?: (providerId: string, userId: string) => Promise<BaseProvider>;
}) {
  const session = new FakeClientSession({
    userId: options.userId ?? "user-1",
    resolveProvider: options.resolveProvider
  });
  const handler = new ChatTurnHandler(session, {
    jobs: {
      registerJob: vi.fn(),
      dropJob: vi.fn(),
      releaseJob: vi.fn(),
      handleNodeProviderCost: vi.fn(),
      runMeasuredCost: () => null
    },
    toolBridge: makeStubBridge(),
    approvalBridge: makeStubBridge(),
    clientTools: () => ({}),
    authToken: () => null,
    defaults: { provider: "ollama", model: "gpt-oss:20b" },
    hydrateGraph: async (): Promise<HydratedGraphData> => ({ nodes: [], edges: [] }),
    configuredProviders: async () => ({}),
    entityRefResolver: () => ({ getAssetInfo: async () => null }),
    resolveEntityReferenceImages: async () => [],
    resolveSourceImageBytes: async () => null,
    resolveReferenceMediaBytes: async () => ({ images: [], videos: [] })
  });
  return { handler, session };
}

describe("ChatTurnHandler security regressions", () => {
  beforeEach(() => {
    initTestDb();
    vi.mocked(admitSpend).mockReset();
  });

  it("enforces credit gate when media_generation.provider is nodetool even if top-level provider is not", async () => {
    vi.mocked(admitSpend).mockResolvedValue({
      allowed: false,
      refusal: "insufficient_credits",
      reason: "Out of credits"
    });
    const resolveProvider = vi.fn(async () => ({}) as BaseProvider);
    const { handler, session } = makeHandler({ resolveProvider });

    await handler.handleChatMessage({
      thread_id: "t-media-bypass",
      content: "a red fox",
      provider: "ollama",
      model: "gpt-oss:20b",
      media_generation: {
        mode: "image",
        provider: "nodetool",
        model: "nodetool/flux-schnell"
      }
    });

    expect(admitSpend).toHaveBeenCalledWith("user-1", 0, [
      "nodetool/flux-schnell"
    ]);
    expect(session.messagesOfType("error")).toHaveLength(1);
    expect(resolveProvider).not.toHaveBeenCalled();
  });

  it("checks media_generation.model against the credit whitelist rather than top-level data.model", async () => {
    vi.mocked(admitSpend).mockResolvedValue({
      allowed: false,
      refusal: "model_not_allowed",
      reason: 'Model "nodetool/disallowed-video" is not available on this server.'
    });
    const resolveProvider = vi.fn(async () => ({}) as BaseProvider);
    const { handler, session } = makeHandler({ resolveProvider });

    await handler.handleChatMessage({
      thread_id: "t-media-model-bypass",
      content: "a rocket launch",
      provider: "nodetool",
      model: "nodetool/director",
      media_generation: {
        mode: "video",
        model: "nodetool/disallowed-video"
      }
    });

    expect(admitSpend).toHaveBeenCalledWith("user-1", 0, [
      "nodetool/disallowed-video"
    ]);
    expect(session.messagesOfType("error")).toHaveLength(1);
    expect(resolveProvider).not.toHaveBeenCalled();
  });

  it("refuses creating a thread with an explicit thread_id attached to another user's project", async () => {
    const victimProject = await Project.create({
      user_id: "user-victim",
      name: "Private Project"
    });
    const resolveProvider = vi.fn(async () => ({}) as BaseProvider);
    const { handler } = makeHandler({
      userId: "user-attacker",
      resolveProvider
    });

    await expect(
      handler.handleChatMessage({
        thread_id: "attacker-new-thread",
        project_id: victimProject.id,
        content: "hello",
        provider: "openai",
        model: "gpt-4o"
      })
    ).rejects.toThrow();

    expect(await Thread.get("attacker-new-thread")).toBeNull();
    expect(resolveProvider).not.toHaveBeenCalled();
  });
});
