/**
 * Run a Comfy workflow on a NodeTool worker that fronts ComfyUI. A worker that
 * reports `comfy.api_v2` is driven over the Comfy API v2. Every other worker
 * uses the `comfy.execute` bridge call, which returns all files at the end.
 */

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  WebsocketPythonBridge,
  type ComfyEvent,
  type PythonBridge
} from "@nodetool-ai/runtime";
import {
  sniffMedia,
  v2Transport,
  workerHttpOrigin,
  type ComfyOutput,
  type ComfyPrompt,
  type ComfyTransport
} from "./comfy-sdk.js";
import { QueuedComfyJob } from "./comfy-server-transport.js";

/** Open a one-shot bridge. A closed run must never reconnect. */
export async function connectComfyWorker(
  url: string,
  token?: string
): Promise<PythonBridge> {
  const bridge = new WebsocketPythonBridge({
    wsUrl: url,
    workerToken: token,
    autoRestart: false
  });
  await bridge.connect();
  return bridge;
}

function requireComfy(bridge: PythonBridge, url: string): void {
  if (!bridge.supportsComfy()) {
    throw new Error(
      `The worker at ${url} does not front a ComfyUI server. Deploy the nodetool-worker-comfy image.`
    );
  }
}

/** The worker's node catalog, read over the bridge. */
export async function fetchComfyWorkerObjectInfo(
  url: string,
  token?: string
): Promise<Record<string, unknown>> {
  const bridge = await connectComfyWorker(url, token);
  try {
    requireComfy(bridge, url);
    return await bridge.comfyObjectInfo();
  } finally {
    bridge.close();
  }
}

/** The prompt node that made a blob. The worker keys blobs `<nodeId>_<name>`. */
function ownerOf(key: string, prompt: ComfyPrompt): string {
  return (
    Object.keys(prompt)
      .filter((id) => key === id || key.startsWith(`${id}_`))
      .sort((a, b) => b.length - a.length)[0] ?? key
  );
}

function blobOutput(
  key: string,
  bytes: Uint8Array,
  prompt: ComfyPrompt
): ComfyOutput {
  const { kind, mime } = sniffMedia(bytes);
  const copy = Buffer.from(bytes);
  return {
    nodeId: ownerOf(key, prompt),
    name: `${key}.${mime.split("/")[1]}`,
    id: key,
    type: kind as ComfyOutput["type"],
    contentType: mime,
    sizeBytes: copy.byteLength,
    toBytes: async () => copy
  };
}

class ComfyBridgeJob extends QueuedComfyJob {
  private readonly requestId = randomUUID();

  constructor(
    private readonly bridge: PythonBridge,
    prompt: ComfyPrompt,
    blobs: Record<string, Uint8Array>,
    timeoutSeconds: number
  ) {
    super();
    void bridge
      .comfyExecute(
        prompt,
        {
          blobs: Object.keys(blobs).length > 0 ? blobs : undefined,
          timeout: timeoutSeconds
        },
        (event) => this.onEvent(event),
        this.requestId
      )
      .then((result) => {
        if (result.status === "cancelled") {
          this.setStatus("canceled");
          return;
        }
        for (const [key, bytes] of Object.entries(result.blobs ?? {})) {
          if (!(bytes instanceof Uint8Array)) continue;
          const output = blobOutput(key, bytes, prompt);
          this.outputs.push(output);
          this.push({ kind: "outputReady", output });
        }
        this.setStatus("succeeded");
      })
      .catch((err: unknown) => {
        if (this.status !== "canceled") {
          this.fail(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        bridge.close();
        this.settle();
      });
  }

  private onEvent(event: ComfyEvent): void {
    if (event.event === "started") {
      this.setStatus("running");
    } else if (event.event === "executing" && event.node) {
      this.setStatus("running");
      this.push(this.progressEvent(event.node, null, null));
    } else if (
      event.event === "progress" &&
      typeof event.value === "number" &&
      typeof event.max === "number" &&
      event.max > 0
    ) {
      this.push(this.progressEvent(event.node ?? null, event.value, event.max));
    }
  }

  async cancel(): Promise<this> {
    this.status = "canceled";
    this.bridge.cancelComfyExecute(this.requestId);
    return this;
  }
}

/** Send a prompt over an open bridge. The job closes the bridge when it ends. */
export function bridgeTransport(
  bridge: PythonBridge,
  timeoutSeconds: number
): ComfyTransport {
  const uploads = new WeakMap<object, Uint8Array>();
  return {
    async submit(graph) {
      const blobs: Record<string, Uint8Array> = {};
      for (const [nodeId, node] of Object.entries(graph)) {
        for (const [field, value] of Object.entries(node.inputs)) {
          const bytes =
            typeof value === "object" && value !== null ? uploads.get(value) : undefined;
          if (bytes) {
            const key = `${nodeId}_${field}`;
            blobs[key] = bytes;
            node.inputs[field] = `blob:${key}`;
          }
        }
      }
      return new ComfyBridgeJob(bridge, graph, blobs, timeoutSeconds);
    },
    assetFromBytes(bytes) {
      const handle = {};
      uploads.set(handle, bytes);
      return handle;
    }
  };
}

/** The transport this worker supports, chosen from its reported status. */
export async function workerTransport(
  url: string,
  token: string | undefined,
  timeoutSeconds: number
): Promise<ComfyTransport> {
  const bridge = await connectComfyWorker(url, token);
  if (bridge.getComfyStatus()?.api_v2 === true) {
    bridge.close();
    return v2Transport(workerHttpOrigin(url), token);
  }
  try {
    requireComfy(bridge, url);
  } catch (err) {
    bridge.close();
    throw err;
  }
  return bridgeTransport(bridge, timeoutSeconds);
}
