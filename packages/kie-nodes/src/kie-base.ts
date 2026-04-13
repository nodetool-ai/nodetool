/**
 * Shared Kie.ai API utilities for submit → poll → download lifecycle.
 * Uses native fetch (Node 18+).
 */

const KIE_API_BASE = "https://api.kie.ai";
const KIE_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-stream-upload";

type UploadContext = {
  storage?: {
    retrieve: (uri: string) => Promise<Uint8Array | null> | Uint8Array | null;
  } | null;
};

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
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
    505: "Feature Disabled"
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
    body: JSON.stringify({ model, input })
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  if (!res.ok)
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId)
    throw new Error(`No taskId in response: ${JSON.stringify(data)}`);
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
      const msg =
        (data.data as Record<string, unknown>)?.failMsg || "Unknown error";
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
  const resultJsonStr = (data.data as Record<string, unknown>)
    ?.resultJson as string;
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
    body: form
  });
  const resData = (await res.json()) as Record<string, unknown>;
  if (resData.code !== undefined) checkStatus(resData);
  if (!res.ok || !resData.success)
    throw new Error(`Upload failed: ${res.status} ${JSON.stringify(resData)}`);
  const downloadUrl = (resData.data as Record<string, unknown>)
    ?.downloadUrl as string;
  if (!downloadUrl) throw new Error(`No downloadUrl in upload response`);
  return downloadUrl;
}

export function getApiKey(secrets: Record<string, string>): string {
  const key = secrets?.KIE_API_KEY || process.env.KIE_API_KEY || "";
  if (!key) throw new Error("KIE_API_KEY is not configured");
  return key;
}

function isRemoteHttpUrl(uri: string | undefined): uri is string {
  return !!uri && /^https?:\/\//.test(uri);
}

function isLocalHttpUrl(uri: string): boolean {
  return (
    uri.includes("localhost") ||
    uri.includes("127.0.0.1") ||
    uri.includes("[::1]")
  );
}

async function resolveUploadBytes(
  ref: Record<string, unknown>,
  context?: UploadContext
): Promise<Buffer | null> {
  const data = ref.data as string | undefined;
  if (data) {
    return Buffer.from(data, "base64");
  }

  const uri = ref.uri as string | undefined;
  if (!uri) return null;

  if (uri.startsWith("data:")) {
    const commaIndex = uri.indexOf(",");
    if (commaIndex !== -1) {
      const encoded = uri.slice(commaIndex + 1);
      return Buffer.from(encoded, "base64");
    }
  }

  const bytes = await context?.storage?.retrieve(uri);
  if (bytes) {
    return Buffer.from(bytes);
  }

  if (isRemoteHttpUrl(uri) && isLocalHttpUrl(uri)) {
    const response = await fetch(uri);
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
  }

  return null;
}

export async function uploadImageInput(
  apiKey: string,
  image: unknown,
  context?: UploadContext
): Promise<string> {
  if (!image || typeof image !== "object") throw new Error("Image is required");
  const img = image as Record<string, unknown>;
  const uri = img.uri as string | undefined;
  if (isRemoteHttpUrl(uri) && !isLocalHttpUrl(uri)) {
    return uri;
  }
  const bytes = await resolveUploadBytes(img, context);
  if (!bytes) throw new Error("Image has no data or URI");
  return uploadFile(
    apiKey,
    bytes,
    "images/user-uploads",
    `upload-${Date.now()}.png`
  );
}

export async function uploadAudioInput(
  apiKey: string,
  audio: unknown,
  context?: UploadContext
): Promise<string> {
  if (!audio || typeof audio !== "object") throw new Error("Audio is required");
  const a = audio as Record<string, unknown>;
  const uri = a.uri as string | undefined;
  if (isRemoteHttpUrl(uri) && !isLocalHttpUrl(uri)) {
    return uri;
  }
  const bytes = await resolveUploadBytes(a, context);
  if (!bytes) throw new Error("Audio has no data or URI");
  return uploadFile(
    apiKey,
    bytes,
    "audio/user-uploads",
    `upload-${Date.now()}.mp3`
  );
}

export async function uploadVideoInput(
  apiKey: string,
  video: unknown,
  context?: UploadContext
): Promise<string> {
  if (!video || typeof video !== "object") throw new Error("Video is required");
  const v = video as Record<string, unknown>;
  const uri = v.uri as string | undefined;
  if (isRemoteHttpUrl(uri) && !isLocalHttpUrl(uri)) {
    return uri;
  }
  const bytes = await resolveUploadBytes(v, context);
  if (!bytes) throw new Error("Video has no data or URI");
  return uploadFile(
    apiKey,
    bytes,
    "videos/user-uploads",
    `upload-${Date.now()}.mp4`
  );
}

function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  return !!(r.data || r.uri);
}

export { isRefSet };

// Custom endpoint helpers for Veo, Runway, etc.
async function submitCustom(
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  if (!res.ok)
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId)
    throw new Error(`No taskId in response: ${JSON.stringify(data)}`);
  return taskId;
}

async function pollCustom(
  apiKey: string,
  taskId: string,
  pollEndpoint: string,
  pollInterval: number,
  maxAttempts: number
): Promise<Record<string, unknown>> {
  const url = `${KIE_API_BASE}${pollEndpoint}?taskId=${taskId}`;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey) });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.code !== undefined) checkStatus(data);
    const inner = data.data as Record<string, unknown>;

    // Veo-style completion: successFlag === 1
    const successFlag = inner?.successFlag;
    if (successFlag !== undefined) {
      const flag = Number(successFlag);
      if (flag === 1) return data;
      if (flag === 2 || flag === 3) {
        throw new Error(`Task failed: ${data.msg || "Unknown error"}`);
      }
    }

    // Runway-style completion: state === "success"
    const state = inner?.state as string;
    if (state === "success") return data;
    if (state === "fail") {
      const msg = inner?.failMsg || data.msg || "Unknown error";
      throw new Error(`Task failed: ${msg}`);
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Task timed out after ${maxAttempts * pollInterval}ms`);
}

async function downloadCustomResult(
  statusData: Record<string, unknown>
): Promise<Buffer> {
  const data = statusData.data as Record<string, unknown>;

  // Try Runway-style: data.videoInfo.videoUrl
  const videoInfo = data?.videoInfo as Record<string, unknown> | undefined;
  if (videoInfo?.videoUrl) {
    const res = await fetch(videoInfo.videoUrl as string);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // Try Veo-style: data.resultUrls or data.response.resultUrls
  let resultUrls: string[] = [];
  const rawUrls =
    (data?.resultUrls as unknown) ||
    ((data?.response as Record<string, unknown>)?.resultUrls as unknown) ||
    ((data?.response as Record<string, unknown>)?.originUrls as unknown);

  if (Array.isArray(rawUrls)) {
    resultUrls = rawUrls.filter((u): u is string => typeof u === "string");
  } else if (typeof rawUrls === "string") {
    try {
      const parsed = JSON.parse(rawUrls);
      if (Array.isArray(parsed)) {
        resultUrls = parsed.filter((u): u is string => typeof u === "string");
      } else if (typeof parsed === "string") {
        resultUrls = [parsed];
      }
    } catch {
      resultUrls = [rawUrls];
    }
  }

  if (!resultUrls.length)
    throw new Error(`No result URLs in response: ${JSON.stringify(statusData)}`);

  const res = await fetch(resultUrls[0]);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function kieExecuteTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  pollInterval = 2000,
  maxAttempts = 300,
  submitEndpoint?: string,
  pollEndpoint?: string
): Promise<{ data: string; taskId: string }> {
  if (submitEndpoint) {
    // Custom submit/poll endpoints (Veo, Runway, etc.)
    const taskId = await submitCustom(apiKey, submitEndpoint, { model, ...input });
    const statusData = await pollCustom(
      apiKey,
      taskId,
      pollEndpoint ?? submitEndpoint,
      pollInterval,
      maxAttempts
    );
    const resultBytes = await downloadCustomResult(statusData);
    return { data: resultBytes.toString("base64"), taskId };
  }
  const taskId = await submitTask(apiKey, model, input);
  await pollStatus(apiKey, taskId, pollInterval, maxAttempts);
  const result = await downloadResult(apiKey, taskId);
  return { data: result.bytes.toString("base64"), taskId: result.taskId };
}

// Suno music uses different endpoints
export async function kieSubmitSuno(
  apiKey: string,
  input: Record<string, unknown>,
  endpoint = "/api/v1/generate"
): Promise<string> {
  // callBackUrl is always required by the Suno API. Since we poll for results
  // we don't actually use it, so inject a placeholder if not already set.
  const body = input.callBackUrl
    ? input
    : { ...input, callBackUrl: "https://nodetool.ai/kie-callback" };
  const res = await fetch(`${KIE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body)
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (data.code !== undefined) checkStatus(data);
  if (!res.ok)
    throw new Error(`Submit failed: ${res.status} ${JSON.stringify(data)}`);
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
    "SENSITIVE_WORD_ERROR"
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

export async function kieExecuteSunoTask(
  apiKey: string,
  input: Record<string, unknown>,
  pollInterval = 4000,
  maxAttempts = 120,
  endpoint?: string
): Promise<{ data: string; taskId: string }> {
  const taskId = await kieSubmitSuno(apiKey, input, endpoint);
  const pollResult = await kiePollSuno(apiKey, taskId, pollInterval, maxAttempts);
  // Polling response: data.response.sunoData[].audioUrl
  const sunoData = (
    (pollResult.data as Record<string, unknown>)?.response as Record<string, unknown>
  )?.sunoData as Array<Record<string, unknown>>;
  if (!sunoData?.length) throw new Error("No sunoData in Suno response");
  const audioUrl = sunoData[0].audioUrl as string;
  if (!audioUrl) throw new Error("No audioUrl in Suno response");
  const dlRes = await fetch(audioUrl);
  if (!dlRes.ok) throw new Error(`Failed to download audio: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  return { data: buf.toString("base64"), taskId };
}

export async function kieImageRef(base64: string): Promise<Record<string, unknown>> {
  try {
    const sharp = (await import("sharp")).default;
    const buf = Buffer.from(base64, "base64");
    const meta = await sharp(buf).metadata();
    return {
      type: "image",
      uri: "",
      data: base64,
      mimeType: meta.format ? `image/${meta.format}` : "image/png",
      width: meta.width,
      height: meta.height
    };
  } catch {
    return { type: "image", uri: "", data: base64 };
  }
}
