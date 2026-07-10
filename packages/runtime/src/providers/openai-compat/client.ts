import { sseEvents } from "./sse.js";
import {
  OpenAICompatError,
  errorFromResponse,
  errorFromStreamEvent
} from "./errors.js";
import type {
  ChatCompletionChunk,
  ChatCompletionResponse,
  ChatCompletionsRequest
} from "./types.js";

export interface OpenAICompatClientOptions {
  /** Endpoint root, e.g. `https://api.groq.com/openai/v1`. */
  baseURL: string;
  apiKey: string;
  /** Extra headers sent on every request (gateway attribution headers etc.). */
  defaultHeaders?: Record<string, string>;
  fetchFn?: typeof fetch;
  /**
   * Retries on retryable failures (408/409/429/5xx, network errors) before the
   * response body is consumed. Defaults to 2, matching the `openai` SDK the
   * migrated providers previously relied on.
   */
  maxRetries?: number;
  /** Time-to-response-headers cap. Defaults to 600s (the `openai` SDK value). */
  timeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

const RETRYABLE_STATUS = new Set([408, 409, 429]);
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 600_000;

export function trimTrailingSlashes(url: string): string {
  // A loop, not `replace(/\/+$/,"")` — the regex backtracks polynomially on
  // adversarial input.
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end -= 1;
  return url.slice(0, end);
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status) || status >= 500;
}

/** `Retry-After` seconds when present and sane (0–60s), else null. */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 60) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    if (delta > 0 && delta <= 60_000) return delta;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8000);
  return base * (0.75 + Math.random() * 0.5);
}

/**
 * Minimal typed client for OpenAI-compatible `/chat/completions` endpoints,
 * built on `fetch`. Replaces the `openai` npm package for providers that only
 * ever used it as a generic HTTP client (Groq, Cerebras, xAI, Mistral, …).
 */
export class OpenAICompatClient {
  readonly baseURL: string;
  private readonly _apiKey: string;
  private readonly _defaultHeaders: Record<string, string>;
  private readonly _fetch: typeof fetch;
  private readonly _maxRetries: number;
  private readonly _timeoutMs: number;

  constructor(options: OpenAICompatClientOptions) {
    this.baseURL = trimTrailingSlashes(options.baseURL);
    this._apiKey = options.apiKey;
    this._defaultHeaders = options.defaultHeaders ?? {};
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this._maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this._timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private headers(streaming: boolean): Record<string, string> {
    return {
      Authorization: `Bearer ${this._apiKey}`,
      "Content-Type": "application/json",
      Accept: streaming ? "text/event-stream" : "application/json",
      ...this._defaultHeaders
    };
  }

  /**
   * POST with retries. Retries fire only before any body is consumed, so both
   * the non-streaming call and the streaming connection setup are covered.
   * Non-2xx responses (after retries) surface as {@link OpenAICompatError}.
   */
  private async post(
    path: string,
    body: unknown,
    streaming: boolean,
    options: RequestOptions
  ): Promise<Response> {
    const url = `${this.baseURL}${path}`;
    const payload = JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      options.signal?.throwIfAborted();

      const timeout = AbortSignal.timeout(this._timeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;

      let response: Response;
      try {
        response = await this._fetch(url, {
          method: "POST",
          headers: this.headers(streaming),
          body: payload,
          signal
        });
      } catch (error) {
        // Abort by the caller is never retried; network errors and timeouts are.
        if (options.signal?.aborted) throw error;
        if (attempt >= this._maxRetries) throw error;
        await sleep(backoffMs(attempt));
        continue;
      }

      if (response.ok) return response;

      const detail = await response.text().catch(() => "");
      if (attempt < this._maxRetries && isRetryableStatus(response.status)) {
        await sleep(retryAfterMs(response) ?? backoffMs(attempt));
        continue;
      }
      throw errorFromResponse(response.status, detail);
    }
  }

  /** Non-streaming chat completion. */
  async chatCompletions(
    request: ChatCompletionsRequest,
    options: RequestOptions = {}
  ): Promise<ChatCompletionResponse> {
    const response = await this.post(
      "/chat/completions",
      { ...request, stream: false },
      false,
      options
    );
    return (await response.json()) as ChatCompletionResponse;
  }

  /**
   * Streaming chat completion. Yields parsed SSE chunks until the `[DONE]`
   * sentinel (or end of stream). Mid-stream `{"error": …}` events throw an
   * {@link OpenAICompatError}.
   */
  async *chatCompletionsStream(
    request: ChatCompletionsRequest,
    options: RequestOptions = {}
  ): AsyncGenerator<ChatCompletionChunk, void, undefined> {
    const response = await this.post(
      "/chat/completions",
      { ...request, stream: true },
      true,
      options
    );
    if (!response.body) {
      throw new OpenAICompatError(
        response.status,
        "streaming response has no body"
      );
    }

    for await (const data of sseEvents(response.body)) {
      if (data === "[DONE]") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        throw new OpenAICompatError(
          undefined,
          `could not parse stream event as JSON: ${data.slice(0, 200)}`
        );
      }
      if (typeof parsed !== "object" || parsed === null) continue;
      const event = parsed as Record<string, unknown>;
      const error = errorFromStreamEvent(event);
      // A chunk that also carries choices is data, not a failure; only pure
      // error events (no choices) abort the stream.
      if (error && !Array.isArray(event.choices)) throw error;
      yield event as ChatCompletionChunk;
    }
  }
}
