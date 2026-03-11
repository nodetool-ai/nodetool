#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tsRoot = path.resolve(scriptDir, "..");

function usage() {
  process.stdout.write(
    [
      "Usage: npm run workflow -- <workflow.json> [--input key=value ...] [--inputs-json '{...}'] [--params-file file.json] [--json] [--show-messages]",
      "",
      "Accepted file shapes:",
      "  1) { \"nodes\": [...], \"edges\": [...] }",
      "  2) { \"graph\": { \"nodes\": [...], \"edges\": [...] }, \"params\": {...} }",
      "  3) RunJobRequest-like object with top-level \"graph\" and optional \"params\"",
      "",
      "Input sources (merged in this order):",
      "  file params < --params-file < --inputs-json < --input key=value",
      "",
      "Examples:",
      "  npm run build",
      "  npm run workflow -- ./workflow.json",
      "  npm run workflow -- ./workflow.json --input text='hello'",
      "  npm run workflow -- ./workflow.json --input condition=true --input payload='{\"x\":1}'",
      "  npm run workflow -- ./workflow.json --inputs-json '{\"a\":1,\"b\":2}'",
      "  npm run workflow -- ./workflow.json --params-file ./params.json --show-messages",
      "  npm run workflow -- ./request.json --json",
    ].join("\n") + "\n"
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const result = {
    workflowPath: "",
    showMessages: false,
    jsonOnly: false,
    inputPairs: [],
    inputsJson: null,
    paramsFile: null,
  };

  while (args.length > 0) {
    const token = args.shift();
    if (!token) break;

    if (token === "--help" || token === "-h") {
      result.help = true;
      continue;
    }
    if (token === "--show-messages") {
      result.showMessages = true;
      continue;
    }
    if (token === "--json") {
      result.jsonOnly = true;
      continue;
    }
    if (token === "--input" || token === "--set") {
      const raw = args.shift();
      if (!raw || raw.startsWith("-")) {
        throw new Error(`${token} requires key=value`);
      }
      result.inputPairs.push(raw);
      continue;
    }
    if (token === "--inputs-json") {
      const raw = args.shift();
      if (!raw || raw.startsWith("-")) {
        throw new Error("--inputs-json requires a JSON object");
      }
      result.inputsJson = raw;
      continue;
    }
    if (token === "--params-file") {
      const raw = args.shift();
      if (!raw || raw.startsWith("-")) {
        throw new Error("--params-file requires a file path");
      }
      result.paramsFile = raw;
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }

    if (!result.workflowPath) {
      result.workflowPath = token;
    } else {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
  }

  return result;
}

function parseValue(raw) {
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) return "";

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function setByPath(target, dottedKey, value) {
  const parts = dottedKey.split(".").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid input key: '${dottedKey}'`);
  }

  let ref = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const next = ref[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      ref[key] = {};
    }
    ref = ref[key];
  }
  ref[parts[parts.length - 1]] = value;
}

function parsePairs(pairs) {
  const out = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Invalid --input value '${pair}', expected key=value`);
    }
    const key = pair.slice(0, eq).trim();
    const raw = pair.slice(eq + 1);
    setByPath(out, key, parseValue(raw));
  }
  return out;
}

function readJsonObjectFile(filePath, label) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`${label} not found: ${abs}`);
  }
  const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

function loadWorkflowFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Workflow file not found: ${abs}`);
  }

  const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  const graph = parsed.graph ?? parsed;
  if (!graph || typeof graph !== "object") {
    throw new Error("Invalid workflow JSON: missing graph object");
  }
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("Invalid workflow JSON: graph must contain arrays 'nodes' and 'edges'");
  }

  return {
    workflowPath: abs,
    graph,
    params: parsed.params && typeof parsed.params === "object" ? parsed.params : {},
    workflowId:
      typeof parsed.workflow_id === "string"
        ? parsed.workflow_id
        : typeof parsed.workflowId === "string"
          ? parsed.workflowId
          : null,
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help || !parsed.workflowPath) {
    usage();
    process.exit(parsed.help ? 0 : 1);
  }

  const { graph, params, workflowPath, workflowId } = loadWorkflowFile(parsed.workflowPath);
  const extraFromFile = parsed.paramsFile
    ? readJsonObjectFile(parsed.paramsFile, "Params file")
    : {};
  const extraFromJson = parsed.inputsJson
    ? (() => {
        const obj = JSON.parse(parsed.inputsJson);
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
          throw new Error("--inputs-json must be a JSON object");
        }
        return obj;
      })()
    : {};
  const extraFromPairs = parsePairs(parsed.inputPairs);
  const resolvedParams = {
    ...params,
    ...extraFromFile,
    ...extraFromJson,
    ...extraFromPairs,
  };

  let WorkflowRunner;
  let NodeRegistry;
  let registerBaseNodes;
  let ProcessingContext;
  let OpenAIProvider;
  let AnthropicProvider;
  let OllamaProvider;
  let LlamaProvider;
  try {
    const kernelPath = path.resolve(tsRoot, "packages/kernel/dist/index.js");
    const nodeSdkPath = path.resolve(tsRoot, "packages/node-sdk/dist/index.js");
    const baseNodesPath = path.resolve(tsRoot, "packages/base-nodes/dist/index.js");
    const runtimePath = path.resolve(tsRoot, "packages/runtime/dist/index.js");

    ({ WorkflowRunner } = await import(pathToFileURL(kernelPath).href));
    ({ NodeRegistry } = await import(pathToFileURL(nodeSdkPath).href));
    ({ registerBaseNodes } = await import(pathToFileURL(baseNodesPath).href));
    ({
      ProcessingContext,
      OpenAIProvider,
      AnthropicProvider,
      OllamaProvider,
      LlamaProvider,
    } = await import(pathToFileURL(runtimePath).href));
  } catch (err) {
    throw new Error(
      `Failed to load TS packages. Run 'npm run build' in ${tsRoot} first.\n${String(err)}`
    );
  }

  const jobId = `job-${Date.now()}`;
  const registry = new NodeRegistry();
  registerBaseNodes(registry);

  const context = new ProcessingContext({
    jobId,
    workflowId: workflowId ?? null,
  });

  const providerCache = new Map();
  context.setProviderResolver(async (providerId) => {
    if (providerCache.has(providerId)) {
      return providerCache.get(providerId);
    }

    let provider;
    if (providerId === "openai") {
      provider = new OpenAIProvider({
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      });
    } else if (providerId === "anthropic") {
      provider = new AnthropicProvider({
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      });
    } else if (providerId === "ollama") {
      provider = new OllamaProvider({
        OLLAMA_API_URL: process.env.OLLAMA_API_URL,
      });
    } else if (providerId === "llama_cpp") {
      provider = new LlamaProvider({
        LLAMA_CPP_URL: process.env.LLAMA_CPP_URL,
      });
    } else {
      throw new Error(`Unsupported provider '${providerId}'`);
    }

    providerCache.set(providerId, provider);
    return provider;
  });

  const runner = new WorkflowRunner(jobId, {
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        throw new Error(`Unknown node type: ${node.type}`);
      }
      return registry.resolve(node);
    },
    executionContext: context,
  });

  const result = await runner.run(
    {
      job_id: jobId,
      workflow_id: workflowId,
      params: resolvedParams,
    },
    {
      nodes: graph.nodes,
      edges: graph.edges,
    }
  );

  if (parsed.jsonOnly) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const summary = {
      workflowPath,
      status: result.status,
      params: resolvedParams,
      outputs: result.outputs,
      outputKeys: Object.keys(result.outputs),
      outputCounts: Object.fromEntries(
        Object.entries(result.outputs).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
      ),
      error: result.error ?? null,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (parsed.showMessages) {
      process.stdout.write(`\nMessages:\n${JSON.stringify(result.messages, null, 2)}\n`);
    }
  }

  process.exit(result.status === "completed" ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
