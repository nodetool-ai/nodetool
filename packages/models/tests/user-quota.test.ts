import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setMasterKey } from "@nodetool-ai/security";
import {
  DEFAULT_QUOTA_SUBJECT,
  Prediction,
  Secret,
  clearQuota,
  getEffectiveQuota,
  initTestDb,
  quotaUsage,
  setProviderCredentialKeyResolver,
  setQuota
} from "../src/index.js";

const USER = "a".repeat(32);
const NOW = new Date("2026-11-15T12:00:00.000Z");

const predict = (fields: Record<string, unknown>) =>
  Prediction.create<Prediction>({
    user_id: USER,
    provider: "openai",
    model: "m",
    status: "completed",
    created_at: "2026-11-10T00:00:00.000Z",
    ...fields
  });

describe("user quotas", () => {
  beforeEach(() => {
    initTestDb();
    setMasterKey("dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz");
    setProviderCredentialKeyResolver((provider) =>
      provider === "ollama" ? null : `${provider.toUpperCase()}_API_KEY`
    );
  });

  afterEach(() => {
    setProviderCredentialKeyResolver(null);
  });

  it("gives a user the default until they get a row of their own", async () => {
    expect(await getEffectiveQuota(USER)).toEqual({ quota: null, custom: false });

    await setQuota(DEFAULT_QUOTA_SUBJECT, { tokenLimit: 1000 }, "admin");
    const inherited = await getEffectiveQuota(USER);
    expect(inherited.custom).toBe(false);
    expect(inherited.quota).toMatchObject({
      subject: DEFAULT_QUOTA_SUBJECT,
      period: "month",
      tokenLimit: 1000,
      mediaUsdLimit: null,
      updatedBy: "admin"
    });

    await setQuota(USER, { period: "day", mediaUsdLimit: 5 }, "admin");
    const own = await getEffectiveQuota(USER);
    expect(own.custom).toBe(true);
    // A user's row replaces the default whole: its null token limit is unlimited.
    expect(own.quota).toMatchObject({ period: "day", tokenLimit: null, mediaUsdLimit: 5 });

    expect(await clearQuota(USER)).toBe(true);
    expect((await getEffectiveQuota(USER)).custom).toBe(false);
  });

  it("keeps fields a change leaves out", async () => {
    await setQuota(USER, { tokenLimit: 10, mediaUsdLimit: 2 }, null);
    const changed = await setQuota(USER, { mediaUsdLimit: null }, null);
    expect(changed).toMatchObject({ tokenLimit: 10, mediaUsdLimit: null });
  });

  it("records whose key paid for a prediction", async () => {
    const server = await predict({});
    expect(server.key_source).toBe("server");

    await Secret.upsert({ userId: USER, key: "OPENAI_API_KEY", value: "sk-own" });
    const own = await predict({});
    expect(own.key_source).toBe("user");

    const local = await predict({ provider: "ollama" });
    expect(local.key_source).toBe("server");
  });

  it("records a ChatGPT sign-in run as the user's, and leaves it out of usage", async () => {
    setProviderCredentialKeyResolver((provider) =>
      provider === "codex" ? "CODEX_ACCESS_TOKEN" : `${provider.toUpperCase()}_API_KEY`
    );
    const row = await predict({
      provider: "codex",
      input_tokens: 400,
      output_tokens: 100
    });
    expect(row.key_source).toBe("user");

    const usage = await quotaUsage(USER, "month", NOW);
    expect(usage.tokens).toBe(0);
  });

  it("leaves the source unset when no resolver is registered", async () => {
    setProviderCredentialKeyResolver(null);
    const row = await predict({});
    expect(row.key_source).toBeNull();
  });

  it("sums tokens and media spend on the server's keys in the window", async () => {
    await predict({ input_tokens: 100, output_tokens: 50 });
    await predict({ total_tokens: 30, input_tokens: 20, output_tokens: 10 });
    await predict({ provider: "fal_ai", cost: 0.25, currency: "USD" });
    await predict({ provider: "fal_ai", cost: 0.5 });
    // Not USD, so not comparable with a USD budget.
    await predict({ provider: "kie", cost: 12, currency: "credits" });
    // Token-billed cost belongs to the token budget, not the media one.
    await predict({ input_tokens: 10, output_tokens: 0, cost: 3 });
    // Before the window.
    await predict({ cost: 9, created_at: "2026-10-31T23:59:59.000Z" });
    // Paid with the user's own key.
    await predict({ cost: 7, key_source: "user" });
    await predict({ input_tokens: 999, key_source: "user" });
    // Written before the column existed: counts as the server's.
    const legacy = await predict({ cost: 1 });
    legacy.key_source = null;
    await legacy.save();

    const usage = await quotaUsage(USER, "month", NOW);
    expect(usage).toEqual({
      period: "month",
      since: "2026-11-01T00:00:00.000Z",
      tokens: 190,
      mediaUsd: 1.75
    });

    const today = await quotaUsage(USER, "day", NOW);
    expect(today.tokens).toBe(0);
    expect(today.mediaUsd).toBe(0);
  });
});
