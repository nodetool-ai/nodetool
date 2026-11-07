/**
 * Together wire operations shared by the provider's capability methods and
 * its endpoint calls. The body builders are also what `together-nodes` sends
 * as endpoint input, so both paths build the same JSON.
 */
export interface TogetherTransport {
  readonly fetchFn?: typeof fetch;
  readonly signal?: AbortSignal;
}

export interface TogetherImageParams {
  readonly prompt: string;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly steps?: number | null;
  readonly guidanceScale?: number | null;
  readonly seed?: number | null;
  readonly negativePrompt?: string | null;
  readonly imageUrl?: string | null;
  readonly referenceImages?: readonly string[];
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

/** POST a JSON body to a path under https://api.together.xyz. */
export function postTogetherJson(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
  options: TogetherTransport = {}
): Promise<Response> {
  return (options.fetchFn ?? globalThis.fetch)(
    `https://api.together.xyz${path}`,
    {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
      signal: options.signal
    }
  );
}

/** The JSON body of POST /v1/images/generations. Throws on an empty prompt. */
export function togetherImageBody(
  model: string,
  params: TogetherImageParams
): Record<string, unknown> {
  if (!params.prompt) {
    throw new Error("The input prompt cannot be empty.");
  }
  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    n: 1,
    response_format: "b64_json"
  };
  if (params.imageUrl) {
    body.image_url = params.imageUrl;
  }
  if (params.referenceImages) {
    body.reference_images = params.referenceImages;
  }
  if (params.width != null) {
    body.width = params.width;
  }
  if (params.height != null) {
    body.height = params.height;
  }
  if (params.steps != null) {
    body.steps = params.steps;
  }
  if (params.guidanceScale != null) {
    body.guidance_scale = params.guidanceScale;
  }
  if (params.seed != null) {
    body.seed = params.seed;
  }
  if (params.negativePrompt) {
    body.negative_prompt = params.negativePrompt;
  }
  return body;
}

export async function togetherImage(
  apiKey: string,
  model: string,
  params: TogetherImageParams,
  options: TogetherTransport & {
    readonly label: "generation" | "editing";
    readonly download: (
      url: string,
      signal?: AbortSignal
    ) => Promise<Uint8Array>;
  }
): Promise<Uint8Array> {
  const response = await postTogetherJson(
    apiKey,
    "/v1/images/generations",
    togetherImageBody(model, params),
    options
  );
  const label = `Together image ${options.label}`;
  if (!response.ok) {
    throw new Error(`${label} failed: ${await response.text()}`);
  }
  const payload: unknown = await response.json();
  const item =
    typeof payload === "object" &&
    payload !== null &&
    "data" in payload &&
    Array.isArray(payload.data)
      ? payload.data[0]
      : undefined;
  if (typeof item !== "object" || item === null) {
    throw new Error(`${label} returned no data.`);
  }
  if (
    "b64_json" in item &&
    typeof item.b64_json === "string" &&
    item.b64_json.length > 0
  ) {
    return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
  }
  if ("url" in item && typeof item.url === "string" && item.url.length > 0) {
    return options.download(item.url, options.signal);
  }
  throw new Error(`${label} returned no image data.`);
}

export interface TogetherSpeechParams {
  readonly text: string;
  readonly voice?: string;
  readonly speed?: number | null;
  readonly format: string;
}

/** The JSON body of POST /v1/audio/speech. Throws on empty text. */
export function togetherSpeechBody(
  model: string,
  params: TogetherSpeechParams
): Record<string, unknown> {
  if (!params.text) {
    throw new Error("text must not be empty");
  }
  const body: Record<string, unknown> = {
    model,
    input: params.text,
    voice: params.voice ?? "tara",
    response_format: params.format
  };
  if (params.speed != null) {
    body.speed = params.speed;
  }
  return body;
}

export async function togetherSpeech(
  apiKey: string,
  model: string,
  params: TogetherSpeechParams,
  options: TogetherTransport = {}
): Promise<Uint8Array> {
  const response = await postTogetherJson(
    apiKey,
    "/v1/audio/speech",
    togetherSpeechBody(model, params),
    options
  );
  if (!response.ok) {
    throw new Error(`Together TTS failed: ${await response.text()}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
