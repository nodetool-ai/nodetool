import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { graph as graphSchema } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type {
  NodeMetadata,
  PropertyTypeMetadata,
  Property
} from "@nodetool-ai/protocol";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const python = join(root, "native/workflow/.venv/bin/python");
const compiler = join(root, "native/workflow/build_tool.py");
const runtime = join(root, "build/native-workflow/nodetool-workflow");
export const tensorSchema = z
  .object({
    shape: z.array(z.number().int().positive()).max(8),
    values: z.array(z.number().finite()).max(1_000_000)
  })
  .strict()
  .refine(
    (tensor) =>
      tensor.shape.reduce((a, b) => a * b, 1) === tensor.values.length,
    "Tensor values must match shape"
  );
export const tensorsSchema = z.record(z.string().min(1), tensorSchema);
export const outputTensorsSchema = z.record(
  z.string(),
  z.object({
    shape: z.array(z.number().int()),
    values: z.array(z.union([z.number(), z.string()]))
  })
);
let targetsCache:
  | { expires: number; pending: Promise<Array<"cpu" | "cuda">> }
  | undefined;
export function torchTargets(): Promise<Array<"cpu" | "cuda">> {
  if (!targetsCache || targetsCache.expires < Date.now()) {
    targetsCache = {
      expires: Date.now() + 30_000,
      pending: probeTorchTargets()
    };
  }
  return targetsCache.pending;
}
async function probeTorchTargets(): Promise<Array<"cpu" | "cuda">> {
  const result = z
    .object({ targets: z.array(z.enum(["cpu", "cuda"])) })
    .parse(
      JSON.parse(
        await runTorchProcess(
          python,
          [compiler, "capabilities"],
          AbortSignal.timeout(30_000)
        )
      )
    );
  return result.targets;
}
export async function torchInstalled(): Promise<boolean> {
  try {
    await Promise.all([access(python), access(compiler), access(runtime)]);
    return true;
  } catch {
    return false;
  }
}

export async function runTorchProcess(
  command: string,
  args: string[],
  signal: AbortSignal
): Promise<string> {
  return trace
    .getTracer("nodetool.torch")
    .startActiveSpan("torch.subprocess", async (span) => {
      span.setAttribute(
        "process.executable.name",
        command === python ? "python" : "nodetool-workflow"
      );
      try {
        return await new Promise<string>((resolveResult, reject) => {
          const child = spawn(command, args, {
            cwd: root,
            detached: process.platform !== "win32",
            env: {
              ...process.env,
              CUDA_HOME: process.env["CUDA_HOME"] ?? join(root, "build/cuda")
            },
            stdio: ["ignore", "pipe", "pipe"]
          });
          let stdout = "";
          let stderr = "";
          let failure: Error | undefined;
          let killTimer: ReturnType<typeof setTimeout> | undefined;
          const killTree = (force: boolean): void => {
            if (process.platform !== "win32" && child.pid) {
              try {
                process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
              } catch (error) {
                if (
                  !(
                    error instanceof Error &&
                    "code" in error &&
                    error.code === "ESRCH"
                  )
                ) {
                  child.kill(force ? "SIGKILL" : "SIGTERM");
                }
              }
            } else {
              child.kill(force ? "SIGKILL" : "SIGTERM");
            }
          };
          const stop = (): void => {
            killTree(false);
            killTimer ??= setTimeout(() => killTree(true), 1000);
          };
          const abort = (): void => {
            failure = new Error("Torch operation cancelled or timed out");
            stop();
          };
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) {
            abort();
          }
          child.stdout.on("data", (chunk: Buffer) => {
            if (failure) {
              return;
            }
            stdout += chunk.toString();
            if (stdout.length > 32_000_000) {
              failure = new Error("Torch output exceeded the size limit");
              stop();
            }
          });
          child.stderr.on("data", (chunk: Buffer) => {
            stderr = (stderr + chunk.toString()).slice(-16_000);
          });
          child.on("error", (error) => {
            failure = error;
          });
          child.on("close", (code) => {
            signal.removeEventListener("abort", abort);
            if (failure) {
              killTree(true);
            }
            if (killTimer) {
              clearTimeout(killTimer);
            }
            if (failure) {
              reject(failure);
            } else if (code === 0) {
              resolveResult(stdout);
            } else {
              reject(new Error(stderr || `Torch process exited with ${code}`));
            }
          });
        });
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
}

const rawCatalogSchema = z.object({
  nodes: z.array(
    z.object({
      type: z.string(),
      inputs: z.array(z.object({ name: z.string(), type: z.string() })),
      outputs: z.array(z.object({ name: z.string(), type: z.string() })),
      properties: z.record(
        z.string(),
        z.object({
          type: z.string(),
          required: z.boolean(),
          default: z.unknown()
        })
      )
    })
  ),
  templates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      exampleInputs: tensorsSchema,
      graph: graphSchema,
      settings: z.object({
        execution: z.object({ kind: z.literal("torch"), version: z.literal(1) })
      })
    })
  )
});
function propertyType(type: string): PropertyTypeMetadata {
  if (["float32", "OIHW", "constant_or_replicate"].includes(type)) {
    return {
      type: "enum",
      optional: false,
      type_args: [],
      values:
        type === "constant_or_replicate" ? ["constant", "replicate"] : [type]
    };
  }
  if (
    type.includes("array") ||
    type.includes("pair") ||
    type === "permutation"
  ) {
    return {
      type: "list",
      optional: false,
      type_args: [
        {
          type: type === "finite_float32_array" ? "float" : "int",
          optional: false,
          type_args: []
        }
      ]
    };
  }
  return {
    type:
      type === "string" ? "str" : type === "positive_integer" ? "int" : "float",
    optional: false,
    type_args: []
  };
}
type TorchCatalog = {
  nodes: NodeMetadata[];
  templates: z.infer<typeof rawCatalogSchema>["templates"];
};
let catalogCache: Promise<TorchCatalog> | undefined;
export function torchCatalog(): Promise<TorchCatalog> {
  catalogCache ??= loadTorchCatalog().catch((error: unknown) => {
    catalogCache = undefined;
    throw error;
  });
  return catalogCache;
}
async function loadTorchCatalog(): Promise<TorchCatalog> {
  const catalog = rawCatalogSchema.parse(
    JSON.parse(
      await runTorchProcess(
        python,
        [compiler, "catalog"],
        AbortSignal.timeout(30_000)
      )
    )
  );
  return {
    ...catalog,
    nodes: catalog.nodes.map((node) => ({
      node_type: node.type,
      title: node.type.split(".").at(-1) ?? node.type,
      description: "Fixed-shape Torch tensor operation",
      namespace: "nodetool.torch",
      layout: "default",
      properties: [
        ...node.inputs.map((port) => ({
          name: port.name,
          type: { type: "tensor", optional: false, type_args: [] },
          required: true
        })),
        ...Object.entries(node.properties).map(([name, spec]) => {
          const property: Property = {
            name,
            type: propertyType(spec.type),
            required: spec.required,
            default: spec.default
          };
          if (
            spec.type.includes("array") ||
            spec.type.includes("pair") ||
            spec.type === "permutation"
          ) {
            property.json_schema_extra = { type: "torch_json" };
          }
          return property;
        })
      ],
      outputs: node.outputs.map((port) => ({
        name: port.name,
        type: { type: "tensor", optional: false, type_args: [] },
        stream: false
      })),
      recommended_models: [],
      required_settings: [],
      supports_dynamic_inputs: false,
      supports_dynamic_outputs: false,
      is_streaming_output: false,
      input_fields: node.inputs.map((port) => port.name),
      inline_fields: Object.keys(node.properties),
      effect: "pure"
    }))
  };
}

export async function executeTorch(
  document: Record<string, unknown>,
  target: "cpu" | "cuda",
  action: "compile" | "run",
  inputs: z.infer<typeof tensorsSchema>,
  stage: (value: string) => Promise<void>,
  cancellation: AbortSignal
): Promise<{
  manifest: Record<string, unknown>;
  outputs: z.infer<typeof outputTensorsSchema> | null;
}> {
  const folder = await mkdtemp(join(tmpdir(), "nodetool-torch-"));
  const signal = AbortSignal.any([
    cancellation,
    AbortSignal.timeout(15 * 60_000)
  ]);
  try {
    const graph = join(folder, "graph.json");
    const artifact = join(folder, "artifact");
    await writeFile(graph, JSON.stringify(document));
    await stage("Compiling with strict Torch export and AOTInductor");
    await runTorchProcess(
      python,
      [
        compiler,
        "compile",
        graph,
        "--bounded-local",
        "--target",
        target,
        "--output",
        artifact
      ],
      signal
    );
    const manifest = z
      .record(z.string(), z.unknown())
      .parse(
        JSON.parse(await readFile(join(artifact, "manifest.json"), "utf8"))
      );
    if (action === "compile") {
      return { manifest, outputs: null };
    }
    await stage("Running compiled tensors in C++");
    const inputPath = join(folder, "inputs.json");
    const outputPath = join(folder, "outputs.json");
    await writeFile(inputPath, JSON.stringify(inputs));
    await runTorchProcess(
      runtime,
      [
        "run",
        join(artifact, "package.pt2"),
        join(artifact, "manifest.json"),
        inputPath,
        outputPath
      ],
      signal
    );
    return {
      manifest,
      outputs: outputTensorsSchema.parse(
        JSON.parse(await readFile(outputPath, "utf8"))
      )
    };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
