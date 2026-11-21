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
    expect(url).toBe("https://api.runpod.io/v2/pods");
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

describe("checkCredential region settings", () => {
  async function probedUrl(
    key: string,
    settings: Record<string, string>
  ): Promise<string> {
    const fetchImpl = vi.fn().mockResolvedValue(respond(401));
    await checkCredential(key, "k", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSetting: async (name) => settings[name] ?? null
    });
    return String(fetchImpl.mock.calls[0][0]);
  }

  it("probes DashScope in the international region when no region is set", async () => {
    expect(await probedUrl("DASHSCOPE_API_KEY", {})).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models"
    );
    expect(await probedUrl("DASHSCOPE_API_KEY", { DASHSCOPE_REGION: "mars" })).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models"
    );
  });

  it("probes a mainland DashScope key on the Beijing host", async () => {
    expect(await probedUrl("DASHSCOPE_API_KEY", { DASHSCOPE_REGION: "china" })).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
    );
  });

  it("probes the stored DASHSCOPE_BASE_URL over the region", async () => {
    expect(
      await probedUrl("DASHSCOPE_API_KEY", {
        DASHSCOPE_REGION: "china",
        DASHSCOPE_BASE_URL: "https://ws-1.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
      })
    ).toBe("https://ws-1.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models");
  });

  it("probes the stored BYTEPLUS_ARK_BASE_URL", async () => {
    expect(
      await probedUrl("BYTEPLUS_ARK_API_KEY", {
        BYTEPLUS_ARK_BASE_URL: "https://ark.eu-west.example.com/api/v3"
      })
    ).toBe("https://ark.eu-west.example.com/api/v3/models");
  });

  it("falls back to the environment when the setting cannot be read", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(401));
    const result = await checkCredential("DASHSCOPE_API_KEY", "k", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSetting: async () => {
        throw new Error("locked");
      }
    });
    expect(result.status).toBe("invalid");
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models"
    );
  });
});

describe("checkCredential cross-region retry", () => {
  const mainlandOnly = (url: string): Response =>
    respond(url.startsWith("https://dashscope.aliyuncs.com") || url.startsWith("https://api.moonshot.cn") ? 200 : 401);

  it("finds a mainland DashScope key on the Beijing host and names the region", async () => {
    const fetchImpl = vi.fn(async (url: string) => mainlandOnly(String(url)));
    const result = await checkCredential("DASHSCOPE_API_KEY", "k", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSetting: async () => null
    });
    expect(result.status).toBe("valid");
    expect(result.region).toEqual({ setting: "DASHSCOPE_REGION", value: "china" });
    expect(result.message).toContain("DASHSCOPE_REGION is now china");
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
      "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
    ]);
  });

  it("finds a mainland Kimi key on the .cn host", async () => {
    const fetchImpl = vi.fn(async (url: string) => mainlandOnly(String(url)));
    const result = await checkCredential("KIMI_API_KEY", "k", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSetting: async () => null
    });
    expect(result.status).toBe("valid");
    expect(result.region).toEqual({ setting: "KIMI_REGION", value: "china" });
  });

  it("reports the first rejection when every region rejects the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(401));
    const result = await checkCredential("DASHSCOPE_API_KEY", "k", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSetting: async () => null
    });
    expect(result.status).toBe("invalid");
    expect(result.region).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not move a key off a pinned DASHSCOPE_BASE_URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(401));
    const result = await checkCredential("DASHSCOPE_API_KEY", "k", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSetting: async (name) =>
        name === "DASHSCOPE_BASE_URL" ? "https://ws-1.example.com/compatible-mode/v1" : null
    });
    expect(result.status).toBe("invalid");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the configured region when the key works there", async () => {
    const fetchImpl = vi.fn(async (url: string) => mainlandOnly(String(url)));
    const result = await checkCredential("DASHSCOPE_API_KEY", "k", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSetting: async (name) => (name === "DASHSCOPE_REGION" ? "china" : null)
    });
    expect(result.status).toBe("valid");
    expect(result.region).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
