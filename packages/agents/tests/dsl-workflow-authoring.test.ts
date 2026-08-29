/**
 * Authoring a workflow with the real DSL, from inside the sandbox.
 *
 * The path under test is the one an agent takes after the cutover: guest code
 * imports `@nodetool-ai/sandbox-dsl`, builds a graph from typed node wrappers,
 * and hands it to `@nodetool-ai/sandbox-nodetool/workflows` to validate, save,
 * run and debug. Every layer below the action is real — the QuickJS guest, the
 * pack loader over the shipped pack directory, the capability dispatcher, the
 * permission gate, the models table, and the kernel. No model provider is
 * involved and nothing reaches the network.
 *
 * One substitution: the node *implementations* are declared here rather than
 * imported from `@nodetool-ai/base-nodes`, which depends on this package
 * through `code-nodes` and cannot be imported back. They are registered under
 * the node types the DSL emits, so the graph the guest authors is the graph the
 * registry validates and the kernel runs. `nodetool.code.Code` runs its body
 * through this package's own sandbox with the node-sdk body-shaping helpers the
 * real node uses, so the Code case is not a mock of code execution.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { initTestDb, Workflow } from "@nodetool-ai/models";
import {
  BaseNode,
  CODE_INPUTS_GLOBAL,
  NodeRegistry,
  createSandboxModuleCatalog,
  discoverSandboxPack,
  hasReturnStatement,
  normalizeCodeOutput,
  prop,
  wrapImplicitReturn
} from "@nodetool-ai/node-sdk";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";
import { ProcessingContext } from "@nodetool-ai/runtime";

import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { runInSandbox } from "../src/js-sandbox.js";
import type {
  ApprovalRequest,
  PermissionMode
} from "../src/tools/tool-permissions.js";

const DSL = "@nodetool-ai/sandbox-dsl";
const WORKFLOWS = "@nodetool-ai/sandbox-nodetool/workflows";
const USER = "user-dsl-authoring";

// ---------------------------------------------------------------------------
// The node types the authored graphs use
// ---------------------------------------------------------------------------

class StringConstant extends BaseNode {
  static readonly nodeType = "nodetool.constant.String";
  static readonly title = "String";
  static readonly description = "A constant string.";
  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "" })
  declare value: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: String(this.value ?? "") };
  }
}

/**
 * The workflow sink. `name` is declared required here so one authored graph can
 * exercise the validator's missing-property path against a real registry rule
 * rather than a hand-written issue list.
 */
class OutputNode extends BaseNode {
  static readonly nodeType = "nodetool.output.Output";
  static readonly title = "Output";
  static readonly description = "Workflow output.";
  static readonly metadataOutputTypes = { output: "any" };

  @prop({ type: "str", default: "", required: true })
  declare name: string;

  @prop({ type: "any", default: null })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? null };
  }
}

/**
 * `nodetool.code.Code`, reduced to what a headless deterministic run needs:
 * dynamic inputs arrive on `inputs`, the returned object's keys are the output
 * handles, and the body runs in the same QuickJS guest the shipped node uses.
 */
class CodeNode extends BaseNode {
  static readonly nodeType = "nodetool.code.Code";
  static readonly title = "Code";
  static readonly description = "Execute JavaScript in a sandbox.";
  static readonly metadataOutputTypes = { output: "any" };
  static readonly inlineFields = ["code"];
  static readonly inputFields = [];
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;

  @prop({ type: "str", default: "return {};" })
  declare code: string;

  @prop({ type: "list[dict]", default: [] })
  declare packages: unknown[];

  async process(): Promise<Record<string, unknown>> {
    const inputs = Object.fromEntries(this.dynamicProps);
    const body = String(this.code ?? "");
    const outcome = await runInSandbox({
      code: hasReturnStatement(body) ? body : wrapImplicitReturn(body),
      globals: { [CODE_INPUTS_GLOBAL]: inputs }
    });
    if (!outcome.success) {
      throw new Error(outcome.error ?? "Code node failed");
    }
    return normalizeCodeOutput(outcome.result) as Record<string, unknown>;
  }
}

/**
 * Stand-in for `lib.svg.Document` so an authored program can exercise list
 * fan-in against a real registry and kernel run without importing base-nodes.
 * Its `process()` joins the elements, so the accumulated list is observable in
 * the workflow output.
 */
class FakeSvgDocument extends BaseNode {
  static readonly nodeType = "lib.svg.Document";
  static readonly title = "SVG Document";
  static readonly description = "Combine SVG elements into one document.";
  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "list[str]", default: [] })
  declare elements: unknown[];

  @prop({ type: "int", default: 0 })
  declare width: number;

  async process(): Promise<Record<string, unknown>> {
    const elements = Array.isArray(this.elements) ? this.elements : [];
    return { output: elements.map((e) => String(e)).join("|") };
  }
}

function buildRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.register(StringConstant);
  registry.register(OutputNode);
  registry.register(CodeNode);
  registry.register(FakeSvgDocument);
  return registry;
}

// ---------------------------------------------------------------------------
// The session an action runs in
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const DSL_PACK_DIR = join(here, "..", "..", "sandbox-packs", "sandbox-dsl");

let catalog: SandboxModuleCatalog | undefined;

/** The shipped DSL pack, read from its own directory the way an install is. */
function dslCatalog(): SandboxModuleCatalog {
  if (catalog) return catalog;
  const discovery = discoverSandboxPack(DSL_PACK_DIR);
  if (discovery === undefined) {
    throw new Error(`${DSL_PACK_DIR} is not a sandbox pack`);
  }
  catalog = createSandboxModuleCatalog([discovery]);
  return catalog;
}

function context(): ProcessingContext {
  return new ProcessingContext({
    jobId: `job_${Math.random().toString(36).slice(2)}`,
    workflowId: null,
    userId: USER
  });
}

/** Catalogs that name no provider, so no model check reaches the network. */
const NO_MODELS = {
  listProviderIds: () => [] as string[],
  listModelIds: () => [] as string[]
};

function ungatedRun(registry = buildRegistry()): CapabilityRun {
  return createCapabilityRun({
    context: context(),
    gate: UNGATED,
    nodeRegistry: registry,
    modelCatalogs: NO_MODELS
  });
}

/** A run whose approval prompts are scripted and recorded. */
function gatedRun(
  mode: PermissionMode,
  answer: "allow" | "deny",
  prompts: ApprovalRequest[]
): CapabilityRun {
  return createCapabilityRun({
    context: context(),
    gate: {
      mode,
      sessionAllow: new Set<string>(),
      requestApproval: async (request) => {
        prompts.push(request);
        return answer;
      }
    },
    nodeRegistry: buildRegistry(),
    modelCatalogs: NO_MODELS
  });
}

interface Observation {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Run one code action. The DSL pack is a third-party pack and needs consent;
 * the capability modules are host-mounted and need a run.
 */
async function action(
  code: string,
  options: { run?: CapabilityRun; packages?: readonly string[] } = {}
): Promise<Observation> {
  const session = createChatCodeActSession({
    tools: [],
    executeTool: async (call) =>
      options.run
        ? options.run.invoke(call.name, call.args)
        : { error: `no run for ${call.name}` },
    sandboxPackages: options.packages ?? [DSL],
    sandboxModuleCatalog: dslCatalog(),
    ...(options.run ? { capabilityRun: options.run } : {})
  });
  return JSON.parse(await session.executeAction({ code })) as Observation;
}

// ---------------------------------------------------------------------------
// Authored programs
// ---------------------------------------------------------------------------

const CODE_BODY =
  "const text = String(inputs.text ?? '');\n" +
  "return { loud: text.toUpperCase() + '!' };";

/** String → Code → Output: deterministic, and the graph most cases author. */
const SHOUT_PROGRAM = `
  import { workflow } from "${DSL}";
  import { string } from "${DSL}/nodetool.constant";
  import { code } from "${DSL}/nodetool.code";
  import { output } from "${DSL}/nodetool.output";

  const greeting = string({ value: "hello" });
  const shout = code({ code: ${JSON.stringify(CODE_BODY)}, text: greeting.output() });
  const out = output({ name: "loud", value: shout.output("loud") });
  return workflow(out);
`;

const SHOUT_PACKAGES = [DSL, `${DSL}/nodetool.constant`, `${DSL}/nodetool.code`];

interface GraphShape {
  nodes: { id: string; type: string; properties: Record<string, unknown> }[];
  edges: {
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  }[];
}

interface ValidationReport {
  ok: boolean;
  issues: { severity: string; code: string; message: string }[];
}

beforeEach(() => {
  initTestDb();
});

// ---------------------------------------------------------------------------
// 1. The allowlist, both directions
// ---------------------------------------------------------------------------

describe("reaching the DSL pack from an action", () => {
  it("imports it when the session allows it", async () => {
    const outcome = await action(
      `import { string } from "${DSL}/nodetool.constant";\n` +
        `import { workflow } from "${DSL}";\n` +
        `return workflow(string({ value: "hi" }));`
    );
    expect(outcome.error).toBeUndefined();
    const graph = outcome.result as GraphShape;
    expect(graph.nodes).toEqual([
      { id: "string", type: "nodetool.constant.String", properties: { value: "hi" } }
    ]);
  });

  it("refuses it by name when the session does not, before the guest starts", async () => {
    const outcome = await action(
      `import { workflow } from "${DSL}";\nreturn workflow();`,
      { packages: [] }
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain(`"${DSL}"`);
    expect(outcome.error).toContain("allowlist");
    expect(outcome.error).toContain(
      "No sandbox package is available in this session"
    );
  });

  it("names the pack when another one is allowed instead", async () => {
    const outcome = await action(
      `import { workflow } from "${DSL}";\nreturn workflow();`,
      { packages: ["@nodetool-ai/sandbox-csv"] }
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain(`"${DSL}"`);
    expect(outcome.error).toContain('Only "@nodetool-ai/sandbox-csv"');
  });

  it("refuses the workflows module when the session has no capability run", async () => {
    const outcome = await action(
      `import { validate_workflow } from "${WORKFLOWS}";\nreturn 1;`
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain(WORKFLOWS);
  });

  it("serves both packs to one action", async () => {
    const outcome = await action(
      `import { workflow } from "${DSL}";\n` +
        `import { string } from "${DSL}/nodetool.constant";\n` +
        `import { validate_workflow } from "${WORKFLOWS}";\n` +
        `const graph = workflow(string({ value: "hi" }));\n` +
        `const report = await validate_workflow({ graph });\n` +
        `return { nodes: graph.nodes.length, ok: report.ok };`,
      { run: ungatedRun() }
    );
    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({ nodes: 1, ok: true });
  });
});

// ---------------------------------------------------------------------------
// 2. Author → validate
// ---------------------------------------------------------------------------

describe("validating an authored graph", () => {
  it("reports no error for the authored String → Code → Output graph", async () => {
    const outcome = await action(
      `import { validate_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       return await validate_workflow({ graph });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    const report = outcome.result as ValidationReport;
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  /**
   * The wired Code handle is declared from the edge that reads it, the way
   * `GraphBuilder` declares it. The DSL pack builds its graph
   * in the guest, which has no registry and so cannot know the node supports
   * dynamic outputs; `validate_workflow` declares it host-side instead.
   */
  it("does not warn that a wired Code handle is undeclared", async () => {
    const outcome = await action(
      `import { validate_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       return await validate_workflow({ graph });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    const report = outcome.result as ValidationReport;
    expect(
      report.issues.filter((i) => i.code === "code_undeclared_output")
    ).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("rejects an edge whose source node was dropped, naming the edge", async () => {
    const outcome = await action(
      `import { validate_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       graph.nodes = graph.nodes.filter((n) => n.type !== "nodetool.constant.String");
       return await validate_workflow({ graph });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    const report = outcome.result as ValidationReport;
    expect(report.ok).toBe(false);
    const dangling = report.issues.filter((i) => i.code === "dangling_edge");
    expect(dangling).toHaveLength(1);
    expect(dangling[0].severity).toBe("error");
    expect(dangling[0].message).toContain("string");
  });

  it("rejects a missing required property, naming the property", async () => {
    const outcome = await action(
      `import { validate_workflow } from "${WORKFLOWS}";
       import { workflow } from "${DSL}";
       import { string } from "${DSL}/nodetool.constant";
       import { output } from "${DSL}/nodetool.output";
       const greeting = string({ value: "hello" });
       const out = output({ value: greeting.output() });
       return await validate_workflow({ graph: workflow(out) });`,
      { run: ungatedRun(), packages: [DSL, `${DSL}/nodetool.constant`] }
    );
    expect(outcome.error).toBeUndefined();
    const report = outcome.result as ValidationReport;
    expect(report.ok).toBe(false);
    const property = report.issues.filter((i) => i.code === "property");
    expect(property).toHaveLength(1);
    expect(property[0].message).toContain("name");
  });

  it("reports a Code body that leaves the wired output unset", async () => {
    const broken = "const text = String(inputs.text ?? '');\nreturn { quiet: text };";
    const outcome = await action(
      `import { validate_workflow } from "${WORKFLOWS}";
       import { workflow } from "${DSL}";
       import { string } from "${DSL}/nodetool.constant";
       import { code } from "${DSL}/nodetool.code";
       import { output } from "${DSL}/nodetool.output";
       const greeting = string({ value: "hello" });
       const shout = code({ code: ${JSON.stringify(broken)}, text: greeting.output() });
       const out = output({ name: "loud", value: shout.output("loud") });
       return await validate_workflow({ graph: workflow(out) });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    const report = outcome.result as ValidationReport;
    const missing = report.issues.filter(
      (i) => i.code === "code_missing_output"
    );
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe("warning");
    expect(missing[0].message).toContain('"loud"');
  });
});

// ---------------------------------------------------------------------------
// 3. Author → run
// ---------------------------------------------------------------------------

describe("running an authored graph on the kernel", () => {
  it("produces the exact output the program computes", async () => {
    const outcome = await action(
      `import { validate_workflow, create_workflow, run_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       const report = await validate_workflow({ graph });
       if (!report.ok) return { issues: report.issues };
       const saved = await create_workflow({ name: "Shout", graph });
       return await run_workflow({ workflow_id: saved.id });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    const run = outcome.result as {
      status: string;
      outputs: Record<string, unknown>;
      error: string | null;
    };
    expect(run.error).toBeNull();
    expect(run.status).toBe("completed");
    expect(Object.values(run.outputs)).toEqual([["HELLO!"]]);
  }, 60_000);

  /**
   * The kernel keys a workflow output by the output node's descriptor `name`
   * (`node.name ?? node.id`), which shipped example graphs carry beside
   * `type`. The DSL pack's `workflow()` emits `name` only inside
   * `properties`, so the runner promotes the property for `nodetool.output.*`
   * sinks and an authored graph's outputs come back under the declared name.
   */
  it("returns the output under the declared name, not the node id", async () => {
    const outcome = await action(
      `import { create_workflow, run_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       const saved = await create_workflow({ name: "Shout", graph });
       return await run_workflow({ workflow_id: saved.id });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    expect((outcome.result as { outputs: unknown }).outputs).toEqual({
      loud: ["HELLO!"]
    });
  }, 60_000);

  it("saves the Code node's wired handle as a declared dynamic output", async () => {
    const outcome = await action(
      `import { create_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       return await create_workflow({ name: "Shout", graph });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    const saved = outcome.result as { id: string };
    const row = await Workflow.find(USER, saved.id);
    const graph = row!.getGraph() as unknown as {
      nodes: { id: string; dynamic_outputs?: Record<string, unknown> }[];
    };
    const code = graph.nodes.find((n) => n.id === "code");
    expect(code?.dynamic_outputs).toEqual({ loud: { type: "any" } });
  }, 60_000);

  it("saves the nodes and edges the DSL authored, unchanged", async () => {
    const outcome = await action(
      `import { create_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       return await create_workflow({ name: "Shout", graph });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    const saved = outcome.result as { id: string };
    const row = await Workflow.find(USER, saved.id);
    expect(row).not.toBeNull();
    const graph = row!.getGraph() as unknown as GraphShape;
    expect(graph.nodes.map((n) => n.type).sort()).toEqual([
      "nodetool.code.Code",
      "nodetool.constant.String",
      "nodetool.output.Output"
    ]);
    expect(graph.edges).toEqual([
      {
        id: "e1_code_output",
        source: "code",
        sourceHandle: "loud",
        target: "output",
        targetHandle: "value"
      },
      {
        id: "e2_string_code",
        source: "string",
        sourceHandle: "output",
        target: "code",
        targetHandle: "text"
      }
    ]);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 4. Author → debug
// ---------------------------------------------------------------------------

interface DebugReport {
  workflow_id: string;
  run: {
    status: string;
    error: string | null;
    outputs: Record<string, unknown>;
    summary: {
      nodes: {
        nodeId: string;
        nodeType: string | null;
        status: string;
        error: string | null;
      }[];
    };
    verdict: { ok: boolean; headline: string };
  };
}

describe("debugging an authored graph", () => {
  it("reports every node of a clean run", async () => {
    const outcome = await action(
      `import { create_workflow, debug_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       const saved = await create_workflow({ name: "Shout", graph });
       return await debug_workflow({ workflow_id: saved.id });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    const report = outcome.result as DebugReport;
    expect(report.run.status).toBe("completed");
    expect(report.run.verdict.ok).toBe(true);
    expect(report.run.summary.nodes.map((n) => n.nodeType).sort()).toEqual([
      "nodetool.code.Code",
      "nodetool.constant.String",
      "nodetool.output.Output"
    ]);
    expect(report.run.summary.nodes.every((n) => n.status === "completed")).toBe(
      true
    );
  }, 60_000);

  it("names the node that threw", async () => {
    const throwing = "throw new Error('the code node exploded');";
    const outcome = await action(
      `import { create_workflow, debug_workflow } from "${WORKFLOWS}";
       import { workflow } from "${DSL}";
       import { string } from "${DSL}/nodetool.constant";
       import { code } from "${DSL}/nodetool.code";
       import { output } from "${DSL}/nodetool.output";
       const greeting = string({ value: "hello" });
       const boom = code({ code: ${JSON.stringify(throwing)}, text: greeting.output() });
       const out = output({ name: "loud", value: boom.output("loud") });
       const saved = await create_workflow({ name: "Boom", graph: workflow(out) });
       return await debug_workflow({ workflow_id: saved.id });`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    const report = outcome.result as DebugReport;
    expect(report.run.status).toBe("failed");
    expect(report.run.verdict.ok).toBe(false);
    const failed = report.run.summary.nodes.filter(
      (n) => n.status === "failed" || (n.error ?? null) !== null
    );
    expect(failed.map((n) => n.nodeType)).toContain("nodetool.code.Code");
    expect(JSON.stringify(failed)).toContain("exploded");
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 5. A Code node wired by a named output handle
// ---------------------------------------------------------------------------

describe("a Code node's dynamic output handle", () => {
  it("is what the DSL emits for output(<slot>)", async () => {
    const outcome = await action(
      `${SHOUT_PROGRAM}`,
      { packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    const graph = outcome.result as GraphShape;
    const edge = graph.edges.find((e) => e.source === "code");
    expect(edge?.sourceHandle).toBe("loud");
  });

  it("validates without an error and carries its value through the run", async () => {
    const outcome = await action(
      `import { validate_workflow, create_workflow, run_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       const report = await validate_workflow({ graph });
       const saved = await create_workflow({ name: "Shout", graph });
       const run = await run_workflow({ workflow_id: saved.id });
       return {
         errors: report.issues.filter((i) => i.severity === "error"),
         values: Object.values(run.outputs)
       };`,
      { run: ungatedRun(), packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({ errors: [], values: [["HELLO!"]] });
  }, 60_000);

  it("has no default, so a bare output() is refused before the graph exists", async () => {
    const bare = await action(
      `import { workflow } from "${DSL}";
       import { code } from "${DSL}/nodetool.code";
       const shout = code({ code: "return { loud: 1 };" });
       return shout.output();`,
      { packages: SHOUT_PACKAGES }
    );
    expect(bare.ok).toBe(false);
    expect(bare.error).toContain("nodetool.code.Code");
    expect(bare.error).toContain("name one");
  });
});

// ---------------------------------------------------------------------------
// 5.5 A list input wired from several sources
// ---------------------------------------------------------------------------

const GRID_PACKAGES = [
  DSL,
  `${DSL}/nodetool.constant`,
  `${DSL}/lib.svg`,
  `${DSL}/nodetool.output`
];

const GRID_PROGRAM = `
  import { workflow } from "${DSL}";
  import { string } from "${DSL}/nodetool.constant";
  import { document } from "${DSL}/lib.svg";
  import { output } from "${DSL}/nodetool.output";

  const a = string({ value: "hello" });
  const b = string({ value: "world" });
  const grid = document({ elements: [a.output(), b.output()], width: 2 });
  return workflow(output({ name: "strip", value: grid.output() }));
`;

describe("a list input wired from an array of handles", () => {
  /**
   * Regression: the collector only followed handles assigned directly to an
   * input, so `tiles: [a.output(), b.output()]` stored the handle markers as
   * literal property values, created no edges, and dropped every upstream
   * node from the graph. The saved two-node workflow validated clean and then
   * failed on its first run with "Image input is required."
   */
  it("wires one edge per element and ships every upstream node", async () => {
    const outcome = await action(GRID_PROGRAM, { packages: GRID_PACKAGES });
    expect(outcome.error).toBeUndefined();
    const graph = outcome.result as GraphShape;
    expect(graph.nodes.map((n) => n.type).sort()).toEqual([
      "lib.svg.Document",
      "nodetool.constant.String",
      "nodetool.constant.String",
      "nodetool.output.Output"
    ]);
    const grid = graph.nodes.find((n) => n.type === "lib.svg.Document");
    expect(grid?.properties).toEqual({ width: 2 });
    const fanIn = graph.edges.filter(
      (e) => e.target === "document" && e.targetHandle === "elements"
    );
    expect(fanIn.map((e) => e.source).sort()).toEqual(["string", "string_2"]);
    expect(fanIn.every((e) => e.sourceHandle === "output")).toBe(true);
  });

  it("validates, saves and runs the fan-in end to end", async () => {
    const outcome = await action(
      `import { validate_workflow, create_workflow, run_workflow } from "${WORKFLOWS}";
       ${GRID_PROGRAM.replace(
         "return workflow(",
         "const graph = workflow("
       )}
       const report = await validate_workflow({ graph });
       if (!report.ok) return { issues: report.issues };
       const saved = await create_workflow({ name: "Strip", graph });
       return await run_workflow({ workflow_id: saved.id });`,
      { run: ungatedRun(), packages: [...GRID_PACKAGES, WORKFLOWS] }
    );
    expect(outcome.error).toBeUndefined();
    const run = outcome.result as {
      status: string;
      error: string | null;
      outputs: Record<string, unknown>;
      issues?: unknown[];
    };
    expect(run.issues ?? []).toEqual([]);
    expect(run.error).toBeNull();
    expect(run.status).toBe("completed");
    const values = (run.outputs["strip"] as string[] | undefined) ?? [];
    // Arrival order across two parallel sources is not guaranteed.
    expect(values).toHaveLength(1);
    expect(String(values[0]).split("|").sort()).toEqual(["hello", "world"]);
  }, 60_000);

  it("refuses an array mixing wired outputs and literal values", async () => {
    const outcome = await action(
      `import { workflow } from "${DSL}";
       import { string } from "${DSL}/nodetool.constant";
       import { document } from "${DSL}/lib.svg";
       const a = string({ value: "hello" });
       const grid = document({ elements: [a.output(), "literal"], width: 2 });
       return workflow(grid);`,
      { packages: [DSL, `${DSL}/nodetool.constant`, `${DSL}/lib.svg`] }
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('"elements"');
    expect(outcome.error).toContain("mixes wired outputs and literal values");
  });

  it("refuses a handle buried inside an object value", async () => {
    const outcome = await action(
      `import { workflow } from "${DSL}";
       import { string } from "${DSL}/nodetool.constant";
       import { code } from "${DSL}/nodetool.code";
       const a = string({ value: "hello" });
       const snippet = code({ code: "return {};", options: { source: a.output() } });
       return workflow(snippet);`,
      { packages: [DSL, `${DSL}/nodetool.constant`, `${DSL}/nodetool.code`] }
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('"options.source"');
    expect(outcome.error).toContain("not wired");
  });
});

// ---------------------------------------------------------------------------
// 6. The permission ladder
// ---------------------------------------------------------------------------

describe("the gate on the authoring path", () => {
  it("surfaces a denied save as an error, and saves nothing", async () => {
    const prompts: ApprovalRequest[] = [];
    const run = gatedRun("default", "deny", prompts);
    const outcome = await action(
      `import { create_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       return await create_workflow({ name: "Shout", graph });`,
      { run, packages: SHOUT_PACKAGES }
    );
    expect(prompts.map((p) => p.toolName)).toEqual(["create_workflow"]);
    expect(prompts[0].category).toBe("write");
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toBeUndefined();
    expect(outcome.error).toContain("declined to run");
    const [workflows] = await Workflow.paginate(USER, { limit: 10 });
    expect(workflows).toEqual([]);
  }, 60_000);

  it("surfaces a denied run as an error, not an empty result", async () => {
    const prompts: ApprovalRequest[] = [];
    const run = gatedRun("default", "deny", prompts);
    const saved = await Workflow.create({
      name: "Shout",
      user_id: USER,
      access: "private",
      graph: { nodes: [], edges: [] }
    });
    const outcome = await action(
      `import { run_workflow } from "${WORKFLOWS}";
       return await run_workflow({ workflow_id: ${JSON.stringify(saved.id)} });`,
      { run, packages: SHOUT_PACKAGES }
    );
    expect(prompts.map((p) => p.toolName)).toEqual(["run_workflow"]);
    expect(prompts[0].category).toBe("execute");
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("declined to run");
  }, 60_000);

  it("asks once and proceeds when the answer is allow", async () => {
    const prompts: ApprovalRequest[] = [];
    const run = gatedRun("default", "allow", prompts);
    const outcome = await action(
      `import { create_workflow, run_workflow } from "${WORKFLOWS}";
       ${SHOUT_PROGRAM.replace("return workflow(out);", "const graph = workflow(out);")}
       const saved = await create_workflow({ name: "Shout", graph });
       return await run_workflow({ workflow_id: saved.id });`,
      { run, packages: SHOUT_PACKAGES }
    );
    expect(outcome.error).toBeUndefined();
    expect(prompts.map((p) => p.toolName)).toEqual([
      "create_workflow",
      "run_workflow"
    ]);
    expect(
      Object.values((outcome.result as { outputs: Record<string, unknown> }).outputs)
    ).toEqual([["HELLO!"]]);
  }, 60_000);
});
