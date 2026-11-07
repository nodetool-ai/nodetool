// Writes one default case per node in parity/inventory.json to
// parity/cases/generated/<module>.json.
//
//   node parity/generate-cases.mjs
//
// A default case is the node alone with its declared defaults, a constant
// node feeding each required input that a constant can carry, and an Output
// node on every declared output. Hand-written cases live in cases/hand/.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "cases", "generated");

/** Constant node type and value for a required input, or null when no constant fits. */
function constantFor(prop) {
  const base = prop.type.split("[")[0];
  if (prop.values?.length) return null;
  switch (base) {
    case "str":
    case "text":
      return { type: "nodetool.constant.String", value: "parity" };
    case "int":
      return { type: "nodetool.constant.Integer", value: Math.max(prop.min ?? 1, 1) };
    case "float":
      return { type: "nodetool.constant.Float", value: Math.max(prop.min ?? 0.5, 0.5) };
    case "bool":
      return { type: "nodetool.constant.Bool", value: true };
    case "list":
      return prop.type === "list[str]" || prop.type === "list"
        ? { type: "nodetool.constant.List", value: ["a", "b"] }
        : null;
    case "dict":
      return { type: "nodetool.constant.Dict", value: { a: 1 } };
    default:
      return null;
  }
}

export function defaultCase(node) {
  const nodes = [{ id: "n", type: node.type, properties: {} }];
  const stableNames = {
    "nodetool.image.SaveImageFile": { filename: "parity.png" },
    "nodetool.model3d.SaveModel3DFile": { filename: "parity.glb" },
    "nodetool.model3d.SaveModel3D": { name: "parity.glb" }
  };
  Object.assign(nodes[0].properties, stableNames[node.type]);
  const edges = [];
  for (const prop of node.properties) {
    if (!prop.required) continue;
    const c = constantFor(prop);
    if (!c) continue;
    const id = `in_${prop.name}`;
    nodes.push({ id, type: c.type, properties: { value: c.value } });
    edges.push({ id: `e_${id}`, source: id, sourceHandle: "output", target: "n", targetHandle: prop.name });
  }
  for (const output of node.outputs) {
    const id = `out_${output.name}`;
    nodes.push({ id, type: "nodetool.output.Output", properties: { name: output.name } });
    edges.push({ id: `e_${id}`, source: "n", sourceHandle: output.name, target: id, targetHandle: "value" });
  }
  return { id: `${node.type}#default`, node: node.type, graph: { nodes, edges } };
}

function slug(module) {
  return module.replace(/^@nodetool-ai\//, "").replace(/\//g, "__");
}

const inventory = JSON.parse(readFileSync(join(here, "inventory.json"), "utf8"));
const byModule = new Map();
for (const node of inventory) {
  if (!byModule.has(node.module)) byModule.set(node.module, []);
  byModule.get(node.module).push(defaultCase(node));
}
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
for (const [module, cases] of byModule) {
  writeFileSync(join(OUT_DIR, `${slug(module)}.json`), JSON.stringify({ module, cases }, null, 1) + "\n");
}
console.log(`${inventory.length} cases in ${byModule.size} files -> ${OUT_DIR}`);
