/**
 * The run service refuses a graph whose selected providers have no
 * credentials, before the job row exists.
 *
 * This is the end-to-end half of the credential preflight: the unit suite
 * proves `unconfiguredProviderErrors` fires and clears; this one proves
 * `runWorkflow` turns it into a 400 that names the secret and never creates
 * the job — the paid-half-a-graph failure (#3923/#3924/#4263) it front-runs.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import {
  BaseNode,
  NodeRegistry,
  prop,
  type GraphInput
} from "@nodetool-ai/node-sdk";
import {
  getProvider,
  type ProcessingContext
} from "@nodetool-ai/runtime";

interface TestState {
  secrets: Record<string, string>;
}

const state = vi.hoisted<TestState>(() => ({ secrets: {} }));

const graph: GraphInput = {
  nodes: [
    {
      id: "n1",
      type: "test.execution.Echo",
      properties: {
        model: { type: "image_model", provider: "openai", id: "gpt-image-2" }
      }
    }
  ],
  edges: []
};

class FakeJob {
  id = "job-1";
  status = "running";
  error: string | null = null;
  markCompleted(): void {
    this.status = "completed";
  }
  markCancelled(): void {
    this.status = "cancelled";
  }
  markFailed(message: string): void {
    this.status = "failed";
    this.error = message;
  }
  async save(): Promise<void> {}
}

const jobCreate = vi.hoisted(() => vi.fn(async () => new FakeJob()));

vi.mock("@nodetool-ai/models", () => ({
  Workflow: {
    find: vi.fn(async () => ({
      id: "wf-1",
      name: "Echo",
      run_mode: "workflow",
      getGraph: () => graph
    }))
  },
  Workspace: { find: vi.fn(async () => null) },
  Job: { create: jobCreate },
  getSecret: vi.fn(async (key: string) => state.secrets[key] ?? null)
}));

const { runWorkflow } = await import("../src/service/workflow-run.js");

class Echo extends BaseNode {
  static readonly nodeType = "test.execution.Echo";
  static readonly title = "Echo";
  static readonly description = "Returns a constant";

  @prop({ type: "str", default: "" })
  declare prompt: string;

  @prop({ type: "object", default: {} })
  declare model: Record<string, unknown>;

  async process(context: ProcessingContext): Promise<Record<string, unknown>> {
    const providerId = this.model["provider"];
    if (typeof providerId !== "string") {
      throw new Error("model.provider must be a string");
    }
    const provider = await context.getProvider(providerId);
    return { output: provider.constructor.name };
  }
}

function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.register(Echo);
  return registry;
}

async function run(): Promise<
  | { kind: "error"; status: number; detail: string }
  | { kind: "payload"; payload: Record<string, unknown> }
> {
  return runWorkflow({
    workflowId: "wf-1",
    userId: "user-7",
    environment: { registry: makeRegistry() },
    resolveWorkspace: async () => null
  });
}

describe("runWorkflow credential refusal", () => {
  const saved = process.env["OPENAI_API_KEY"];

  afterEach(() => {
    state.secrets = {};
    if (saved === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = saved;
    jobCreate.mockClear();
  });

  it("reproduces the provider construction failure without the key", async () => {
    delete process.env["OPENAI_API_KEY"];
    await expect(getProvider("openai", () => null)).rejects.toThrow(
      "OPENAI_API_KEY is required"
    );
  });

  it("refuses with 400 naming the secret, before any job row exists", async () => {
    delete process.env["OPENAI_API_KEY"];
    const outcome = await run();
    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.status).toBe(400);
    expect(outcome.detail).toContain('"openai"');
    expect(outcome.detail).toContain("OPENAI_API_KEY");
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it("runs once the store resolves the key", async () => {
    delete process.env["OPENAI_API_KEY"];
    state.secrets["OPENAI_API_KEY"] = "sk-test";
    const outcome = await run();
    expect(outcome.kind).toBe("payload");
    expect(jobCreate).toHaveBeenCalledTimes(1);
  });

  it("accepts the env value the provider itself would read", async () => {
    process.env["OPENAI_API_KEY"] = "sk-env";
    const outcome = await run();
    expect(outcome.kind).toBe("payload");
  });
});
