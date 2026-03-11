#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tsRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(tsRoot, "..");
const defaultPythonRoots = [path.resolve(repoRoot, "..")];
const allowedTsOnlyNodeTypes = new Set(["nodetool.workflows.base_node.Preview"]);

function usage() {
  process.stdout.write(
    [
      "Usage: npm run metadata:diff -- [--mode emitted|raw] [--python-root /path/to/root ...] [--json] [--output report.json]",
      "",
      "Modes:",
      "  emitted  Compare registry-emitted TS metadata against Python metadata (default).",
      "  raw      Compare raw TS-generated metadata against Python metadata without Python backfill.",
      "",
      "Exit codes:",
      "  0  no mismatches",
      "  1  mismatches found",
      "  2  invalid arguments or setup failure",
    ].join("\n") + "\n"
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = {
    mode: "emitted",
    pythonRoots: [...defaultPythonRoots],
    json: false,
    output: null,
    help: false,
  };

  while (args.length > 0) {
    const token = args.shift();
    if (!token) break;

    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
    if (token === "--json") {
      parsed.json = true;
      continue;
    }
    if (token === "--mode") {
      const value = args.shift();
      if (value !== "emitted" && value !== "raw") {
        throw new Error("--mode must be 'emitted' or 'raw'");
      }
      parsed.mode = value;
      continue;
    }
    if (token === "--python-root") {
      const value = args.shift();
      if (!value) {
        throw new Error("--python-root requires a path");
      }
      if (
        parsed.pythonRoots.length === defaultPythonRoots.length &&
        parsed.pythonRoots.every((entry, index) => entry === defaultPythonRoots[index])
      ) {
        parsed.pythonRoots = [];
      }
      parsed.pythonRoots.push(path.resolve(value));
      continue;
    }
    if (token === "--output") {
      const value = args.shift();
      if (!value) {
        throw new Error("--output requires a file path");
      }
      parsed.output = path.resolve(value);
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return parsed;
}

function typeToString(typeMeta) {
  const args = (typeMeta?.type_args ?? []).map(typeToString).filter(Boolean);
  return args.length > 0 ? `${typeMeta.type}[${args.join(", ")}]` : typeMeta.type;
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortJson(nested)])
    );
  }
  return value;
}

function normalizeMetadata(metadata) {
  return {
    title: metadata.title,
    description: metadata.description,
    namespace: metadata.namespace,
    node_type: metadata.node_type,
    layout: metadata.layout ?? null,
    the_model_info: sortJson(metadata.the_model_info ?? null),
    recommended_models: sortJson(metadata.recommended_models ?? []),
    basic_fields: metadata.basic_fields ?? [],
    required_settings: metadata.required_settings ?? [],
    is_dynamic: metadata.is_dynamic ?? false,
    is_streaming_output: metadata.is_streaming_output ?? false,
    expose_as_tool: metadata.expose_as_tool ?? false,
    supports_dynamic_outputs: metadata.supports_dynamic_outputs ?? false,
    model_packs: sortJson(metadata.model_packs ?? []),
    properties: (metadata.properties ?? []).map((property) => ({
      name: property.name,
      type: typeToString(property.type),
      default: sortJson(property.default),
      title: property.title ?? null,
      description: property.description ?? null,
      min: property.min ?? null,
      max: property.max ?? null,
      values: property.values ?? property.type?.values ?? null,
      required: property.required ?? false,
      json_schema_extra: sortJson(property.json_schema_extra ?? null),
    })),
    outputs: (metadata.outputs ?? []).map((output) => ({
      name: output.name,
      type: typeToString(output.type),
      stream: output.stream ?? false,
    })),
  };
}

async function loadBuiltModule(relativePath) {
  const abs = path.resolve(tsRoot, relativePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Built module not found: ${abs}. Run the workspace build first.`);
  }
  return import(pathToFileURL(abs).href);
}

function resolvePythonMetadata(loaded, nodeType) {
  return loaded.nodesByType.get(nodeType) ?? loaded.nodesByType.get(nodeType.endsWith("Node") ? nodeType.slice(0, -4) : nodeType);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exit(0);
  }

  const [{ NodeRegistry, getNodeMetadata }, { ALL_BASE_NODES, registerBaseNodes }] = await Promise.all([
    loadBuiltModule("packages/node-sdk/dist/index.js"),
    loadBuiltModule("packages/base-nodes/dist/index.js"),
  ]);

  const registry = new NodeRegistry({ strictMetadata: true });
  const loaded = registry.loadPythonMetadata({ roots: options.pythonRoots, maxDepth: 7 });
  registerBaseNodes(registry);

  const report = {
    mode: options.mode,
    pythonRoots: options.pythonRoots,
    files: loaded.files,
    pythonNodeCount: loaded.nodesByType.size,
    tsNodeCount: ALL_BASE_NODES.length,
    missingPython: [],
    allowedMissingPython: [],
    unexpectedMissingPython: [],
    mismatches: [],
  };

  for (const NodeClass of ALL_BASE_NODES) {
    const pythonMetadata = resolvePythonMetadata(loaded, NodeClass.nodeType);
    if (!pythonMetadata) {
      report.missingPython.push(NodeClass.nodeType);
      if (allowedTsOnlyNodeTypes.has(NodeClass.nodeType)) {
        report.allowedMissingPython.push(NodeClass.nodeType);
      } else {
        report.unexpectedMissingPython.push(NodeClass.nodeType);
      }
      continue;
    }

    const tsMetadata =
      options.mode === "raw"
        ? getNodeMetadata(NodeClass)
        : registry.getMetadata(NodeClass.nodeType);

    if (!tsMetadata) {
      report.mismatches.push({
        node_type: NodeClass.nodeType,
        reason: "missing_ts_metadata",
      });
      continue;
    }

    const normalizedTs = normalizeMetadata(tsMetadata);
    const normalizedPy = normalizeMetadata(pythonMetadata);
    if (JSON.stringify(normalizedTs) !== JSON.stringify(normalizedPy)) {
      report.mismatches.push({
        node_type: NodeClass.nodeType,
        ts: normalizedTs,
        python: normalizedPy,
      });
    }
  }

  report.summary = {
    missingPython: report.missingPython.length,
    allowedMissingPython: report.allowedMissingPython.length,
    unexpectedMissingPython: report.unexpectedMissingPython.length,
    mismatches: report.mismatches.length,
    compared: ALL_BASE_NODES.length - report.missingPython.length,
  };

  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `Mode: ${report.mode}`,
        `Python roots: ${report.pythonRoots.join(", ")}`,
        `Metadata files: ${report.files.length}`,
        `TS nodes: ${report.tsNodeCount}`,
        `Python nodes: ${report.pythonNodeCount}`,
        `Compared: ${report.summary.compared}`,
        `Missing Python: ${report.summary.missingPython}`,
        `Allowed TS-only: ${report.summary.allowedMissingPython}`,
        `Unexpected missing Python: ${report.summary.unexpectedMissingPython}`,
        `Mismatches: ${report.summary.mismatches}`,
      ].join("\n") + "\n"
    );

    if (report.missingPython.length > 0) {
      process.stdout.write(`\nTS-only nodes:\n${report.missingPython.map((nodeType) => `  ${nodeType}`).join("\n")}\n`);
    }

    if (report.mismatches.length > 0) {
      process.stdout.write(
        `\nMismatched nodes:\n${report.mismatches
          .slice(0, 50)
          .map((entry) => `  ${entry.node_type}`)
          .join("\n")}\n`
      );
    }

    if (options.output) {
      process.stdout.write(`\nReport written to ${options.output}\n`);
    }
  }

  process.exit(report.summary.unexpectedMissingPython > 0 || report.summary.mismatches > 0 ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
});
