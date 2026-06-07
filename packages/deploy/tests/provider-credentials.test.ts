import { describe, it, expect } from "vitest";

import {
  PROVIDER_SECRET_KEYS,
  resolveProviderCredentials,
  validateDeploymentCredentials,
  type SecretResolver
} from "../src/provider-credentials.js";
import type { AnyDeployment } from "../src/deployment-config.js";

/**
 * A recording resolver: returns values from `store` and records every key it
 * was asked for, so we can assert least-privilege (only the provider's declared
 * keys are ever read) and per-user scoping.
 */
function makeResolver(store: Record<string, string>): {
  resolver: SecretResolver;
  asked: Array<{ key: string; userId: string }>;
} {
  const asked: Array<{ key: string; userId: string }> = [];
  const resolver: SecretResolver = async (key, userId) => {
    asked.push({ key, userId });
    return store[key] ?? null;
  };
  return { resolver, asked };
}

const runpod = { type: "runpod" } as unknown as AnyDeployment;
const gcp = { type: "gcp" } as unknown as AnyDeployment;
const fly = { type: "fly" } as unknown as AnyDeployment;
const huggingface = { type: "huggingface" } as unknown as AnyDeployment;
const railway = { type: "railway" } as unknown as AnyDeployment;

describe("PROVIDER_SECRET_KEYS", () => {
  it("declares the expected providers", () => {
    expect(Object.keys(PROVIDER_SECRET_KEYS).sort()).toEqual([
      "docker",
      "fly",
      "gcp",
      "huggingface",
      "railway",
      "runpod"
    ]);
  });

  it("requires RUNPOD_API_KEY for runpod and GCP_SERVICE_ACCOUNT_KEY for gcp", () => {
    expect(PROVIDER_SECRET_KEYS.runpod.required).toContain("RUNPOD_API_KEY");
    expect(PROVIDER_SECRET_KEYS.gcp.required).toContain(
      "GCP_SERVICE_ACCOUNT_KEY"
    );
    expect(PROVIDER_SECRET_KEYS.fly.required).toContain("FLY_API_TOKEN");
  });
});

describe("resolveProviderCredentials — least privilege", () => {
  it("reads ONLY the provider's declared keys (runpod)", async () => {
    const { resolver, asked } = makeResolver({
      RUNPOD_API_KEY: "rp",
      // These are present in the store but NOT declared by runpod — they must
      // never be requested.
      FLY_API_TOKEN: "fly",
      GCP_SERVICE_ACCOUNT_KEY: "sa",
      HF_TOKEN: "hf"
    });
    const { credentials, missingRequired } = await resolveProviderCredentials(
      runpod,
      "alice",
      resolver
    );
    expect(missingRequired).toEqual([]);
    expect(credentials.RUNPOD_API_KEY).toBe("rp");
    // Cross-provider secrets were neither requested nor returned.
    expect(credentials.FLY_API_TOKEN).toBeUndefined();
    expect(credentials.GCP_SERVICE_ACCOUNT_KEY).toBeUndefined();

    const askedKeys = new Set(asked.map((a) => a.key));
    const declared = new Set([
      ...PROVIDER_SECRET_KEYS.runpod.required,
      ...PROVIDER_SECRET_KEYS.runpod.optional
    ]);
    for (const k of askedKeys) expect(declared.has(k)).toBe(true);
  });

  it("scopes every lookup to the requested userId", async () => {
    const { resolver, asked } = makeResolver({ FLY_API_TOKEN: "f" });
    await resolveProviderCredentials(fly, "bob", resolver);
    expect(asked.length).toBeGreaterThan(0);
    for (const a of asked) expect(a.userId).toBe("bob");
  });

  it("includes optional keys when present, skips them when absent", async () => {
    const withDocker = makeResolver({
      RUNPOD_API_KEY: "rp",
      DOCKER_USERNAME: "u",
      DOCKER_PASSWORD: "p"
    });
    const a = await resolveProviderCredentials(
      runpod,
      "alice",
      withDocker.resolver
    );
    expect(a.credentials.DOCKER_USERNAME).toBe("u");
    expect(a.credentials.DOCKER_PASSWORD).toBe("p");

    const noDocker = makeResolver({ RUNPOD_API_KEY: "rp" });
    const b = await resolveProviderCredentials(
      runpod,
      "alice",
      noDocker.resolver
    );
    expect(b.credentials.DOCKER_USERNAME).toBeUndefined();
    expect(b.missingRequired).toEqual([]);
  });

  it("reports a missing REQUIRED key by name", async () => {
    const { resolver } = makeResolver({}); // no RUNPOD_API_KEY
    const { credentials, missingRequired } = await resolveProviderCredentials(
      runpod,
      "alice",
      resolver
    );
    expect(credentials.RUNPOD_API_KEY).toBeUndefined();
    expect(missingRequired).toContain("RUNPOD_API_KEY");
  });

  it("reports a missing required key for gcp by name", async () => {
    const { resolver } = makeResolver({});
    const { missingRequired } = await resolveProviderCredentials(
      gcp,
      "alice",
      resolver
    );
    expect(missingRequired).toContain("GCP_SERVICE_ACCOUNT_KEY");
  });
});

describe("resolveProviderCredentials — oneOf / aliasing", () => {
  it("accepts the canonical HF_TOKEN", async () => {
    const { resolver } = makeResolver({ HF_TOKEN: "hf-canonical" });
    const { credentials, missingRequired } = await resolveProviderCredentials(
      huggingface,
      "alice",
      resolver
    );
    expect(missingRequired).toEqual([]);
    expect(credentials.HF_TOKEN).toBe("hf-canonical");
  });

  it("accepts the HUGGING_FACE_HUB_TOKEN alias and mirrors it to HF_TOKEN", async () => {
    const { resolver } = makeResolver({
      HUGGING_FACE_HUB_TOKEN: "hf-alias"
    });
    const { credentials, missingRequired } = await resolveProviderCredentials(
      huggingface,
      "alice",
      resolver
    );
    expect(missingRequired).toEqual([]);
    // The alias resolves the group and is surfaced under the canonical name.
    expect(credentials.HF_TOKEN).toBe("hf-alias");
  });

  it("flags the unmet HF group when neither alias resolves", async () => {
    const { resolver } = makeResolver({});
    const { missingRequired } = await resolveProviderCredentials(
      huggingface,
      "alice",
      resolver
    );
    expect(missingRequired.join("; ")).toMatch(/HF_TOKEN/);
    expect(missingRequired.join("; ")).toMatch(/HUGGING_FACE_HUB_TOKEN/);
  });

  it("accepts RAILWAY_API_TOKEN or its RAILWAY_TOKEN alias", async () => {
    const apiTok = makeResolver({ RAILWAY_API_TOKEN: "rt" });
    const a = await resolveProviderCredentials(
      railway,
      "alice",
      apiTok.resolver
    );
    expect(a.missingRequired).toEqual([]);
    expect(a.credentials.RAILWAY_API_TOKEN).toBe("rt");

    const projTok = makeResolver({ RAILWAY_TOKEN: "rt2" });
    const b = await resolveProviderCredentials(
      railway,
      "alice",
      projTok.resolver
    );
    expect(b.missingRequired).toEqual([]);
    // Mirrored under the canonical RAILWAY_API_TOKEN.
    expect(b.credentials.RAILWAY_API_TOKEN).toBe("rt2");
  });
});

describe("validateDeploymentCredentials — provider-aware (docker)", () => {
  function dockerDeployment(
    host: string,
    ssh?: { password?: string; key_path?: string }
  ): AnyDeployment {
    return { type: "docker", host, ssh } as unknown as AnyDeployment;
  }

  it("short-circuits for localhost docker (no SSH creds needed)", () => {
    const problems = validateDeploymentCredentials(
      dockerDeployment("localhost"),
      {}
    );
    expect(problems).toEqual([]);
  });

  it("short-circuits for 127.0.0.1 docker", () => {
    expect(
      validateDeploymentCredentials(dockerDeployment("127.0.0.1"), {})
    ).toEqual([]);
  });

  it("requires SSH auth material for a remote docker host", () => {
    const problems = validateDeploymentCredentials(
      dockerDeployment("203.0.113.10"),
      {}
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("; ")).toMatch(/SSH/i);
  });

  it("accepts a remote docker host with an SSH_PRIVATE_KEY secret", () => {
    const problems = validateDeploymentCredentials(
      dockerDeployment("203.0.113.10"),
      { SSH_PRIVATE_KEY: "-----BEGIN KEY-----" }
    );
    expect(problems).toEqual([]);
  });

  it("accepts a remote docker host with an ssh password configured", () => {
    const problems = validateDeploymentCredentials(
      dockerDeployment("203.0.113.10", { password: "pw" }),
      {}
    );
    expect(problems).toEqual([]);
  });
});
