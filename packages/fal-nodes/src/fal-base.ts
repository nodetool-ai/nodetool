/**
 * Shared FAL AI API utilities for submit → poll → download lifecycle.
 * Uses native fetch (Node 18+).
 */

// ---------------------------------------------------------------------------
// API Key extraction
// ---------------------------------------------------------------------------

export function getFalApiKey(inputs: Record<string, unknown>): string {
  const key =
    (inputs._secrets as Record<string, string>)?.FAL_API_KEY ||
    process.env.FAL_API_KEY ||
    "";
  if (!key) throw new Error("FAL_API_KEY is not configured");
  return key;
}

// ---------------------------------------------------------------------------
// Submit job to FAL queue API, poll until complete, return result
// ---------------------------------------------------------------------------

export async function falSubmit(
  apiKey: string,
  endpoint: string,
  args: Record<string, unknown>,
  pollInterval = 500,
  maxAttempts = 300
): Promise<Record<string, unknown>> {
  // POST to queue
  const submitRes = await fetch(
    `https://queue.fal.run/${endpoint}/requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    }
  );
  if (!submitRes.ok) {
    const errBody = await submitRes.text();
    throw new Error(`FAL submit failed: ${submitRes.status} ${errBody}`);
  }
  const submitData = (await submitRes.json()) as Record<string, unknown>;
  const requestId = submitData.request_id as string;
  if (!requestId)
    throw new Error(`No request_id in FAL submit response: ${JSON.stringify(submitData)}`);

  // Poll until COMPLETED or FAILED
  let interval = pollInterval;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 1.5, 2000);

    const statusRes = await fetch(
      `https://queue.fal.run/${endpoint}/requests/${requestId}/status?logs=true`,
      {
        headers: { Authorization: `Key ${apiKey}` },
      }
    );
    if (!statusRes.ok) {
      const errBody = await statusRes.text();
      throw new Error(`FAL status check failed: ${statusRes.status} ${errBody}`);
    }
    const statusData = (await statusRes.json()) as Record<string, unknown>;
    const status = statusData.status as string;

    if (status === "COMPLETED") break;
    if (status === "FAILED") {
      const errMsg =
        (statusData.error as string) ||
        JSON.stringify(statusData);
      throw new Error(`FAL job failed: ${errMsg}`);
    }
    // QUEUED or IN_PROGRESS — keep polling
    if (i === maxAttempts - 1) {
      throw new Error(`FAL job timed out after ${maxAttempts} attempts`);
    }
  }

  // Fetch result
  const resultRes = await fetch(
    `https://queue.fal.run/${endpoint}/requests/${requestId}`,
    {
      headers: { Authorization: `Key ${apiKey}` },
    }
  );
  if (!resultRes.ok) {
    const errBody = await resultRes.text();
    throw new Error(`FAL result fetch failed: ${resultRes.status} ${errBody}`);
  }
  return (await resultRes.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Two-step upload to FAL CDN
// ---------------------------------------------------------------------------

export async function falUpload(
  apiKey: string,
  data: Uint8Array,
  contentType: string
): Promise<string> {
  // Step 1: get upload token
  const tokenRes = await fetch(
    "https://rest.alpha.fal.ai/storage/auth/token?storage_type=fal-cdn-v3",
    {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );
  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    throw new Error(`FAL upload token failed: ${tokenRes.status} ${errBody}`);
  }
  const tokenData = (await tokenRes.json()) as Record<string, unknown>;
  const token = tokenData.token as string;
  if (!token)
    throw new Error(`No token in FAL upload response: ${JSON.stringify(tokenData)}`);

  // Step 2: upload bytes
  const uploadRes = await fetch("https://v3.fal.media/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: Buffer.from(data),
  });
  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    throw new Error(`FAL file upload failed: ${uploadRes.status} ${errBody}`);
  }
  const uploadData = (await uploadRes.json()) as Record<string, unknown>;
  const accessUrl = uploadData.access_url as string;
  if (!accessUrl)
    throw new Error(`No access_url in FAL upload response: ${JSON.stringify(uploadData)}`);
  return accessUrl;
}

// ---------------------------------------------------------------------------
// Resolve asset ref to FAL-accessible URL
// ---------------------------------------------------------------------------

export async function assetToFalUrl(
  apiKey: string,
  ref: Record<string, unknown>
): Promise<string | null> {
  const uri = ref.uri as string | undefined;
  if (uri?.startsWith("https://") && !uri.includes("localhost")) return uri;
  const data = ref.data as string | undefined;
  if (data) {
    const bytes = Uint8Array.from(Buffer.from(data, "base64"));
    const contentType = inferContentType(ref.type as string);
    return falUpload(apiKey, bytes, contentType);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Convert image ref to data:image/png;base64,... URL
// ---------------------------------------------------------------------------

export async function imageToDataUrl(
  ref: Record<string, unknown>
): Promise<string | null> {
  const data = ref.data as string | undefined;
  if (data) return `data:image/png;base64,${data}`;
  const uri = ref.uri as string | undefined;
  if (uri?.startsWith("https://")) {
    const res = await fetch(uri);
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function inferContentType(assetType: string | undefined): string {
  switch (assetType) {
    case "image":
      return "image/png";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

export function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  return Boolean(r.data || r.uri || r.asset_id);
}

export function removeNulls(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (obj[k] == null) delete obj[k];
    if (
      typeof obj[k] === "object" &&
      obj[k] !== null &&
      !Array.isArray(obj[k])
    ) {
      const nested = obj[k] as Record<string, unknown>;
      for (const nk of Object.keys(nested)) {
        if (nested[nk] == null) delete nested[nk];
      }
    }
  }
}
