import { beforeEach, describe, expect, it } from "vitest";
import { COMPACTION_EVENT_TYPE, initTestDb, Message, Thread } from "@nodetool-ai/models";
import { capabilityModuleOf, listCapabilitySpecs } from "@nodetool-ai/agents";
import { getRunTraceScope } from "@nodetool-ai/runtime";
import { fakeProvider, makeChatTurnHarness } from "./chat-turn-test-harness.js";

function request(threadId: string): Record<string, unknown> {
  return { thread_id: threadId, content: "next question", provider: "mock", model: "m" };
}

describe("chat run protected content provenance", () => {
  beforeEach(() => initTestDb());

  it("suppresses content from protected tools older than the compaction and recent probe", async () => {
    const thread = await Thread.create<Thread>({ user_id: "1" });
    const protectedName = listCapabilitySpecs().find((spec) => capabilityModuleOf(spec.name) === "email")?.name;
    expect(protectedName).toBeDefined();
    await Message.create({ thread_id: thread.id, user_id: "1", role: "tool", name: protectedName, content: "protected mail body" });
    for (let index = 0; index < 55; index++) {
      await Message.create({ thread_id: thread.id, user_id: "1", role: "assistant", content: "earlier answer" });
    }
    await Message.create({ thread_id: thread.id, user_id: "1", role: "user", execution_event_type: COMPACTION_EVENT_TYPE, content: "compacted protected mail body" });
    let suppressed: boolean | undefined;
    const harness = makeChatTurnHarness({ session: { resolveProvider: async () => fakeProvider({ generateLoop: async function* () {
      suppressed = getRunTraceScope()?.policy.contentSuppressed;
      yield { type: "chunk", content: "answer", done: true };
    } }) } });
    await harness.handler.handleChatMessage(request(thread.id));
    expect(suppressed).toBe(true);
  });

  it("carries native session suppression through renewal without source tool rows", async () => {
    const thread = await Thread.create<Thread>({ user_id: "1" });
    await Message.create({ thread_id: thread.id, user_id: "1", role: "assistant", content: "prior answer", provider_session: {
      providerId: "mock", model: "m", token: "prior", checkpoint: 1, traceContentSuppressed: true
    } });
    let suppressed: boolean | undefined;
    let priorFlag: unknown;
    const harness = makeChatTurnHarness({ session: { resolveProvider: async () => fakeProvider({ generateLoop: async function* (args) {
      suppressed = getRunTraceScope()?.policy.contentSuppressed;
      const session = args.providerSession;
      priorFlag = typeof session === "object" && session !== null && "traceContentSuppressed" in session ? session.traceContentSuppressed : undefined;
      yield { type: "session", session: { providerId: "mock", model: "m", token: "renewed", checkpoint: 2 } };
      yield { type: "message", message: { role: "assistant", content: "new answer", toolCalls: null } };
      yield { type: "chunk", content: "", done: true };
    } }) } });
    await harness.handler.handleChatMessage(request(thread.id));
    expect(suppressed).toBe(true);
    expect(priorFlag).toBe(true);
    const [messages] = await Message.paginate(thread.id, { limit: 10 });
    expect(messages.find((message) => message.provider_session?.token === "renewed")?.provider_session?.traceContentSuppressed).toBe(true);
  });
});
