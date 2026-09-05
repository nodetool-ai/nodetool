/**
 * The thin function nodes call (D6).
 *
 * Validates every input and output file name with `jobFileNameSchema`,
 * refuses more than `MAX_OUTPUT_COUNT` declared outputs, builds the
 * `BlenderJob`, picks a runner (D7), and returns the runner's result. A node
 * never touches a runner.
 */

import { HostBinaryMissingError, withSpan } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { isCloudProfileActive } from "@nodetool-ai/protocol";

import { resolveBlenderBinary } from "./blender-binary.js";
import {
  jobFileNameSchema,
  BLENDER_JOB_VERSION,
  type BlenderJob,
  type BlenderOp
} from "./job.js";
import {
  BlenderJobError,
  LocalBlenderRunner,
  MAX_OUTPUT_COUNT,
  WorkerBlenderRunner,
  type BlenderRunner,
  type BlenderRunOptions,
  type BlenderRunResult
} from "./runner.js";

/** File name the model bytes are staged under. The extension selects import. */
export const BLENDER_MODEL_INPUT_FILE = "model.glb";

/**
 * Select the local tier when Blender resolves. Otherwise, an explicitly
 * configured worker is used only after its status advertises Blender.
 *
 * A configured worker is never silently replaced with local after a worker
 * connection or capability failure: the URL is an explicit deployment choice.
 */
export async function resolveBlenderRunner(
  blenderPath?: string | null,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<BlenderRunner> {
  if (testRunner) return testRunner;
  try {
    await (blenderBinaryResolverForTesting?.() ??
      resolveBlenderBinary({ configuredPath: blenderPath }));
    return new LocalBlenderRunner({ binaryPath: blenderPath ?? undefined });
  } catch (err) {
    if (!(err instanceof HostBinaryMissingError)) throw err;
  }
  const workerUrl = process.env["NODETOOL_WORKER_URL"]?.trim();
  if (!workerUrl) {
    return new LocalBlenderRunner({ binaryPath: blenderPath ?? undefined });
  }
  const runner = new WorkerBlenderRunner();
  await runner.assertAvailable(options);
  return runner;
}

let testRunner: BlenderRunner | null = null;
let blenderBinaryResolverForTesting: (() => Promise<void>) | null = null;

/**
 * Override `resolveBlenderRunner` for node tests (T6b), so every node test
 * runs against a fake and proves the node never reaches past the
 * `BlenderRunner` interface. Pass null to restore the local runner.
 */
export function __setBlenderRunnerForTesting(
  runner: BlenderRunner | null
): void {
  testRunner = runner;
}

/** Test seam for exercising D7 without depending on the host's Blender install. */
export function __setBlenderBinaryResolverForTesting(
  resolver: (() => Promise<void>) | null
): void {
  blenderBinaryResolverForTesting = resolver;
}

function engineOf(op: BlenderOp): string | undefined {
  const params = op.params as unknown as { engine?: unknown };
  return typeof params.engine === "string" ? params.engine : undefined;
}

export async function runBlenderJob(
  // The local runner stages through the workspace seam (D6 step 1): the
  // scratch parent comes from `context.workspace.scratchDir()`. Fakes in
  // node tests run without a context and never touch the filesystem.
  context: ProcessingContext | undefined,
  modelBytes: Uint8Array,
  op: BlenderOp,
  outputs: Record<string, string>,
  options: BlenderRunOptions
): Promise<BlenderRunResult> {
  if (modelBytes.length === 0) {
    throw new BlenderJobError("bad_job", "Blender model input is empty.");
  }
  const modelFile = jobFileNameSchema.safeParse(BLENDER_MODEL_INPUT_FILE);
  if (!modelFile.success) {
    throw new BlenderJobError(
      "bad_job",
      `Invalid Blender input file name "${BLENDER_MODEL_INPUT_FILE}".`
    );
  }
  const outputEntries = Object.entries(outputs);
  if (outputEntries.length > MAX_OUTPUT_COUNT) {
    throw new BlenderJobError(
      "bad_job",
      `Too many Blender outputs: ${outputEntries.length} declared, ` +
        `at most ${MAX_OUTPUT_COUNT} allowed.`
    );
  }
  for (const [name, file] of outputEntries) {
    if (!jobFileNameSchema.safeParse(file).success) {
      throw new BlenderJobError(
        "bad_job",
        `Invalid Blender output file name "${file}" for output "${name}".`
      );
    }
  }
  const job: BlenderJob = {
    version: BLENDER_JOB_VERSION,
    inputs: { model: BLENDER_MODEL_INPUT_FILE },
    outputs: { ...outputs },
    job: op
  };
  // A stored path is executable configuration. The hosted cloud profile must
  // never execute a user-supplied host path.
  const blenderPath =
    context &&
    !isCloudProfileActive(
      process.env["NODETOOL_NODE_PROFILE"],
      process.env["NODETOOL_ENV"]
    )
      ? await context.getSetting("BLENDER_PATH")
      : null;
  const runner = await resolveBlenderRunner(blenderPath, {
    signal: options.signal,
    timeoutMs: options.timeoutMs
  });
  const binary = await resolveBlenderBinary({ configuredPath: blenderPath }).catch(
    () => null
  );
  const engine = engineOf(op);
  // The local runner needs a real directory, which only the workspace can
  // give it (`scratchDir()` is the seam a cloud workspace implements). A
  // fake runner needs none, so a missing context only fails the local tier.
  let runOptions = options;
  if (runner instanceof LocalBlenderRunner) {
    const workspace = context?.workspace;
    if (!workspace) {
      throw new BlenderJobError(
        "bad_job",
        `Blender local render needs a processing context with a workspace.`
      );
    }
    runOptions = { ...options, scratchParent: await workspace.scratchDir() };
  }

  return withSpan(
    "blender.run",
    {
      "blender.version": binary?.version.join("."),
      "blender.op": op.op,
      "blender.engine": engine,
      "blender.runner": runner.kind
    },
    async (span) => {
      const result = await runner.run(job, { model: modelBytes }, runOptions);
      span?.setAttribute("blender.render_seconds", result.stats.render_seconds);
      if (result.exitCode !== undefined) {
        span?.setAttribute("blender.exit_code", result.exitCode);
      }
      if (result.queuedMs !== undefined) {
        span?.setAttribute("blender.queued_ms", result.queuedMs);
      }
      return result;
    }
  );
}
