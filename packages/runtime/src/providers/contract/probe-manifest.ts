/**
 * The provider contract probe manifest.
 *
 * A cassette proves NodeTool still handles a response a provider gave us *once*.
 * It cannot notice that the provider changed the response today. Each entry
 * here names one response shape NodeTool depends on, the production decoder
 * that reads it, a checked-in raw HTTP response fixture, and — where a live
 * call is cheap enough to make nightly — the single request that fetches
 * today's version of it.
 *
 * Both directions run the same decoder. The fixture direction is the offline
 * test (`provider-contract-probes.test.ts`); the live direction is the nightly
 * probe (`scripts/provider-contract-probe.mjs`). Neither ever writes a
 * cassette.
 *
 * Budget: the first manifest allows one live request and USD 0.05 per provider
 * per run, enforced by `runProbes` and asserted by the manifest test.
 */

import {
  decodeChatCompletion,
  type DecodedChatCompletion
} from "../openai-compat/index.js";
import { decodeOpenAIModelList } from "../openai-provider.js";
import {
  decodeGeminiGenerateContent,
  decodeGeminiModelsPage
} from "../gemini-provider.js";
import {
  decodeFalLanguageCatalog,
  extractAudioUrl,
  extractImageUrls,
  extractVideoUrl
} from "../fal-provider.js";
import {
  decodeKieRecordInfo,
  decodeKieResultUrls,
  decodeKieTaskSubmission,
  kieEnvelopeError
} from "../kie-provider.js";

/** Providers the first manifest covers. */
export type ProbeProvider = "openai" | "gemini" | "fal_ai" | "kie";

/** The one live HTTP request an entry may make per run. */
export interface LiveProbeSpec {
  /** Environment variable holding the credential, or null when none is needed. */
  credential: string | null;
  /** Hard ceiling on requests this entry may issue in one run. */
  maxRequests: number;
  /** Hard ceiling on what this entry may spend in one run. */
  maxCostUsd: number;
  /** What one run is expected to cost, for the budget rollup. */
  estimatedCostUsd: number;
  /**
   * Build the request. `env` is the process environment; `credential` is the
   * resolved secret (empty string when the entry needs none).
   */
  request(
    env: Record<string, string | undefined>,
    credential: string
  ): { url: string; init: RequestInit };
  /**
   * True when a non-2xx status is the contract under test — KIE answers a
   * rejected submission with its error envelope — so the runner decodes the
   * body instead of reporting a network failure.
   */
  acceptsHttpError?: boolean;
}

export interface ProbeManifestEntry {
  /** Stable id, `<provider>.<shape>`. */
  id: string;
  provider: ProbeProvider;
  /** The model or endpoint whose response shape this entry pins. */
  target: string;
  /** Name of the production decoder the check runs. */
  decoder: string;
  /** Raw response fixture, relative to `tests/fixtures/provider-contract/`. */
  fixture: string;
  /**
   * Run the production decoder over a raw response body and assert what the
   * provider needs from it. Throws on anything a caller could not use.
   */
  check(raw: unknown): void;
  /**
   * Dotted paths into the fixture whose removal must make `check` fail. These
   * are the positive controls: the offline test deletes each one and requires
   * the check to reject the result.
   */
  requiredFields: string[];
  /** The nightly live request, or null when this shape is fixture-only. */
  live: LiveProbeSpec | null;
  /** Why there is no live probe. Required when `live` is null. */
  liveGap?: string;
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function checkChatCompletion(raw: unknown): void {
  const decoded: DecodedChatCompletion = decodeChatCompletion(raw);
  expect(
    isNonEmptyString(decoded.content) || (decoded.toolCalls?.length ?? 0) > 0,
    "chat completion carried neither content nor a tool call"
  );
  expect(
    isNonEmptyString(decoded.finishReason),
    "chat completion carried no finish_reason"
  );
  expect(decoded.usage !== null, "chat completion carried no usage block");
  expect(
    (decoded.usage?.outputTokens ?? 0) > 0,
    "chat completion reported zero output tokens"
  );
}

const OPENAI_PROBE_MODEL = "gpt-5.4-mini";
const GEMINI_PROBE_MODEL = "gemini-3-flash";

export const PROBE_MANIFEST: ProbeManifestEntry[] = [
  {
    id: "openai.chat-completion",
    provider: "openai",
    target: `POST https://api.openai.com/v1/chat/completions (${OPENAI_PROBE_MODEL})`,
    decoder: "decodeChatCompletion",
    fixture: "openai/chat-completion.json",
    check: checkChatCompletion,
    requiredFields: [
      "choices",
      "choices.0.message.content",
      "choices.0.finish_reason",
      "usage"
    ],
    live: {
      credential: "OPENAI_API_KEY",
      maxRequests: 1,
      maxCostUsd: 0.05,
      estimatedCostUsd: 0.001,
      request: (env, credential) => ({
        url: "https://api.openai.com/v1/chat/completions",
        init: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credential}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: env.NODETOOL_PROBE_OPENAI_MODEL ?? OPENAI_PROBE_MODEL,
            messages: [{ role: "user", content: "Reply with the word ok." }],
            max_completion_tokens: 16
          })
        }
      })
    }
  },
  {
    id: "openai.models-list",
    provider: "openai",
    target: "GET https://api.openai.com/v1/models",
    decoder: "decodeOpenAIModelList",
    fixture: "openai/models-list.json",
    check: (raw) => {
      const models = decodeOpenAIModelList(raw, {
        provider: "openai",
        onlyResponsesModels: true
      });
      expect(models.length > 0, "model list decoded to no gpt-5 models");
      expect(
        models.every((m) => isNonEmptyString(m.id) && isNonEmptyString(m.name)),
        "a decoded model is missing an id or name"
      );
    },
    requiredFields: ["data", "data.0.id"],
    live: null,
    liveGap:
      "One live request per provider, and the chat completion is the shape a " +
      "run actually depends on. The model list is covered by its fixture."
  },
  {
    id: "gemini.generate-content",
    provider: "gemini",
    target: `POST :generateContent (${GEMINI_PROBE_MODEL})`,
    decoder: "decodeGeminiGenerateContent",
    fixture: "gemini/generate-content.json",
    check: (raw) => {
      const decoded = decodeGeminiGenerateContent(raw);
      expect(decoded.parts.length > 0, "candidate carried no parts");
      expect(
        decoded.parts.some((part) => isNonEmptyString(part.text)),
        "no candidate part carried text"
      );
      expect(
        (decoded.usage?.candidatesTokenCount ?? 0) > 0,
        "usageMetadata reported no candidate tokens"
      );
    },
    requiredFields: [
      "candidates",
      "candidates.0.content.parts",
      "usageMetadata.candidatesTokenCount"
    ],
    live: {
      credential: "GEMINI_API_KEY",
      maxRequests: 1,
      maxCostUsd: 0.05,
      estimatedCostUsd: 0.001,
      request: (env, credential) => {
        const model = env.NODETOOL_PROBE_GEMINI_MODEL ?? GEMINI_PROBE_MODEL;
        return {
          url:
            "https://generativelanguage.googleapis.com/v1beta/models/" +
            `${model}:generateContent?key=${encodeURIComponent(credential)}`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                { role: "user", parts: [{ text: "Reply with the word ok." }] }
              ],
              generationConfig: { maxOutputTokens: 16 }
            })
          }
        };
      }
    }
  },
  {
    id: "gemini.models-list",
    provider: "gemini",
    target: "GET https://generativelanguage.googleapis.com/v1beta/models",
    decoder: "decodeGeminiModelsPage",
    fixture: "gemini/models-list.json",
    check: (raw) => {
      const page = decodeGeminiModelsPage(raw);
      const usable = (page.models ?? []).filter((m) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent")
      );
      expect(usable.length > 0, "no listed model supports generateContent");
      expect(
        usable.every((m) => isNonEmptyString(m.name)),
        "a listed model has no name"
      );
    },
    requiredFields: [
      "models",
      "models.0.name",
      "models.0.supportedGenerationMethods"
    ],
    live: null,
    liveGap:
      "One live request per provider; generateContent is the shape a run " +
      "depends on. The model list is covered by its fixture."
  },
  {
    id: "fal_ai.language-catalog",
    provider: "fal_ai",
    target: "GET https://openrouter.ai/api/v1/models",
    decoder: "decodeFalLanguageCatalog",
    fixture: "fal_ai/language-catalog.json",
    check: (raw) => {
      const rows = decodeFalLanguageCatalog(raw);
      expect(rows.length > 0, "fal catalog decoded to no rows");
      expect(
        rows.some((row) => isNonEmptyString(row.id)),
        "no catalog row carried an id"
      );
      expect(
        rows.some((row) => row.supported_parameters?.includes("tools")),
        "no catalog row declared tool support"
      );
    },
    requiredFields: ["data", "data.0.id", "data.0.supported_parameters"],
    live: {
      // fal's chat route is OpenRouter's router, and its catalog is the public
      // OpenRouter listing — no credential, no cost.
      credential: null,
      maxRequests: 1,
      maxCostUsd: 0,
      estimatedCostUsd: 0,
      request: () => ({
        url: "https://openrouter.ai/api/v1/models",
        init: { method: "GET" }
      })
    }
  },
  {
    id: "fal_ai.image-result",
    provider: "fal_ai",
    target: "fal queue result (image endpoints)",
    decoder: "extractImageUrls",
    fixture: "fal_ai/image-result.json",
    check: (raw) => {
      const urls = extractImageUrls(raw as Record<string, unknown>);
      expect(urls.length > 0, "no image url in the fal result");
      expect(
        urls.every((url) => url.startsWith("https://")),
        "a fal image url is not https"
      );
    },
    requiredFields: ["images", "images.0.url"],
    live: null,
    liveGap:
      "A live image result requires a paid generation. Covered by fixtures " +
      "until the manifest's per-provider request budget is raised."
  },
  {
    id: "fal_ai.video-result",
    provider: "fal_ai",
    target: "fal queue result (video endpoints)",
    decoder: "extractVideoUrl",
    fixture: "fal_ai/video-result.json",
    check: (raw) => {
      const url = extractVideoUrl(raw as Record<string, unknown>);
      expect(url.startsWith("https://"), "fal video url is not https");
    },
    requiredFields: ["video.url"],
    live: null,
    liveGap: "A live video result requires a paid generation."
  },
  {
    id: "fal_ai.audio-result",
    provider: "fal_ai",
    target: "fal queue result (TTS and music endpoints)",
    decoder: "extractAudioUrl",
    fixture: "fal_ai/audio-result.json",
    check: (raw) => {
      const url = extractAudioUrl(raw as Record<string, unknown>);
      expect(url.startsWith("https://"), "fal audio url is not https");
    },
    requiredFields: ["audio.url"],
    live: null,
    liveGap: "A live audio result requires a paid generation."
  },
  {
    id: "kie.error-envelope",
    provider: "kie",
    target: "POST https://api.kie.ai/api/v1/jobs/createTask (unknown model)",
    decoder: "kieEnvelopeError",
    fixture: "kie/error-envelope.json",
    check: (raw) => {
      const error = kieEnvelopeError(raw as Record<string, unknown>);
      expect(
        error !== null,
        "KIE error envelope no longer decodes to a known code"
      );
    },
    requiredFields: ["code"],
    live: {
      credential: "KIE_API_KEY",
      maxRequests: 1,
      maxCostUsd: 0,
      estimatedCostUsd: 0,
      // KIE reports a rejected submission inside the body, so this creates no
      // job and costs nothing. It is the only KIE response a probe can obtain
      // without paying for a generation.
      acceptsHttpError: true,
      request: (_env, credential) => ({
        url: "https://api.kie.ai/api/v1/jobs/createTask",
        init: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credential}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "nodetool/contract-probe-no-such-model",
            input: {}
          })
        }
      })
    }
  },
  {
    id: "kie.create-task",
    provider: "kie",
    target: "POST https://api.kie.ai/api/v1/jobs/createTask (accepted)",
    decoder: "decodeKieTaskSubmission",
    fixture: "kie/create-task.json",
    check: (raw) => {
      const taskId = decodeKieTaskSubmission(raw as Record<string, unknown>);
      expect(isNonEmptyString(taskId), "createTask decoded to an empty taskId");
    },
    requiredFields: ["data.taskId"],
    live: null,
    liveGap: "Accepting a task starts a paid job."
  },
  {
    id: "kie.record-info",
    provider: "kie",
    target: "GET https://api.kie.ai/api/v1/jobs/recordInfo",
    decoder: "decodeKieRecordInfo",
    fixture: "kie/record-info.json",
    check: (raw) => {
      const info = decodeKieRecordInfo(raw as Record<string, unknown>);
      expect(
        info.state === "success",
        `recordInfo decoded to state "${info.state}", expected "success"`
      );
      const urls = decodeKieResultUrls(raw as Record<string, unknown>);
      expect(urls.length > 0, "recordInfo carried no result urls");
    },
    requiredFields: ["data.state", "data.resultJson"],
    live: null,
    liveGap: "A finished record requires a paid job."
  }
];

/** Every provider the manifest covers, in manifest order. */
export function probeProviders(): ProbeProvider[] {
  return [...new Set(PROBE_MANIFEST.map((entry) => entry.provider))];
}
