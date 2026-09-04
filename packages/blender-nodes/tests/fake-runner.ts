/**
 * T6b runner seam: a `FakeBlenderRunner` implementing `BlenderRunner`.
 *
 * Records the `job` and `inputs` it receives so the node tests in the next
 * run can prove a node never reaches past the interface. The canned result
 * defaults to one zero-byte output per declared output with zeroed stats.
 */

import type {
  BlenderJob,
  BlenderRunOptions,
  BlenderRunner,
  BlenderRunResult
} from "../src/runner.js";

export interface FakeBlenderCall {
  job: BlenderJob;
  inputs: Record<string, Uint8Array>;
  options: BlenderRunOptions;
}

export class FakeBlenderRunner implements BlenderRunner {
  readonly kind = "local" as const;
  readonly calls: FakeBlenderCall[] = [];

  constructor(private readonly canned?: Partial<BlenderRunResult>) {}

  async run(
    job: BlenderJob,
    inputs: Record<string, Uint8Array>,
    options: BlenderRunOptions
  ): Promise<BlenderRunResult> {
    this.calls.push({ job, inputs, options });
    if (this.canned) {
      return {
        outputs: this.canned.outputs ?? defaultOutputs(job),
        stats: this.canned.stats ?? {
          blender_version: "4.5.0-test",
          render_seconds: 0
        },
        exitCode: this.canned.exitCode ?? 0
      };
    }
    return {
      outputs: defaultOutputs(job),
      stats: { blender_version: "4.5.0-test", render_seconds: 0 },
      exitCode: 0
    };
  }
}

function defaultOutputs(job: BlenderJob): Record<string, Uint8Array> {
  const outputs: Record<string, Uint8Array> = {};
  for (const name of Object.keys(job.outputs)) outputs[name] = new Uint8Array();
  return outputs;
}
