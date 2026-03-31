/**
 * ComfyUI workflow executor for local and RunPod serverless endpoints.
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

/**
 * Execute a ComfyUI workflow against a local ComfyUI server.
 */
export async function executeComfyLocal(
  prompt: ComfyPrompt,
  addr: string,
  maxAttempts = 60,
  intervalMs = 1000
): Promise<ComfyExecutorResult> {
  // Submit prompt
  let promptId: string;
  try {
    const submitRes = await fetch(`http://${addr}/prompt`, {
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
      const histRes = await fetch(`http://${addr}/history/${promptId}`);
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
          const viewRes = await fetch(`http://${addr}/view?${params.toString()}`);
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

/**
 * Execute a ComfyUI workflow via RunPod serverless.
 */
export async function executeComfyRunPod(
  prompt: ComfyPrompt,
  apiKey: string,
  endpointId: string,
  maxAttempts = 120,
  intervalMs = 2000
): Promise<ComfyExecutorResult> {
  const baseUrl = `https://api.runpod.ai/v2/${endpointId}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // Submit job
  let jobId: string;
  try {
    const submitRes = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { workflow: prompt } }),
    });
    if (!submitRes.ok) {
      const text = await submitRes.text();
      return { status: "failed", error: `RunPod submit failed (${submitRes.status}): ${text}` };
    }
    const submitData = (await submitRes.json()) as { id: string };
    jobId = submitData.id;
    log.info(`RunPod job submitted: ${jobId}`);
  } catch (err) {
    return { status: "failed", error: `RunPod submit error: ${String(err)}` };
  }

  // Poll status
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const statusRes = await fetch(`${baseUrl}/status/${jobId}`, { headers });
      if (statusRes.ok) {
        const data = (await statusRes.json()) as {
          status: string;
          output?: { message?: string; images?: Array<{ image: string; filename?: string }> };
          error?: string;
        };

        if (data.status === "COMPLETED") {
          const images: ComfyImage[] = [];

          if (data.output?.message) {
            // Single data-URI image
            const base64 = stripDataUriPrefix(data.output.message);
            images.push({ type: "image", data: base64, filename: "output.png" });
          }

          if (data.output?.images) {
            for (const img of data.output.images) {
              const base64 = stripDataUriPrefix(img.image);
              images.push({
                type: "image",
                data: base64,
                filename: img.filename ?? "output.png",
              });
            }
          }

          return {
            status: "completed",
            images,
            raw_output: data as unknown as Record<string, unknown>,
          };
        }

        if (data.status === "FAILED") {
          return { status: "failed", error: data.error ?? "RunPod job failed" };
        }

        // IN_QUEUE, IN_PROGRESS — keep polling
      }
    } catch {
      // Polling error — retry
    }
    if (attempt < maxAttempts - 1) {
      await delay(intervalMs);
    }
  }

  // Timeout — try to cancel
  try {
    await fetch(`${baseUrl}/cancel/${jobId}`, { method: "POST", headers });
    log.warn(`Cancelled timed-out RunPod job ${jobId}`);
  } catch {
    // Best-effort cancel
  }

  return { status: "failed", error: "Timeout waiting for RunPod result" };
}

function stripDataUriPrefix(data: string): string {
  const commaIndex = data.indexOf(",");
  if (commaIndex !== -1 && data.startsWith("data:")) {
    return data.slice(commaIndex + 1);
  }
  return data;
}
