/**
 * The per-user spend limits of a self-hosted server: which calls they stop,
 * and that work on a user's own key is never counted or refused.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setMasterKey } from "@nodetool-ai/security";
import {
  DEFAULT_QUOTA_SUBJECT,
  Prediction,
  Secret,
  initTestDb,
  setProviderCredentialKeyResolver,
  setQuota
} from "@nodetool-ai/models";
import {
  admitQuota,
  forgetQuota,
  installQuotaLedger,
  providerCredentialKey,
  quotaNeedsForGraph
} from "../src/quota-gate.js";

const USER = "e".repeat(32);

const spend = (fields: Record<string, unknown>) =>
  Prediction.create({
    user_id: USER,
    model: "m",
    status: "completed",
    ...fields
  });

describe("quota gate", () => {
  beforeEach(() => {
    initTestDb();
    setMasterKey("dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz");
    installQuotaLedger();
    forgetQuota();
  });

  afterEach(() => {
    setProviderCredentialKeyResolver(null);
    forgetQuota();
  });

  it("allows everything when no limit is set", async () => {
    await spend({ provider: "openai", input_tokens: 10_000_000 });
    expect(await admitQuota(USER, [{ kind: "tokens", provider: "openai" }])).toEqual({
      allowed: true
    });
  });

  it("refuses model calls once the token budget is used up", async () => {
    await setQuota(DEFAULT_QUOTA_SUBJECT, { tokenLimit: 100 }, null);
    await spend({ provider: "openai", input_tokens: 60, output_tokens: 39 });
    expect((await admitQuota(USER, [{ kind: "tokens", provider: "openai" }])).allowed).toBe(true);

    await spend({ provider: "openai", input_tokens: 1 });
    const refused = await admitQuota(USER, [{ kind: "tokens", provider: "openai" }]);
    expect(refused).toMatchObject({ allowed: false, kind: "tokens" });
    if (!refused.allowed) {
      expect(refused.reason).toContain("100 of your 100 model tokens this month");
    }
    // The media budget is unlimited, so media work still runs.
    expect((await admitQuota(USER, [{ kind: "media", provider: "fal_ai" }])).allowed).toBe(true);
  });

  it("refuses media work its estimate would carry over the budget", async () => {
    await setQuota(USER, { period: "day", mediaUsdLimit: 1 }, null);
    await spend({ provider: "fal_ai", cost: 0.7 });
    expect(
      (await admitQuota(USER, [{ kind: "media", provider: "fal_ai", estimatedUsd: 0.2 }])).allowed
    ).toBe(true);
    const refused = await admitQuota(USER, [
      { kind: "media", provider: "fal_ai", estimatedUsd: 0.4 }
    ]);
    expect(refused).toMatchObject({ allowed: false, kind: "media" });
    if (!refused.allowed) {
      expect(refused.reason).toContain("$0.70 of your $1.00 media budget today");
    }
  });

  it("never counts or refuses work on the user's own key", async () => {
    await setQuota(DEFAULT_QUOTA_SUBJECT, { tokenLimit: 10 }, null);
    await Secret.upsert({ userId: USER, key: "OPENAI_API_KEY", value: "sk-own" });
    const own = await spend({ provider: "openai", input_tokens: 500 });
    expect(own.key_source).toBe("user");
    expect((await admitQuota(USER, [{ kind: "tokens", provider: "openai" }])).allowed).toBe(true);

    await spend({ provider: "anthropic", input_tokens: 10 });
    expect((await admitQuota(USER, [{ kind: "tokens", provider: "anthropic" }])).allowed).toBe(false);
    // The same user's own key still works once the server budget is gone.
    expect((await admitQuota(USER, [{ kind: "tokens", provider: "openai" }])).allowed).toBe(true);
  });

  it("names the credential each provider family bills against", () => {
    expect(providerCredentialKey("openai")).toBe("OPENAI_API_KEY");
    expect(providerCredentialKey("fal_ai")).toBe("FAL_API_KEY");
    expect(providerCredentialKey("kie")).toBe("KIE_API_KEY");
    expect(providerCredentialKey("replicate")).toBe("REPLICATE_API_TOKEN");
    expect(providerCredentialKey("")).toBeNull();
  });

  it("reads which budgets a workflow graph spends from", () => {
    const metadata: Record<string, unknown> = {
      "llm.Chat": {
        properties: [{ name: "model", type: { type: "language_model" } }]
      },
      "image.TextToImage": {
        properties: [{ name: "model", type: { type: "image_model" } }]
      },
      "fal.Flux": { fal_unit_pricing: { unit_price: 0.05 } },
      "text.Concat": { properties: [{ name: "a", type: { type: "str" } }] }
    };
    const needs = quotaNeedsForGraph(
      [
        { id: "1", type: "llm.Chat", data: { model: { provider: "openai", id: "gpt" } } },
        { id: "2", type: "image.TextToImage", data: { model: { provider: "gemini", id: "img" } } },
        { id: "3", type: "fal.Flux", data: {} },
        { id: "4", type: "text.Concat", data: { a: "x" } }
      ],
      (type) => metadata[type] as never,
      [
        { node_id: "2", estimated_cost: 0.04 },
        { node_id: "3", estimated_cost: 0.05 }
      ]
    );
    expect(needs).toEqual([
      { kind: "tokens", provider: "openai" },
      { kind: "media", provider: "gemini", estimatedUsd: 0.04 },
      { kind: "media", provider: "fal_ai", estimatedUsd: 0.05 }
    ]);
  });
});
