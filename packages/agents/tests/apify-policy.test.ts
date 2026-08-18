/**
 * The policy, budget, and normalization layers — the parts that decide what
 * runs and what a model gets to see.
 *
 * These are the checks that make the integration something other than remote
 * code execution by proxy, so they are tested for what they *refuse*, not only
 * for what they allow: an actor off the allowlist, an input pointed at a
 * private address, an eleventh run in a session capped at ten.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ApifyBudgetLedger,
  DEFAULT_BUDGET,
  apifyPolicyFromEnv,
  allowsDiscovery,
  assertActorInputUrlsArePublic,
  decideActor,
  isPubliclyRoutableUrl
} from "../src/apify/policy.js";
import { ApifyError } from "../src/apify/errors.js";
import { ACTOR_CATALOG, catalogActor, defaultActorFor } from "../src/apify/catalog.js";
import {
  inputSchemaFromBuild,
  simplifyInputSchema,
  summarizeActor,
  summarizeDataset
} from "../src/apify/normalize.js";
import { runActor } from "../src/apify/run.js";
import type { ApifyClient } from "../src/apify/client.js";

const ENV_KEYS = [
  "NODETOOL_APIFY_MODE",
  "NODETOOL_APIFY_ALLOWED_ACTORS",
  "NODETOOL_APIFY_MAX_RUNS",
  "NODETOOL_APIFY_MAX_COST_USD"
] as const;
const stash: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    stash[key] = process.env[key];
    delete process.env[key];
  }
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (stash[key] === undefined) delete process.env[key];
    else process.env[key] = stash[key];
  }
});

describe("policy modes", () => {
  it("defaults to discovery: shipped actors run, others ask, nothing is open", () => {
    const policy = apifyPolicyFromEnv({});
    expect(policy.mode).toBe("discovery");
    expect(decideActor(policy, "someone/unknown").decision).toBe("ask");
  });

  it("allows every shipped actor by default", () => {
    const policy = apifyPolicyFromEnv({});
    for (const actor of ACTOR_CATALOG) {
      expect(decideActor(policy, actor.id).decision).toBe("allow");
    }
  });

  it("refuses an unknown actor in allowlist mode and lists what is allowed", () => {
    const policy = apifyPolicyFromEnv({ NODETOOL_APIFY_MODE: "allowlist" });
    const verdict = decideActor(policy, "someone/sketchy-scraper");
    expect(verdict.decision).toBe("deny");
    expect(verdict.decision === "deny" && verdict.reason).toContain(
      "apify/website-content-crawler"
    );
  });

  it("asks rather than refuses in discovery mode", () => {
    const policy = apifyPolicyFromEnv({ NODETOOL_APIFY_MODE: "discovery" });
    expect(decideActor(policy, "someone/sketchy-scraper").decision).toBe("ask");
    // A shipped actor still runs without a prompt.
    expect(decideActor(policy, "apify/web-scraper").decision).toBe("allow");
  });

  it("allows anything in unrestricted mode", () => {
    const policy = apifyPolicyFromEnv({ NODETOOL_APIFY_MODE: "unrestricted" });
    expect(decideActor(policy, "someone/anything").decision).toBe("allow");
  });

  it("refuses everything when disabled", () => {
    const policy = apifyPolicyFromEnv({ NODETOOL_APIFY_MODE: "disabled" });
    expect(decideActor(policy, "apify/web-scraper").decision).toBe("deny");
  });

  it("adds operator actors to the shipped list rather than replacing it", () => {
    const policy = apifyPolicyFromEnv({
      NODETOOL_APIFY_ALLOWED_ACTORS: "acme/custom, other~thing"
    });
    expect(decideActor(policy, "acme/custom").decision).toBe("allow");
    // The tilde form is accepted and canonicalized.
    expect(decideActor(policy, "other/thing").decision).toBe("allow");
    // And the shipped ones survive.
    expect(decideActor(policy, "apify/web-scraper").decision).toBe("allow");
  });

  it("only reports discovery for the modes that have it", () => {
    expect(allowsDiscovery(apifyPolicyFromEnv({}))).toBe(true);
    expect(
      allowsDiscovery(apifyPolicyFromEnv({ NODETOOL_APIFY_MODE: "allowlist" }))
    ).toBe(false);
    expect(
      allowsDiscovery(apifyPolicyFromEnv({ NODETOOL_APIFY_MODE: "disabled" }))
    ).toBe(false);
  });

  it("falls back to discovery for an unrecognized mode", () => {
    expect(apifyPolicyFromEnv({ NODETOOL_APIFY_MODE: "yolo" }).mode).toBe(
      "discovery"
    );
  });
});

describe("actor input URL screening", () => {
  it.each([
    "http://localhost:7777/api",
    "http://127.0.0.1/",
    "https://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/internal",
    "http://192.168.1.1/",
    "http://[::1]/",
    "file:///etc/passwd"
  ])("refuses %s", (url) => {
    expect(isPubliclyRoutableUrl(url)).toBe(false);
    expect(() =>
      assertActorInputUrlsArePublic({ startUrls: [{ url }] })
    ).toThrow(ApifyError);
  });

  it("allows plain-http public sites, which actors legitimately crawl", () => {
    expect(isPubliclyRoutableUrl("http://example.com/page")).toBe(true);
    expect(isPubliclyRoutableUrl("https://example.com/page")).toBe(true);
  });

  it("finds a URL at any depth and under any field name", () => {
    // Every actor names its URL field differently, so the walk is over the
    // whole input rather than a known set of keys.
    expect(() =>
      assertActorInputUrlsArePublic({
        deeply: { nested: [{ somethingElse: "http://169.254.169.254/" }] }
      })
    ).toThrow(/169\.254\.169\.254/);
  });

  it("ignores non-URL strings", () => {
    expect(() =>
      assertActorInputUrlsArePublic({ query: "coffee shops in Amsterdam" })
    ).not.toThrow();
  });
});

describe("budget", () => {
  it("refuses the run past the cap, before anything is started", () => {
    const ledger = new ApifyBudgetLedger({ ...DEFAULT_BUDGET, maxRuns: 2 });
    ledger.reserveRun("apify/web-scraper");
    ledger.reserveRun("apify/web-scraper");
    expect(() => ledger.reserveRun("apify/web-scraper")).toThrow(
      /already started 2 Apify runs/
    );
  });

  it("refuses once the session's spend cap is reached", () => {
    const ledger = new ApifyBudgetLedger({ ...DEFAULT_BUDGET, maxCostUsd: 1 });
    ledger.recordCost(1.5);
    expect(() => ledger.reserveRun("apify/web-scraper")).toThrow(
      /its limit of \$1\.00/
    );
  });

  it("clamps run options down to the budget but never up", () => {
    const ledger = new ApifyBudgetLedger({
      ...DEFAULT_BUDGET,
      maxRunSeconds: 60,
      maxItems: 100,
      maxMemoryMb: 1024
    });
    expect(
      ledger.clampRunOptions({
        timeoutSecs: 9999,
        maxItems: 100000,
        memoryMbytes: 8192
      })
    ).toEqual({ timeoutSecs: 60, maxItems: 100, memoryMbytes: 1024 });

    // A caller asking for less than the cap keeps its own smaller number.
    expect(ledger.clampRunOptions({ timeoutSecs: 10 }).timeoutSecs).toBe(10);
  });

  it("ignores a cost Apify did not report", () => {
    const ledger = new ApifyBudgetLedger();
    ledger.recordCost(undefined);
    ledger.recordCost(Number.NaN);
    expect(ledger.costUsd).toBe(0);
  });
});

describe("runActor gating", () => {
  const stubClient = {
    startRun: async () => ({ id: "RUN1", actId: "A", status: "SUCCEEDED" }),
    getRun: async () => ({ id: "RUN1", actId: "A", status: "SUCCEEDED" })
  } as unknown as ApifyClient;

  it("refuses a disallowed actor without starting anything", async () => {
    const policy = apifyPolicyFromEnv({});
    const ledger = new ApifyBudgetLedger();
    let started = false;
    const client = {
      startRun: async () => {
        started = true;
        return { id: "R", actId: "A", status: "SUCCEEDED" };
      }
    } as unknown as ApifyClient;

    await expect(
      runActor(client, policy, ledger, {
        actorId: "someone/sketchy",
        input: {},
        waitForFinish: false
      })
    ).rejects.toMatchObject({ kind: "actor_not_allowed" });
    expect(started).toBe(false);
    // A refused actor must not consume a run slot either.
    expect(ledger.runs).toBe(0);
  });

  it("runs an ask-mode actor once approval comes back", async () => {
    const policy = apifyPolicyFromEnv({ NODETOOL_APIFY_MODE: "discovery" });
    const asked: string[] = [];
    const result = await runActor(
      stubClient,
      policy,
      new ApifyBudgetLedger(),
      { actorId: "someone/new", input: {}, waitForFinish: false },
      {
        approve: async (actorId) => {
          asked.push(actorId);
          return true;
        }
      }
    );
    expect(asked).toEqual(["someone/new"]);
    expect(result.run.id).toBe("RUN1");
  });

  it("refuses an ask-mode actor when the surface cannot ask", async () => {
    const policy = apifyPolicyFromEnv({ NODETOOL_APIFY_MODE: "discovery" });
    await expect(
      runActor(stubClient, policy, new ApifyBudgetLedger(), {
        actorId: "someone/new",
        input: {},
        waitForFinish: false
      })
    ).rejects.toMatchObject({ kind: "actor_not_allowed" });
  });

  it("screens the actor input before spending a run slot", async () => {
    const ledger = new ApifyBudgetLedger();
    await expect(
      runActor(stubClient, apifyPolicyFromEnv({}), ledger, {
        actorId: "apify/web-scraper",
        input: { startUrls: [{ url: "http://169.254.169.254/" }] },
        waitForFinish: false
      })
    ).rejects.toMatchObject({ kind: "invalid_input" });
    expect(ledger.runs).toBe(0);
  });
});

describe("catalog", () => {
  it("prefers the cheap crawler over the browser for a page fetch", () => {
    // Order is what a model reads, so the default for "get me this page" must
    // be the HTTP crawl, not Playwright.
    expect(defaultActorFor("crawl")?.id).toBe("apify/website-content-crawler");
    expect(catalogActor("apify/playwright-scraper")?.capability).toBe("browser");
  });

  it("has no duplicate ids", () => {
    const ids = ACTOR_CATALOG.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("normalization", () => {
  it("builds the canonical id from username and name, not the opaque one", () => {
    const summary = summarizeActor({
      id: "zX9opaqueKey",
      username: "compass",
      name: "google-maps-extractor",
      title: "Google Maps Extractor",
      totalUsers30Days: 4200,
      pricingModel: "PRICE_PER_DATASET_ITEM",
      pictureUrl: "https://apify.com/pic.png"
    });
    expect(summary.id).toBe("compass/google-maps-extractor");
    expect(summary.url).toBe("https://apify.com/compass/google-maps-extractor");
    expect(summary.monthly_users).toBe(4200);
    expect(summary.shipped).toBe(true);
    // Presentation fields are dropped rather than forwarded to a model.
    expect(JSON.stringify(summary)).not.toContain("pic.png");
  });

  it("flattens an input schema and puts required fields first", () => {
    const schema = simplifyInputSchema("apify/x", {
      title: "Input",
      required: ["queries"],
      properties: {
        maxItems: { type: "integer", default: 100, editor: "number" },
        queries: {
          type: "array",
          description: "Search terms",
          editor: "stringList",
          items: { type: "string" }
        },
        language: { type: "string", enum: ["en", "de"], prefill: "en" }
      }
    });
    expect(schema.fields[0].name).toBe("queries");
    expect(schema.fields[0].required).toBe(true);
    expect(schema.fields[0].items).toBe("string");
    // `prefill` becomes the default — for many actors it is the worked example.
    const language = schema.fields.find((f) => f.name === "language");
    expect(language?.default).toBe("en");
    expect(language?.enum).toEqual(["en", "de"]);
    // Editor hints drive Apify's own form and mean nothing to a model.
    expect(JSON.stringify(schema)).not.toContain("stringList");
  });

  it("reads the schema from actorDefinition.input and nowhere else", () => {
    expect(inputSchemaFromBuild({ actorDefinition: { input: { a: 1 } } })).toEqual({
      a: 1
    });
    expect(inputSchemaFromBuild({ readme: "# docs" })).toBeUndefined();
  });

  it("reports an actor with no schema as empty rather than guessing", () => {
    const schema = simplifyInputSchema("apify/x", undefined);
    expect(schema.fields).toEqual([]);
    expect(schema.full_schema_url).toContain("apify/x");
  });

  it("says how to read the rest instead of truncating silently", () => {
    const summary = summarizeDataset({
      items: [{ a: 1 }, { a: 2 }],
      total: 14392,
      offset: 0,
      datasetId: "DS1"
    });
    expect(summary.has_more).toBe(true);
    expect(summary.total).toBe(14392);
    expect(summary.note).toContain("offset: 2");
    expect(summary.note).toContain("DS1");
  });

  it("drops whole rows, never partial ones, to fit the size cap", () => {
    const fat = { text: "x".repeat(50_000) };
    const summary = summarizeDataset({
      items: Array.from({ length: 40 }, () => fat),
      offset: 0
    });
    expect(summary.items.length).toBeLessThan(40);
    // Every surviving row is whole.
    for (const item of summary.items) expect(item).toEqual(fat);
    expect(summary.note).toContain("dropped");
  });

  it("reports a complete page as complete", () => {
    const summary = summarizeDataset({
      items: [{ a: 1 }],
      total: 1,
      offset: 0
    });
    expect(summary.has_more).toBe(false);
    expect(summary.note).toBeUndefined();
  });
});
