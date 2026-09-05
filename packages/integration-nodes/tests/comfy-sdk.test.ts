import { describe, it, expect } from "vitest";
import { QueueFull, WorkflowFormatUi, InsufficientCredits } from "@comfyorg/sdk";
import {
  runComfyWorkflow,
  type ComfyJob,
  type ComfyJobError,
  type ComfyOutput,
  type ComfyPrompt,
  type ComfyRunEvent,
  type ComfyTransport
} from "@nodetool-ai/integration-nodes";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const prompt: ComfyPrompt = {
  "3": { class_type: "KSampler", inputs: { seed: 1, steps: 20 } },
  "5": { class_type: "LoadImage", inputs: { image: "" } },
  "9": { class_type: "SaveImage", inputs: { images: ["8", 0] } }
};

/** A 1x1 PNG header — enough bytes to be a distinguishable payload. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fakeOutput(
  overrides: Partial<ComfyOutput> & { bytes?: Uint8Array } = {}
): ComfyOutput {
  const bytes = overrides.bytes ?? PNG;
  return {
    nodeId: overrides.nodeId ?? "9",
    name: overrides.name ?? "ComfyUI_00001_.png",
    id: overrides.id ?? "asset-1",
    type: overrides.type ?? "image",
    contentType: overrides.contentType ?? "image/png",
    sizeBytes: overrides.sizeBytes ?? bytes.length,
    toBytes: async () => bytes
  };
}

class FakeJob implements ComfyJob {
  readonly id = "job-1";
  cancelCalls = 0;
  refreshCalls = 0;
  private statusValue: string;

  constructor(
    private readonly script: ComfyRunEvent[],
    private readonly finalStatus: string = "succeeded",
    public readonly error: ComfyJobError | null = null,
    private readonly finalOutputs: ComfyOutput[] = []
  ) {
    this.statusValue = "queued";
  }

  get status(): string {
    return this.statusValue;
  }

  get outputs(): ComfyOutput[] {
    return this.finalOutputs;
  }

  async *events(signal?: AbortSignal): AsyncGenerator<ComfyRunEvent, void, void> {
    for (const event of this.script) {
      if (signal?.aborted) {
        const aborted = new Error("aborted");
        aborted.name = "AbortError";
        throw aborted;
      }
      yield event;
    }
  }

  async refresh(): Promise<this> {
    this.refreshCalls += 1;
    this.statusValue = this.finalStatus;
    return this;
  }

  async cancel(): Promise<this> {
    this.cancelCalls += 1;
    return this;
  }
}

interface FakeTransport extends ComfyTransport {
  readonly uploads: Array<{ filename: string; contentType: string; bytes: Uint8Array }>;
  readonly submitted: ComfyPrompt[];
  readonly job: FakeJob;
}

function makeTransport(job: FakeJob, submitError?: unknown): FakeTransport {
  const uploads: FakeTransport["uploads"] = [];
  const submitted: ComfyPrompt[] = [];
  return {
    uploads,
    submitted,
    job,
    async submit(graph) {
      if (submitError) throw submitError;
      submitted.push(graph);
      return job;
    },
    assetFromBytes(bytes, filename, contentType) {
      uploads.push({ bytes, filename, contentType });
      return { __asset: filename };
    }
  };
}

interface Logged {
  content: string;
  severity: string;
}

function makeContext(): {
  context: ProcessingContext;
  logs: Logged[];
  progress: Array<{ progress: number; total: number }>;
} {
  const logs: Logged[] = [];
  const progress: Array<{ progress: number; total: number }> = [];
  const context = {
    postMessage(msg: Record<string, unknown>) {
      if (msg.type === "log_update") {
        logs.push({
          content: String(msg.content),
          severity: String(msg.severity)
        });
      }
      if (msg.type === "node_progress") {
        progress.push({
          progress: Number(msg.progress),
          total: Number(msg.total)
        });
      }
    }
  } as unknown as ProcessingContext;
  return { context, logs, progress };
}

function run(
  transport: ComfyTransport,
  dynamicProps: Array<[string, unknown]> = [],
  overrides: {
    signal?: AbortSignal;
    context?: ProcessingContext;
    previews?: boolean;
  } = {}
) {
  return runComfyWorkflow(transport, prompt, dynamicProps, {
    signal: overrides.signal ?? new AbortController().signal,
    nodeId: "node-1",
    nodeName: "Run ComfyUI Workflow (Comfy Cloud)",
    context: overrides.context,
    previews: overrides.previews
  });
}

async function drain(
  gen: AsyncGenerator<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const frames: Array<Record<string, unknown>> = [];
  for await (const frame of gen) frames.push(frame);
  return frames;
}

const succeeded: ComfyRunEvent = {
  kind: "statusChange",
  status: "succeeded",
  queuePosition: null
};

describe("runComfyWorkflow — input injection", () => {
  it("writes a scalar dynamic input into the cloned prompt without mutating the source", async () => {
    const transport = makeTransport(new FakeJob([succeeded]));
    await drain(run(transport, [["3:seed", 42]]));

    expect(transport.submitted[0]["3"].inputs.seed).toBe(42);
    expect(prompt["3"].inputs.seed).toBe(1);
  });

  it("uploads a media ref and writes the asset handle into the prompt", async () => {
    const transport = makeTransport(new FakeJob([succeeded]));
    await drain(
      run(transport, [
        [
          "5:image",
          { type: "image", uri: "", data: Buffer.from(PNG).toString("base64") }
        ]
      ])
    );

    expect(transport.uploads).toHaveLength(1);
    expect(transport.uploads[0]).toMatchObject({
      filename: "nodetool_5_image.png",
      contentType: "image/png"
    });
    expect(transport.uploads[0].bytes).toEqual(PNG);
    expect(transport.submitted[0]["5"].inputs.image).toEqual({
      __asset: "nodetool_5_image.png"
    });
  });

  it("skips a handle that names an unknown node, and null values", async () => {
    const transport = makeTransport(new FakeJob([succeeded]));
    await drain(
      run(transport, [
        ["77:seed", 5],
        ["3:steps", null],
        ["nocolon", 1]
      ])
    );

    expect(transport.submitted[0]["3"].inputs.steps).toBe(20);
    expect(transport.submitted[0]["77"]).toBeUndefined();
  });
});

describe("runComfyWorkflow — outputs", () => {
  it("yields one frame per output in arrival order, keyed <node>:<kind>", async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const job = new FakeJob(
      [
        { kind: "outputReady", output: fakeOutput({ nodeId: "9" }) },
        {
          kind: "outputReady",
          output: fakeOutput({
            nodeId: "12",
            type: "audio",
            contentType: "audio/wav",
            bytes: audio
          })
        },
        succeeded
      ],
      "succeeded",
      null,
      [fakeOutput({ nodeId: "9" })]
    );
    const frames = await drain(run(makeTransport(job)));

    expect(Object.keys(frames[0])).toEqual(["9:image"]);
    expect(frames[0]["9:image"]).toEqual({
      type: "image",
      uri: "",
      data: Buffer.from(PNG).toString("base64"),
      mimeType: "image/png"
    });
    expect(Object.keys(frames[1])).toEqual(["12:audio"]);
    expect(frames[1]["12:audio"]).toMatchObject({
      type: "audio",
      mimeType: "audio/wav",
      data: Buffer.from(audio).toString("base64")
    });
    expect(frames[2]).toEqual({
      output: {
        job_id: "job-1",
        status: "succeeded",
        outputs: [
          {
            node_id: "9",
            name: "ComfyUI_00001_.png",
            type: "image",
            content_type: "image/png",
            size_bytes: PNG.length,
            asset_id: "asset-1"
          }
        ]
      }
    });
  });

  it("decodes a text output to a string and routes file outputs to a document ref", async () => {
    const job = new FakeJob([
      {
        kind: "outputReady",
        output: fakeOutput({
          nodeId: "20",
          type: "text",
          contentType: "text/plain",
          bytes: new Uint8Array(Buffer.from("hello", "utf-8"))
        })
      },
      {
        kind: "outputReady",
        output: fakeOutput({
          nodeId: "21",
          type: "file",
          contentType: "application/zip",
          bytes: new Uint8Array([9])
        })
      },
      succeeded
    ]);
    const frames = await drain(run(makeTransport(job)));

    expect(frames[0]).toEqual({ "20:text": "hello" });
    expect(frames[1]["21:file"]).toMatchObject({
      type: "document",
      mimeType: "application/zip"
    });
  });
});

describe("runComfyWorkflow — events", () => {
  it("maps progress to node_progress, preferring sampler steps", async () => {
    const { context, progress } = makeContext();
    const job = new FakeJob([
      {
        kind: "progress",
        value: 0.5,
        message: null,
        nodesDone: 1,
        nodesTotal: 4,
        currentNode: "3",
        step: 7,
        steps: 20
      },
      {
        kind: "progress",
        value: 0.5,
        message: null,
        nodesDone: 2,
        nodesTotal: 4,
        currentNode: "3",
        step: null,
        steps: null
      },
      succeeded
    ]);
    await drain(run(makeTransport(job), [], { context }));

    expect(progress).toEqual([
      { progress: 7, total: 20 },
      { progress: 2, total: 4 }
    ]);
  });

  it("logs job logs and status changes", async () => {
    const { context, logs } = makeContext();
    const job = new FakeJob([
      { kind: "log", level: "error", message: "node blew up" },
      { kind: "statusChange", status: "running", queuePosition: 3 },
      succeeded
    ]);
    await drain(run(makeTransport(job), [], { context }));

    expect(logs).toContainEqual({ content: "node blew up", severity: "error" });
    expect(logs.map((l) => l.content)).toContain(
      "Status: running (queue position 3)"
    );
  });

  it("logs preview frames only when previews are on", async () => {
    const preview: ComfyRunEvent = {
      kind: "preview",
      nodeId: "3",
      contentType: "image/jpeg",
      data: new Uint8Array([1, 2, 3, 4])
    };

    const on = makeContext();
    await drain(
      run(makeTransport(new FakeJob([preview, succeeded])), [], {
        context: on.context,
        previews: true
      })
    );
    expect(on.logs.map((l) => l.content)).toContain(
      "Preview from #3 (4 bytes, image/jpeg)"
    );

    const off = makeContext();
    await drain(
      run(makeTransport(new FakeJob([preview, succeeded])), [], {
        context: off.context,
        previews: false
      })
    );
    expect(off.logs.some((l) => l.content.includes("Preview"))).toBe(false);
  });
});

describe("runComfyWorkflow — terminal states", () => {
  it("throws with the node-level detail when the job failed", async () => {
    const job = new FakeJob(
      [{ kind: "statusChange", status: "failed", queuePosition: null }],
      "failed",
      {
        code: "execution_error",
        message: "CUDA out of memory",
        node_id: "3",
        class_type: "KSampler"
      }
    );
    await expect(drain(run(makeTransport(job)))).rejects.toThrow(
      "Comfy job job-1 failed in KSampler (#3): CUDA out of memory [execution_error]"
    );
  });

  it("throws an abort-style error when the job was canceled", async () => {
    const job = new FakeJob(
      [{ kind: "statusChange", status: "canceled", queuePosition: null }],
      "canceled"
    );
    await expect(drain(run(makeTransport(job)))).rejects.toThrow(
      /job-1 was canceled/
    );
  });

  it("reports a non-success terminal status that is neither failed nor canceled", async () => {
    const job = new FakeJob(
      [{ kind: "statusChange", status: "expired", queuePosition: null }],
      "expired"
    );
    await expect(drain(run(makeTransport(job)))).rejects.toThrow(
      /job-1 ended expired/
    );
  });
});

describe("runComfyWorkflow — cancellation", () => {
  it("cancels the job server-side when the signal aborts mid-stream", async () => {
    const job = new FakeJob([
      { kind: "outputReady", output: fakeOutput({ nodeId: "9" }) },
      { kind: "outputReady", output: fakeOutput({ nodeId: "10" }) },
      succeeded
    ]);
    const controller = new AbortController();
    const gen = run(makeTransport(job), [], { signal: controller.signal });

    const first = await gen.next();
    expect(Object.keys(first.value as Record<string, unknown>)).toEqual([
      "9:image"
    ]);

    controller.abort();
    expect(job.cancelCalls).toBe(1);

    await expect(gen.next()).rejects.toThrow(/job-1 was canceled/);
  });

  it("cancels immediately when the signal is already aborted at submit time", async () => {
    const job = new FakeJob([succeeded]);
    const controller = new AbortController();
    controller.abort();
    const gen = run(makeTransport(job), [], { signal: controller.signal });

    await expect(drain(gen)).rejects.toThrow(/canceled/);
    expect(job.cancelCalls).toBe(1);
  });
});

describe("runComfyWorkflow — submit errors", () => {
  it("explains a full queue and its retry hint", async () => {
    const transport = makeTransport(
      new FakeJob([succeeded]),
      new QueueFull("no free workers", {
        retryAfter: 5,
        code: "queue_full",
        httpStatus: 429
      })
    );
    await expect(drain(run(transport))).rejects.toThrow(
      "Comfy queue is full: no free workers Retry after 5s."
    );
  });

  it("explains a UI-format workflow", async () => {
    const transport = makeTransport(
      new FakeJob([succeeded]),
      new WorkflowFormatUi("workflow is in UI-export format", {
        code: "workflow_format_ui",
        httpStatus: 422
      })
    );
    await expect(drain(run(transport))).rejects.toThrow(
      /UI-export format.*Export \(API\)/s
    );
  });

  it("explains an exhausted credit balance", async () => {
    const transport = makeTransport(
      new FakeJob([succeeded]),
      new InsufficientCredits("balance is 0", {
        code: "insufficient_credits",
        httpStatus: 402
      })
    );
    await expect(drain(run(transport))).rejects.toThrow(
      "Comfy account has insufficient credits: balance is 0"
    );
  });
});
