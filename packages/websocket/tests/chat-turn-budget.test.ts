/**
 * The chat turn's run budget: one object per turn, shared by everything the
 * turn starts, and a stop the user can see.
 *
 * Two failure modes are pinned here. A turn that ends because a ceiling
 * refused it looks exactly like a model that finished answering unless the
 * reason is written into the thread (invariant I-3). And a budget the turn
 * hands out by value — a fresh one per capability run, per sub-agent, per
 * node — is no ceiling at all, because every nested loop then gets the whole
 * cap again (invariant I-2).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestDb, Message } from "@nodetool-ai/models";
import { BaseProvider, RUN_BUDGET_CONTEXT_KEY } from "@nodetool-ai/runtime";
import type {
  Message as ProviderMessage,
  ProviderStreamItem,
  RunBudget
} from "@nodetool-ai/runtime";
import { makeChatTurnHarness, type ChatTurnHarness } from "./chat-turn-test-harness.js";

/** Priced by the catalog, so a cap can refuse a turn on it. */
const PRICED_MODEL = "gpt-4o-mini";
/** A local model: priced at zero, so no USD cap can ever refuse it. */
const LOCAL_MODEL = "qwen-3.5:4b";

const BUDGET_ENV_KEYS = [
  "NODETOOL_AGENT_TURN_COST_CAP_USD",
  "NODETOOL_AGENT_TURN_DEADLINE_MS",
  "NODETOOL_AGENT_MAX_CONCURRENCY",
  "NODETOOL_AGENT_MAX_TURNS",
  "NODETOOL_AGENT_UNPRICED_TOKEN_CEILING"
] as const;

/**
 * A real {@link BaseProvider}, not a `generateLoop` double: the budget is
 * enforced *inside* the base loop, so a double that replaces the loop would
 * test nothing. Each turn optionally asks for a tool, which is what keeps the
 * loop coming back for another turn.
 */
class ScriptedProvider extends BaseProvider {
  readonly provider: "openai" | "ollama";
  /** Model turns actually made — the number a refused turn must not increase. */
  turns = 0;

  constructor(
    providerId: "openai" | "ollama",
    private readonly callToolEveryTurn: boolean
  ) {
    super();
    this.provider = providerId;
  }

  async generateMessage(): Promise<ProviderMessage> {
    return { role: "assistant", content: "unused" };
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    this.turns++;
    if (this.callToolEveryTurn) {
      yield {
        id: `call_${this.turns}`,
        name: "definitely_not_a_tool",
        args: {}
      };
      return;
    }
    yield { type: "chunk", content: "done", done: true };
  }
}

function chatTurn(
  threadId: string,
  providerId: string,
  model: string
): Record<string, unknown> {
  return { thread_id: threadId, content: "hi", provider: providerId, model };
}

async function assistantTexts(threadId: string): Promise<string[]> {
  const [rows] = await Message.paginate(threadId, { limit: 100 });
  return rows
    .filter((m) => m.role === "assistant")
    .map((m) => (typeof m.content === "string" ? m.content : ""));
}

function harnessFor(provider: BaseProvider): ChatTurnHarness {
  return makeChatTurnHarness({
    session: { resolveProvider: async () => provider }
  });
}

describe("the chat turn's run budget", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    initTestDb();
    for (const key of BUDGET_ENV_KEYS) saved.set(key, process.env[key]);
  });

  afterEach(() => {
    for (const key of BUDGET_ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("ends a turn priced above the cap before any model call, and says why", async () => {
    // Below one worst-case turn on a priced model (16k output tokens on
    // gpt-4o-mini is about a cent), so the first reservation is refused and
    // the call is never made.
    process.env.NODETOOL_AGENT_TURN_COST_CAP_USD = "0.001";
    const provider = new ScriptedProvider("openai", false);
    const harness = harnessFor(provider);

    await harness.handler.handleChatMessage(
      chatTurn("t-budget-cap", "openai", PRICED_MODEL)
    );

    expect(provider.turns).toBe(0);
    const texts = await assistantTexts("t-budget-cap");
    const notice = texts.find((t) => t.startsWith("Stopped:"));
    expect(notice).toBeDefined();
    expect(notice).toContain("turn budget of $0.001 reached");
    // The same text reaches the client, not just the transcript.
    expect(
      harness.session.messages.some(
        (m) =>
          m.role === "assistant" &&
          typeof m.content === "string" &&
          m.content.includes("turn budget of $")
      )
    ).toBe(true);
  });

  it("reads a non-positive cap as no cap, not as a cap of zero", async () => {
    // `Number("")` is 0, and a budget of $0 refuses every turn — the coercion
    // that would silently make a local-only install unable to chat at all.
    process.env.NODETOOL_AGENT_TURN_COST_CAP_USD = "0";
    const provider = new ScriptedProvider("openai", false);
    const harness = harnessFor(provider);

    await harness.handler.handleChatMessage(
      chatTurn("t-budget-nocap", "openai", PRICED_MODEL)
    );

    expect(provider.turns).toBe(1);
    expect(
      (await assistantTexts("t-budget-nocap")).some((t) =>
        t.startsWith("Stopped:")
      )
    ).toBe(false);
  });

  it("runs a local model unbounded by dollars and stops it on the turn count", async () => {
    // A cap far below a single priced turn, which a zero-priced local model
    // sails past: what ends this run is the turn count, not the money.
    process.env.NODETOOL_AGENT_TURN_COST_CAP_USD = "0.001";
    process.env.NODETOOL_AGENT_MAX_TURNS = "2";
    const provider = new ScriptedProvider("ollama", true);
    const harness = harnessFor(provider);

    await harness.handler.handleChatMessage(
      chatTurn("t-budget-local", "ollama", LOCAL_MODEL)
    );

    expect(provider.turns).toBe(2);
    const notice = (await assistantTexts("t-budget-local")).find((t) =>
      t.startsWith("Stopped:")
    );
    expect(notice).toContain("turn limit of 2 reached");
  });

  it("reports what the run spent in a log the user can see", async () => {
    // The number lived only in `log.debug`, so the person paying for the run
    // never saw it.
    const provider = new ScriptedProvider("ollama", false);
    const harness = harnessFor(provider);

    await harness.handler.handleChatMessage(
      chatTurn("t-budget-spend", "ollama", LOCAL_MODEL)
    );

    const spendLog = harness.session
      .messagesOfType("log_update")
      .find((m) => m.node_name === "budget");
    expect(spendLog).toBeDefined();
    expect(String(spendLog?.content)).toMatch(/^Run spent \$\d+\.\d{4}$/);
    expect(spendLog?.thread_id).toBe("t-budget-spend");
  });

  it("says the spend is a lower bound when a turn had no catalog price", async () => {
    process.env.NODETOOL_AGENT_UNPRICED_TOKEN_CEILING = "1000000";
    process.env.NODETOOL_AGENT_TURN_COST_CAP_USD = "1";
    const provider = new ScriptedProvider("openai", false);
    const harness = harnessFor(provider);

    await harness.handler.handleChatMessage(
      chatTurn("t-budget-unpriced", "openai", "a-model-nobody-prices")
    );

    const spendLog = harness.session
      .messagesOfType("log_update")
      .find((m) => m.node_name === "budget");
    expect(String(spendLog?.content)).toContain("at least $");
    expect(String(spendLog?.content)).toContain(
      "1 turn(s) on a model with no catalog price"
    );
  });

  it("shares one budget object with the capability run, the sub-agent runtime and the context", async () => {
    process.env.NODETOOL_AGENT_MAX_TURNS = "5";
    const provider = new ScriptedProvider("ollama", false);
    const harness = harnessFor(provider);

    await harness.handler.handleChatMessage(
      chatTurn("t-budget-shared", "ollama", LOCAL_MODEL)
    );

    const run = harness.handler.getCapabilityRun();
    expect(run).not.toBeNull();
    const budget = run?.budget;
    expect(budget).toBeDefined();
    // Identity, not equality: a copy would hand every nested loop the whole
    // cap again (invariant I-2).
    expect(run?.subAgent?.budget).toBe(budget);
    expect(run?.context.get(RUN_BUDGET_CONTEXT_KEY)).toBe(budget);
    // And the provider loop reserved against that same object: one turn ran.
    expect((budget as RunBudget).turnCount.current).toBe(1);
  });
});
