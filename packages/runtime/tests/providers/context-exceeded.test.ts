/**
 * Each provider's context-window refusal reaches the caller as one code.
 *
 * The inputs are the same checked-in raw response bodies the offline contract
 * probes decode, fed here through the real provider so that what a failed turn
 * leaves on the error is what a caller reads: `context_exceeded`. A caller that
 * cannot recognize this failure has nothing to do with it but hand the user a
 * provider error; recognizing it is what lets the transcript be shortened and
 * the turn retried.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { APIError as AnthropicAPIError } from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { APIError as OpenAIAPIError } from "openai";
import { AnthropicProvider } from "../../src/providers/anthropic-provider.js";
import { GeminiProvider } from "../../src/providers/gemini-provider.js";
import { OpenAIProvider } from "../../src/providers/openai-provider.js";
import { FakeProvider } from "../../src/providers/fake-provider.js";
import { providerFailureDetail } from "../../src/providers/provider-error.js";
import type { Message } from "../../src/providers/types.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/provider-contract/", import.meta.url)
);

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as Record<
    string,
    unknown
  >;
}

const PROMPT: Message[] = [{ role: "user", content: "hello" }];

/** The error a turn threw, or a failure when the turn did not throw. */
async function failureFrom(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (err) {
    return err;
  }
  throw new Error("the provider returned a message instead of failing");
}

function anthropicClient(create: () => Promise<unknown>): Anthropic {
  // SAFETY: the non-streaming turn reaches `messages.create` and nothing else
  // on the client, so the rest of the SDK surface is never read.
  return { messages: { create } } as unknown as Anthropic;
}

function openAIClient(create: () => Promise<unknown>): OpenAI {
  // SAFETY: as above — the non-streaming turn reaches only
  // `chat.completions.create`.
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

describe("anthropic", () => {
  it("maps the 400 the API returns when the input overflows the window", async () => {
    const body = fixture("anthropic/context-window-exceeded.json");
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      {
        client: anthropicClient(() =>
          Promise.reject(
            AnthropicAPIError.generate(400, body, undefined, new Headers())
          )
        )
      }
    );

    const err = await failureFrom(() =>
      provider.generateMessageTraced({
        model: "claude-sonnet-5",
        messages: PROMPT
      })
    );

    expect(providerFailureDetail(err)).toEqual({
      code: "context_exceeded",
      provider: "anthropic",
      secretKey: null
    });
  });

  it("maps the stop reason generation ends on when it runs into the window", async () => {
    const response = fixture("anthropic/context-window-exceeded-stop.json");
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      { client: anthropicClient(() => Promise.resolve(response)) }
    );

    const err = await failureFrom(() =>
      provider.generateMessageTraced({
        model: "claude-sonnet-5",
        messages: PROMPT
      })
    );

    expect(providerFailureDetail(err)?.code).toBe("context_exceeded");
  });

  it("leaves an unrelated failure unmapped", async () => {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: "k" },
      {
        client: anthropicClient(() =>
          Promise.reject(
            AnthropicAPIError.generate(
              429,
              {
                type: "error",
                error: {
                  type: "rate_limit_error",
                  message: "Number of request tokens has exceeded your rate limit"
                }
              },
              undefined,
              new Headers()
            )
          )
        )
      }
    );

    const err = await failureFrom(() =>
      provider.generateMessageTraced({
        model: "claude-sonnet-5",
        messages: PROMPT
      })
    );

    expect(providerFailureDetail(err)?.code).not.toBe("context_exceeded");
  });
});

describe("openai", () => {
  it("maps the context_length_exceeded error code", async () => {
    const body = fixture("openai/context-length-exceeded.json");
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: openAIClient(() =>
          Promise.reject(
            OpenAIAPIError.generate(400, body, undefined, new Headers())
          )
        )
      }
    );

    const err = await failureFrom(() =>
      provider.generateMessageTraced({ model: "gpt-4o-mini", messages: PROMPT })
    );

    expect(providerFailureDetail(err)).toEqual({
      code: "context_exceeded",
      provider: "openai",
      secretKey: null
    });
  });

  it("leaves an unrelated failure unmapped", async () => {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: "k" },
      {
        client: openAIClient(() =>
          Promise.reject(
            OpenAIAPIError.generate(
              429,
              {
                error: {
                  message: "Rate limit reached for gpt-4o-mini",
                  type: "requests",
                  code: "rate_limit_exceeded"
                }
              },
              undefined,
              new Headers()
            )
          )
        )
      }
    );

    const err = await failureFrom(() =>
      provider.generateMessageTraced({ model: "gpt-4o-mini", messages: PROMPT })
    );

    expect(providerFailureDetail(err)?.code).not.toBe("context_exceeded");
  });
});

describe("gemini", () => {
  function geminiProvider(status: number, body: unknown): GeminiProvider {
    return new GeminiProvider(
      { GEMINI_API_KEY: "k" },
      {
        fetchFn: async () =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" }
          })
      }
    );
  }

  it("maps the 400 that reports the input token count", async () => {
    const provider = geminiProvider(
      400,
      fixture("gemini/context-window-exceeded.json")
    );

    const err = await failureFrom(() =>
      provider.generateMessageTraced({
        model: "gemini-3-flash",
        messages: PROMPT
      })
    );

    expect(providerFailureDetail(err)).toEqual({
      code: "context_exceeded",
      provider: "gemini",
      secretKey: null
    });
  });

  it("leaves an unrelated failure unmapped", async () => {
    const provider = geminiProvider(429, {
      error: {
        code: 429,
        message: "Resource has been exhausted (e.g. check quota).",
        status: "RESOURCE_EXHAUSTED"
      }
    });

    const err = await failureFrom(() =>
      provider.generateMessageTraced({
        model: "gemini-3-flash",
        messages: PROMPT
      })
    );

    expect(providerFailureDetail(err)?.code).not.toBe("context_exceeded");
  });
});

describe("a provider with no established signal", () => {
  it("classifies nothing, so no transcript is rewritten on a guess", () => {
    const provider = new FakeProvider();
    const body = fixture("openai/context-length-exceeded.json");

    expect(provider.isContextExceededError(body)).toBe(false);
    expect(
      provider.isContextExceededError(
        new Error("This model's maximum context length is 128000 tokens")
      )
    ).toBe(false);
  });
});
