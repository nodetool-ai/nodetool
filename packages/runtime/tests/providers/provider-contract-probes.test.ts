/**
 * Offline half of the provider contract probes (docs/failure-mode-roadmap.md §6).
 *
 * Every manifest entry decodes its checked-in raw response fixture through the
 * production decoder it names, and every declared required field is deleted
 * once to prove the check can fail. The live half runs nightly from
 * `scripts/provider-contract-probe.mjs`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROBE_MANIFEST,
  probeProviders,
  runProbes,
  summarizeShape,
  redactText,
  type ProbeManifestEntry
} from "../../src/providers/contract/index.js";

const FIXTURE_DIR = join(
  fileURLToPath(new URL("../fixtures/provider-contract/", import.meta.url))
);

function loadFixture(entry: ProbeManifestEntry): unknown {
  return JSON.parse(
    readFileSync(join(FIXTURE_DIR, entry.fixture), "utf8")
  ) as unknown;
}

/** Delete a dotted path (`data.0.id`) from a deep clone of `value`. */
function withoutPath(value: unknown, path: string): unknown {
  const clone = structuredClone(value) as Record<string, unknown>;
  const segments = path.split(".");
  let cursor: unknown = clone;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(segment)];
    } else if (cursor && typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      throw new Error(`path ${path} does not exist in the fixture`);
    }
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(cursor)) {
    const index = Number(last);
    if (!(index in cursor)) {
      throw new Error(`path ${path} does not exist in the fixture`);
    }
    cursor.splice(index, 1);
  } else if (cursor && typeof cursor === "object") {
    const record = cursor as Record<string, unknown>;
    if (!(last in record)) {
      throw new Error(`path ${path} does not exist in the fixture`);
    }
    delete record[last];
  } else {
    throw new Error(`path ${path} does not exist in the fixture`);
  }
  return clone;
}

describe("provider contract probe manifest", () => {
  it("covers the four providers the roadmap names", () => {
    expect(probeProviders().sort()).toEqual([
      "fal_ai",
      "gemini",
      "kie",
      "openai"
    ]);
    expect(PROBE_MANIFEST.length).toBeGreaterThanOrEqual(4);
  });

  it("gives every entry an id, a decoder, a fixture, and required fields", () => {
    const ids = new Set<string>();
    for (const entry of PROBE_MANIFEST) {
      expect(entry.id.startsWith(`${entry.provider}.`)).toBe(true);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(entry.decoder.length).toBeGreaterThan(0);
      expect(entry.target.length).toBeGreaterThan(0);
      expect(entry.requiredFields.length).toBeGreaterThan(0);
    }
  });

  it("holds every entry to one request and USD 0.05 per provider", () => {
    const requests: Record<string, number> = {};
    const cost: Record<string, number> = {};
    for (const entry of PROBE_MANIFEST) {
      if (!entry.live) {
        // A fixture-only entry must say why there is no live probe.
        expect(entry.liveGap?.length ?? 0).toBeGreaterThan(0);
        continue;
      }
      expect(entry.live.maxRequests).toBeLessThanOrEqual(1);
      expect(entry.live.maxCostUsd).toBeLessThanOrEqual(0.05);
      expect(entry.live.estimatedCostUsd).toBeLessThanOrEqual(
        entry.live.maxCostUsd
      );
      requests[entry.provider] = (requests[entry.provider] ?? 0) + 1;
      cost[entry.provider] =
        (cost[entry.provider] ?? 0) + entry.live.estimatedCostUsd;
    }
    for (const provider of Object.keys(requests)) {
      expect(requests[provider]).toBeLessThanOrEqual(1);
      expect(cost[provider]).toBeLessThanOrEqual(0.05);
    }
    // The audit must have found live entries, or it proves nothing.
    expect(Object.keys(requests).sort()).toEqual([
      "fal_ai",
      "gemini",
      "kie",
      "openai"
    ]);
  });
});

describe.each(PROBE_MANIFEST.map((entry) => [entry.id, entry] as const))(
  "%s",
  (_id, entry) => {
    it("decodes its checked-in raw response", () => {
      expect(() => entry.check(loadFixture(entry))).not.toThrow();
    });

    it.each(entry.requiredFields)(
      "rejects the response with %s removed",
      (path) => {
        const mutated = withoutPath(loadFixture(entry), path);
        expect(() => entry.check(mutated)).toThrow();
      }
    );
  }
);

describe("retained probe artifacts", () => {
  const secretish = {
    authorization: "Bearer sk-live-0123456789abcdef0123456789",
    prompt: "the user asked about matti.georgi@example.com",
    id: "req_01JABCDEF0123456789",
    output: {
      url: "https://fal.media/files/tiger/out.png?X-Amz-Signature=deadbeefcafe",
      content_type: "image/png"
    },
    choices: [{ message: { content: "my api key is sk-live-999" } }]
  };

  it("keeps shape and drops every value that could carry a secret", () => {
    const artifact = JSON.stringify(summarizeShape(secretish));
    for (const leak of [
      "sk-live-0123456789abcdef0123456789",
      "matti.georgi@example.com",
      "req_01JABCDEF0123456789",
      "X-Amz-Signature",
      "deadbeefcafe",
      "fal.media",
      "sk-live-999"
    ]) {
      expect(artifact).not.toContain(leak);
    }
    // Structure survives: the reader can still see what the response carried.
    expect(artifact).toContain("authorization");
    expect(artifact).toContain("choices");
    expect(artifact).toContain("image/png");
  });

  it("redacts credentials and urls out of a retained error message", () => {
    const text = redactText(
      'HTTP 401: {"error":{"message":"Incorrect API key provided: sk-live-abcdef123456"}} ' +
        "while fetching https://fal.media/files/tiger/out.png?X-Amz-Signature=deadbeef"
    );
    expect(text).not.toContain("sk-live-abcdef123456");
    expect(text).not.toContain("X-Amz-Signature");
    expect(text).not.toContain("deadbeef");
    expect(text).toContain("HTTP 401");
  });
});

describe("live probe runner", () => {
  const entry = PROBE_MANIFEST.find((e) => e.id === "openai.chat-completion");
  if (!entry) throw new Error("openai.chat-completion entry is missing");

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  it("passes and retains only the response shape", async () => {
    const report = await runProbes({
      entries: [entry],
      env: { OPENAI_API_KEY: "sk-live-secret-key-value" },
      fetchImpl: async () => jsonResponse(loadFixture(entry))
    });
    expect(report.totals.passed).toBe(1);
    expect(report.totals.requests).toBe(1);
    expect(JSON.stringify(report)).not.toContain("sk-live-secret-key-value");
    expect(JSON.stringify(report.results[0].shape)).toContain("chat.completion");
  });

  it("reports a changed response shape as a schema failure", async () => {
    const broken = withoutPath(loadFixture(entry), "usage");
    const report = await runProbes({
      entries: [entry],
      env: { OPENAI_API_KEY: "k" },
      fetchImpl: async () => jsonResponse(broken)
    });
    expect(report.results[0].status).toBe("schema-failure");
    expect(report.totals.schemaFailures).toBe(1);
    expect(report.totals.networkFailures).toBe(0);
  });

  it("reports an unreachable provider as a network failure, not a schema one", async () => {
    const report = await runProbes({
      entries: [entry],
      env: { OPENAI_API_KEY: "k" },
      fetchImpl: async () => {
        throw new Error("getaddrinfo ENOTFOUND api.openai.com");
      }
    });
    expect(report.results[0].status).toBe("network-failure");
    expect(report.totals.schemaFailures).toBe(0);
  });

  it("reports a gateway error page as a network failure", async () => {
    const report = await runProbes({
      entries: [entry],
      env: { OPENAI_API_KEY: "k" },
      fetchImpl: async () =>
        new Response("<html>502 Bad Gateway</html>", { status: 502 })
    });
    expect(report.results[0].status).toBe("network-failure");
  });

  it("decodes the body when the entry expects an http error", async () => {
    const kie = PROBE_MANIFEST.find((e) => e.id === "kie.error-envelope");
    if (!kie) throw new Error("kie.error-envelope entry is missing");
    const report = await runProbes({
      entries: [kie],
      env: { KIE_API_KEY: "k" },
      fetchImpl: async () => jsonResponse(loadFixture(kie), 404)
    });
    expect(report.results[0].status).toBe("passed");
  });

  it("skips an entry whose credential is absent and one with no live spec", async () => {
    const fixtureOnly = PROBE_MANIFEST.find((e) => e.live === null);
    if (!fixtureOnly) throw new Error("no fixture-only entry in the manifest");
    const report = await runProbes({
      entries: [entry, fixtureOnly],
      env: {},
      fetchImpl: async () => {
        throw new Error("the runner must not reach the network here");
      }
    });
    expect(report.results.map((r) => r.status)).toEqual(["skipped", "skipped"]);
    expect(report.totals.requests).toBe(0);
  });

  it("stops at the per-provider request budget", async () => {
    let calls = 0;
    const report = await runProbes({
      entries: [entry, { ...entry, id: "openai.second-call" }],
      env: { OPENAI_API_KEY: "k" },
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse(loadFixture(entry));
      }
    });
    expect(calls).toBe(1);
    expect(report.results[1].status).toBe("skipped");
    expect(report.results[1].reason).toContain("request budget");
  });
});
