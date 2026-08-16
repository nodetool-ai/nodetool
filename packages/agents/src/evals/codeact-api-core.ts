/**
 * CodeAct eval cases for the CORE `nodetool.*` namespaces — workflows, nodes,
 * models, media, jobs, assets, agents (plus `batch`).
 *
 * The two graph-authoring cases build with `@nodetool-ai/sandbox-dsl`, so the
 * world's node types are the ones that pack really exports. The exception is
 * `nodetool.text.Uppercase`, which only ever appears inside pre-built
 * workflows a case runs by id.
 *
 * The belt below is a set of fakes named exactly like the real tools, so the
 * executor lights up the object model, its prompt section, and the guest
 * prelude. Behind them sits one deterministic in-memory world: a node catalog
 * a three-type interpreter can actually execute, workflows saved through
 * `create_workflow` and runnable by the id it hands back, a background job
 * that settles on its second poll, an interactive run that escalates once, a
 * ranked model catalog the media tools validate against, and an asset store.
 * No DB, no network, no clock beyond the sandbox's own `sleep`.
 */

import type { Tool } from "../tools/base-tool.js";
import { GRAPH_DSL_PACKAGE } from "../codeact/graph-dsl-package.js";
import {
  RecordingTool,
  type CodeActEvalCase,
  type CodeActToolRecorder
} from "./codeact-cases.js";

const str = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value);

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Words a critique judges a brief by — short ones carry no signal. */
const briefTerms = (brief: string): string[] =>
  Array.from(new Set(brief.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []));

interface NodeProperty {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface NodeSpec {
  type: string;
  description: string;
  keywords: readonly string[];
  properties: readonly NodeProperty[];
  /** Accepts inputs beyond `properties` — a real node with dynamic slots. */
  dynamicInputs?: boolean;
  outputs: readonly { name: string; type: string }[];
  evaluate: (props: Record<string, unknown>) => string;
}

const prop = (
  name: string,
  type: string,
  required: boolean,
  description: string
): NodeProperty => ({ name, type, required, description });

const OUT_STR = [{ name: "output", type: "str" }] as const;

const NODE_CATALOG: readonly NodeSpec[] = [
  {
    type: "nodetool.input.StringInput",
    description: "A string workflow input, addressed by name at run time.",
    keywords: ["input", "string", "text", "parameter", "entry"],
    properties: [
      prop("name", "str", true, "Run parameter this input reads."),
      prop("value", "str", false, "Default when the run passes nothing.")
    ],
    outputs: OUT_STR,
    evaluate: (props) => str(props["value"])
  },
  {
    type: "nodetool.text.Concat",
    description: "Join two strings, a followed by b.",
    keywords: ["concat", "join", "append", "combine", "text"],
    properties: [
      prop("a", "str", true, "First string."),
      prop("b", "str", true, "Second string.")
    ],
    outputs: OUT_STR,
    evaluate: (props) => str(props["a"]) + str(props["b"])
  },
  {
    // The one type here that NodeTool does not really ship. It is the middle
    // node of the world's pre-built workflows, which cases run by id; nothing
    // authors it, so the DSL pack never needs a wrapper for it.
    type: "nodetool.text.Uppercase",
    description: "Uppercase a string.",
    keywords: ["uppercase", "shout", "case", "text"],
    properties: [prop("text", "str", true, "String to uppercase.")],
    outputs: OUT_STR,
    evaluate: (props) => str(props["text"]).toUpperCase()
  },
  {
    type: "nodetool.text.Template",
    // Every other spec here takes fixed properties. This one takes a template
    // plus whatever slots the template names, so a case that wires it has to
    // read what the node reports rather than assume a signature.
    description: "Render a template, substituting {{slot}} from its inputs.",
    keywords: ["template", "render", "substitute", "format", "text"],
    properties: [prop("string", "str", true, "Template text.")],
    dynamicInputs: true,
    outputs: OUT_STR,
    evaluate: (props) =>
      str(props["string"]).replace(
        /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
        (_, slot) => str(props[String(slot)])
      )
  },
  {
    type: "nodetool.output.Output",
    description: "A named output of the workflow.",
    keywords: ["output", "result", "string", "return"],
    properties: [
      prop("name", "str", true, "Name this output is reported under."),
      prop("value", "str", true, "Value to report.")
    ],
    outputs: OUT_STR,
    evaluate: (props) => str(props["value"])
  }
];

const nodeSpec = (type: string): NodeSpec | undefined =>
  NODE_CATALOG.find((spec) => spec.type === type);

interface WorldNode {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

interface WorldEdge {
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

interface WorldGraph {
  nodes: WorldNode[];
  edges: WorldEdge[];
}

interface WorldWorkflow {
  id: string;
  name: string;
  description: string;
  tags: string[];
  graph: WorldGraph;
}

interface WorldAsset {
  id: string;
  name: string;
  content_type: string;
  uri: string;
  content: string;
  /** Generation prompt, for the media tools that judge their own output. */
  prompt?: string;
}

interface WorldJob {
  id: string;
  workflow_id: string;
  params: Record<string, unknown>;
  polls: number;
  outputs: Record<string, string>;
}

interface WorldSession {
  id: string;
  workflow_id: string;
  params: Record<string, unknown>;
  escalation_id: string;
  node_id: string;
}

interface ModelEntry {
  provider: string;
  model_id: string;
  type: string;
  capabilities: readonly string[];
}

/** Ranked: `find_model` answers in this order, so `pick` is deterministic. */
const MODEL_CATALOG: readonly ModelEntry[] = [
  {
    provider: "fal_ai",
    model_id: "fal-ai/flux/schnell",
    type: "image",
    capabilities: ["text_to_image", "image_to_image"]
  },
  {
    provider: "fal_ai",
    model_id: "fal-ai/flux/dev",
    type: "image",
    capabilities: ["text_to_image"]
  },
  {
    provider: "openai",
    model_id: "gpt-image-2",
    type: "image",
    capabilities: ["text_to_image", "image_to_image"]
  },
  {
    provider: "openai",
    model_id: "gpt-5.4-mini",
    type: "language",
    capabilities: ["generate_message", "vision"]
  },
  {
    provider: "anthropic",
    model_id: "claude-sonnet-5",
    type: "language",
    capabilities: ["generate_message", "vision"]
  },
  {
    provider: "fal_ai",
    model_id: "fal-ai/ltx-video",
    type: "video",
    capabilities: ["text_to_video", "image_to_video"]
  },
  {
    provider: "openai",
    model_id: "tts-1",
    type: "tts",
    capabilities: ["text_to_speech"]
  },
  {
    provider: "openai",
    model_id: "whisper-1",
    type: "asr",
    capabilities: ["transcribe_audio"]
  },
  {
    provider: "openai",
    model_id: "text-embedding-3-small",
    type: "embedding",
    capabilities: ["embed_text"]
  }
];

const stringInputGraph = (
  inputName: string,
  middleType: string,
  middleProps: Record<string, unknown>,
  outputName: string
): WorldGraph => ({
  nodes: [
    {
      id: "in_1",
      type: "nodetool.input.StringInput",
      properties: { name: inputName }
    },
    { id: "mid_1", type: middleType, properties: middleProps },
    {
      id: "out_1",
      type: "nodetool.output.Output",
      properties: { name: outputName }
    }
  ],
  edges: [
    {
      source: "in_1",
      sourceHandle: "output",
      target: "mid_1",
      targetHandle: middleType === "nodetool.text.Concat" ? "a" : "text"
    },
    {
      source: "mid_1",
      sourceHandle: "output",
      target: "out_1",
      targetHandle: "value"
    }
  ]
});

class CoreWorld {
  readonly workflows = new Map<string, WorldWorkflow>();
  readonly assets = new Map<string, WorldAsset>();
  readonly jobs = new Map<string, WorldJob>();
  readonly sessions = new Map<string, WorldSession>();
  private seq = 0;

  constructor() {
    this.workflows.set("wf_greet", {
      id: "wf_greet",
      name: "Greeting Builder",
      description: "Greets whoever the run names.",
      tags: ["demo"],
      graph: stringInputGraph(
        "name",
        "nodetool.text.Concat",
        { b: ", welcome aboard!" },
        "greeting"
      )
    });
    this.workflows.set("wf_shout", {
      id: "wf_shout",
      name: "Shout Line",
      description: "Uppercases one line.",
      tags: ["demo"],
      graph: stringInputGraph("line", "nodetool.text.Uppercase", {}, "shout")
    });
  }

  id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  workflow(id: unknown): WorldWorkflow {
    const found = this.workflows.get(str(id));
    if (!found) {
      throw new Error(
        `No workflow "${str(id)}". list_workflows reports what exists.`
      );
    }
    return found;
  }

  model(provider: unknown, model: unknown, capability: string): ModelEntry {
    const entry = MODEL_CATALOG.find(
      (m) => m.provider === str(provider) && m.model_id === str(model)
    );
    if (!entry) {
      throw new Error(
        `No model "${str(provider)}/${str(model)}" in the catalog — ` +
          `resolve one with find_model(${capability}).`
      );
    }
    if (!entry.capabilities.includes(capability)) {
      throw new Error(
        `Model "${entry.provider}/${entry.model_id}" does not offer ` +
          `"${capability}" (it offers ${entry.capabilities.join(", ")}).`
      );
    }
    return entry;
  }

  asset(ref: unknown): WorldAsset {
    const key = str(ref);
    const direct =
      this.assets.get(key) ?? this.assets.get(key.replace(/^asset:\/\//, ""));
    if (direct) return direct;
    for (const asset of this.assets.values()) {
      if (asset.name === key || asset.uri === key) return asset;
    }
    throw new Error(
      `No asset "${key}" — list_assets or asset_search finds one.`
    );
  }

  saveAsset(
    name: string,
    content: string,
    contentType: string,
    prompt?: string
  ): WorldAsset {
    const id = this.id("asset");
    const asset: WorldAsset = {
      id,
      name,
      content,
      content_type: contentType,
      uri: `asset://${id}`
    };
    if (prompt !== undefined) asset.prompt = prompt;
    this.assets.set(id, asset);
    return asset;
  }
}

interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateGraph(graph: WorldGraph): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const fed = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source) errors.push(`Edge from unknown node "${edge.source}"`);
    if (!target) {
      errors.push(`Edge to unknown node "${edge.target}"`);
      continue;
    }
    const spec = nodeSpec(target.type);
    const handle = str(edge.targetHandle);
    if (
      spec &&
      spec.dynamicInputs !== true &&
      !spec.properties.some((p) => p.name === handle)
    ) {
      errors.push(
        `Node "${target.id}" (${target.type}) has no input "${handle}"`
      );
    }
    const set = fed.get(target.id) ?? new Set<string>();
    set.add(handle);
    fed.set(target.id, set);
  }

  for (const node of graph.nodes) {
    const spec = nodeSpec(node.type);
    if (!spec) {
      errors.push(`Unknown node type "${node.type}" on node "${node.id}"`);
      continue;
    }
    for (const p of spec.properties) {
      if (!p.required) continue;
      const wired = fed.get(node.id)?.has(p.name) === true;
      const set = str(node.properties[p.name]).length > 0;
      if (!wired && !set) {
        errors.push(`Node "${node.id}" (${node.type}) is missing "${p.name}"`);
      }
    }
  }

  if (!graph.nodes.some((n) => n.type === "nodetool.output.Output")) {
    warnings.push("Graph has no output node, so a run reports nothing.");
  }
  return { valid: errors.length === 0, errors, warnings };
}

/** Evaluate the graph. `skipNodeId` yields "" for that node (escalation skip). */
function runGraph(
  graph: WorldGraph,
  params: Record<string, unknown>,
  skipNodeId?: string
) {
  const values = new Map<string, string>();
  const remaining = [...graph.nodes];
  const outputs: Record<string, string> = {};

  while (remaining.length > 0) {
    const ready = remaining.filter((node) =>
      graph.edges
        .filter((e) => e.target === node.id)
        .every((e) => values.has(e.source))
    );
    if (ready.length === 0) {
      throw new Error("Graph has a cycle or an edge from a missing node.");
    }
    for (const node of ready) {
      const spec = nodeSpec(node.type);
      if (!spec) throw new Error(`Unknown node type "${node.type}"`);
      const props: Record<string, unknown> = { ...node.properties };
      for (const edge of graph.edges.filter((e) => e.target === node.id)) {
        props[str(edge.targetHandle)] = values.get(edge.source) ?? "";
      }
      if (node.type === "nodetool.input.StringInput") {
        const key = str(props["name"]);
        if (params[key] !== undefined) props["value"] = params[key];
      }
      const value = node.id === skipNodeId ? "" : spec.evaluate(props);
      values.set(node.id, value);
      if (node.type === "nodetool.output.Output") {
        outputs[str(props["name"])] = value;
      }
      remaining.splice(remaining.indexOf(node), 1);
    }
  }
  return outputs;
}

/** The node an interactive run parks on: the first non-input node. */
function escalationNode(graph: WorldGraph): WorldNode {
  const node =
    graph.nodes.find((n) => n.type !== "nodetool.input.StringInput") ??
    graph.nodes[0];
  if (!node) throw new Error("Graph has no nodes to run.");
  return node;
}

function toGraph(value: unknown): WorldGraph {
  const raw = record(value);
  const nodes = Array.isArray(raw["nodes"]) ? (raw["nodes"] as unknown[]) : [];
  const edges = Array.isArray(raw["edges"]) ? (raw["edges"] as unknown[]) : [];
  return {
    nodes: nodes.map((n) => {
      const node = record(n);
      return {
        id: str(node["id"]),
        type: str(node["type"]),
        properties: record(node["properties"])
      };
    }),
    edges: edges.map((e) => {
      const edge = record(e);
      return {
        source: str(edge["source"]),
        sourceHandle: str(edge["sourceHandle"] ?? "output"),
        target: str(edge["target"]),
        targetHandle: str(edge["targetHandle"])
      };
    })
  };
}

const summarize = (workflow: WorldWorkflow) => ({
  id: workflow.id,
  name: workflow.name,
  description: workflow.description,
  tags: workflow.tags
});

const EXAMPLE_WORKFLOWS: readonly WorldWorkflow[] = [
  {
    id: "example_shout",
    name: "shout-line",
    description: "Uppercase one line — the smallest useful graph.",
    tags: ["example"],
    graph: stringInputGraph("line", "nodetool.text.Uppercase", {}, "shout")
  }
];

/**
 * The core-namespace toolbelt. Every call builds a fresh world, so cases never
 * see each other's workflows, assets, or jobs.
 */
export function createCoreApiTools(recorder: CodeActToolRecorder): Tool[] {
  const world = new CoreWorld();

  const tool = <TResult>(
    name: string,
    description: string,
    properties: Record<string, unknown>,
    impl: (params: Record<string, unknown>) => TResult
  ): Tool =>
    new RecordingTool(
      name,
      description,
      { type: "object", properties },
      recorder,
      impl
    );

  const s = { type: "string" };
  const o = { type: "object" };

  const runSaved = (
    params: Record<string, unknown>
  ): { workflow: WorldWorkflow; outputs: Record<string, string> } => {
    const workflow = world.workflow(params["workflow_id"]);
    return {
      workflow,
      outputs: runGraph(workflow.graph, record(params["params"]))
    };
  };

  const generate = (
    params: Record<string, unknown>,
    capability: string,
    contentType: string,
    prefix: string
  ) => {
    const model = world.model(params["provider"], params["model"], capability);
    const prompt = str(params["prompt"]);
    const asset = world.saveAsset(
      `${prefix}-${str(world.assets.size + 1)}`,
      prompt,
      contentType,
      prompt
    );
    return {
      asset_uri: asset.uri,
      asset_id: asset.id,
      provider: model.provider,
      model: model.model_id,
      prompt
    };
  };

  const adherence = (image: unknown, brief: unknown) => {
    const asset = world.asset(image);
    const prompt = (asset.prompt ?? asset.content).toLowerCase();
    const terms = briefTerms(str(brief));
    const missing = terms.filter((term) => !prompt.includes(term));
    const score =
      terms.length === 0
        ? 1
        : Math.round(((terms.length - missing.length) / terms.length) * 100) /
          100;
    return { asset, score, missing };
  };

  return [
    tool(
      "list_workflows",
      "List saved workflows.",
      { limit: { type: "number" }, workflow_type: s },
      (params) => {
        if (str(params["workflow_type"]) === "example") {
          return { workflows: EXAMPLE_WORKFLOWS.map(summarize) };
        }
        return {
          workflows: [...world.workflows.values()].map(summarize)
        };
      }
    ),
    tool(
      "get_workflow",
      "Get one workflow with its graph.",
      { workflow_id: s },
      (params) => {
        const workflow = world.workflow(params["workflow_id"]);
        return { ...summarize(workflow), graph: workflow.graph };
      }
    ),
    tool(
      "create_workflow",
      "Save a graph as a workflow.",
      { name: s, graph: o, tags: { type: "array" }, description: s },
      (params) => {
        const graph = toGraph(params["graph"]);
        const check = validateGraph(graph);
        if (!check.valid) {
          throw new Error(
            `Refusing to save an invalid graph: ${check.errors.join("; ")}`
          );
        }
        const id = world.id("wf");
        const workflow: WorldWorkflow = {
          id,
          name: str(params["name"]) || id,
          description: str(params["description"]),
          tags: Array.isArray(params["tags"])
            ? (params["tags"] as string[])
            : [],
          graph
        };
        world.workflows.set(id, workflow);
        return summarize(workflow);
      }
    ),
    tool(
      "run_workflow",
      "Run a saved workflow. With interactive:true a failing node escalates.",
      { workflow_id: s, params: o, interactive: { type: "boolean" } },
      (params) => {
        const workflow = world.workflow(params["workflow_id"]);
        if (params["interactive"] === true) {
          const node = escalationNode(workflow.graph);
          const session: WorldSession = {
            id: world.id("session"),
            workflow_id: workflow.id,
            params: record(params["params"]),
            escalation_id: world.id("esc"),
            node_id: node.id
          };
          world.sessions.set(session.id, session);
          return {
            status: "escalated",
            session_id: session.id,
            escalation: {
              id: session.escalation_id,
              node_id: node.id,
              node_type: node.type,
              error: "Transient failure while processing the node.",
              allowedActions: ["retry", "substitute", "skip", "fail"]
            }
          };
        }
        return {
          status: "completed",
          workflow_id: workflow.id,
          outputs: runGraph(workflow.graph, record(params["params"]))
        };
      }
    ),
    tool(
      "start_background_job",
      "Start a workflow as a background job and return its id.",
      { workflow_id: s, params: o },
      (params) => {
        const { workflow, outputs } = runSaved(params);
        const id = world.id("job");
        world.jobs.set(id, {
          id,
          workflow_id: workflow.id,
          params: record(params["params"]),
          polls: 0,
          outputs
        });
        return { id, job_id: id, status: "running", workflow_id: workflow.id };
      }
    ),
    tool(
      "debug_workflow",
      "Run a workflow and report a per-node verdict.",
      { workflow_id: s, params: o },
      (params) => {
        const { workflow, outputs } = runSaved(params);
        return {
          verdict: { ok: true, issues: [] },
          outputs,
          nodes: workflow.graph.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            status: "completed"
          }))
        };
      }
    ),
    tool(
      "validate_workflow",
      "Statically check a graph or a saved workflow.",
      { graph: o, workflow_id: s },
      (params) => {
        const graph =
          params["graph"] === undefined
            ? world.workflow(params["workflow_id"]).graph
            : toGraph(params["graph"]);
        return validateGraph(graph);
      }
    ),
    tool(
      "resolve_workflow_escalation",
      "Answer an escalation from an interactive run.",
      { session_id: s, escalation_id: s, action: s, outputs: o, reason: s },
      (params) => {
        const session = world.sessions.get(str(params["session_id"]));
        if (!session)
          throw new Error(`No debug session "${str(params["session_id"])}"`);
        if (str(params["escalation_id"]) !== session.escalation_id) {
          throw new Error(
            `Escalation "${str(params["escalation_id"])}" is not open on this session.`
          );
        }
        const action = str(params["action"]);
        const workflow = world.workflow(session.workflow_id);
        const intervention = { escalation_id: session.escalation_id, action };
        world.sessions.delete(session.id);
        if (action === "fail") {
          return {
            status: "failed",
            error: str(params["reason"]) || "Run failed by supervisor verdict.",
            interventions: [intervention]
          };
        }
        if (action === "substitute") {
          return {
            status: "completed",
            outputs: record(params["outputs"]),
            interventions: [intervention]
          };
        }
        const outputs = runGraph(
          workflow.graph,
          session.params,
          action === "skip" ? session.node_id : undefined
        );
        return { status: "completed", outputs, interventions: [intervention] };
      }
    ),
    tool(
      "get_example_workflow",
      "Load one shipped example workflow with its graph.",
      { package_name: s, example_name: s },
      (params) => {
        const name = str(params["example_name"]);
        const example = EXAMPLE_WORKFLOWS.find((e) => e.name === name);
        if (!example) {
          throw new Error(
            `No example "${name}" in package "${str(params["package_name"])}".`
          );
        }
        return { ...summarize(example), graph: example.graph };
      }
    ),
    tool(
      "search_nodes",
      "Search the node catalog by keyword.",
      { query: { type: "array" }, n_results: { type: "number" } },
      (params) => {
        const queries = (
          Array.isArray(params["query"]) ? params["query"] : [params["query"]]
        ).map((q) => str(q).toLowerCase());
        const hits = NODE_CATALOG.filter((spec) =>
          queries.some((query) =>
            query
              .split(/\s+/)
              .filter((word) => word.length > 2)
              .some(
                (word) =>
                  spec.type.toLowerCase().includes(word) ||
                  spec.keywords.some(
                    (k) => k.includes(word) || word.includes(k)
                  )
              )
          )
        );
        const results = (hits.length > 0 ? hits : NODE_CATALOG).slice(
          0,
          Number(params["n_results"] ?? 10)
        );
        return {
          results: results.map((spec) => ({
            node_type: spec.type,
            description: spec.description
          }))
        };
      }
    ),
    tool(
      "get_node_info",
      "Full metadata for one node type.",
      { node_type: s },
      (params) => {
        const spec = nodeSpec(str(params["node_type"]));
        if (!spec) {
          throw new Error(
            `Unknown node type "${str(params["node_type"])}" — search_nodes lists them.`
          );
        }
        return {
          node_type: spec.type,
          description: spec.description,
          properties: spec.properties,
          dynamic_inputs: spec.dynamicInputs === true,
          outputs: spec.outputs
        };
      }
    ),
    tool(
      "list_nodes",
      "Browse the node catalog, optionally by namespace.",
      { namespace: s, limit: { type: "number" } },
      (params) => {
        const namespace = str(params["namespace"]);
        const nodes = NODE_CATALOG.filter(
          (spec) => namespace === "" || spec.type.startsWith(namespace)
        );
        return {
          nodes: nodes.map((spec) => ({
            node_type: spec.type,
            description: spec.description
          }))
        };
      }
    ),
    tool(
      "run_node",
      "Run ONE node with a property bag — the single-node harness.",
      { node_type: s, inputs: o },
      (params) => {
        const spec = nodeSpec(str(params["node_type"]));
        if (!spec)
          throw new Error(`Unknown node type "${str(params["node_type"])}"`);
        const inputs = record(params["inputs"]);
        const missing = spec.properties
          .filter((p) => p.required && str(inputs[p.name]).length === 0)
          .map((p) => p.name);
        if (missing.length > 0) {
          throw new Error(
            `${spec.type} needs ${missing.join(", ")} — get_node_info lists its properties.`
          );
        }
        return { node_type: spec.type, output: spec.evaluate(inputs) };
      }
    ),
    tool(
      "find_model",
      "Rank the configured models offering a capability.",
      { capability: s, limit: { type: "number" }, provider_hint: s },
      (params) => {
        const capability = str(params["capability"]);
        const hint = str(params["provider_hint"]);
        const matches = MODEL_CATALOG.filter(
          (m) =>
            m.capabilities.includes(capability) &&
            (hint === "" || m.provider === hint)
        );
        const limit = Number(params["limit"] ?? 5);
        return {
          capability,
          results: matches.slice(0, limit).map((m) => ({
            provider: m.provider,
            model_id: m.model_id,
            type: m.type,
            capabilities: m.capabilities
          })),
          note:
            matches.length === 0
              ? `No configured model offers "${capability}".`
              : undefined
        };
      }
    ),
    tool(
      "list_models",
      "Browse the model catalog.",
      { provider: s, model_type: s, limit: { type: "number" } },
      (params) => {
        const provider = str(params["provider"]);
        const type = str(params["model_type"]);
        return {
          results: MODEL_CATALOG.filter(
            (m) =>
              (provider === "" || m.provider === provider) &&
              (type === "" || m.type === type)
          ).map((m) => ({
            provider: m.provider,
            model_id: m.model_id,
            id: m.model_id,
            type: m.type
          }))
        };
      }
    ),
    tool(
      "list_provider_models",
      "One provider's catalog.",
      { provider: s },
      (params) => {
        const provider = str(params["provider"]);
        return {
          provider,
          results: MODEL_CATALOG.filter((m) => m.provider === provider).map(
            (m) => ({
              provider: m.provider,
              model_id: m.model_id,
              type: m.type
            })
          )
        };
      }
    ),
    tool(
      "generate_image",
      "Generate an image and save it as an asset.",
      {
        provider: s,
        model: s,
        prompt: s,
        width: { type: "number" },
        height: { type: "number" }
      },
      (params) => generate(params, "text_to_image", "image/png", "image")
    ),
    tool(
      "read_media_bytes",
      "Read the bytes behind a media reference (asset:// URI or asset id).",
      { uri: s },
      (params) => {
        const asset = world.asset(params["uri"]);
        const content_base64 = Buffer.from(asset.content, "utf8").toString(
          "base64"
        );
        return {
          uri: asset.uri,
          size: content_base64.length,
          mime_type: asset.content_type,
          content_base64
        };
      }
    ),
    tool(
      "edit_image",
      "Edit an existing image asset.",
      { provider: s, model: s, prompt: s, input_file: s },
      (params) => {
        const model = world.model(
          params["provider"],
          params["model"],
          "image_to_image"
        );
        const source = world.asset(params["input_file"]);
        const prompt = `${source.prompt ?? source.content} | ${str(params["prompt"])}`;
        const asset = world.saveAsset(
          `edit-${source.name}`,
          prompt,
          "image/png",
          prompt
        );
        return {
          asset_uri: asset.uri,
          asset_id: asset.id,
          provider: model.provider,
          model: model.model_id
        };
      }
    ),
    tool(
      "generate_video",
      "Generate a video and save it as an asset.",
      { provider: s, model: s, prompt: s },
      (params) => generate(params, "text_to_video", "video/mp4", "video")
    ),
    tool(
      "animate_image",
      "Animate an image asset into a video.",
      { provider: s, model: s, input_file: s },
      (params) => {
        const model = world.model(
          params["provider"],
          params["model"],
          "image_to_video"
        );
        const source = world.asset(params["input_file"]);
        const asset = world.saveAsset(
          `clip-${source.name}`,
          source.prompt ?? source.content,
          "video/mp4",
          source.prompt ?? source.content
        );
        return {
          asset_uri: asset.uri,
          provider: model.provider,
          model: model.model_id
        };
      }
    ),
    tool(
      "generate_speech",
      "Synthesize speech and save it as an asset.",
      { provider: s, model: s, text: s, voice: s },
      (params) => {
        world.model(params["provider"], params["model"], "text_to_speech");
        const text = str(params["text"]);
        const asset = world.saveAsset(
          `speech-${str(world.assets.size + 1)}`,
          text,
          "audio/mpeg"
        );
        return {
          asset_uri: asset.uri,
          duration_seconds: Math.round((text.length / 15) * 10) / 10
        };
      }
    ),
    tool(
      "transcribe_audio",
      "Transcribe an audio asset.",
      { provider: s, model: s, input_file: s },
      (params) => {
        world.model(params["provider"], params["model"], "transcribe_audio");
        const asset = world.asset(params["input_file"]);
        return { text: asset.content };
      }
    ),
    tool(
      "embed_text",
      "Embed text as a vector.",
      { provider: s, model: s, text: s },
      (params) => {
        world.model(params["provider"], params["model"], "embed_text");
        const text = str(params["text"]);
        const embedding = [0, 1, 2, 3].map((slot) => {
          let sum = 0;
          for (let i = slot; i < text.length; i += 4) sum += text.charCodeAt(i);
          return Math.round((sum % 1000) / 10) / 100;
        });
        return { embedding, dimensions: embedding.length };
      }
    ),
    tool(
      "critique_image",
      "Judge one image against a brief with a vision model.",
      { provider: s, model: s, image: s, brief: s, taste_profile: s },
      (params) => {
        world.model(params["provider"], params["model"], "vision");
        const { score, missing } = adherence(params["image"], params["brief"]);
        return {
          verdict: score >= 0.75 ? "pass" : "revise",
          score,
          defects: missing.map(
            (term) => `the brief asks for "${term}"; the image does not show it`
          )
        };
      }
    ),
    tool(
      "compare_images",
      "Rank 2-8 candidates against a brief.",
      {
        provider: s,
        model: s,
        images: { type: "array" },
        brief: s,
        taste_profile: s
      },
      (params) => {
        world.model(params["provider"], params["model"], "vision");
        const images = Array.isArray(params["images"]) ? params["images"] : [];
        const ranked = images
          .map((image, index) => ({
            image: str(image),
            index,
            score: adherence(image, params["brief"]).score
          }))
          .sort((a, b) => b.score - a.score || a.index - b.index);
        return { winner: ranked[0]?.image, ranking: ranked };
      }
    ),
    tool(
      "score_image_adherence",
      "Score an image against the brief as yes/no checks.",
      { provider: s, model: s, image: s, brief: s },
      (params) => {
        world.model(params["provider"], params["model"], "vision");
        const { score, missing } = adherence(params["image"], params["brief"]);
        return {
          score,
          checks: briefTerms(str(params["brief"])).map((term) => ({
            question: `Does the image show "${term}"?`,
            pass: !missing.includes(term)
          }))
        };
      }
    ),
    tool(
      "ffmpeg",
      "Run ffmpeg on workspace files.",
      {
        args: { type: "array" },
        output_file: s,
        timeout_seconds: { type: "number" }
      },
      (params) => {
        const output =
          typeof params["output_file"] === "string" && params["output_file"]
            ? params["output_file"]
            : "out.mp4";
        const asset = world.saveAsset(output, "ffmpeg", "video/mp4");
        return { success: true, output_file: output, asset_uri: asset.uri };
      }
    ),
    tool(
      "yt_dlp",
      "Download a video with yt-dlp.",
      {
        url: s,
        output_file: s,
        format: s,
        timeout_seconds: { type: "number" }
      },
      (params) => {
        const url = str(params["url"]);
        const output =
          typeof params["output_file"] === "string" && params["output_file"]
            ? params["output_file"]
            : "download.mp4";
        const asset = world.saveAsset(output, url, "video/mp4");
        return {
          success: true,
          url,
          output_file: output,
          asset_uri: asset.uri
        };
      }
    ),
    tool(
      "list_jobs",
      "List background jobs.",
      { workflow_id: s, limit: { type: "number" } },
      (params) => {
        const workflowId = str(params["workflow_id"]);
        return {
          jobs: [...world.jobs.values()]
            .filter(
              (job) => workflowId === "" || job.workflow_id === workflowId
            )
            .map((job) => ({
              id: job.id,
              workflow_id: job.workflow_id,
              status: job.polls > 1 ? "completed" : "running"
            }))
        };
      }
    ),
    tool(
      "get_job",
      "Get one job. It reports running on the first poll, completed after.",
      { job_id: s },
      (params) => {
        const job = world.jobs.get(str(params["job_id"]));
        if (!job) throw new Error(`No job "${str(params["job_id"])}"`);
        job.polls += 1;
        const done = job.polls > 1;
        return {
          id: job.id,
          workflow_id: job.workflow_id,
          status: done ? "completed" : "running",
          polls: job.polls,
          result: done ? { outputs: job.outputs } : undefined
        };
      }
    ),
    tool("get_job_logs", "Read a job's logs.", { job_id: s }, (params) => {
      const job = world.jobs.get(str(params["job_id"]));
      if (!job) throw new Error(`No job "${str(params["job_id"])}"`);
      return {
        job_id: job.id,
        logs: [`job ${job.id} started`, `workflow ${job.workflow_id} scheduled`]
      };
    }),
    tool(
      "list_assets",
      "List assets.",
      { content_type: s, query: s, limit: { type: "number" } },
      (params) => {
        const contentType = str(params["content_type"]);
        const query = str(params["query"]).toLowerCase();
        return {
          assets: [...world.assets.values()]
            .filter(
              (a) =>
                (contentType === "" ||
                  a.content_type.startsWith(contentType)) &&
                (query === "" || a.name.toLowerCase().includes(query))
            )
            .map((a) => ({
              id: a.id,
              name: a.name,
              uri: a.uri,
              content_type: a.content_type
            }))
        };
      }
    ),
    tool("get_asset", "Get one asset record.", { asset_id: s }, (params) => {
      const asset = world.asset(params["asset_id"]);
      return {
        id: asset.id,
        name: asset.name,
        uri: asset.uri,
        content_type: asset.content_type
      };
    }),
    tool(
      "asset_search",
      "Search assets by name or content.",
      { query: s, limit: { type: "number" } },
      (params) => {
        const query = str(params["query"]).toLowerCase();
        return {
          results: [...world.assets.values()]
            .filter(
              (a) =>
                a.name.toLowerCase().includes(query) ||
                a.content.toLowerCase().includes(query)
            )
            .map((a) => ({
              id: a.id,
              name: a.name,
              uri: a.uri,
              content_type: a.content_type
            }))
        };
      }
    ),
    tool(
      "save_asset",
      "Save content as a named asset.",
      { name: s, content: s, content_type: s },
      (params) => {
        const asset = world.saveAsset(
          str(params["name"]),
          str(params["content"]),
          str(params["content_type"]) || "text/plain"
        );
        return { id: asset.id, name: asset.name, uri: asset.uri };
      }
    ),
    tool(
      "read_asset",
      "Read a saved asset's content.",
      { name: s },
      (params) => {
        const asset = world.asset(params["name"]);
        return {
          id: asset.id,
          name: asset.name,
          content: asset.content,
          content_type: asset.content_type
        };
      }
    ),
    tool(
      "list_images",
      "List image assets as handles.",
      { query: s, limit: { type: "number" } },
      () => ({
        images: [...world.assets.values()]
          .filter((a) => a.content_type.startsWith("image/"))
          .map((a) => ({ id: a.id, name: a.name, uri: a.uri }))
      })
    ),
    tool(
      "run_subtask",
      "Run a sub-agent on a self-contained prompt.",
      { description: s, prompt: s },
      (params) => {
        const prompt = str(params["prompt"]);
        const numbers = (prompt.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
        return {
          description: str(params["description"]),
          result: {
            sum: numbers.reduce((total, n) => total + n, 0),
            numbers,
            words: prompt.split(/\s+/).filter((w) => w.length > 0).length
          }
        };
      }
    )
  ];
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const isAssetUri = (value: unknown): boolean =>
  typeof value === "string" && value.startsWith("asset://");

export const CODEACT_API_CORE_CASES: readonly CodeActEvalCase[] = [
  {
    id: "api-graph-build-and-run",
    description: "Discover node types, then build, validate and run a graph",
    objective:
      "Build a workflow that takes a string input named `name` and reports an " +
      "output named `greeting` reading `<name>, welcome aboard!`. " +
      "Discover the node types from the catalog — never guess a type. " +
      'Validate the graph before running it, then run it with name = "Ada" ' +
      "and finish with {greeting: <the run's greeting output>}.",
    outputSchema: {
      type: "object",
      properties: { greeting: { type: "string" } },
      required: ["greeting"]
    },
    createTools: createCoreApiTools,
    sandboxPackages: [GRAPH_DSL_PACKAGE],
    namespaces: ["nodes", "workflows"],
    expect: {
      requiredTools: ["search_nodes", "validate_workflow", "run_workflow"],
      maxActions: 5,
      resultCheck: (r) => asObject(r)["greeting"] === "Ada, welcome aboard!",
      resultCheckLabel: 'greeting="Ada, welcome aboard!"'
    }
  },
  {
    id: "api-probe-node-then-wire",
    description: "Probe a node with the single-node harness before wiring it",
    objective:
      "Find the node that renders a text template. Probe it on its own with " +
      'the template "{{title}} — a field report" and title "Hello World" so ' +
      "you know exactly what it emits, then build and run a workflow that " +
      "renders that same template from a `title` input, using " +
      '"Fox In Snow" as the title. Report the rendered line as an output ' +
      "named `line`. Finish with {probe: <the probe output>, " +
      "line: <the run's line output>}.",
    outputSchema: {
      type: "object",
      properties: { probe: { type: "string" }, line: { type: "string" } },
      required: ["probe", "line"]
    },
    createTools: createCoreApiTools,
    sandboxPackages: [GRAPH_DSL_PACKAGE],
    namespaces: ["nodes", "workflows"],
    expect: {
      requiredTools: ["run_node", "run_workflow"],
      maxActions: 5,
      resultCheck: (r) =>
        asObject(r)["probe"] === "Hello World — a field report" &&
        asObject(r)["line"] === "Fox In Snow — a field report",
      resultCheckLabel:
        'probe="Hello World — a field report", line="Fox In Snow — a field report"'
    }
  },
  {
    id: "api-pick-model-and-batch-images",
    description: "Survey providers, pick a model, batch-generate images",
    objective:
      'Three shots need rendering: "a red fox in snow", "a fox by a river", ' +
      'and "a fox on a rooftop". Report which providers this workspace has ' +
      "models from, resolve one text-to-image model from the ranked catalog " +
      "(never guess an id), generate all three images, and finish with " +
      "{provider, model, uris} where uris holds the three asset URIs in the " +
      "order the shots were listed.",
    outputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        model: { type: "string" },
        uris: { type: "array", items: { type: "string" } }
      },
      required: ["provider", "model", "uris"]
    },
    createTools: createCoreApiTools,
    namespaces: ["models", "media"],
    expect: {
      requiredTools: ["list_models", "find_model", "generate_image"],
      maxActions: 5,
      minToolCalls: 5,
      resultCheck: (r) => {
        const result = asObject(r);
        const uris = result["uris"];
        return (
          result["provider"] === "fal_ai" &&
          result["model"] === "fal-ai/flux/schnell" &&
          Array.isArray(uris) &&
          uris.length === 3 &&
          new Set(uris).size === 3 &&
          uris.every(isAssetUri)
        );
      },
      resultCheckLabel: "fal_ai/fal-ai/flux/schnell + 3 distinct asset URIs"
    }
  },
  {
    id: "api-generate-then-critique",
    description: "Generate an image, then judge it against the brief",
    objective:
      'Render the brief "a red fox in deep snow" with a text-to-image model, ' +
      "then have a vision chat model critique the result against that same " +
      "brief using the critique judge (not the adherence scorer). Finish " +
      "with {asset_uri, verdict, score} — verdict is the critique's own " +
      "verdict string, not a serialized report.",
    outputSchema: {
      type: "object",
      properties: {
        asset_uri: { type: "string" },
        verdict: { type: "string" },
        score: { type: "number" }
      },
      required: ["asset_uri", "verdict", "score"]
    },
    createTools: createCoreApiTools,
    namespaces: ["models", "media"],
    expect: {
      requiredTools: ["find_model", "generate_image", "critique_image"],
      maxActions: 5,
      resultCheck: (r) => {
        const result = asObject(r);
        return (
          isAssetUri(result["asset_uri"]) &&
          result["verdict"] === "pass" &&
          typeof result["score"] === "number" &&
          result["score"] >= 0.75
        );
      },
      resultCheckLabel: "verdict=pass, score>=0.75, asset:// uri"
    }
  },
  {
    id: "api-background-job-wait",
    description: "Start a workflow as a background job and wait for it",
    objective:
      'Find the saved workflow called "Shout Line", start it as a background ' +
      'job with line = "ship it", and wait for the job to settle rather than ' +
      "polling by hand. Finish with {status: <the settled job's status>, " +
      "shout: <the shout output's plain string value — the uppercased line " +
      "itself, not JSON and not a status>}.",
    outputSchema: {
      type: "object",
      properties: { status: { type: "string" }, shout: { type: "string" } },
      required: ["status", "shout"]
    },
    createTools: createCoreApiTools,
    namespaces: ["workflows", "jobs"],
    expect: {
      requiredTools: ["list_workflows", "start_background_job", "get_job"],
      maxActions: 4,
      resultCheck: (r) => {
        const result = asObject(r);
        return (
          result["status"] === "completed" && result["shout"] === "SHIP IT"
        );
      },
      resultCheckLabel: 'status=completed, shout="SHIP IT"'
    }
  },
  {
    id: "api-batch-existing-workflow",
    description:
      "Run one saved workflow over several inputs with bounded fan-out",
    objective:
      'Find the saved workflow called "Shout Line" and run it once per line ' +
      'for "alpha", "beta" and "gamma", with bounded concurrency rather than ' +
      "one action per line. Finish with {shouts: [...]} holding each run's " +
      "shout output value — the uppercased lines themselves, not run " +
      "statuses — in the order the lines were listed.",
    outputSchema: {
      type: "object",
      properties: { shouts: { type: "array", items: { type: "string" } } },
      required: ["shouts"]
    },
    createTools: createCoreApiTools,
    namespaces: ["workflows"],
    expect: {
      requiredTools: ["list_workflows", "run_workflow"],
      maxActions: 4,
      minToolCalls: 4,
      resultCheck: (r) => {
        const shouts = asObject(r)["shouts"];
        return (
          Array.isArray(shouts) &&
          shouts.length === 3 &&
          shouts[0] === "ALPHA" &&
          shouts[1] === "BETA" &&
          shouts[2] === "GAMMA"
        );
      },
      resultCheckLabel: "shouts=[ALPHA, BETA, GAMMA]"
    }
  },
  {
    id: "api-interactive-escalation",
    description: "Answer an escalation from an interactive run",
    objective:
      'Run the saved workflow called "Greeting Builder" interactively with ' +
      'name = "Ada". It parks on a node that failed transiently and hands ' +
      "you an escalation: have that node tried again so the run finishes " +
      "with its real output. Finish with {greeting: <the run's greeting " +
      "output>, action: <the action you answered with>}.",
    outputSchema: {
      type: "object",
      properties: { greeting: { type: "string" }, action: { type: "string" } },
      required: ["greeting", "action"]
    },
    createTools: createCoreApiTools,
    namespaces: ["workflows"],
    expect: {
      requiredTools: ["run_workflow", "resolve_workflow_escalation"],
      maxActions: 4,
      resultCheck: (r) => {
        const result = asObject(r);
        return (
          result["greeting"] === "Ada, welcome aboard!" &&
          result["action"] === "retry"
        );
      },
      resultCheckLabel: 'greeting="Ada, welcome aboard!", action=retry'
    }
  },
  {
    id: "api-delegate-subtask",
    description: "Delegate a self-contained subtask to a sub-agent",
    objective:
      "You cannot do arithmetic yourself here: delegate it. Spawn a " +
      "sub-agent with a self-contained prompt asking for the sum of the " +
      "numbers 12, 30 and 5 (it sees none of this conversation), and finish " +
      "with {sum: <the number it comes back with>}.",
    outputSchema: {
      type: "object",
      properties: { sum: { type: "number" } },
      required: ["sum"]
    },
    createTools: createCoreApiTools,
    namespaces: ["agents"],
    expect: {
      requiredTools: ["run_subtask"],
      maxActions: 4,
      resultCheck: (r) => asObject(r)["sum"] === 47,
      resultCheckLabel: "sum=47"
    }
  },
  {
    id: "api-asset-round-trip",
    description: "Save an asset, find it again, read it back",
    objective:
      'Save a note asset named "run-notes.txt" whose content is exactly ' +
      '"fox: ok". Then find that asset again by searching for "run-notes" ' +
      "and read its content back. Finish with {asset_id: <the saved " +
      "asset's id>, content: <the text stored in the asset — the file body " +
      "you read back, not the asset record>}.",
    outputSchema: {
      type: "object",
      properties: { asset_id: { type: "string" }, content: { type: "string" } },
      required: ["asset_id", "content"]
    },
    createTools: createCoreApiTools,
    namespaces: ["assets"],
    expect: {
      requiredTools: ["save_asset", "read_asset"],
      maxActions: 4,
      resultCheck: (r) => {
        const result = asObject(r);
        return (
          result["content"] === "fox: ok" &&
          typeof result["asset_id"] === "string" &&
          result["asset_id"].startsWith("asset_")
        );
      },
      resultCheckLabel: 'content="fox: ok", asset_id=asset_*'
    }
  }
];
