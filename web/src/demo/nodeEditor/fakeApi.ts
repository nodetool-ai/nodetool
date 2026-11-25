/**
 * Answers the editor's HTTP calls in the node editor demo, which has no
 * server.
 *
 * tRPC queries the demo needs (model lists for the model menus, empty lists
 * for the editor's background reads) get fixed answers. Every other tRPC procedure gets a tRPC error and every `/api/`
 * request a 404, at once and without a network round trip, so the editor
 * treats them the way it treats an unreachable server.
 */
import type { UnifiedModel } from "../../stores/ApiTypes";

type Answer = unknown;
type Resolver = Answer | ((input: unknown) => Answer);

function byProvider(models: UnifiedModel[]): (input: unknown) => UnifiedModel[] {
  return (input) => {
    const provider = (input as { provider?: unknown } | null)?.provider;
    return models.filter((model) => model.provider === provider);
  };
}

const IMAGE_MODELS: UnifiedModel[] = [
  { type: "image_model", provider: "fal_ai", id: "fal-ai/flux/schnell", name: "FLUX.1 Schnell", supported_tasks: ["text_to_image"] },
  { type: "image_model", provider: "openai", id: "gpt-image-2", name: "GPT Image 2", supported_tasks: ["text_to_image"] },
  { type: "image_model", provider: "gemini", id: "gemini-3-pro-image-preview", name: "Nano Banana Pro", supported_tasks: ["text_to_image"] }
] as UnifiedModel[];

const VIDEO_MODELS: UnifiedModel[] = [
  { type: "video_model", provider: "gemini", id: "veo-3.1-generate-preview", name: "Veo 3.1 Preview", supported_tasks: ["text_to_video", "image_to_video"] },
  { type: "video_model", provider: "fal_ai", id: "fal-ai/kling-video/v2.1/master/image-to-video", name: "Kling 2.1 Master", supported_tasks: ["image_to_video"] }
] as UnifiedModel[];

const LANGUAGE_MODELS: UnifiedModel[] = [
  { type: "language_model", provider: "openai", id: "gpt-5.4", name: "GPT-5.4" },
  { type: "language_model", provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }
] as UnifiedModel[];

const PROVIDERS = [
  { provider: "fal_ai", capabilities: ["text_to_image", "image_to_video"], access: "remote_api", display_name: "FAL" },
  { provider: "gemini", capabilities: ["text_to_image", "text_to_video", "image_to_video"], access: "remote_api", display_name: "Gemini" },
  { provider: "openai", capabilities: ["generate_message", "text_to_image"], access: "remote_api", display_name: "OpenAI" },
  { provider: "anthropic", capabilities: ["generate_message"], access: "remote_api", display_name: "Anthropic" }
];

/** Fixed answers, by tRPC procedure path. */
export const DEMO_TRPC_ANSWERS: Record<string, Resolver> = {
  "models.providers": PROVIDERS,
  "models.rankedKeys": [],
  "models.image": IMAGE_MODELS,
  "models.imageByProvider": byProvider(IMAGE_MODELS),
  "models.videoByProvider": byProvider(VIDEO_MODELS),
  "models.llmByProvider": byProvider(LANGUAGE_MODELS),
  "models.recommendedImageTextToImage": IMAGE_MODELS,
  "models.video": VIDEO_MODELS,
  "models.recommendedVideoTextToVideo": VIDEO_MODELS,
  "models.recommendedVideoImageToVideo": VIDEO_MODELS,
  "models.llm": LANGUAGE_MODELS,
  "models.recommended": [],
  "threads.list": { threads: [], next: null },
  "jobs.list": { jobs: [], next_start_key: null },
  "assets.list": { assets: [], next: null },
  "projects.list": []
};

const NOT_IN_DEMO = "Not available in the demo";

function trpcError(path: string): Answer {
  return {
    error: {
      message: NOT_IN_DEMO,
      code: -32004,
      data: { code: "NOT_FOUND", httpStatus: 404, path }
    }
  };
}

function parseInputs(raw: string | null): Record<string, unknown> {
  if (raw === null) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The response body for a tRPC GET such as `/trpc/a.b,c.d?batch=1&input=…`.
 * A batched request's `input` is keyed by position.
 */
export function answerTrpc(pathname: string, search: URLSearchParams): Answer {
  const batched = search.has("batch");
  const procedures = decodeURIComponent(pathname.replace(/^.*\/trpc\//, "")).split(",");
  const inputs = parseInputs(search.get("input"));
  const answers = procedures.map((path, index) => {
    if (!(path in DEMO_TRPC_ANSWERS)) {
      return trpcError(path);
    }
    const resolver = DEMO_TRPC_ANSWERS[path];
    const input = batched ? inputs[String(index)] : inputs;
    return { result: { data: typeof resolver === "function" ? resolver(input) : resolver } };
  });
  return batched ? answers : answers[0];
}

function jsonResponse(body: Answer, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** Route `/trpc/` and `/api/` requests to the fake. Returns an uninstall. */
export function installFakeApi(): () => void {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (url.origin === window.location.origin) {
      if (url.pathname.startsWith("/trpc/")) {
        const batched = url.searchParams.has("batch");
        const body = answerTrpc(url.pathname, url.searchParams);
        const failed = batched ? false : typeof body === "object" && body !== null && "error" in body;
        return jsonResponse(body, failed ? 404 : 200);
      }
      if (url.pathname.startsWith("/api/")) {
        return jsonResponse({ detail: NOT_IN_DEMO }, 404);
      }
    }
    return original(input, init);
  };
  return () => {
    window.fetch = original;
  };
}
