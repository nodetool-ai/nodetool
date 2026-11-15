import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedProviderCredit,
  clearProviderCredit,
  creditAccountFor,
  creditAccountKey,
  creditBlockReason,
  creditEndpointProviderIds,
  creditFromAmount,
  fetchProviderCredit,
  markProviderCreditExhausted,
  readProviderCredit
} from "../../src/providers/provider-credits.js";
import { BaseProvider } from "../../src/providers/base-provider.js";
import { getProvider, registerProvider, unregisterProvider } from "../../src/providers/provider-registry.js";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

function fetchReturning(status: number, body: unknown) {
  return vi.fn().mockImplementation(async () => json(status, body));
}

async function read(providerId: string, body: unknown, status = 200) {
  const fetchImpl = fetchReturning(status, body);
  const credit = await fetchProviderCredit(providerId, "key-123", {
    fetchImpl: fetchImpl as unknown as typeof fetch
  });
  return { credit, fetchImpl };
}

afterEach(() => clearProviderCredit());

describe("fetchProviderCredit", () => {
  it("reads an OpenRouter key's remaining limit", async () => {
    const { credit, fetchImpl } = await read("openrouter", {
      data: { limit: 20, limit_remaining: 1.5, usage: 18.5 }
    });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/key");
    expect(credit).toMatchObject({ state: "low", remaining: 1.5, limit: 20, currency: "USD" });
  });

  it("reports nothing for an OpenRouter key with no spending cap", async () => {
    const { credit } = await read("openrouter", { data: { limit: null, limit_remaining: null } });
    expect(credit).toBeNull();
  });

  it("reads a DeepSeek balance and trusts is_available over the amount", async () => {
    const ok = await read("deepseek", {
      is_available: true,
      balance_infos: [{ currency: "CNY", total_balance: "110.00" }]
    });
    expect(ok.credit).toMatchObject({ state: "available", remaining: 110, currency: "CNY" });

    const empty = await read("deepseek", {
      is_available: false,
      balance_infos: [{ currency: "USD", total_balance: "0.30" }]
    });
    expect(empty.credit?.state).toBe("exhausted");
  });

  it("reads Moonshot, KIE, Meshy, Topaz, Atlas Cloud and Comfy balances", async () => {
    expect((await read("moonshot", { code: 0, data: { available_balance: 49.5 } })).credit)
      .toMatchObject({ state: "available", remaining: 49.5, currency: "USD" });
    expect((await read("kie", { code: 200, msg: "success", data: 0 })).credit?.state)
      .toBe("exhausted");
    expect((await read("meshy", { balance: 1000 })).credit)
      .toMatchObject({ remaining: 1000, unit: "credits" });
    expect((await read("topaz", { available_credits: 12, reserved_credits: 3 })).credit)
      .toMatchObject({ remaining: 12, unit: "credits" });
    expect((await read("atlascloud", { available: { value: "4.250000", currency: "usd" } })).credit)
      .toMatchObject({ remaining: 4.25, currency: "USD" });
    expect((await read("comfy_cloud", { summary: { balance: { amount_micros: 4250, currency: "USD" } } })).credit)
      .toMatchObject({ remaining: 42.5, currency: "USD" });
  });

  it("treats a KIE error body sent with HTTP 200 as unknown", async () => {
    expect((await read("kie", { code: 401, msg: "Unauthorized" })).credit).toBeNull();
  });

  it("sends fal its Key scheme and reads the expanded credits", async () => {
    const { credit, fetchImpl } = await read("fal_ai", {
      username: "team",
      credits: { current_balance: 24.5, currency: "USD" }
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.fal.ai/v1/account/billing?expand=credits");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Key key-123" });
    expect(credit).toMatchObject({ remaining: 24.5, state: "available" });
  });

  it("reports nothing when fal refuses a key without billing permission", async () => {
    expect((await read("fal_ai", { detail: "forbidden" }, 403)).credit).toBeNull();
  });

  it("does not call ElevenLabs exhausted while overage billing is on", async () => {
    const capped = await read("elevenlabs", {
      character_count: 10000,
      character_limit: 10000,
      can_extend_character_limit: false,
      max_credit_limit_extension: 0
    });
    expect(capped.credit?.state).toBe("exhausted");

    const overage = await read("elevenlabs", {
      character_count: 10000,
      character_limit: 10000,
      can_extend_character_limit: true,
      max_credit_limit_extension: "unlimited"
    });
    expect(overage.credit?.state).not.toBe("exhausted");
  });

  it("limits Evolink to the smaller of the key and account balances", async () => {
    const { credit } = await read("evolink", {
      success: true,
      data: {
        token: { remaining_credits: 5, used_credits: 1, unlimited_credits: false },
        user: { remaining_credits: 900, used_credits: 1 }
      }
    });
    expect(credit?.remaining).toBe(5);
  });

  it("answers null for a provider without an endpoint, and never throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await fetchProviderCredit("openai", "k", { fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await fetchProviderCredit("deepseek", "k", { fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
  });

  it("covers the providers the findings table lists", () => {
    expect(creditEndpointProviderIds().sort()).toEqual([
      "atlascloud", "comfy_cloud", "deepseek", "elevenlabs", "evolink", "fal_ai",
      "kie", "meshy", "moonshot", "openrouter", "topaz"
    ]);
  });
});

describe("creditFromAmount", () => {
  it("marks low under a tenth of the limit or under one currency unit", () => {
    expect(creditFromAmount({ label: "X", remaining: 9, limit: 100, unit: "credits" }).state).toBe("low");
    expect(creditFromAmount({ label: "X", remaining: 11, limit: 100, unit: "credits" }).state).toBe("available");
    expect(creditFromAmount({ label: "X", remaining: 0.5, unit: "currency", currency: "USD" }).state).toBe("low");
    expect(creditFromAmount({ label: "X", remaining: 5, unit: "credits" }).state).toBe("available");
  });
});

describe("credit cache", () => {
  it("keys accounts by provider and credential, never by the raw key", () => {
    const a = creditAccountKey("deepseek", "sk-a");
    expect(a).not.toContain("sk-a");
    expect(a).not.toBe(creditAccountKey("deepseek", "sk-b"));
    expect(a).toBe(creditAccountKey("deepseek", "sk-a"));
    expect(creditAccountKey("codex", undefined)).toBe("codex");
  });

  it("caches a read and shares concurrent requests", async () => {
    const fetchImpl = fetchReturning(200, { balance: 10 });
    const account = creditAccountFor("meshy", "k", { fetchImpl: fetchImpl as unknown as typeof fetch });
    const [one, two] = await Promise.all([readProviderCredit(account), readProviderCredit(account)]);
    expect(one?.remaining).toBe(10);
    expect(two?.remaining).toBe(10);
    await readProviderCredit(account);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await readProviderCredit(account, { refresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("answers cachedOnly reads without waiting and fills the cache behind them", async () => {
    const fetchImpl = fetchReturning(200, { balance: 0 });
    const account = creditAccountFor("meshy", "k", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await readProviderCredit(account, { cachedOnly: true })).toBeNull();
    await vi.waitFor(() => expect(cachedProviderCredit(account.key)?.state).toBe("exhausted"));
  });

  it("keeps a payment refusal when a later balance read fails", async () => {
    const fetchImpl = fetchReturning(500, {});
    const account = creditAccountFor("meshy", "k", { fetchImpl: fetchImpl as unknown as typeof fetch });
    markProviderCreditExhausted(account.key, "meshy");
    const credit = await readProviderCredit(account, { refresh: true });
    expect(credit?.source).toBe("call_failure");
    expect(creditBlockReason(credit)).toContain("lack of credit");
  });

  it("clears a payment refusal once the balance shows credit", async () => {
    const fetchImpl = fetchReturning(200, { balance: 50 });
    const account = creditAccountFor("meshy", "k", { fetchImpl: fetchImpl as unknown as typeof fetch });
    markProviderCreditExhausted(account.key, "meshy");
    const credit = await readProviderCredit(account, { refresh: true });
    expect(credit?.state).toBe("available");
    expect(creditBlockReason(credit)).toBeNull();
  });
});

class PaymentFailingProvider extends BaseProvider {
  constructor() {
    super("openai");
  }
  async *generateMessages(): AsyncGenerator<never> {
    // Not called.
  }
}

describe("provider instances", () => {
  afterEach(() => unregisterProvider("credit-test"));

  it("binds the registry credential and records a payment refusal", async () => {
    registerProvider("credit-test", PaymentFailingProvider as never, { OPENAI_API_KEY: "" });
    const provider = await getProvider("credit-test", () => "sk-test");
    expect(await provider.creditStatus()).toBeNull();

    provider.recordCallFailure({
      operation: "generateMessages",
      error: Object.assign(new Error("You exceeded your current quota"), {
        status: 429,
        code: "insufficient_quota"
      })
    });
    const credit = await provider.creditStatus({ cachedOnly: true });
    expect(credit?.state).toBe("exhausted");
    expect(cachedProviderCredit(creditAccountKey("credit-test", "sk-test"))?.source).toBe("call_failure");
  });

  it("does not mark a provider exhausted on a rate limit", async () => {
    registerProvider("credit-test", PaymentFailingProvider as never, { OPENAI_API_KEY: "" });
    const provider = await getProvider("credit-test", () => "sk-test");
    provider.recordCallFailure({
      operation: "generateMessages",
      error: Object.assign(new Error("Rate limit reached"), { status: 429 })
    });
    expect(await provider.creditStatus({ cachedOnly: true })).toBeNull();
  });
});
