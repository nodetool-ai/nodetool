/**
 * Structural validation for every workflow example that ships in the repo.
 *
 * Covers two directories:
 *
 *   1. `packages/base-nodes/nodetool/examples/nodetool-base/*.json`
 *      — production templates surfaced in the UI.
 *   2. `examples/workflows/*.json`
 *      — small CLI samples that exercise the nodetool CLI runner.
 *
 * For each workflow we verify:
 *   - the JSON parses,
 *   - the graph has the expected shape (`graph.nodes`, `graph.edges`),
 *   - every node has a unique string `id` and string `type`,
 *   - every edge references nodes that exist via string handles,
 *   - every referenced node type is registered by `registerBaseNodes()` or
 *     appears in the static allowlist of types that legitimately live in
 *     sibling packages, are Python-only, or are stale references that the
 *     UI tolerates (annotations, removed/renamed nodes still in templates),
 *   - the registry's per-node validator does not flag any *non-model*
 *     required property as missing once connected edges are accounted for.
 *
 * Model fields (`*_model`) are *intentionally* shipped empty in many
 * templates — the user picks a model at runtime — so we drop those issues.
 *
 * No provider, network, or model call happens: nothing is executed.
 * Providers and other external services therefore stay un-touched.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Graph } from "@nodetool-ai/kernel";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_EXAMPLES_DIR = path.resolve(
  __dirname,
  "../nodetool/examples/nodetool-base"
);
const CLI_EXAMPLES_DIR = path.resolve(__dirname, "../../../examples/workflows");

/**
 * Node types referenced by example workflows that are NOT registered by
 * `registerBaseNodes()`. Grouped by reason so future maintainers know whether
 * the entry can be removed.
 */
const ALLOWED_UNREGISTERED_TYPES = new Set<string>([
  // ── 1. Sibling packages not loaded in base-nodes tests ─────────────────
  "anthropic.agents.ClaudeAgent",
  "kie.image.NanoBanana",
  "fal.text_to_image.NanoBanana2",
  "vector.chroma.HybridSearch",

  // ── 2. UI annotation node (no runtime behaviour) ───────────────────────
  "nodetool.workflows.base_node.Comment",

  // ── 3. Python-only nodes referenced by Python-era templates ────────────
  // (Listed individually so adding a TS port surfaces as a test failure.)
  "lib.http.GetRequest",
  "lib.http.GetRequestDocument",
  "lib.http.DownloadFiles",
  "lib.json.StringifyJSON",
  "lib.pymupdf.ExtractText",
  "nodetool.boolean.Compare",
  "nodetool.boolean.ConditionalSwitch",
  "nodetool.boolean.LogicalOperator",
  "nodetool.dictionary.SaveJSON",
  "search.amazon.AmazonSearch",
  "search.amazon.AmazonProduct",
  "search.bing.BingSearch",
  "search.duckduckgo.DuckDuckGoSearch",
  "search.google_extra.GoogleEvents",
  "search.google_extra.GoogleFlights",
  "search.google_extra.GoogleHotels",
  "search.scholar.GoogleScholar",
  "search.trends.GoogleTrends",
  "search.walmart.WalmartSearch",
  "search.walmart.WalmartProduct",
  "search.yelp.YelpSearch",
  "search.youtube.YouTubeSearch",
  // Python plugin namespaces only present when Python bridge runs.
  "lib.librosa.analysis.MFCC",
  "lib.pedalboard.Reverb",

  // ── 4. Stale `nodetool.lib.*` aliases that should be `lib.*` ───────────
  // (Templates haven't been re-saved since the namespace was flattened.)
  "nodetool.lib.image.draw.RenderText",
  "nodetool.lib.image.enhance.Brightness",
  "nodetool.lib.image.enhance.Contrast",

  // ── 5. Test-only input marker recognised by the kernel runner ──────────
  "test.Input"
]);

interface WorkflowFile {
  fileName: string;
  filePath: string;
  group: string;
  data: {
    name?: string;
    graph: {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };
  };
}

function loadWorkflowsFrom(dir: string, group: string): WorkflowFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((fileName) => {
      const filePath = path.join(dir, fileName);
      const raw = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(raw) as WorkflowFile["data"];
      return { fileName: `${group}/${fileName}`, filePath, group, data };
    });
}

const baseWorkflows = loadWorkflowsFrom(BASE_EXAMPLES_DIR, "nodetool-base");
const cliWorkflows = loadWorkflowsFrom(CLI_EXAMPLES_DIR, "examples/workflows");
const workflows = [...baseWorkflows, ...cliWorkflows];

const registry = new NodeRegistry();
registerBaseNodes(registry);
const registeredTypes = new Set(registry.list());
const resolver = createGraphNodeTypeResolver(registry);

function isKnownType(nodeType: string): boolean {
  return registeredTypes.has(nodeType) || ALLOWED_UNREGISTERED_TYPES.has(nodeType);
}

/** Drop issues that complain about empty `*_model` fields. Templates
 * intentionally ship without a selected model; the user picks one in the UI.
 */
function isModelSelectionIssue(message: string): boolean {
  return /requires a [a-z_]+_model to be selected/.test(message);
}

describe("example workflow inventory", () => {
  it("finds workflows in both example directories", () => {
    expect(baseWorkflows.length).toBeGreaterThan(0);
    expect(cliWorkflows.length).toBeGreaterThan(0);
  });

  it("registers a non-trivial set of node types via registerBaseNodes", () => {
    expect(registeredTypes.size).toBeGreaterThan(100);
  });

  it("does not double-list any allowlisted type that is actually registered", () => {
    const overlap = [...ALLOWED_UNREGISTERED_TYPES].filter((t) =>
      registeredTypes.has(t)
    );
    expect(
      overlap,
      `Remove from ALLOWED_UNREGISTERED_TYPES — these are now registered:\n  ${overlap.join("\n  ")}`
    ).toEqual([]);
  });
});

describe.each(workflows)("workflow $fileName", ({ data, fileName }) => {
  const nodes = data.graph?.nodes ?? [];
  const edges = data.graph?.edges ?? [];
  const nodeIds = new Set<string>(
    nodes
      .map((n) => (typeof n.id === "string" ? n.id : null))
      .filter((id): id is string => id != null)
  );

  it("has a graph with non-empty nodes/edges arrays", () => {
    expect(data.graph).toBeTypeOf("object");
    expect(Array.isArray(data.graph.nodes)).toBe(true);
    expect(Array.isArray(data.graph.edges)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);
  });

  it("every node has a unique string id and a string type", () => {
    const seen = new Set<string>();
    const issues: string[] = [];
    for (const node of nodes) {
      if (typeof node.id !== "string" || node.id.length === 0) {
        issues.push(`node missing id: ${JSON.stringify(node).slice(0, 80)}`);
        continue;
      }
      if (seen.has(node.id)) {
        issues.push(`duplicate node id: ${node.id}`);
      }
      seen.add(node.id);
      if (typeof node.type !== "string" || node.type.length === 0) {
        issues.push(`node ${node.id} missing type`);
      }
    }
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("every edge connects two existing nodes via string handles", () => {
    const issues: string[] = [];
    for (const edge of edges) {
      for (const field of [
        "source",
        "sourceHandle",
        "target",
        "targetHandle"
      ] as const) {
        const value = edge[field];
        if (typeof value !== "string" || value.length === 0) {
          issues.push(
            `edge missing ${field}: ${JSON.stringify(edge).slice(0, 80)}`
          );
        }
      }
      const source = edge.source as string | undefined;
      const target = edge.target as string | undefined;
      if (source && !nodeIds.has(source)) {
        issues.push(`edge source not found: ${source}`);
      }
      if (target && !nodeIds.has(target)) {
        issues.push(`edge target not found: ${target}`);
      }
    }
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("every referenced node type is registered or allowlisted", () => {
    const unknown: string[] = [];
    for (const node of nodes) {
      const type = node.type as string;
      if (!isKnownType(type)) {
        unknown.push(`${node.id}:${type}`);
      }
    }
    expect(
      unknown,
      `${fileName} references unknown node types — register them or add to ALLOWED_UNREGISTERED_TYPES:\n  ${unknown.join("\n  ")}`
    ).toEqual([]);
  });

  it("hydrates through Graph.loadFromDict with the registry resolver", async () => {
    // skipErrors: drops unknown-type nodes (which are tracked separately
    // above) rather than throwing; this exercises the same code path the
    // real runner uses when loading saved graphs.
    const graph = await Graph.loadFromDict(data.graph, {
      resolver,
      skipErrors: true,
      allowUndefinedProperties: true
    });
    const expectedSurvivors = nodes.filter((n) =>
      registeredTypes.has(n.type as string)
    ).length;
    expect(graph.nodes.length).toBe(expectedSurvivors);
  });

  it("required non-model properties are set or connected to an edge", () => {
    const connectedByNode = new Map<string, Set<string>>();
    for (const edge of edges) {
      const target = edge.target as string;
      const handle = edge.targetHandle as string;
      if (!target || !handle) continue;
      let set = connectedByNode.get(target);
      if (!set) {
        set = new Set();
        connectedByNode.set(target, set);
      }
      set.add(handle);
    }

    const issues: string[] = [];
    for (const node of nodes) {
      const type = node.type as string;
      if (!registeredTypes.has(type)) continue;

      // Mirror Graph.fromDict: prefer `properties`, fall back to `data`.
      const properties =
        (node.properties as Record<string, unknown> | undefined) ??
        (node.data as Record<string, unknown> | undefined) ??
        {};
      const connected = connectedByNode.get(node.id as string) ?? new Set();
      const found = registry
        .validateNode(
          {
            id: node.id as string,
            type,
            properties
          },
          connected
        )
        .filter((issue) => !isModelSelectionIssue(issue.message));
      for (const issue of found) {
        issues.push(
          `${node.id}(${type}).${issue.property}: ${issue.message}`
        );
      }
    }
    expect(
      issues,
      `${fileName} has unfilled required properties:\n  ${issues.join("\n  ")}`
    ).toEqual([]);
  });
});
