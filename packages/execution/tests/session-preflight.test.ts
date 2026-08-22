/**
 * `ExecutionSession` refuses a graph this runtime cannot honour before it
 * spends anything on it.
 *
 * `runWorkflow` has refused bad models, providers, and credentials since the
 * credential preflight shipped, but `ExecutionSession.create` did not — so
 * every host that goes through the facade instead of the run service (the CLI
 * `workflows run`, `nodetool run`, the debug harness, the websocket runner)
 * still failed at the node that needed the key, after the upstream half of the
 * graph had already run and billed.
 *
 * Both directions are pinned: the refusal fires and names the secret, and it
 * stays silent once the resolver answers. So is the "before" half — the Python
 * bridge is never connected and `persistence.onAccepted` is never called, the
 * two side effects that make a late refusal expensive.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BaseNode, NodeRegistry, prop } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ExecutionSession,
  ExecutionPreflightError,
  isExecutionPreflightError,
  providerConfigurationChecker,
  type RunModelCatalogs
} from "../src/index.js";

/**
 * The store behind the *default* secret resolver — the one the facade builds
 * when a caller brings no context. Mocked at the module boundary because that
 * resolver reads the models database, which a unit test has no business
 * initializing.
 */
const store = vi.hoisted(() => ({ secrets: {} as Record<string, string> }));

vi.mock("@nodetool-ai/models", () => ({
  Workflow: { find: vi.fn(async () => null) },
  Workspace: {
    find: vi.fn(async () => null),
    ensureDefault: vi.fn(async () => ({ isAccessible: () => false }))
  },
  Job: { create: vi.fn() },
  getSecret: vi.fn(async (key: string) => store.secrets[key] ?? null)
}));

/** A node carrying a model selection — the only shape the preflight reads. */
class Generate extends BaseNode {
  static readonly nodeType = "test.execution.Generate";
  static readonly title = "Generate";
  static readonly description = "Selects a model";

  @prop({ type: "object", default: {} })
  declare model: Record<string, unknown>;

  async process(): Promise<Record<string, unknown>> {
    return { output: String(this.model["id"] ?? "") };
  }
}

function registry(): NodeRegistry {
  const reg = new NodeRegistry();
  reg.register(Generate);
  return reg;
}

const graphSelecting = (provider: string, id = "gpt-image-2") => ({
  nodes: [
    {
      id: "n1",
      type: "test.execution.Generate",
      properties: { model: { type: "image_model", provider, id } }
    }
  ],
  edges: []
});

/** A context whose secret store holds exactly `values`. */
function contextWith(values: Record<string, string>): ProcessingContext {
  return new ProcessingContext({
    jobId: "preflight-test",
    workflowId: null,
    userId: "1",
    storage: null,
    workspace: null,
    secretResolver: (key: string) => values[key] ?? null
  });
}

async function refusalOf(
  options: Parameters<typeof ExecutionSession.create>[0]
): Promise<ExecutionPreflightError> {
  try {
    await ExecutionSession.create(options);
  } catch (err) {
    if (isExecutionPreflightError(err)) return err;
    throw err;
  }
  throw new Error("expected ExecutionSession.create to refuse");
}

describe("ExecutionSession preflight", () => {
  const savedKey = process.env["OPENAI_API_KEY"];

  beforeEach(() => {
    delete process.env["OPENAI_API_KEY"];
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = savedKey;
  });

  it("refuses a provider no registry knows", async () => {
    const error = await refusalOf({
      graph: graphSelecting("totally-not-a-provider"),
      registry: registry(),
      bridgeFactory: async () => null,
      context: contextWith({})
    });
    expect(error.issues.map((i) => i.kind)).toEqual(["model"]);
    expect(error.message).toContain('"totally-not-a-provider"');
  });

  it("refuses a model the provider does not offer", async () => {
    const catalogs: RunModelCatalogs = {
      listProviderIds: () => ["openai"],
      listModelIds: () => ["gpt-image-1"]
    };
    const error = await refusalOf({
      graph: graphSelecting("openai", "totally-not-a-real-model-xyz"),
      registry: registry(),
      bridgeFactory: async () => null,
      catalogs,
      context: contextWith({})
    });
    expect(error.issues.map((i) => i.kind)).toEqual(["model"]);
    expect(error.message).toContain("totally-not-a-real-model-xyz");
  });

  it("refuses a registered provider whose credential nothing resolves", async () => {
    const error = await refusalOf({
      graph: graphSelecting("openai"),
      registry: registry(),
      bridgeFactory: async () => null,
      context: contextWith({})
    });
    expect(error.issues.map((i) => i.kind)).toEqual(["credential"]);
    expect(error.message).toContain("OPENAI_API_KEY");
    expect(error.message).toContain("Settings");
  });

  it("resolves the credential through the injected context's store", async () => {
    const session = await ExecutionSession.create({
      graph: graphSelecting("openai"),
      registry: registry(),
      bridgeFactory: async () => null,
      context: contextWith({ OPENAI_API_KEY: "sk-injected" })
    });
    expect((await session.result).status).toBe("completed");
  });

  it("reports model issues alone — an unregistered provider has no credential to check", async () => {
    const error = await refusalOf({
      graph: graphSelecting("totally-not-a-provider"),
      registry: registry(),
      bridgeFactory: async () => null,
      context: contextWith({})
    });
    expect(error.issues.every((i) => i.kind === "model")).toBe(true);
  });

  it("connects no Python bridge and accepts no job when it refuses", async () => {
    const bridgeFactory = vi.fn(async () => null);
    const onAccepted = vi.fn();
    await refusalOf({
      graph: graphSelecting("openai"),
      registry: registry(),
      bridgeFactory,
      persistence: { onAccepted },
      context: contextWith({})
    });
    expect(bridgeFactory).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("leaves a graph with no model selection untouched", async () => {
    const bridgeFactory = vi.fn(async () => null);
    const session = await ExecutionSession.create({
      graph: {
        nodes: [
          {
            id: "n1",
            type: "test.execution.Generate",
            properties: { model: {} }
          }
        ],
        edges: []
      },
      registry: registry(),
      bridgeFactory,
      context: contextWith({})
    });
    expect((await session.result).status).toBe("completed");
    expect(bridgeFactory).toHaveBeenCalledTimes(1);
  });

  it("lets a custom-provider host declare its own registry", async () => {
    const catalogs: RunModelCatalogs = {
      listProviderIds: () => ["cassette"],
      listModelIds: () => ["replay-1"]
    };
    const session = await ExecutionSession.create({
      graph: graphSelecting("cassette", "replay-1"),
      registry: registry(),
      bridgeFactory: async () => null,
      catalogs,
      // The cassette needs no credential; the process-wide registry has never
      // heard of it, so the default checker would say nothing either way.
      providerConfiguration: providerConfigurationChecker([]),
      context: contextWith({})
    });
    expect((await session.result).status).toBe("completed");
  });
});

describe("ExecutionSession preflight — default secret resolver", () => {
  const savedKey = process.env["OPENAI_API_KEY"];

  beforeEach(() => {
    delete process.env["OPENAI_API_KEY"];
    store.secrets = {};
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = savedKey;
    store.secrets = {};
  });

  const options = () => ({
    graph: graphSelecting("openai"),
    registry: registry(),
    bridgeFactory: async () => null
  });

  it("refuses when the store the facade's own context reads holds nothing", async () => {
    const error = await refusalOf(options());
    expect(error.issues.map((i) => i.kind)).toEqual(["credential"]);
    expect(error.message).toContain("OPENAI_API_KEY");
  });

  it("runs once that same store answers", async () => {
    store.secrets["OPENAI_API_KEY"] = "sk-stored";
    const session = await ExecutionSession.create(options());
    expect((await session.result).status).toBe("completed");
  });

  it("accepts the env value the provider itself would read", async () => {
    process.env["OPENAI_API_KEY"] = "sk-env";
    const session = await ExecutionSession.create(options());
    expect((await session.result).status).toBe("completed");
  });
});
