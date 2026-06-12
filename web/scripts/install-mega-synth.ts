/**
 * Install the Mega Synth demo workflow into the local NodeTool library.
 *
 * Builds the same graph the perf harness stress-tests with
 * (src/perf/megaSynthPatch.ts), laid out for the editor, and creates it via
 * the running backend. Open it in the editor and hit Run.
 *
 *   npx tsx web/scripts/install-mega-synth.ts [layers=1]
 *
 * layers=1 is the demo; higher values stack detuned copies of the whole
 * ensemble (8 ≈ super-ensemble, 24 ≈ ~1,100-node stress test).
 */
import { buildMegaSynthPatch } from "../src/perf/megaSynthPatch";

const API = process.env.NODETOOL_API_URL ?? "http://localhost:7777";
const layers = Math.max(1, Number(process.argv[2] ?? 1));

const { nodes, edges } = buildMegaSynthPatch(layers);

const workflowGraph = {
  nodes: nodes.map(({ id, type, properties, ui_properties }) => ({
    id,
    parent_id: null,
    type,
    data: properties,
    ui_properties,
    dynamic_properties: {},
    dynamic_outputs: {},
    sync_mode: "on_any"
  })),
  edges: edges.map((e) => ({ ...e, ui_properties: null }))
};

const res = await fetch(`${API}/trpc/workflows.create`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    json: {
      name: layers === 1 ? "Mega Synth" : `Mega Synth ×${layers}`,
      description:
        "Generative modular ensemble: bass, 4-step arp, detuned pad, S&H " +
        "sparkle lead, hat, kick and FM drone on shared clocks. " +
        `${layers} layer(s), ${nodes.length} nodes. ` +
        "Doubles as the realtime perf stress patch (PERF_PATCH=mega).",
      access: "private",
      graph: workflowGraph
    }
  })
});

if (!res.ok) {
  console.error("create failed:", res.status, await res.text());
  process.exit(1);
}
const workflow = (await res.json()).result.data.json;
console.log(
  `Mega Synth installed (${nodes.length} nodes, ${edges.length} edges, ` +
    `${layers} layer(s))\n→ http://localhost:3000/editor/${workflow.id}`
);
