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
