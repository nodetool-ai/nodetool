import { describe, it, expect, vi } from "vitest";
import {
  checkCredential,
  isCredentialVerifiable,
  verifiableCredentialKeys
} from "../../src/providers/credential-check.js";

const respond = (status: number): Response =>
  new Response(status === 200 ? "{}" : "", { status });

describe("checkCredential", () => {
  it("reports valid on a 2xx and sends the credential as the provider expects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(200));

    const result = await checkCredential("OPENAI_API_KEY", "sk-test", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.status).toBe("valid");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/models");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-test"
    });
  });

  it("reports invalid on 401 and on 403", async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn().mockResolvedValue(respond(status));
      const result = await checkCredential("ANTHROPIC_API_KEY", "k", {
        fetchImpl: fetchImpl as unknown as typeof fetch
      });
      expect(result.status).toBe("invalid");
      expect(result.message).toContain(String(status));
    }
  });

  it("reports unverifiable — never valid — on a status that says nothing", async () => {
    for (const status of [429, 500, 503]) {
      const fetchImpl = vi.fn().mockResolvedValue(respond(status));
      const result = await checkCredential("GROQ_API_KEY", "k", {
        fetchImpl: fetchImpl as unknown as typeof fetch
      });
      expect(result.status).toBe("unverifiable");
    }
  });

  it("reports unverifiable when the request fails outright", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const result = await checkCredential("MISTRAL_API_KEY", "k", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result.status).toBe("unverifiable");
    expect(result.message).toMatch(/could not reach/i);
  });

  it("reports unverifiable when the probe outruns its timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );

    const result = await checkCredential("HF_TOKEN", "hf_x", {
      timeoutMs: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.status).toBe("unverifiable");
    expect(result.message).toMatch(/did not answer/i);
  });

  it("reports unverifiable for a provider with no probe, without any request", async () => {
    const fetchImpl = vi.fn();
    const result = await checkCredential("FAL_API_KEY", "fal-key", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.status).toBe("unverifiable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports invalid for an empty value without spending a request", async () => {
    const fetchImpl = vi.fn();
    const result = await checkCredential("OPENAI_API_KEY", "", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.status).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("probes RunPod's pod listing with a bearer key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(401));
    const result = await checkCredential("RUNPOD_API_KEY", "rp-key", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.status).toBe("invalid");
    expect(result.message).toContain("RunPod");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://rest.runpod.io/v1/pods");
    expect((init as RequestInit).headers).toEqual({
      Authorization: "Bearer rp-key"
    });
  });

  it("probes Sarvam's model listing with the subscription-key header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(200));
    const result = await checkCredential("SARVAM_API_KEY", "sv-key", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.status).toBe("valid");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.sarvam.ai/v2/models");
    expect((init as RequestInit).headers).toEqual({
      "api-subscription-key": "sv-key"
    });
  });

  it("keys a URL-authenticated provider on the value instead of a header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(200));
    await checkCredential("GEMINI_API_KEY", "abc/123", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("key=abc%2F123");
    expect((init as RequestInit).headers).toEqual({});
  });
});

describe("isCredentialVerifiable", () => {
  it("agrees with the probe table", () => {
    expect(isCredentialVerifiable("OPENAI_API_KEY")).toBe(true);
    expect(isCredentialVerifiable("FAL_API_KEY")).toBe(false);
    expect(verifiableCredentialKeys()).toContain("ANTHROPIC_API_KEY");
    expect(verifiableCredentialKeys()).not.toContain("FAL_API_KEY");
  });
});

describe("checkCredential account probes", () => {
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status });

  /** First call answers the listing, the second the account probe. */
  const twoStep = (listing: Response, account: Response) =>
    vi.fn().mockResolvedValueOnce(listing).mockResolvedValueOnce(account);

  it("reports an OpenAI key on an empty account", async () => {
    const fetchImpl = twoStep(
      json(200, { data: [] }),
      json(429, {
        error: {
          message: "You exceeded your current quota, please check your plan and billing details.",
          type: "insufficient_quota",
          code: "insufficient_quota"
        }
      })
    );
    const result = await checkCredential("OPENAI_API_KEY", "sk", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result.status).toBe("valid");
    expect(result.account?.state).toBe("no_credit");
    expect(result.message).toBe(result.account?.message);
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.parse(String((init as RequestInit).body)).max_tokens).toBe(1);
  });

  it("reports a Gemini free-tier key with no quota", async () => {
    const fetchImpl = twoStep(
      json(200, { models: [] }),
      json(429, {
        error: {
          code: 429,
          status: "RESOURCE_EXHAUSTED",
          message:
            "You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 0"
        }
      })
    );
    const result = await checkCredential("GEMINI_API_KEY", "g", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result.status).toBe("valid");
    expect(result.account?.state).toBe("no_quota");
  });

  it("reports an Anthropic account whose credit balance is too low", async () => {
    const fetchImpl = twoStep(
      json(200, { data: [] }),
      json(400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Your credit balance is too low to access the Anthropic API."
        }
      })
    );
    const result = await checkCredential("ANTHROPIC_API_KEY", "a", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result.account?.state).toBe("no_credit");
  });

  it("reads an empty DeepSeek balance", async () => {
    const fetchImpl = twoStep(
      json(200, { data: [] }),
      json(200, { is_available: false, balance_infos: [] })
    );
    const result = await checkCredential("DEEPSEEK_API_KEY", "d", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result.account?.state).toBe("no_credit");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://api.deepseek.com/user/balance");
  });

  it("reads OpenRouter's key description without a second request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        json(200, { data: { limit_remaining: null, is_free_tier: true } })
      );
    const result = await checkCredential("OPENROUTER_API_KEY", "o", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result.account?.state).toBe("free_tier");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("says nothing about the account when the test request fails for another reason", async () => {
    const fetchImpl = twoStep(
      json(200, { data: [] }),
      json(404, { error: { message: "The model does not exist" } })
    );
    const result = await checkCredential("OPENAI_API_KEY", "sk", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result.status).toBe("valid");
    expect(result.account).toBeUndefined();
    expect(result.message).toBe("OpenAI accepted the key.");
  });

  it("keeps the key check when the account probe throws", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { data: [] }))
      .mockRejectedValueOnce(new Error("fetch failed"));
    const result = await checkCredential("ANTHROPIC_API_KEY", "a", {
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(result.status).toBe("valid");
    expect(result.account).toBeUndefined();
  });
});
