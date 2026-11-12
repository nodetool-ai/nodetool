// Inventory of the base node library: every class in ALL_BASE_NODES with the
// module that defines it and the metadata the parity cases are built from.
//
//   node parity/inventory.mjs [outfile]     (default: parity/inventory.json)
//
// run.mjs calls this inside its sandbox. It imports node classes only and runs
// no node code.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ALL_BASE_NODES } from "@nodetool-ai/base-nodes";
import { hasStreamingOutput, NodeRegistry } from "@nodetool-ai/node-sdk";
import { baseNodeModules } from "./modules.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function typeString(t) {
  if (!t) return "any";
  const args = (t.type_args ?? []).map(typeString);
  return args.length > 0 ? `${t.type}[${args.join(", ")}]` : t.type;
}

export async function buildInventory() {
  const modules = baseNodeModules();
  const owner = new Map();
  for (const spec of modules) {
    const mod = await import(spec);
    // Some modules export a class only through their *_NODES list.
    for (const [exportName, value] of Object.entries(mod)) {
      const found = Array.isArray(value)
        ? value.map((v, i) => [v, `${exportName}[${i}]`])
        : [[value, exportName]];
      for (const [cls, name] of found) {
        if (typeof cls !== "function" || typeof cls.nodeType !== "string") continue;
        const named = owner.get(cls);
        if (!named || (named.module === spec && named.export.includes("[") && !name.includes("["))) {
          owner.set(cls, { module: spec, export: name });
        }
      }
    }
  }

  const registry = new NodeRegistry();
  for (const cls of ALL_BASE_NODES) registry.register(cls);

  return ALL_BASE_NODES.map((cls) => {
    const where = owner.get(cls);
    if (!where) throw new Error(`${cls.nodeType}: no module in base-nodes exports this class`);
    const md = registry.resolveMetadata(cls.nodeType);
    return {
      type: cls.nodeType,
      class: where.export,
      package: where.module.split("/").slice(0, 2).join("/"),
      module: where.module,
      title: md.title,
      platforms: cls.platforms ?? ["node"],
      input_mode: cls.inputMode ?? null,
      is_streaming_input: cls.isStreamingInput === true,
      is_streaming_output: hasStreamingOutput(cls),
      has_run: typeof cls.prototype.run === "function",
      is_trigger: cls.isTrigger === true,
      is_controlled: cls.isControlled === true,
      supports_dynamic_inputs: md.supports_dynamic_inputs === true,
      supports_dynamic_outputs: md.supports_dynamic_outputs === true,
      required_settings: md.required_settings ?? [],
      required_runtimes: cls.requiredRuntimes ?? [],
      requires_gpu: cls.requiresGpu === true,
      effect: md.effect ?? null,
      properties: (md.properties ?? []).map((p) => ({
        name: p.name,
        type: typeString(p.type),
        default: p.default ?? null,
        required: p.required === true,
        ...(p.values?.length ? { values: p.values } : p.type?.values?.length ? { values: p.type.values } : {}),
        ...(p.min != null ? { min: p.min } : {}),
        ...(p.max != null ? { max: p.max } : {})
      })),
      outputs: (md.outputs ?? []).map((o) => ({
        name: o.name,
        type: typeString(o.type),
        stream: o.stream === true
      }))
    };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outfile = process.argv[2] ?? join(here, "inventory.json");
  const inventory = await buildInventory();
  writeFileSync(outfile, JSON.stringify(inventory, null, 1) + "\n");
  console.log(`${inventory.length} nodes -> ${outfile}`);
  process.exit(0);
}
