import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import { ACTIVE_MODEL_CONTEXT_KEY } from "@nodetool-ai/runtime";
import { Asset, Job, Workflow, initTestDb } from "@nodetool-ai/models";
import {
  debugSessions,
  InteractiveEscalationHandle
} from "@nodetool-ai/execution/service";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  getAllMcpTools,
  type ExampleWorkflowCatalog
} from "../src/tools/mcp-tools.js";
import { RUNTIME_MODEL_CATALOGS } from "../src/tools/mcp-tool-support.js";
import type { Tool } from "../src/tools/base-tool.js";
import {
  UNGATED,
  createCapabilityRun,
  toolForCapabilityName,
  type CreateCapabilityRunOptions
} from "../src/capabilities/index.js";

/**
 * One capability as a `Tool`, over a run carrying what a host injects. What
 * used to be a constructor argument on a tool class is a field on the run,
 * read at call time.
 */
type CapabilityDeps = Omit<CreateCapabilityRunOptions, "context" | "gate">;

function capTool(name: string, deps: CapabilityDeps = {}): Tool {
  return toolForCapabilityName(name, (context) =>
    createCapabilityRun({ context, gate: UNGATED, ...deps })
  );
}

const USER = "user-1";

function makeMockContext(): ProcessingContext {
  const variables: Record<string, unknown> = {};
  return {
    userId: USER,
    authToken: "access-token",
    environment: {},
    get: (key: string) => variables[key],
    set: (key: string, value: unknown) => {
      variables[key] = value;
    }
  } as unknown as ProcessingContext;
}

let ctx: ProcessingContext;

/**
 * The tools run in-process against the real models layer, so every test gets a
 * fresh in-memory database rather than a stubbed `fetch`. A tool result and the
 * REST response are the same function's answer now; asserting on request URLs
 * would test nothing that exists.
 */
beforeEach(() => {
  initTestDb();
  ctx = makeMockContext();
});

/** A registry that resolves nothing — enough to get past the "no registry" gate. */
const stubRegistry = {
  has: () => false,
  getMetadata: () => undefined,
  resolve: () => {
    throw new Error("stub registry resolves nothing");
  },
  resolveMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

/** Poll the job row until it reaches `status`, so a detached run can be read. */
async function waitForJobStatus(
  jobId: string,
  status: string,
  timeoutMs = 5000
): Promise<Job> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = (await Job.find(USER, jobId)) as Job | null;
    if (job && job.status === status) return job;
    if (Date.now() >= deadline) {
      throw new Error(
        `job ${jobId} was "${job?.status ?? "missing"}", not "${status}"`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function saveWorkflow(
  fields: Partial<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    graph: unknown;
    run_mode: string;
  }> = {}
): Promise<Workflow> {
  return (await Workflow.create({
    user_id: USER,
    name: fields.name ?? "A workflow",
    description: fields.description ?? "",
    tags: fields.tags ?? [],
    access: "private",
    run_mode: fields.run_mode ?? "workflow",
    graph: (fields.graph ?? { nodes: [], edges: [] }) as never,
    ...(fields.id ? { id: fields.id } : {})
  })) as Workflow;
}

// ---------------------------------------------------------------------------
// Workflow Tools
// ---------------------------------------------------------------------------

describe("list_workflows", () => {
  const tool = capTool("list_workflows");

  it("has correct name and schema", () => {
    expect(tool.name).toBe("list_workflows");
    expect(tool.toProviderTool().inputSchema).toBeDefined();
  });

  it("lists the user's workflows without their graphs", async () => {
    await saveWorkflow({ name: "Mine", description: "d", tags: ["t"] });
    const result = (await tool.process(ctx, { workflow_type: "user" })) as {
      workflows: Array<Record<string, unknown>>;
    };
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0]).toEqual({
      id: expect.any(String),
      name: "Mine",
      description: "d",
      tags: ["t"]
    });
  });

  it("says so when no example catalog was injected", async () => {
    const result = (await tool.process(ctx, {
      workflow_type: "example"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("not available in this process");
  });

  it("reads examples from the injected catalog", async () => {
    const examples: ExampleWorkflowCatalog = {
      list: async ({ query }) =>
        query === "news"
          ? [{ id: "ex-1", name: "News", description: "", tags: [] }]
          : [],
      get: async () => null
    };
    const withCatalog = capTool("list_workflows", { examples });
    const result = (await withCatalog.process(ctx, {
      workflow_type: "example",
      query: "news"
    })) as { workflows: Array<Record<string, unknown>> };
    expect(result.workflows[0]?.name).toBe("News");
  });

  it("userMessage reflects query", () => {
    expect(tool.userMessage({ query: "test" })).toContain("test");
    expect(tool.userMessage({})).toContain("user");
  });
});

describe("get_workflow", () => {
  const tool = capTool("get_workflow");

  it("returns the stored workflow, graph included", async () => {
    const saved = await saveWorkflow({
      name: "WF",
      graph: { nodes: [{ id: "n1", type: "ns.A" }], edges: [] }
    });
    const result = (await tool.process(ctx, {
      workflow_id: saved.id
    })) as Record<string, unknown>;
    expect(result.id).toBe(saved.id);
    expect(result.name).toBe("WF");
    expect(result.graph).toBeDefined();
  });

  it("reports a workflow that does not exist", async () => {
    const result = (await tool.process(ctx, {
      workflow_id: "nope"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("nope");
  });

  it("userMessage includes workflow_id", () => {
    expect(tool.userMessage({ workflow_id: "wf-1" })).toContain("wf-1");
  });
});

describe("create_workflow", () => {
  const tool = capTool("create_workflow", {
    modelCatalogs: RUNTIME_MODEL_CATALOGS
  });

  /** The graph as it was actually persisted. */
  async function createdGraph(
    result: unknown
  ): Promise<Record<string, unknown>> {
    const id = String((result as Record<string, unknown>)["id"]);
    const stored = await Workflow.find(USER, id);
    return stored!.graph as unknown as Record<string, unknown>;
  }

  // A workflow saved with a provider nothing can construct is a run that
  // fails after the upstream nodes have already executed. The ids are in the
  // graph the agent just wrote, so the mistake is cheap to catch here.
  describe("model selection preflight", () => {
    const catalogs = {
      listProviderIds: () => ["kie"],
      listModelIds: (provider: string, modelType: string) =>
        provider === "kie" && modelType === "video_model"
          ? ["wan/2-7-image-to-video"]
          : undefined
    };
    const checked = capTool("create_workflow", { modelCatalogs: catalogs });
    const graphWith = (model: Record<string, unknown>) => ({
      nodes: [
        { id: "n1", type: "nodetool.video.ImageToVideo", properties: { model } }
      ],
      edges: []
    });

    it("refuses to create a workflow naming an unregistered provider", async () => {
      const result = (await checked.process(ctx, {
        name: "WF",
        graph: graphWith({ type: "video_model", provider: "nope", id: "x" })
      })) as { error: string; issues: Array<{ code: string }> };

      expect(result.error).toContain("providers or models");
      expect(result.issues[0]?.code).toBe("unknown_provider");
      const [saved] = await Workflow.paginate(USER, {});
      expect(saved).toHaveLength(0);
    });

    it("refuses a model id the provider does not offer", async () => {
      const result = (await checked.process(ctx, {
        name: "WF",
        graph: graphWith({ type: "video_model", provider: "kie", id: "wan/2" })
      })) as { issues: Array<{ code: string; node_id: string }> };

      expect(result.issues[0]?.code).toBe("unknown_model");
      expect(result.issues[0]?.node_id).toBe("n1");
      const [saved] = await Workflow.paginate(USER, {});
      expect(saved).toHaveLength(0);
    });

    it("creates the workflow when every selection resolves", async () => {
      const result = (await checked.process(ctx, {
        name: "WF",
        graph: graphWith({
          type: "video_model",
          provider: "kie",
          id: "wan/2-7-image-to-video"
        })
      })) as Record<string, unknown>;
      expect(result.id).toEqual(expect.any(String));
      expect(await Workflow.find(USER, String(result.id))).not.toBeNull();
    });
  });

  // A graph whose model properties are left at the default saves fine and
  // then every Agent node dies on "Select a model" at run time — after the
  // upstream half of the graph executed. Nothing stamps models in later.
  describe("unset model preflight", () => {
    const modelRegistry = {
      has: (type: string) => type === "nodetool.agents.Agent",
      getMetadata: () => undefined,
      resolveMetadata: () => undefined,
      validateNode: (
        _descriptor: unknown,
        connectedHandles: ReadonlySet<string>
      ) =>
        connectedHandles.has("model")
          ? []
          : [
              {
                code: "unset_model",
                property: "model",
                message:
                  'Property "model" requires a language_model to be selected'
              }
            ]
    } as unknown as NodeRegistry;
    const checked = capTool("create_workflow", { nodeRegistry: modelRegistry });
    const graphWithAgent = (edges: unknown[] = []) => ({
      nodes: [
        { id: "a1", type: "nodetool.agents.Agent", properties: {} },
        { id: "src", type: "nodetool.input.StringInput", properties: {} }
      ],
      edges
    });

    it("refuses a workflow whose agent node has no model selected", async () => {
      const result = (await checked.process(ctx, {
        name: "WF",
        graph: graphWithAgent()
      })) as { error: string; issues: Array<{ code: string; node_id: string }> };

      expect(result.error).toContain("unselected");
      expect(result.issues[0]?.code).toBe("unset_model");
      expect(result.issues[0]?.node_id).toBe("a1");
      const [saved] = await Workflow.paginate(USER, {});
      expect(saved).toHaveLength(0);
    });

    it("allows a model property fed by an edge", async () => {
      const result = (await checked.process(ctx, {
        name: "WF",
        graph: graphWithAgent([
          {
            id: "e1",
            source: "src",
            sourceHandle: "output",
            target: "a1",
            targetHandle: "model"
          }
        ])
      })) as Record<string, unknown>;
      expect(result.id).toEqual(expect.any(String));
      expect(await Workflow.find(USER, String(result.id))).not.toBeNull();
    });

    /**
     * A registry that validates the bag it is handed, the way the real one
     * does. create_workflow normalizes a kernel-shape graph into the editor
     * shape (bag under `data`) before checking, and the check used to read
     * only `properties` — so every graph with a selected model was refused
     * as unselected.
     */
    const bagRegistry = {
      has: (type: string) => type === "nodetool.agents.Agent",
      getMetadata: () => undefined,
      resolveMetadata: () => undefined,
      validateNode: (
        descriptor: { properties: Record<string, unknown> },
        connectedHandles: ReadonlySet<string>
      ) =>
        connectedHandles.has("model") ||
        (descriptor.properties["model"] &&
          typeof descriptor.properties["model"] === "object")
          ? []
          : [
              {
                code: "unset_model",
                property: "model",
                message:
                  'Property "model" requires a language_model to be selected'
              }
            ]
    } as unknown as NodeRegistry;
    const bagChecked = capTool("create_workflow", {
      nodeRegistry: bagRegistry,
      // Silent catalogs: this test is about the unselected-model gate, not
      // the provider/model id walk.
      modelCatalogs: {
        listProviderIds: () => [],
        listModelIds: () => undefined
      }
    });
    const agentGraphWithModel = (model: Record<string, unknown>) => ({
      nodes: [
        { id: "a1", type: "nodetool.agents.Agent", properties: { model } }
      ],
      edges: []
    });

    it("reads a selected model from the normalized (editor-shape) graph", async () => {
      const result = (await bagChecked.process(ctx, {
        name: "WF",
        graph: agentGraphWithModel({
          type: "language_model",
          provider: "kie",
          id: "m1"
        })
      })) as { id?: string; error?: string };

      expect(result.error).toBeUndefined();
      expect(result.id).toEqual(expect.any(String));
      expect(await Workflow.find(USER, String(result.id))).not.toBeNull();
    });

    it("still flags a genuinely empty model on that shape", async () => {
      const result = (await bagChecked.process(ctx, {
        name: "WF",
        graph: graphWithAgent()
      })) as { error: string; issues: Array<{ code: string }> };

      expect(result.error).toContain("unselected");
      expect(result.issues[0]?.code).toBe("unset_model");
      const [saved] = await Workflow.paginate(USER, {});
      expect(saved).toHaveLength(0);
    });
  });

  // A DSL wiring handle stored as a property value means the edge was never
  // created — the input is unconnected and the node producing the value may
  // be missing from the graph. Saving such a graph used to succeed silently
  // and fail on the first run.
  describe("leftover wiring handle preflight", () => {
    const handleGraph = () => ({
      nodes: [
        {
          id: "grid",
          type: "lib.grid.CombineImageGrid",
          properties: {
            tiles: [
              { __handle: true, source: "img", sourceHandle: "output" }
            ],
            columns: 3
          }
        },
        { id: "out", type: "nodetool.output.Output", properties: {} }
      ],
      edges: []
    });
    const checked = capTool("create_workflow", {});

    it("refuses to save a graph whose property holds a wiring handle", async () => {
      const result = (await checked.process(ctx, {
        name: "WF",
        graph: handleGraph()
      })) as { error: string; issues: Array<{ code: string; message: string }> };

      expect(result.error).toContain("wiring handles");
      expect(result.issues[0]?.code).toBe("leftover_wiring_handle");
      expect(result.issues[0]?.message).toContain("tiles[0]");
      const [saved] = await Workflow.paginate(USER, {});
      expect(saved).toHaveLength(0);
    });

    it("saves a clean graph unchanged", async () => {
      const result = (await checked.process(ctx, {
        name: "WF",
        graph: {
          nodes: [{ id: "out", type: "x.Y", properties: { tiles: ["a"] } }],
          edges: []
        }
      })) as Record<string, unknown>;
      expect(result.id).toEqual(expect.any(String));
    });
  });

  it("persists the workflow under the calling user", async () => {
    const result = (await tool.process(ctx, {
      name: "Test WF",
      graph: { nodes: [], edges: [] }
    })) as Record<string, unknown>;
    expect(result.name).toBe("Test WF");
    const stored = await Workflow.find(USER, String(result.id));
    expect(stored?.user_id).toBe(USER);
    expect(stored?.access).toBe("private");
  });

  it("normalizes an agent-friendly keyed graph", async () => {
    const result = await tool.process(ctx, {
      name: "Daily News",
      graph: {
        nodes: {
          search: {
            node_type: "openai.text.WebSearch",
            parameters: { query: "current technology news" }
          },
          summarize: {
            node_type: "mistral.text.ChatComplete",
            parameters: { model: "mistral-large-latest" }
          }
        },
        edges: [
          { source: "search", target: "summarize", target_input: "prompt" }
        ]
      }
    });

    // Stored shape: the property bag lives flat under `data`, not
    // `properties` — the editor reads `node.data`.
    expect(await createdGraph(result)).toEqual({
      nodes: [
        {
          id: "search",
          type: "openai.text.WebSearch",
          data: { query: "current technology news" },
          ui_properties: {
            position: { x: 0, y: 0 },
            zIndex: 0,
            width: 280,
            selectable: true
          }
        },
        {
          id: "summarize",
          type: "mistral.text.ChatComplete",
          data: { model: "mistral-large-latest" },
          // Downstream of `search`, so column 1 of the dataflow layout.
          ui_properties: {
            position: { x: 320, y: 0 },
            zIndex: 0,
            width: 280,
            selectable: true
          }
        }
      ],
      edges: [
        {
          id: "edge-0",
          source: "search",
          sourceHandle: "output",
          target: "summarize",
          targetHandle: "prompt"
        }
      ]
    });
  });

  it("normalizes node_type in an array graph", async () => {
    const result = await tool.process(ctx, {
      name: "News Summarizer",
      graph: {
        nodes: [
          {
            id: "search_node",
            node_type: "xai.text.WebSearch",
            properties: { query: "latest news", search_mode: "on" }
          },
          {
            id: "summarizer_node",
            node_type: "nodetool.agents.Agent",
            properties: { instructions: "Summarize the news" }
          }
        ],
        edges: [
          {
            source: "search_node",
            sourceHandle: "output",
            target: "summarizer_node",
            targetHandle: "input"
          }
        ]
      }
    });

    expect((await createdGraph(result))["nodes"]).toEqual([
      {
        id: "search_node",
        type: "xai.text.WebSearch",
        data: { query: "latest news", search_mode: "on" },
        ui_properties: {
          position: { x: 0, y: 0 },
          zIndex: 0,
          width: 280,
          selectable: true
        }
      },
      {
        id: "summarizer_node",
        type: "nodetool.agents.Agent",
        data: { instructions: "Summarize the news" },
        ui_properties: {
          position: { x: 320, y: 0 },
          zIndex: 0,
          width: 280,
          selectable: true
        }
      }
    ]);
  });

  it("always auto-lays-out, overriding caller positions but keeping other ui_properties", async () => {
    const result = await tool.process(ctx, {
      name: "Already stored shape",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.input.StringInput",
            data: { name: "prompt" },
            ui_properties: {
              position: { x: 42, y: 99 },
              zIndex: 0,
              title: "Prompt"
            }
          }
        ],
        edges: []
      }
    });

    expect((await createdGraph(result))["nodes"]).toEqual([
      {
        id: "n1",
        type: "nodetool.input.StringInput",
        data: { name: "prompt" },
        ui_properties: {
          // Caller's position is discarded; other fields (title) survive.
          position: { x: 0, y: 0 },
          zIndex: 0,
          width: 280,
          selectable: true,
          title: "Prompt"
        }
      }
    ]);
  });

  it("lays out a chain left-to-right and stacks parallel roots", async () => {
    const result = await tool.process(ctx, {
      name: "Diamond",
      graph: {
        nodes: [
          { id: "a", type: "t", properties: {} },
          { id: "b", type: "t", properties: {} },
          { id: "c", type: "t", properties: {} }
        ],
        // a -> c and b -> c: a,b are roots (column 0), c is column 1.
        edges: [
          { source: "a", target: "c", targetHandle: "x" },
          { source: "b", target: "c", targetHandle: "y" }
        ]
      }
    });

    const nodes = (await createdGraph(result))["nodes"] as Array<{
      id: string;
      ui_properties: { position: unknown };
    }>;
    expect(
      Object.fromEntries(nodes.map((n) => [n.id, n.ui_properties.position]))
    ).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 220 },
      c: { x: 320, y: 0 }
    });
  });

  it("never stores a node carrying both `properties` and `data`", async () => {
    const result = await tool.process(ctx, {
      name: "Planner output",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.input.StringInput",
            properties: { name: "prompt" }
          }
        ],
        edges: []
      }
    });

    const node = (
      (await createdGraph(result))["nodes"] as Array<Record<string, unknown>>
    )[0];
    expect(node["properties"]).toBeUndefined();
    expect(node["data"]).toEqual({ name: "prompt" });
  });

  it("userMessage includes name", () => {
    expect(tool.userMessage({ name: "My WF" })).toContain("My WF");
  });
});

describe("run_workflow", () => {
  it("refuses without a node registry instead of reaching for a server", async () => {
    const result = (await capTool("run_workflow").process(ctx, {
      workflow_id: "wf-456"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("no node registry");
    expect(result.ran).toBe(false);
  });

  it("reports the service's refusal for a workflow that is not there", async () => {
    const tool = capTool("run_workflow", { nodeRegistry: stubRegistry });
    const result = (await tool.process(ctx, {
      workflow_id: "missing"
    })) as Record<string, unknown>;
    expect(result.status).toBe(404);
    expect(String(result.error)).toContain("not found");
  });

  it("prefers the injected workflow environment over the bare registry", async () => {
    // The server injects its Python-aware runtime lazily; the tool must
    // resolve it per call so an agent-run workflow executes exactly like an
    // HTTP-run one.
    const saved = await saveWorkflow({ graph: { nodes: [], edges: [] } });
    let resolved = 0;
    const tool = capTool("run_workflow", {
      workflowEnvironment: async () => {
        resolved += 1;
        return { registry: stubRegistry };
      }
    });
    const result = (await tool.process(ctx, {
      workflow_id: saved.id
    })) as Record<string, unknown>;
    expect(resolved).toBe(1);
    expect(result.error ?? null).toBeNull();
  });

  it("refuses a workflow whose run mode the backend does not run", async () => {
    const saved = await saveWorkflow({ run_mode: "app" });
    const tool = capTool("run_workflow", { nodeRegistry: stubRegistry });
    const result = (await tool.process(ctx, {
      workflow_id: saved.id
    })) as Record<string, unknown>;
    expect(result.status).toBe(400);
    expect(String(result.error)).toContain("run mode");
  });

  it("runs the workflow and reports the job", async () => {
    const saved = await saveWorkflow({ graph: { nodes: [], edges: [] } });
    const tool = capTool("run_workflow", { nodeRegistry: stubRegistry });
    const result = (await tool.process(ctx, {
      workflow_id: saved.id
    })) as Record<string, unknown>;
    expect(result.workflow_id).toBe(saved.id);
    expect(result.job_id).toEqual(expect.any(String));
    expect(await Job.find(USER, String(result.job_id))).not.toBeNull();
  });
});

describe("debug_workflow", () => {
  it("refuses without a node registry", async () => {
    const result = (await capTool("debug_workflow").process(ctx, {
      workflow_id: "wf-1"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("no node registry");
  });

  it("returns the verdict, the job row, and the graph overview", async () => {
    const saved = await saveWorkflow({
      name: "Debuggable",
      graph: { nodes: [], edges: [] }
    });
    const tool = capTool("debug_workflow", { nodeRegistry: stubRegistry });
    const report = (await tool.process(ctx, {
      workflow_id: saved.id
    })) as Record<string, unknown>;

    const run = report.run as Record<string, unknown>;
    expect(run.verdict).toBeDefined();
    expect(run.summary).toBeDefined();
    expect((report.job as Record<string, unknown>)?.["id"]).toBe(run.job_id);
    expect((report.workflow as Record<string, unknown>)?.["name"]).toBe(
      "Debuggable"
    );
  });

  it("omits the graph overview when the caller says so", async () => {
    const saved = await saveWorkflow();
    const tool = capTool("debug_workflow", { nodeRegistry: stubRegistry });
    const report = (await tool.process(ctx, {
      workflow_id: saved.id,
      include_graph: false
    })) as Record<string, unknown>;
    expect(report.workflow).toBeUndefined();
  });

  /**
   * A refused run never started, so there is no report to nest it in. Nested
   * under `run`, the failure was invisible to the sandbox dispatcher — which
   * throws on a top-level `{error}` precisely so a guest cannot compute with
   * one — and a 404 came back as a value an agent logged as `Status: 404` and
   * carried on from. `run_workflow` has always answered at the top level.
   */
  it("reports a workflow it cannot find as an error, not as a report", async () => {
    const tool = capTool("debug_workflow", { nodeRegistry: stubRegistry });
    const result = (await tool.process(ctx, {
      workflow_id: "wf-does-not-exist"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("not found");
    expect(result.status).toBe(404);
    expect(result.run).toBeUndefined();
  });
});

describe("resolve_workflow_escalation", () => {
  const tool = capTool("resolve_workflow_escalation");

  it("reports a session that is not the caller's", async () => {
    const result = (await tool.process(ctx, {
      session_id: "sess-9",
      escalation_id: "esc-1",
      action: "skip"
    })) as Record<string, unknown>;
    expect(result.status).toBe(404);
    expect(String(result.error)).toContain("not found");
  });

  /** A live session parked on one escalation, as an interactive run leaves it. */
  async function parkedSession(allowedActions: string[]) {
    const handle = new InteractiveEscalationHandle();
    let settle: (report: Record<string, unknown>) => void = () => {};
    const done = new Promise<Record<string, unknown>>((resolve) => {
      settle = resolve;
    });
    const session = debugSessions.create({
      userId: USER,
      workflowId: "wf-1",
      jobId: "job-1",
      handle,
      done,
      cancel: () => settle({ status: "cancelled" })
    });
    const decided = handle.decide(
      {
        nodeId: "n1",
        allowedActions,
        declaredOutputs: { value: "str" }
      } as never,
      new AbortController().signal
    );
    const event = await session.waitForEvent();
    if (event.kind !== "escalated") throw new Error("expected an escalation");
    return { session, escalationId: event.escalationId, decided, settle };
  }

  it("carries the applyTo scope on a skip", async () => {
    const parked = await parkedSession(["skip", "fail"]);
    const result = tool.process(ctx, {
      session_id: parked.session.id,
      escalation_id: parked.escalationId,
      action: "skip",
      apply_to: "signature"
    });
    const outcome = await parked.decided;
    expect(outcome.verdict).toEqual({ action: "skip", applyTo: "signature" });
    parked.settle({ status: "completed" });
    await result;
  });

  it("carries substitute outputs, and a fail reason, and nothing else", async () => {
    const substitute = await parkedSession(["substitute"]);
    const pending = tool.process(ctx, {
      session_id: substitute.session.id,
      escalation_id: substitute.escalationId,
      action: "substitute",
      outputs: { value: "repaired" },
      reason: "ignored for substitute"
    });
    expect((await substitute.decided).verdict).toEqual({
      action: "substitute",
      outputs: { value: "repaired" }
    });
    substitute.settle({ status: "completed" });
    await pending;

    const failing = await parkedSession(["fail"]);
    const failPending = tool.process(ctx, {
      session_id: failing.session.id,
      escalation_id: failing.escalationId,
      action: "fail",
      reason: "upstream data is unusable"
    });
    expect((await failing.decided).verdict).toEqual({
      action: "fail",
      reason: "upstream data is unusable"
    });
    failing.settle({ status: "failed" });
    await failPending;
  });

  it("rejects a verdict the escalation does not allow", async () => {
    const parked = await parkedSession(["fail"]);
    const result = (await tool.process(ctx, {
      session_id: parked.session.id,
      escalation_id: parked.escalationId,
      action: "skip"
    })) as Record<string, unknown>;
    expect(result.status).toBe(400);
    expect(String(result.error)).toContain("not allowed");
    parked.session.forceSettle("test over");
    await parked.decided;
  });
});

describe("debug_app", () => {
  it("refuses without a node registry", async () => {
    const result = (await capTool("debug_app").process(ctx, {
      application_id: "app-1"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("no node registry");
  });

  it("insists on exactly one target", async () => {
    const tool = capTool("debug_app", { nodeRegistry: stubRegistry });
    expect(
      String(((await tool.process(ctx, {})) as Record<string, unknown>).error)
    ).toContain("either an application_id or a document");
    expect(
      String(
        (
          (await tool.process(ctx, {
            application_id: "app-1",
            document: { root: {} }
          })) as Record<string, unknown>
        ).error
      )
    ).toContain("not both");
  });

  it("reports an application the user does not own", async () => {
    const tool = capTool("debug_app", { nodeRegistry: stubRegistry });
    const result = (await tool.process(ctx, {
      application_id: "app-1"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("No application found");
  });

  it("requires neither target in the schema — the service enforces exactly one", () => {
    const tool = capTool("debug_app");
    expect(tool.inputSchema.required).toEqual([]);
    expect(Object.keys(tool.inputSchema.properties ?? {})).toContain(
      "application_id"
    );
    expect(Object.keys(tool.inputSchema.properties ?? {})).toContain(
      "document"
    );
  });

  it("userMessage distinguishes the free wiring check from a run", () => {
    const tool = capTool("debug_app");
    expect(tool.userMessage({ application_id: "app-1", run: false })).toContain(
      "Checking"
    );
    expect(tool.userMessage({ document: {} })).toContain("draft");
  });
});

describe("validate_workflow", () => {
  const tool = capTool("validate_workflow", {
    modelCatalogs: RUNTIME_MODEL_CATALOGS
  });

  it("reports a saved workflow it cannot find", async () => {
    const result = (await tool.process(ctx, {
      workflow_id: "wf-789"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("wf-789");
  });

  it("reports an error, not the graph, when it has no registry", async () => {
    // Returning the graph with a note read as a pass to any caller checking
    // for issues rather than reading prose.
    const result = (await tool.process(ctx, {
      graph: { nodes: [{ id: "n1", type: "ns.A" }], edges: [] }
    })) as Record<string, unknown>;

    expect(result.error).toContain("no node registry");
    expect(result.validated).toBe(false);
    expect(result.graph).toBeUndefined();
  });

  it("validates the graph of a saved workflow", async () => {
    const saved = await saveWorkflow({
      graph: { nodes: [{ id: "n1", type: "ns.A", data: {} }], edges: [] }
    });
    const registry = {
      has: () => true,
      getMetadata: () => ({ properties: [], outputs: [] }),
      validateNode: () => []
    };
    const withRegistry = capTool("validate_workflow", {
      nodeRegistry: registry as never,
      modelCatalogs: RUNTIME_MODEL_CATALOGS
    });
    const result = (await withRegistry.process(ctx, {
      workflow_id: saved.id
    })) as { ok: boolean };
    expect(result.ok).toBe(true);
  });

  // The model catalog is the half that was never wired: a graph naming a real
  // provider and a model id it does not offer validated clean on this surface,
  // which is exactly where hallucinated ids come from.
  it("flags a model id the provider does not offer", async () => {
    const registry = {
      has: () => true,
      getMetadata: () => ({ properties: [], outputs: [] }),
      validateNode: () => []
    };
    const withCatalogs = capTool("validate_workflow", {
      nodeRegistry: registry as never,
      modelCatalogs: {
        listProviderIds: () => ["kie"],
        listModelIds: (provider, modelType) =>
          provider === "kie" && modelType === "video_model"
            ? ["wan/2-7-image-to-video"]
            : undefined
      }
    });

    const result = (await withCatalogs.process(ctx, {
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.video.ImageToVideo",
            properties: {
              model: { type: "video_model", provider: "kie", id: "wan/2-7" }
            }
          }
        ],
        edges: []
      }
    })) as { ok: boolean; issues: Array<{ code: string; message: string }> };

    expect(result.ok).toBe(false);
    const issue = result.issues.find((i) => i.code === "unknown_model");
    expect(issue?.message).toContain("wan/2-7-image-to-video");
  });
});

// The credential half. `validate_workflow` reported a graph as clean when the
// node it names needs a key nobody has set — the same graph `nodetool validate`
// warns about on a DB target — because nothing on this surface ever asked the
// store.
describe("validate_workflow missing credentials", () => {
  const KEYED = "ns.NeedsKey";
  const keyedRegistry = {
    has: (type: string) => type === KEYED,
    getMetadata: () => ({
      properties: [],
      outputs: [],
      required_settings: ["FAL_API_KEY"]
    }),
    validateNode: () => []
  } as unknown as NodeRegistry;

  const graph = {
    nodes: [{ id: "n1", type: KEYED, properties: {} }],
    edges: []
  };

  /** What the host answers for the keys the graph declares. */
  function validatorWith(
    available: string[] | null,
    extra: CapabilityDeps = {}
  ): Tool {
    const deps: CapabilityDeps = {
      nodeRegistry: keyedRegistry,
      modelCatalogs: RUNTIME_MODEL_CATALOGS,
      ...extra
    };
    if (available !== null) {
      deps.availableSecrets = (keys) =>
        new Set(keys.filter((key) => available.includes(key)));
    }
    return capTool("validate_workflow", deps);
  }

  type Report = {
    ok: boolean;
    issues: Array<{ code: string; message: string; nodeId?: string }>;
  };

  it("warns, naming the key and where to set it", async () => {
    const result = (await validatorWith([]).process(ctx, { graph })) as Report;
    const issue = result.issues.find((i) => i.code === "missing_secret");
    expect(issue?.nodeId).toBe("n1");
    expect(issue?.message).toContain("FAL_API_KEY");
    expect(issue?.message).toContain("Settings → Credentials");
    // A warning informs; it does not refuse the graph.
    expect(result.ok).toBe(true);
  });

  it("stays silent once the host resolves the key", async () => {
    const result = (await validatorWith(["FAL_API_KEY"]).process(ctx, {
      graph
    })) as Report;
    expect(result.issues.some((i) => i.code === "missing_secret")).toBe(false);
  });

  it("reports nothing when the run carries no resolver", async () => {
    const result = (await validatorWith(null).process(ctx, {
      graph
    })) as Report;
    expect(result.issues.some((i) => i.code === "missing_secret")).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("asks only for the names the graph declares", async () => {
    const asked: string[][] = [];
    const tool = capTool("validate_workflow", {
      nodeRegistry: keyedRegistry,
      modelCatalogs: RUNTIME_MODEL_CATALOGS,
      availableSecrets: (keys) => {
        asked.push([...keys]);
        return new Set<string>();
      }
    });
    await tool.process(ctx, { graph });
    expect(asked).toEqual([["FAL_API_KEY"]]);
  });

  it("does not ask at all when the graph declares nothing", async () => {
    const asked: string[][] = [];
    const bareRegistry = {
      has: () => true,
      getMetadata: () => ({ properties: [], outputs: [] }),
      validateNode: () => []
    } as unknown as NodeRegistry;
    const tool = capTool("validate_workflow", {
      nodeRegistry: bareRegistry,
      modelCatalogs: RUNTIME_MODEL_CATALOGS,
      availableSecrets: (keys) => {
        asked.push([...keys]);
        return new Set<string>();
      }
    });
    await tool.process(ctx, {
      graph: { nodes: [{ id: "n1", type: "ns.A" }], edges: [] }
    });
    expect(asked).toEqual([]);
  });

  // Pointing a headless agent at `request_secret` sends it at a call that
  // fails closed, so the mention is gated on the run being able to serve it.
  it("names request_secret only when the run can raise the dialog", async () => {
    const withDialog = (await validatorWith([], {
      secretPrompt: async () => "saved"
    }).process(ctx, { graph })) as Report;
    expect(
      withDialog.issues.find((i) => i.code === "missing_secret")?.message
    ).toContain("request_secret");

    const headless = (await validatorWith([]).process(ctx, {
      graph
    })) as Report;
    expect(
      headless.issues.find((i) => i.code === "missing_secret")?.message
    ).not.toContain("request_secret");
  });
});

// ---------------------------------------------------------------------------
// Timeline / Sketch validation
// ---------------------------------------------------------------------------

describe("validate_timeline", () => {
  const track = {
    id: "t1",
    name: "Video",
    type: "video" as const,
    index: 0,
    visible: true,
    locked: false
  };
  const clip = (trackId: string) => ({
    id: "c1",
    trackId,
    name: "Shot",
    startMs: 0,
    durationMs: 2000,
    mediaType: "video" as const,
    sourceType: "imported" as const,
    status: "generated" as const,
    locked: false,
    versions: []
  });
  const doc = (trackId: string) => ({
    tracks: [track],
    clips: [clip(trackId)],
    markers: []
  });

  it("validates an inline document and summarizes a clean result", async () => {
    const tool = capTool("validate_timeline");
    const result = (await tool.process(ctx, { document: doc("t1") })) as {
      ok: boolean;
      errors: unknown[];
      summary: string;
    };

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary).toBe("No issues found.");
  });

  it("reports a clip on a track the document lacks", async () => {
    const tool = capTool("validate_timeline");
    const result = (await tool.process(ctx, { document: doc("missing") })) as {
      ok: boolean;
      errors: Array<{ code: string }>;
      summary: string;
    };

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("clip_track_missing");
    expect(result.summary).toContain("1 error");
  });

  it("loads a saved timeline through the injected loader", async () => {
    const loader = vi.fn().mockResolvedValue({
      // Stored documents are JSON text; the tool parses them.
      document: JSON.stringify(doc("missing")),
      fps: 24,
      width: 1920,
      height: 1080,
      name: "My sequence"
    });
    const tool = capTool("validate_timeline", {
      loaders: { timeline: loader }
    });
    const result = (await tool.process(ctx, { timeline_id: "seq-1" })) as {
      ok: boolean;
      timeline_id: string;
      name: string;
    };

    expect(loader).toHaveBeenCalledWith(ctx, "seq-1");
    expect(result.ok).toBe(false);
    expect(result.timeline_id).toBe("seq-1");
    expect(result.name).toBe("My sequence");
  });

  it("reports an error when given an id but wired with no loader", async () => {
    const tool = capTool("validate_timeline");
    const result = (await tool.process(ctx, { timeline_id: "seq-1" })) as {
      error: string;
      validated: boolean;
    };

    expect(result.error).toContain("no timeline loader");
    expect(result.validated).toBe(false);
  });
});

describe("validate_sketch", () => {
  const layer = (overrides: Record<string, unknown> = {}) => ({
    id: "layer-1",
    name: "Background",
    type: "raster",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    data: null,
    ...overrides
  });
  const doc = (activeLayerId = "layer-1") => ({
    sketch: {
      version: 3,
      canvas: { width: 1024, height: 768, backgroundColor: "#ffffff" },
      layers: [layer()],
      activeLayerId,
      maskLayerId: null
    },
    layerBindings: []
  });

  it("validates an inline document and summarizes a clean result", async () => {
    const tool = capTool("validate_sketch");
    const result = (await tool.process(ctx, { document: doc() })) as {
      ok: boolean;
      errors: unknown[];
      summary: string;
    };

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary).toBe("No issues found.");
  });

  it("reports an active layer the stack lacks", async () => {
    const tool = capTool("validate_sketch");
    const result = (await tool.process(ctx, { document: doc("gone") })) as {
      ok: boolean;
      errors: Array<{ code: string }>;
      summary: string;
    };

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("active_layer_missing");
    expect(result.summary).toContain("1 error");
  });

  it("checks the inline document against the canvas meta it is given", async () => {
    const tool = capTool("validate_sketch");
    const result = (await tool.process(ctx, {
      document: doc(),
      width: 512,
      height: 768,
      background_color: "#ffffff"
    })) as { ok: boolean; warnings: Array<{ code: string }> };

    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain(
      "canvas_size_mismatch"
    );
  });

  it("loads a saved sketch through the injected loader", async () => {
    const loader = vi.fn().mockResolvedValue({
      // Stored documents are JSON text; the tool parses them.
      document: JSON.stringify(doc("gone")),
      width: 1024,
      height: 768,
      backgroundColor: "#ffffff",
      name: "My sketch"
    });
    const tool = capTool("validate_sketch", { loaders: { sketch: loader } });
    const result = (await tool.process(ctx, {
      image_document_id: "img-1"
    })) as {
      ok: boolean;
      image_document_id: string;
      name: string;
    };

    expect(loader).toHaveBeenCalledWith(ctx, "img-1");
    expect(result.ok).toBe(false);
    expect(result.image_document_id).toBe("img-1");
    expect(result.name).toBe("My sketch");
  });

  it("reports a sketch the loader cannot find", async () => {
    const tool = capTool("validate_sketch", {
      loaders: { sketch: vi.fn().mockResolvedValue(null) }
    });
    const result = (await tool.process(ctx, {
      image_document_id: "img-1"
    })) as {
      error: string;
      validated: boolean;
    };

    expect(result.error).toContain("was not found");
    expect(result.validated).toBe(false);
  });

  it("reports an error when given an id but wired with no loader", async () => {
    const tool = capTool("validate_sketch");
    const result = (await tool.process(ctx, {
      image_document_id: "img-1"
    })) as {
      error: string;
      validated: boolean;
    };

    expect(result.error).toContain("no sketch loader");
    expect(result.validated).toBe(false);
  });

  it("reports having nothing to validate", async () => {
    const tool = capTool("validate_sketch");
    const result = (await tool.process(ctx, {})) as { error: string };
    expect(result.error).toContain("No sketch to validate");
  });
});

describe("get_example_workflow", () => {
  it("says so when no example catalog was injected", async () => {
    const result = (await capTool("get_example_workflow").process(ctx, {
      package_name: "nodetool-base",
      example_name: "Hello"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("not available in this process");
  });

  it("loads the example from the injected catalog", async () => {
    const examples: ExampleWorkflowCatalog = {
      list: async () => [],
      get: async (pkg, name) =>
        pkg === "nodetool-base" && name === "Hello"
          ? { name: "Hello", graph: { nodes: [], edges: [] } }
          : null
    };
    const tool = capTool("get_example_workflow", { examples });
    expect(
      await tool.process(ctx, {
        package_name: "nodetool-base",
        example_name: "Hello"
      })
    ).toMatchObject({ name: "Hello" });
  });

  it("reports an example the catalog does not have", async () => {
    const tool = capTool("get_example_workflow", {
      examples: { list: async () => [], get: async () => null }
    });
    const result = (await tool.process(ctx, {
      package_name: "nodetool-base",
      example_name: "Nope"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("Nope");
  });
});

describe("export_workflow_digraph", () => {
  it("says so when no DSL exporter was injected", async () => {
    const result = (await capTool("export_workflow_digraph").process(ctx, {
      workflow_id: "wf-1"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("no DSL exporter");
  });

  it("renders the stored graph through the injected exporter", async () => {
    const saved = await saveWorkflow({
      name: "Exportable",
      graph: { nodes: [], edges: [] }
    });
    const exportDsl = vi.fn(() => "const g = graph();");
    const tool = capTool("export_workflow_digraph", { exportDsl });
    const result = (await tool.process(ctx, {
      workflow_id: saved.id
    })) as Record<string, unknown>;
    expect(result.source).toBe("const g = graph();");
    expect(exportDsl).toHaveBeenCalledWith(expect.anything(), {
      workflowName: "Exportable"
    });
  });

  it("reports a workflow it cannot find", async () => {
    const tool = capTool("export_workflow_digraph", { exportDsl: () => "" });
    const result = (await tool.process(ctx, {
      workflow_id: "gone"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("gone");
  });
});

// ---------------------------------------------------------------------------
// Job Tools
// ---------------------------------------------------------------------------

async function saveJob(fields: { workflowId?: string } = {}): Promise<Job> {
  return (await Job.create({
    workflow_id: fields.workflowId ?? "wf-1",
    user_id: USER,
    status: "completed",
    params: {},
    graph: { nodes: [], edges: [] }
  })) as Job;
}

describe("list_jobs", () => {
  const tool = capTool("list_jobs");

  it("lists the user's jobs", async () => {
    await saveJob();
    const result = (await tool.process(ctx, {})) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.["job_type"]).toBe("workflow");
  });

  it("filters by workflow", async () => {
    await saveJob({ workflowId: "wf-abc" });
    await saveJob({ workflowId: "wf-other" });
    const result = (await tool.process(ctx, { workflow_id: "wf-abc" })) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(result.jobs.map((j) => j["workflow_id"])).toEqual(["wf-abc"]);
  });
});

describe("get_job", () => {
  const tool = capTool("get_job");

  it("returns the job row", async () => {
    const job = await saveJob();
    const result = (await tool.process(ctx, { job_id: job.id })) as Record<
      string,
      unknown
    >;
    expect(result.id).toBe(job.id);
    expect(result.status).toBe("completed");
  });

  // A failed job's own failure message is payload, not a tool failure: a bare
  // `error` string at the root made the CodeAct bridge throw and discard the
  // rest of the record.
  it("carries a failed job's message under job_error, not error", async () => {
    const job = (await Job.create({
      workflow_id: "wf-1",
      user_id: USER,
      status: "failed",
      error: "Node \"x\" failed: boom"
    })) as Job;
    const result = (await tool.process(ctx, { job_id: job.id })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("failed");
    expect(result["job_error"]).toBe('Node "x" failed: boom');
    expect(Object.prototype.hasOwnProperty.call(result, "error")).toBe(false);
  });

  it("reports a job that is not the caller's", async () => {
    const result = (await tool.process(ctx, {
      job_id: "job-123"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("job-123");
  });

  it("userMessage includes job_id", () => {
    expect(tool.userMessage({ job_id: "job-xyz" })).toContain("job-xyz");
  });
});

describe("get_job_logs", () => {
  const tool = capTool("get_job_logs");

  it("returns the most recent log entries up to the limit", async () => {
    const job = (await Job.create({
      workflow_id: "wf-1",
      user_id: USER,
      status: "failed",
      logs: [{ message: "one" }, { message: "two" }, { message: "three" }]
    })) as Job;

    expect(await tool.process(ctx, { job_id: job.id, limit: 2 })).toMatchObject(
      {
        job_id: job.id,
        total_logs: 3,
        logs: [{ message: "two" }, { message: "three" }]
      }
    );
  });

  // The call succeeded even though the job did not — a root-level `error`
  // string made every failed job's logs unreadable through the sandbox bridge.
  it("answers a failed job's logs with the failure under job_error", async () => {
    const job = (await Job.create({
      workflow_id: "wf-1",
      user_id: USER,
      status: "failed",
      error: "AtlasCloud job failed: request body field <image> is required",
      logs: [{ message: "submitting" }]
    })) as Job;
    const result = (await tool.process(ctx, { job_id: job.id })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("failed");
    expect(result["job_error"]).toContain("AtlasCloud");
    expect(result["logs"]).toEqual([{ message: "submitting" }]);
    expect(Object.prototype.hasOwnProperty.call(result, "error")).toBe(false);
  });

  it("userMessage includes job_id", () => {
    expect(tool.userMessage({ job_id: "job-789" })).toContain("job-789");
  });
});

describe("start_background_job", () => {
  it("refuses without a node registry", async () => {
    const result = (await capTool("start_background_job").process(ctx, {
      workflow_id: "wf-bg"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("no node registry");
  });

  it("marks the run as backgrounded", async () => {
    const saved = await saveWorkflow();
    const tool = capTool("start_background_job", {
      nodeRegistry: stubRegistry
    });
    const result = (await tool.process(ctx, {
      workflow_id: saved.id
    })) as Record<string, unknown>;
    expect(result.background).toBe(true);
    expect(result.job_id).toEqual(expect.any(String));
  });

  // `background: true` used to be a label on a blocking call: the tool awaited
  // the whole run. A live session started a two-minute render this way and its
  // turn was cancelled before the call returned. With the node parked, this
  // test hangs forever if the call ever waits again.
  it("returns while the run is still going, and settles the job with outputs", async () => {
    const saved = await saveWorkflow({
      graph: { nodes: [{ id: "slow", type: "test.Slow", data: {} }], edges: [] }
    });
    let release!: () => void;
    const parked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tool = capTool("start_background_job", {
      workflowEnvironment: async () => ({
        registry: {
          ...stubRegistry,
          getClass: () => undefined
        } as unknown as NodeRegistry,
        resolveExecutor: () => ({
          process: async () => {
            await parked;
            return { output: "done" };
          }
        })
      })
    });

    const receipt = (await tool.process(ctx, {
      workflow_id: saved.id
    })) as Record<string, unknown>;
    expect(receipt.status).toBe("running");
    expect(receipt.background).toBe(true);
    // The jobs API keys everything else on `id`; a receipt that spelled it
    // only `job_id` sent a live session to get_job(undefined).
    expect(receipt.id).toBe(receipt.job_id);
    const jobId = String(receipt.job_id);
    expect((await Job.find(USER, jobId))?.status).toBe("running");

    release();
    const settled = await waitForJobStatus(jobId, "completed");
    expect(settled.runOutputs()).toEqual({ slow: ["done"] });

    const record = (await capTool("get_job").process(ctx, {
      job_id: jobId
    })) as Record<string, unknown>;
    expect(record.outputs).toEqual({ slow: ["done"] });
  });

  it("userMessage includes workflow_id", () => {
    expect(
      capTool("start_background_job").userMessage({ workflow_id: "wf-123" })
    ).toContain("wf-123");
  });
});

// ---------------------------------------------------------------------------
// Asset Tools
// ---------------------------------------------------------------------------

async function saveAsset(name: string, contentType = "image/png") {
  return Asset.create({
    user_id: USER,
    name,
    content_type: contentType,
    parent_id: null
  });
}

describe("list_assets", () => {
  const tool = capTool("list_assets");

  it("lists the user's assets", async () => {
    await saveAsset("logo.png");
    const result = (await tool.process(ctx, {})) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(result.assets.map((a) => a["name"])).toContain("logo.png");
  });

  it("searches by name", async () => {
    await saveAsset("logo.png");
    await saveAsset("photo.png");
    const result = (await tool.process(ctx, { query: "logo" })) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(result.assets.map((a) => a["name"])).toEqual(["logo.png"]);
  });

  it("says so when no package-asset lister was injected", async () => {
    const result = (await tool.process(ctx, {
      source: "package"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("not available in this process");
  });

  it("reads package assets from the injected lister", async () => {
    const withLister = capTool("list_assets", {
      listPackageAssets: async () => [{ name: "bundled.png" }]
    });
    const result = (await withLister.process(ctx, { source: "package" })) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(result.assets[0]?.["name"]).toBe("bundled.png");
  });

  it("userMessage includes query when given", () => {
    expect(tool.userMessage({ query: "my logo" })).toContain("my logo");
  });

  it("userMessage says listing when no query", () => {
    expect(tool.userMessage({})).toContain("Listing");
  });
});

describe("get_asset", () => {
  const tool = capTool("get_asset");

  it("returns the asset row", async () => {
    const asset = await saveAsset("one.png");
    const result = (await tool.process(ctx, {
      asset_id: asset.id
    })) as Record<string, unknown>;
    expect(result.name).toBe("one.png");
  });

  it("reports an asset that is not the caller's", async () => {
    const result = (await tool.process(ctx, {
      asset_id: "asset-789"
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("asset-789");
  });

  it("userMessage includes asset id", () => {
    expect(tool.userMessage({ asset_id: "abc-123" })).toContain("abc-123");
  });
});

// ---------------------------------------------------------------------------
// getAllMcpTools
// ---------------------------------------------------------------------------

describe("getAllMcpTools", () => {
  it("returns the default tool set", () => {
    const names = getAllMcpTools().map((t) => t.name);
    expect(names).toContain("list_workflows");
    expect(names).toContain("get_workflow");
    expect(names).toContain("create_workflow");
    expect(names).toContain("run_workflow");
    expect(names).toContain("validate_workflow");
    // Apps must be authorable from headless chat as well as debuggable in an
    // open App Builder document. This catches a belt omission where
    // `nodetool.apps.create()` existed in the prelude but its backing tool did
    // not, so the action failed with "not in this toolbelt".
    expect(names).toContain("list_apps");
    expect(names).toContain("get_app");
    expect(names).toContain("create_app");
    expect(names).toContain("edit_app");
    expect(names).toContain("debug_app");
    expect(names).toContain("delete_app");
    expect(names).toContain("get_example_workflow");
    expect(names).toContain("export_workflow_digraph");
    expect(names).toContain("list_jobs");
    expect(names).toContain("get_job");
    expect(names).toContain("get_job_logs");
    expect(names).toContain("start_background_job");
    expect(names).toContain("list_assets");
    expect(names).toContain("get_asset");
    // Asset persistence tools — always available so the agent can surface
    // text/binary artifacts into the chat asset browser.
    expect(names).toContain("save_asset");
    expect(names).toContain("read_asset");
  });

  // Node discovery reads the registry directly. There is no registry-free
  // variant any more: the only other way to answer was an HTTP call to a
  // server that may not be running.
  it("offers node discovery only with a registry", () => {
    const names = getAllMcpTools().map((t) => t.name);
    expect(names).not.toContain("list_nodes");
    expect(names).not.toContain("search_nodes");
    expect(names).not.toContain("get_node_info");
  });

  it("adds the local node tools when a registry is provided", () => {
    const registry = {
      listMetadata: () => [],
      getMetadata: () => undefined
    } as unknown as Parameters<typeof getAllMcpTools>[0]["registry"];
    const names = getAllMcpTools({ registry }).map((t) => t.name);
    expect(names.filter((n) => n === "list_nodes").length).toBe(1);
    expect(names.filter((n) => n === "search_nodes").length).toBe(1);
    expect(names.filter((n) => n === "get_node_info").length).toBe(1);
    // No find_model unless providers are also passed.
    expect(names).not.toContain("find_model");
  });

  it("adds the model catalog tools when providers are supplied (with registry)", () => {
    const registry = {
      listMetadata: () => [],
      getMetadata: () => undefined
    } as unknown as Parameters<typeof getAllMcpTools>[0]["registry"];
    const names = getAllMcpTools({
      registry,
      providers: { fake: {} as unknown as BaseProvider }
    }).map((t) => t.name);
    expect(names).toContain("find_model");
    expect(names).toContain("list_models");
  });

  it("adds them without a registry too (multi-task path)", () => {
    const names = getAllMcpTools({
      providers: { fake: {} as unknown as BaseProvider }
    }).map((t) => t.name);
    expect(names).toContain("find_model");
    expect(names).toContain("list_models");
  });

  it("omits the model catalog tools when no providers are supplied", () => {
    const names = getAllMcpTools().map((t) => t.name);
    expect(names).not.toContain("find_model");
    expect(names).not.toContain("list_models");
  });

  // The media tools read nothing off the run — `runProviderPrediction` is on
  // the context — so the provider map is not their dependency and never was.
  // Adding them here meant a host that injected none (a Code node, a JS
  // script) had no way to generate anything, while `critique_image` on the
  // same belt could judge an image it could not make.
  it("leaves the media tools to the built-in belt", () => {
    const names = getAllMcpTools({
      providers: { fake: {} as unknown as BaseProvider }
    }).map((t) => t.name);
    expect(names).not.toContain("generate_image");
    expect(names).not.toContain("generate_speech");
  });

  it("all tools have valid toProviderTool()", () => {
    const tools = getAllMcpTools();
    // An empty belt would satisfy every assertion below by matching nothing.
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      const pt = tool.toProviderTool();
      expect(pt.name).toBeTruthy();
      expect(pt.description).toBeTruthy();
      expect(pt.inputSchema).toBeDefined();
    }
  });
});
