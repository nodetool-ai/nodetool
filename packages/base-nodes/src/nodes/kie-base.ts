/**
 * Shared Kie.ai API utilities for submit → poll → download lifecycle.
 * Uses native fetch (Node 18+).
 */

const KIE_API_BASE = "https://api.kie.ai";
const KIE_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-stream-upload";

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function checkStatus(data: Record<string, unknown>): void {
  const code = Number(data.code);
  const map: Record<number, string> = {
    401: "Unauthorized",
    402: "Insufficient Credits",
    404: "Not Found",
    422: "Validation Error",
    429: "Rate Limited",
    455: "Service Unavailable",
    500: "Server Error",
    501: "Generation Failed",
    505: "Feature Disabled",
  };
  if (map[code]) throw new Error(`${map[code]}: ${JSON.stringify(data)}`);
}

async function submitTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, input }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  if (!res.ok) throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId) throw new Error(`No taskId in response: ${JSON.stringify(data)}`);
  return taskId;
}

async function pollStatus(
  apiKey: string,
  taskId: string,
  pollInterval: number,
  maxAttempts: number
): Promise<Record<string, unknown>> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey) });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.code !== undefined) checkStatus(data);
    const state = (data.data as Record<string, unknown>)?.state as string;
    if (state === "success") return data;
    if (state === "failed") {
      const msg = (data.data as Record<string, unknown>)?.failMsg || "Unknown error";
      throw new Error(`Task failed: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Task timed out after ${maxAttempts * pollInterval}ms`);
}

async function downloadResult(
  apiKey: string,
  taskId: string
): Promise<{ bytes: Buffer; taskId: string }> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Failed to get result: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  const resultJsonStr = (data.data as Record<string, unknown>)?.resultJson as string;
  if (!resultJsonStr) throw new Error("No resultJson in response");
  const resultData = JSON.parse(resultJsonStr) as Record<string, unknown>;
  const resultUrls = resultData.resultUrls as string[];
  if (!resultUrls?.length) throw new Error("No resultUrls in resultJson");
  const dlRes = await fetch(resultUrls[0]);
  if (!dlRes.ok) throw new Error(`Failed to download from ${resultUrls[0]}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  return { bytes: buf, taskId };
}

export async function uploadFile(
  apiKey: string,
  data: Buffer,
  uploadPath: string,
  filename: string
): Promise<string> {
  const form = new globalThis.FormData();
  form.append("file", new Blob([new Uint8Array(data)]), filename);
  form.append("uploadPath", uploadPath);
  form.append("fileName", filename);
  const res = await fetch(KIE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const resData = (await res.json()) as Record<string, unknown>;
  if (resData.code !== undefined) checkStatus(resData);
  if (!res.ok || !resData.success)
    throw new Error(`Upload failed: ${res.status} ${JSON.stringify(resData)}`);
  const downloadUrl = (resData.data as Record<string, unknown>)?.downloadUrl as string;
  if (!downloadUrl) throw new Error(`No downloadUrl in upload response`);
  return downloadUrl;
}

export function getApiKey(inputs: Record<string, unknown>): string {
  const key =
    (inputs._secrets as Record<string, string>)?.KIE_API_KEY ||
    process.env.KIE_API_KEY ||
    "";
  if (!key) throw new Error("KIE_API_KEY is not configured");
  return key;
}

export async function uploadImageInput(
  apiKey: string,
  image: unknown
): Promise<string> {
  if (!image || typeof image !== "object") throw new Error("Image is required");
  const img = image as Record<string, unknown>;
  const uri = img.uri as string | undefined;
  if (uri?.startsWith("http://") || uri?.startsWith("https://")) {
    if (!uri.includes("localhost") && !uri.includes("127.0.0.1")) return uri;
  }
  const data = img.data as string | undefined;
  if (!data) throw new Error("Image has no data or URI");
  return uploadFile(apiKey, Buffer.from(data, "base64"), "images/user-uploads", `upload-${Date.now()}.png`);
}

export async function uploadAudioInput(
  apiKey: string,
  audio: unknown
): Promise<string> {
  if (!audio || typeof audio !== "object") throw new Error("Audio is required");
  const a = audio as Record<string, unknown>;
  const uri = a.uri as string | undefined;
  if (uri?.startsWith("http://") || uri?.startsWith("https://")) {
    if (!uri.includes("localhost") && !uri.includes("127.0.0.1")) return uri;
  }
  const data = a.data as string | undefined;
  if (!data) throw new Error("Audio has no data or URI");
  return uploadFile(apiKey, Buffer.from(data, "base64"), "audio/user-uploads", `upload-${Date.now()}.mp3`);
}

export async function uploadVideoInput(
  apiKey: string,
  video: unknown
): Promise<string> {
  if (!video || typeof video !== "object") throw new Error("Video is required");
  const v = video as Record<string, unknown>;
  const uri = v.uri as string | undefined;
  if (uri?.startsWith("http://") || uri?.startsWith("https://")) {
    if (!uri.includes("localhost") && !uri.includes("127.0.0.1")) return uri;
  }
  const data = v.data as string | undefined;
  if (!data) throw new Error("Video has no data or URI");
  return uploadFile(apiKey, Buffer.from(data, "base64"), "videos/user-uploads", `upload-${Date.now()}.mp4`);
}

function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  return !!(r.data || r.uri);
}

export { isRefSet };

export async function kieExecuteTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  pollInterval = 2000,
  maxAttempts = 300
): Promise<{ data: string; taskId: string }> {
  const taskId = await submitTask(apiKey, model, input);
  await pollStatus(apiKey, taskId, pollInterval, maxAttempts);
  const result = await downloadResult(apiKey, taskId);
  return { data: result.bytes.toString("base64"), taskId: result.taskId };
}

// Suno music uses different endpoints
export async function kieSubmitSuno(
  apiKey: string,
  input: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/generate`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  if (!res.ok) throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId) throw new Error(`No taskId: ${JSON.stringify(data)}`);
  return taskId;
}

export async function kiePollSuno(
  apiKey: string,
  taskId: string,
  pollInterval = 4000,
  maxAttempts = 120
): Promise<Record<string, unknown>> {
  const url = `${KIE_API_BASE}/api/v1/generate/record-info?taskId=${taskId}`;
  const failed = new Set([
    "CREATE_TASK_FAILED",
    "GENERATE_AUDIO_FAILED",
    "CALLBACK_EXCEPTION",
    "SENSITIVE_WORD_ERROR",
  ]);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey) });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.code !== undefined) checkStatus(data);
    const status = (data.data as Record<string, unknown>)?.status as string;
    if (status === "SUCCESS") return data;
    if (failed.has(status)) throw new Error(`Suno task failed: ${status}`);
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Suno task timed out`);
}

export async function kieDownloadSunoResult(
  apiKey: string,
  taskId: string
): Promise<{ data: string; taskId: string }> {
  const url = `${KIE_API_BASE}/api/v1/generate/record-info?taskId=${taskId}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  const data = (await res.json()) as Record<string, unknown>;
  const clips = ((data.data as Record<string, unknown>)?.response as Record<string, unknown>)?.clips as Array<Record<string, unknown>>;
  if (!clips?.length) throw new Error("No clips in Suno response");
  const audioUrl = clips[0].audioUrl as string;
  if (!audioUrl) throw new Error("No audioUrl in Suno clip");
  const dlRes = await fetch(audioUrl);
  if (!dlRes.ok) throw new Error(`Failed to download audio`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  return { data: buf.toString("base64"), taskId };
}

export async function kieExecuteSunoTask(
  apiKey: string,
  input: Record<string, unknown>,
  pollInterval = 4000,
  maxAttempts = 120
): Promise<{ data: string; taskId: string }> {
  const taskId = await kieSubmitSuno(apiKey, input);
  await kiePollSuno(apiKey, taskId, pollInterval, maxAttempts);
  return kieDownloadSunoResult(apiKey, taskId);
}
