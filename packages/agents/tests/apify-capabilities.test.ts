/**
 * The `apify` capability module — the surface an agent and the sandbox both
 * reach.
 *
 * The point of the module is that it is the *only* way in, so the tests are
 * mostly about what does not cross it. Guest code runs a real sandbox action
 * against the real dispatcher here, so "the token never reaches the guest" is
 * checked by asking the guest, not by reading the implementation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";

import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import {
  APIFY_CAPABILITIES,
  module as apifyModule
} from "../src/capabilities/apify.js";
import {
  capabilityCategoryFor,
  capabilityModuleIssues,
  listCapabilityModules,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import type { CapabilityRun } from "../src/capabilities/types.js";

const TOKEN = "apify_api_TOKENTHATMUSTNOTLEAK00000";

const ENV_KEYS = [
  "NODETOOL_APIFY_MODE",
  "NODETOOL_APIFY_ALLOWED_ACTORS",
  "APIFY_API_TOKEN",
  "APIFY_API_KEY"
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

function contextWith(secrets: Record<string, string> = {}): ProcessingContext {
  return {
    userId: "apify-test",
    getSecret: async (key: string) => secrets[key] ?? null
  } as unknown as ProcessingContext;
}

function runWith(secrets: Record<string, string> = {}): CapabilityRun {
  return createCapabilityRun({ context: contextWith(secrets), gate: UNGATED });
}

/** One sandbox action whose only surface is the capability run. */
async function action(
  run: CapabilityRun,
  code: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const session = createChatCodeActSession({
    tools: [],
    executeTool: async (call) => run.invoke(call.name, call.args),
    capabilityRun: run
  });
  return JSON.parse(await session.executeAction({ code })) as {
    ok: boolean;
    result?: unknown;
    error?: string;
  };
}

describe("registration", () => {
  it("is registered, and the module walk is clean", async () => {
    expect(listCapabilityModules()).toContain("apify");
    const loaded = await loadCapabilityModule("apify");
    expect(capabilityModuleIssues("apify", loaded)).toEqual([]);
    expect(loaded.exports.map((e) => e.spec.name).sort()).toEqual(
      APIFY_CAPABILITIES.map((e) => e.spec.name).sort()
    );
    expect(apifyModule.module).toBe("apify");
  });

  it("classes only the two acting capabilities as external", () => {
    // Reading the store or a finished dataset spends nothing and changes
    // nothing; starting and stopping an actor are the side effects.
    for (const entry of APIFY_CAPABILITIES) {
      const expected =
        entry.spec.name === "run_apify_actor" ||
        entry.spec.name === "abort_apify_run"
          ? "external"
          : "read";
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        expected
      ]);
      // The classification map the gate reads must agree with the spec.
      expect(capabilityCategoryFor(entry.spec.name)).toBe(expected);
    }
  });

  it("tells a model not to invent actor ids or input fields", () => {
    const byName = (name: string) =>
      APIFY_CAPABILITIES.find((e) => e.spec.name === name)!;
    expect(byName("run_apify_actor").spec.description).toMatch(
      /do not\s+invent actor ids or input fields/i
    );
    // And it must steer to the cheapest thing that works.
    expect(byName("run_apify_actor").spec.description).toMatch(
      /crawl beats an HTML scrape beats a full browser run/i
    );
  });
});

describe("credentials", () => {
  it("reports a missing token as a setting to change, not a stack trace", async () => {
    // With discovery off, a search answers from the shipped catalog without
    // needing a token at all — the token check belongs to the calls that
    // actually reach Apify.
    process.env.NODETOOL_APIFY_MODE = "allowlist";
    const result = (await runWith().invoke("search_apify_actors", {
      query: "crawler"
    })) as Record<string, unknown>;
    expect(result.ok).toBe(true);

    const needsToken = (await runWith().invoke("get_apify_run", {
      run_id: "RUN1"
    })) as Record<string, unknown>;
    expect(needsToken.ok).toBe(false);
    expect(needsToken.error_kind).toBe("auth");
    expect(String(needsToken.error)).toContain("APIFY_API_TOKEN");
  });

  it("never hands the token to guest code", async () => {
    // Allowlist mode keeps the search on the shipped catalog, so this needs
    // no network; what it proves is about the guest's view, not the store.
    process.env.NODETOOL_APIFY_MODE = "allowlist";
    const run = runWith({ APIFY_API_TOKEN: TOKEN });
    const specifier = sandboxCapabilitySpecifier("apify");
    const observed = await action(
      run,
      `import apify from ${JSON.stringify(specifier)};\n` +
        // Everything the guest can see: the module's own exports, the globals,
        // and whatever a capability answers with.
        `const shapes = Object.keys(apify).map((k) => typeof apify[k]);\n` +
        `const answer = await apify.search_apify_actors({ query: "crawler" });\n` +
        `return { shapes, answer, secrets: typeof globalThis.APIFY_API_TOKEN };`
    );
    expect(observed.ok).toBe(true);
    const payload = JSON.stringify(observed.result);
    expect(payload).not.toContain(TOKEN);
    expect(payload).not.toContain("apify_api_");
    // The guest sees functions, not configuration.
    const result = observed.result as { shapes: string[]; secrets: string };
    expect(new Set(result.shapes)).toEqual(new Set(["function"]));
    expect(result.secrets).toBe("undefined");
  });

  it("accepts the legacy APIFY_API_KEY so an upgrade does not break", async () => {
    process.env.NODETOOL_APIFY_MODE = "allowlist";
    const result = (await runWith({ APIFY_API_KEY: TOKEN }).invoke(
      "get_apify_actor_schema",
      { actor_id: "someone/not-allowed" }
    )) as Record<string, unknown>;
    // It gets past the token check and fails on the allowlist instead of auth,
    // which is what proves the fallback name was read.
    expect(result.error_kind).toBe("actor_not_allowed");
  });
});

describe("permissions", () => {
  it("refuses everything when the integration is disabled", async () => {
    process.env.NODETOOL_APIFY_MODE = "disabled";
    const run = runWith({ APIFY_API_TOKEN: TOKEN });
    for (const name of ["search_apify_actors", "get_apify_actor_schema"]) {
      const result = (await run.invoke(name, {
        query: "x",
        actor_id: "apify/web-scraper"
      })) as Record<string, unknown>;
      expect(result.ok).toBe(false);
      expect(result.error_kind).toBe("disabled");
    }
  });

  it("answers a search from the shipped catalog when discovery is off", async () => {
    process.env.NODETOOL_APIFY_MODE = "allowlist";
    const result = (await runWith({ APIFY_API_TOKEN: TOKEN }).invoke(
      "search_apify_actors",
      { query: "maps" }
    )) as Record<string, unknown>;
    expect(result.discovery).toBe("allowlist-only");
    const actors = result.actors as Array<Record<string, unknown>>;
    expect(actors.some((a) => a.id === "compass/google-maps-extractor")).toBe(
      true
    );
    // It says why the store was not searched instead of pretending it was.
    expect(String(result.note)).toContain("NODETOOL_APIFY_MODE=discovery");
  });

  it("refuses to inspect an actor it would never run", async () => {
    process.env.NODETOOL_APIFY_MODE = "allowlist";
    const result = (await runWith({ APIFY_API_TOKEN: TOKEN }).invoke(
      "get_apify_actor_schema",
      { actor_id: "someone/sketchy" }
    )) as Record<string, unknown>;
    expect(result.error_kind).toBe("actor_not_allowed");
    expect(String(result.error)).toContain("allowlist");
  });

  it("refuses to run an actor off the allowlist", async () => {
    process.env.NODETOOL_APIFY_MODE = "allowlist";
    const result = (await runWith({ APIFY_API_TOKEN: TOKEN }).invoke(
      "run_apify_actor",
      { actor_id: "someone/sketchy", input: {} }
    )) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.error_kind).toBe("actor_not_allowed");
  });

  it("refuses an actor input pointed at an internal address", async () => {
    const result = (await runWith({ APIFY_API_TOKEN: TOKEN }).invoke(
      "run_apify_actor",
      {
        actor_id: "apify/website-content-crawler",
        input: { startUrls: [{ url: "http://169.254.169.254/latest/" }] }
      }
    )) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.error_kind).toBe("invalid_input");
    expect(String(result.error)).toContain("169.254.169.254");
  });
});

describe("input validation", () => {
  it("names the missing argument instead of calling Apify", async () => {
    const result = (await runWith({ APIFY_API_TOKEN: TOKEN }).invoke(
      "get_apify_dataset_items",
      {}
    )) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("dataset_id is required");
  });

  it("accepts actorId the way guest JS writes it", async () => {
    process.env.NODETOOL_APIFY_MODE = "allowlist";
    const result = (await runWith({ APIFY_API_TOKEN: TOKEN }).invoke(
      "get_apify_actor_schema",
      { actorId: "someone/sketchy" }
    )) as Record<string, unknown>;
    expect(result.error_kind).toBe("actor_not_allowed");
    expect(String(result.error)).not.toContain("actor_id is required");
  });

  it("accepts actor as an alias for actor_id", async () => {
    process.env.NODETOOL_APIFY_MODE = "allowlist";
    const result = (await runWith({ APIFY_API_TOKEN: TOKEN }).invoke(
      "run_apify_actor",
      { actor: "someone/sketchy", input: {} }
    )) as Record<string, unknown>;
    expect(result.error_kind).toBe("actor_not_allowed");
    expect(String(result.error)).not.toContain("actor_id is required");
  });

  it("guest import accepts actorId and a positional actor id", async () => {
    process.env.NODETOOL_APIFY_MODE = "allowlist";
    const run = runWith({ APIFY_API_TOKEN: TOKEN });
    const specifier = sandboxCapabilitySpecifier("apify");
    const camel = await action(
      run,
      `import { get_apify_actor_schema } from ${JSON.stringify(specifier)};
       try {
         return await get_apify_actor_schema({ actorId: "someone/sketchy" });
       } catch (e) {
         return e instanceof Error ? e.message : String(e);
       }`
    );
    expect(camel.ok).toBe(true);
    expect(String(camel.result)).toMatch(/allowlist|not allowed/i);
    expect(String(camel.result)).not.toContain("actor_id is required");

    const positional = await action(
      run,
      `import { get_apify_actor_schema } from ${JSON.stringify(specifier)};
       try {
         return await get_apify_actor_schema("someone/sketchy");
       } catch (e) {
         return e instanceof Error ? e.message : String(e);
       }`
    );
    expect(positional.ok).toBe(true);
    expect(String(positional.result)).toMatch(/allowlist|not allowed/i);
    expect(String(positional.result)).not.toContain("actor_id is required");
  });
});

describe("produced files", () => {
  it("imports the Apify storage files a run's dataset points at, and says how to keep one", async () => {
    // The regression: a downloader actor answered with a `downloadedFileUrl`
    // into Apify's expiring store, and the model — with nothing importing it —
    // fetched it by hand, read the bytes to base64 and pushed them back
    // through save_asset. The run result now carries the imported file.
    const original = globalThis.fetch;
    const video = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const recordUrl =
      "https://api.apify.com/v2/key-value-stores/KV1/records/clip.mp4";
    const requested: string[] = [];
    const json = (body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json", ...headers }
      });
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("/v2/acts/") && url.includes("/runs")) {
        return json({
          data: {
            id: "RUN1",
            actId: "A",
            status: "SUCCEEDED",
            defaultDatasetId: "DS1",
            defaultKeyValueStoreId: "KV1"
          }
        });
      }
      if (url.includes("/v2/datasets/DS1/items")) {
        return json(
          [
            {
              id: "clip",
              downloadedFileUrl: recordUrl,
              // A page URL, not a produced file: must not be imported.
              input: "https://www.youtube.com/watch?v=abc",
              nested: { again: recordUrl }
            }
          ],
          { "x-apify-pagination-total": "1" }
        );
      }
      if (url === recordUrl) {
        return new Response(video, {
          status: 200,
          headers: { "content-type": "video/mp4" }
        });
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${url}`);
    }) as unknown as typeof fetch;

    try {
      const stored = new Map<string, Uint8Array>();
      const context = {
        userId: "user-apify",
        getSecret: async (key: string) =>
          key === "APIFY_API_TOKEN" ? TOKEN : null,
        storage: {
          store: async (key: string, bytes: Uint8Array) => {
            stored.set(key, bytes);
            return `memory://${key}`;
          },
          retrieve: async () => null
        },
        resolveTempUrl: async (uri: string) =>
          `/api/storage/${uri.slice("memory://".length)}`
      } as unknown as ProcessingContext;
      const run = createCapabilityRun({ context, gate: UNGATED });
      const result = (await run.invoke("run_apify_actor", {
        actor_id: "apify/website-content-crawler",
        input: {}
      })) as Record<string, unknown>;

      expect(result.ok).toBe(true);
      const files = result.files as Array<Record<string, unknown>>;
      expect(files).toHaveLength(1);
      expect(files[0].source_url).toBe(recordUrl);
      expect(files[0].content_type).toBe("video/mp4");
      expect(files[0].size_bytes).toBe(video.byteLength);
      expect(String(files[0].asset_url)).toMatch(/^\/api\/storage\/apify\//);
      expect(files[0].import_error).toBeUndefined();
      // The bytes are in NodeTool storage, fetched once.
      expect(requested.filter((u) => u === recordUrl)).toHaveLength(1);
      expect([...stored.values()][0]).toEqual(video);
      // And the result tells the model the copy path that needs no base64.
      expect(String(result.files_note)).toContain("save_asset({name, source: asset_url})");
    } finally {
      globalThis.fetch = original;
    }
  });
});
