/**
 * ComfyUI workflow executor — submits prompts to any ComfyUI server
 * (local, RunPod Pod, or any remote host).
 */
import { createLogger } from "@nodetool/config";

const log = createLogger("runtime:comfy-executor");

export interface ComfyImage {
  type: "image";
  data: string;
  filename: string;
}

export interface ComfyExecutorResult {
  status: "completed" | "failed";
  images?: ComfyImage[];
  raw_output?: Record<string, unknown>;
  error?: string;
}

type ComfyPrompt = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(addr: string): string {
  const url = addr.startsWith("http") ? addr : `http://${addr}`;
  return url.replace(/\/+$/, "");
}

/**
 * Execute a ComfyUI workflow against a ComfyUI server.
 * Works with local servers, RunPod Pods, or any remote ComfyUI host.
 */
export async function executeComfy(
  prompt: ComfyPrompt,
  addr: string,
  maxAttempts = 600,
  intervalMs = 2000
): Promise<ComfyExecutorResult> {
  const base = normalizeBaseUrl(addr);

  // Submit prompt
  let promptId: string;
  try {
    const submitRes = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!submitRes.ok) {
      const text = await submitRes.text();
      return { status: "failed", error: `Submit failed (${submitRes.status}): ${text}` };
    }
    const submitData = (await submitRes.json()) as { prompt_id: string };
    promptId = submitData.prompt_id;
    log.info(`Submitted prompt ${promptId}`);
  } catch (err) {
    return { status: "failed", error: `Submit error: ${String(err)}` };
  }

  // Poll history
  let historyData: Record<string, unknown> | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const histRes = await fetch(`${base}/history/${promptId}`);
      if (histRes.ok) {
        const data = (await histRes.json()) as Record<string, unknown>;
        if (data[promptId]) {
          historyData = data[promptId] as Record<string, unknown>;
          break;
        }
      }
    } catch {
      // Polling error — retry
    }
    if (attempt < maxAttempts - 1) {
      await delay(intervalMs);
    }
  }

  if (!historyData) {
    return { status: "failed", error: "Timeout waiting for ComfyUI result" };
  }

  // Extract images from outputs
  const images: ComfyImage[] = [];
  const outputs = historyData.outputs as
    | Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>
    | undefined;

  if (outputs) {
    for (const nodeOutput of Object.values(outputs)) {
      if (!nodeOutput.images) continue;
      for (const img of nodeOutput.images) {
        try {
          const params = new URLSearchParams({
            filename: img.filename,
            subfolder: img.subfolder,
            type: img.type,
          });
          const viewRes = await fetch(`${base}/view?${params.toString()}`);
          if (viewRes.ok) {
            const buffer = await viewRes.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            images.push({ type: "image", data: base64, filename: img.filename });
          }
        } catch (err) {
          log.warn(`Failed to fetch image ${img.filename}: ${String(err)}`);
        }
      }
    }
  }

  return {
    status: "completed",
    images,
    raw_output: historyData as Record<string, unknown>,
  };
}
