/**
 * The SerpAPI client — the only code that holds the key.
 *
 * Two properties carry the security of this whole layer, and both are asserted
 * here rather than read off the implementation: the key reaches the request and
 * nothing else, and a caller cannot take the `api_key` or `output` slot away
 * from the host. The rest is classification — which failures are worth a second
 * attempt, and which spend the same refusal twice.
 */

import { describe, expect, it } from "vitest";

import { SerpApiClient } from "../src/serpapi/client.js";
import { SerpApiError } from "../src/serpapi/errors.js";

const KEY = "serpapi_KEYTHATMUSTNOTLEAK0000000000";

interface Recorder {
  readonly urls: string[];
  readonly fetch: typeof fetch;
}

function recorder(
  responses: readonly (() => Response)[] | (() => Response)
): Recorder {
  const urls: string[] = [];
  const queue = Array.isArray(responses) ? [...responses] : undefined;
  const impl = (async (input: string | URL) => {
    urls.push(String(input));
    if (queue !== undefined) {
      const next = queue.shift();
      if (next === undefined) throw new Error("no scripted response left");
      return next();
    }
    return (responses as () => Response)();
  }) as unknown as typeof fetch;
  return { urls, fetch: impl };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

function clientWith(rec: Recorder): SerpApiClient {
  return new SerpApiClient(KEY, {
    fetchImpl: rec.fetch,
    retryBaseMs: 1
  });
}

describe("search", () => {
  it("sends the engine, the caller's parameters, and the key", async () => {
    const rec = recorder(() => json({ organic_results: [] }));
    await clientWith(rec).search("google_scholar", { q: "attention", num: 5 });

    const url = new URL(rec.urls[0]);
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    expect(url.searchParams.get("engine")).toBe("google_scholar");
    expect(url.searchParams.get("q")).toBe("attention");
    expect(url.searchParams.get("num")).toBe("5");
    expect(url.searchParams.get("api_key")).toBe(KEY);
    expect(url.searchParams.get("output")).toBe("json");
  });

  it("will not let a caller take the host's parameter slots", async () => {
    const rec = recorder(() => json({ organic_results: [] }));
    await clientWith(rec).search("google", {
      q: "x",
      api_key: "attacker-key",
      output: "html"
    });

    const url = new URL(rec.urls[0]);
    expect(url.searchParams.get("api_key")).toBe(KEY);
    expect(url.searchParams.get("output")).toBe("json");
    expect(rec.urls[0]).not.toContain("attacker-key");
  });

  it("treats SerpAPI's 200-with-error envelope as a failure", async () => {
    const rec = recorder(() => json({ error: "Unsupported parameter combo" }));
    await expect(
      clientWith(rec).search("google", { q: "x" })
    ).rejects.toMatchObject({
      kind: "invalid_input",
      engine: "google"
    });
  });
});

describe("failure classification", () => {
  it("does not retry a rejected key", async () => {
    const rec = recorder([() => json({ error: "Invalid API key" }, 401)]);
    const failure = await clientWith(rec)
      .search("google", { q: "x" })
      .catch((e: unknown) => e as SerpApiError);
    expect(failure).toBeInstanceOf(SerpApiError);
    expect((failure as SerpApiError).kind).toBe("auth");
    expect((failure as SerpApiError).retryable).toBe(false);
    expect(rec.urls).toHaveLength(1);
  });

  it("retries a rate limit and returns the answer that follows", async () => {
    const rec = recorder([
      () => json({ error: "slow down" }, 429),
      () => json({ organic_results: [{ title: "ok" }] })
    ]);
    const body = await clientWith(rec).search("google", { q: "x" });
    expect(rec.urls).toHaveLength(2);
    expect(body.organic_results).toEqual([{ title: "ok" }]);
  });

  it("keeps the key out of the error it throws", async () => {
    // The worst case: SerpAPI echoes the whole request URL back in the body.
    const rec = recorder([
      () =>
        new Response(
          `Bad request for https://serpapi.com/search.json?q=x&api_key=${KEY}`,
          { status: 400 }
        )
    ]);
    const failure = await clientWith(rec)
      .search("google", { q: "x" })
      .catch((e: unknown) => e as SerpApiError);
    expect(String((failure as SerpApiError).message)).not.toContain(KEY);
    expect(String((failure as SerpApiError).message)).toContain("«redacted»");
  });

  it("refuses to be built without a key", () => {
    expect(() => new SerpApiClient("  ")).toThrow(SerpApiError);
  });
});

describe("account and locations", () => {
  it("reads the plan and what is left of it", async () => {
    const rec = recorder(() =>
      json({
        plan_name: "Developer",
        searches_per_month: 5000,
        this_month_usage: 12,
        total_searches_left: 4988,
        // Fields nothing above this layer reads must not leak through.
        api_key: KEY
      })
    );
    const account = await clientWith(rec).account();
    expect(account).toEqual({
      plan: "Developer",
      searchesPerMonth: 5000,
      thisMonthUsage: 12,
      totalSearchesLeft: 4988
    });
  });

  it("returns the canonical spelling the `location` parameter wants", async () => {
    const rec = recorder(() =>
      json([
        {
          name: "Austin",
          canonical_name: "Austin,Texas,United States",
          country_code: "US",
          target_type: "City",
          reach: 6_440_000
        }
      ])
    );
    const [first] = await clientWith(rec).locations("Austin", 2);
    expect(first.canonicalName).toBe("Austin,Texas,United States");
    expect(new URL(rec.urls[0]).searchParams.get("limit")).toBe("2");
  });
});
