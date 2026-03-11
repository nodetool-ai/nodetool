import { BaseNode } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

type LibCompatDescriptor = {
  nodeType: string;
  title: string;
  description: string;
};

const PYTHON_BRIDGE_SCRIPT = String.raw`
import asyncio
import base64
import dataclasses
import importlib
import json
import sys
from enum import Enum
from pathlib import Path

def to_json(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, bytes):
        return {"__bytes__": base64.b64encode(value).decode("ascii")}
    if isinstance(value, Enum):
        return value.value
    if dataclasses.is_dataclass(value):
        return {k: to_json(v) for k, v in dataclasses.asdict(value).items()}
    if isinstance(value, dict):
        return {str(k): to_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [to_json(v) for v in value]
    if hasattr(value, "model_dump") and callable(value.model_dump):
        return to_json(value.model_dump())
    if hasattr(value, "dict") and callable(value.dict):
        return to_json(value.dict())
    if hasattr(value, "__dict__") and not isinstance(value, type):
        return {k: to_json(v) for k, v in value.__dict__.items() if not k.startswith("_")}
    return str(value)

async def main():
    payload = json.loads(sys.stdin.read() or "{}")
    for p in payload.get("python_paths", []):
        if p and Path(p).exists() and p not in sys.path:
            sys.path.insert(0, p)

    node_type = payload["node_type"]
    module_path = "nodetool.nodes." + ".".join(node_type.split(".")[:-1])
    class_name = node_type.split(".")[-1]

    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)
    props = payload.get("props", {})

    from nodetool.workflows.processing_context import ProcessingContext
    context = ProcessingContext(user_id="ts-runtime", auth_token="")
    node = cls(**props)
    result = await node.process(context)

    sys.stdout.write(json.dumps({"ok": True, "result": to_json(result)}))

try:
    asyncio.run(main())
except Exception as exc:
    sys.stdout.write(json.dumps({"ok": False, "error": str(exc), "type": type(exc).__name__}))
`;

async function runPythonBridge(nodeType: string, props: Record<string, unknown>): Promise<unknown> {
  const candidates = [
    process.env.NODETOOL_BASE_SRC,
    process.env.NODETOOL_LIB_AUDIO_SRC,
    resolve(process.cwd(), "../nodetool-base/src"),
    resolve(process.cwd(), "../../nodetool-base/src"),
    resolve(process.cwd(), "../../../nodetool-base/src"),
    resolve(process.cwd(), "../nodetool-lib-audio/src"),
    resolve(process.cwd(), "../../nodetool-lib-audio/src"),
    resolve(process.cwd(), "../../../nodetool-lib-audio/src"),
    "/Users/mg/workspace/nodetool-base/src",
    "/Users/mg/workspace/nodetool-lib-audio/src",
  ].filter((p): p is string => Boolean(p));

  const pythonPaths = candidates.filter((p, i, arr) => arr.indexOf(p) === i && existsSync(p));

  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("python3", ["-c", PYTHON_BRIDGE_SCRIPT], {
      stdio: "pipe",
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", (err) => rejectPromise(err));
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`Python bridge failed for ${nodeType} (exit ${code}): ${stderr || stdout}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        if (!parsed.ok) {
          rejectPromise(new Error(`Python node ${nodeType} failed: ${String(parsed.error ?? "unknown error")}`));
          return;
        }
        resolvePromise(parsed.result);
      } catch (error) {
        rejectPromise(new Error(`Invalid Python bridge response for ${nodeType}: ${String(error)} :: ${stdout || stderr}`));
      }
    });

    child.stdin.write(JSON.stringify({ node_type: nodeType, props, python_paths: pythonPaths }));
    child.stdin.end();
  });
}

function createLibCompatNode(descriptor: LibCompatDescriptor): NodeClass {
  const LibCompatPythonNode = class extends BaseNode {
    static readonly nodeType = descriptor.nodeType;
    static readonly title = descriptor.title;
    static readonly description = descriptor.description;

    async process(
      inputs: Record<string, unknown>,
      _context?: ProcessingContext
    ): Promise<Record<string, unknown>> {
      const props = { ...this.serialize(), ...inputs };
      delete (props as Record<string, unknown>).__node_id;
      delete (props as Record<string, unknown>).__node_name;
      const result = await runPythonBridge(descriptor.nodeType, props);
      if (result && typeof result === "object" && !Array.isArray(result)) {
        return result as Record<string, unknown>;
      }
      return { output: result };
    }
  };

  return LibCompatPythonNode as NodeClass;
}

const LIB_COMPAT_DESCRIPTORS: readonly LibCompatDescriptor[] = [];

export const LIB_COMPAT_PY_NODES: readonly NodeClass[] = LIB_COMPAT_DESCRIPTORS.map((d) =>
  createLibCompatNode(d)
);
