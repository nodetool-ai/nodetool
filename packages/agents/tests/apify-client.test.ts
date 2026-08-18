/**
 * The Apify client, policy, and normalization — everything below the
 * capability module, against a fake Apify.
 *
 * Nothing here reaches the network. The client takes an injected `fetch`, so
 * these are assertions about the exact requests NodeTool sends, the exact
 * classification it puts on each failure, and what it refuses before sending
 * anything at all.
 *
 * Two properties get more attention than the rest, because they are the ones a
 * regression would quietly undo: the token never appears in anything the client
 * *returns*, and a cancelled run aborts the actor instead of merely abandoning
 * the wait.
 */

import { describe, expect, it, vi } from "vitest";

import {
  ApifyClient,
  isTerminalRunStatus,
  toActorPathId,
  toCanonicalActorId
} from "../src/apify/client.js";
import { ApifyError, asApifyError } from "../src/apify/errors.js";
import {
  ApifyBudgetLedger,
  apifyPolicyFromEnv,
  assertActorInputUrlsArePublic,
  decideActor,
  isPubliclyRoutableUrl,
  type ApifyPolicy
} from "../src/apify/policy.js";
import {
  inputSchemaFromBuild,
  simplifyInputSchema,
  summarizeActor,
  summarizeDataset
} from "../src/apify/normalize.js";
import { runActor, waitForRun } from "../src/apify/run.js";

const TOKEN = "apify_api_SUPERSECRETVALUE0123456789";

/** A `Response` good enough for the client, with the headers it reads. */
function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const headers = new Headers(init.headers ?? {});
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
    clone() {
      return this as unknown as Response;
    }
  } as unknown as Response;
}

/** Record every request the client makes, answering from a scripted queue. */
function fakeFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function clientWith(responses: Array<() => Response>) {
  const { impl, calls } = fakeFetch(responses);
  return {
    client: new ApifyClient(TOKEN, { fetchImpl: impl, retryBaseMs: 1 }),
    calls
  };
}

describe("actor id forms", () => {
  it("converts owner/name to the tilde form the API path wants", () => {
    expect(toActorPathId("apify/website-content-crawler")).toBe(
      "apify~website-content-crawler"
    );
    // Already-tilde ids pass through, so either form is accepted everywhere.
    expect(toActorPathId("apify~web-scraper")).toBe("apify~web-scraper");
  });

  it("canonicalizes back to owner/name for display and the allowlist", () => {
    expect(toCanonicalActorId("apify~web-scraper")).toBe("apify/web-scraper");
  });
});

describe("request construction", () => {
  it("sends a bearer token and the actor's input as the body", async () => {
    const { client, calls } = clientWith([
      () => jsonResponse({ data: { id: "RUN1", actId: "A", status: "READY" } })
    ]);
    await client.startRun({
      actorId: "apify/web-scraper",
      input: { startUrls: [{ url: "https://example.com" }] },
      timeoutSecs: 120,
      maxItems: 50
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toContain("/v2/acts/apify~web-scraper/runs");
    expect(call.url).toContain("timeout=120");
    expect(call.url).toContain("maxItems=50");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(call.init.body).toBe(
      '{"startUrls":[{"url":"https://example.com"}]}'
    );
  });

  it("reads the input schema from the default build endpoint", async () => {
    const { client, calls } = clientWith([
      () => jsonResponse({ data: { actorDefinition: { input: {} } } })
    ]);
    await client.getDefaultBuild("compass/google-maps-extractor");
    expect(calls[0].url).toContain(
      "/v2/acts/compass~google-maps-extractor/builds/default"
    );
  });

  it("pages a dataset and reports the total from the pagination header", async () => {
    const { client, calls } = clientWith([
      () =>
        jsonResponse([{ a: 1 }], {
          headers: { "x-apify-pagination-total": "14392" }
        })
    ]);
    const page = await client.getDatasetItems({
      datasetId: "DS1",
      offset: 40,
      limit: 20
    });
    expect(calls[0].url).toContain("offset=40");
    expect(calls[0].url).toContain("limit=20");
    expect(page.total).toBe(14392);
    expect(page.items).toEqual([{ a: 1 }]);
  });
});

describe("error classification", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "actor_not_found"],
    [429, "rate_limited"],
    [400, "invalid_input"]
  ])("maps HTTP %i onto %s", async (status, kind) => {
    const { client } = clientWith([
      () => jsonResponse({ error: { message: "nope" } }, { status })
    ]);
    // maxAttempts is 3 by default and 429 retries, so the queue repeats.
    await expect(client.getRun("RUN1")).rejects.toMatchObject({ kind });
  });

  it("retries a rate limit and succeeds on a later attempt", async () => {
    let call = 0;
    const { impl } = fakeFetch([
      () => {
        call += 1;
        return call < 3
          ? jsonResponse({ error: { message: "slow down" } }, { status: 429 })
          : jsonResponse({ data: { id: "RUN1", actId: "A", status: "SUCCEEDED" } });
      }
    ]);
    const client = new ApifyClient(TOKEN, { fetchImpl: impl, retryBaseMs: 1 });
    await expect(client.getRun("RUN1")).resolves.toMatchObject({
      status: "SUCCEEDED"
    });
    expect(call).toBe(3);
  });

  it("does not retry a deterministic failure", async () => {
    let call = 0;
    const { impl } = fakeFetch([
      () => {
        call += 1;
        return jsonResponse({ error: { message: "bad input" } }, { status: 400 });
      }
    ]);
    const client = new ApifyClient(TOKEN, { fetchImpl: impl, retryBaseMs: 1 });
    await expect(client.getRun("RUN1")).rejects.toMatchObject({
      kind: "invalid_input"
    });
    // One attempt. Retrying an input the API rejected spends the same failure
    // twice, and for a *run* it would spend real money twice.
    expect(call).toBe(1);
  });

  it("never puts the token into an error message", async () => {
    const { client } = clientWith([
      () =>
        jsonResponse(
          { error: { message: `token ${TOKEN} was rejected` } },
          { status: 401 }
        )
    ]);
    const error = await client.getRun("RUN1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApifyError);
    const text = `${(error as ApifyError).message} ${JSON.stringify(
      (error as ApifyError).toResult()
    )}`;
    expect(text).not.toContain(TOKEN);
    expect(text).toContain("«redacted»");
  });

  it("refuses to construct without a token, naming the setting", () => {
    expect(() => new ApifyClient("")).toThrow(/APIFY_API_TOKEN/);
  });

  it("classifies an abort as cancelled, not as a network blip", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(asApifyError(abort).kind).toBe("cancelled");
    // Only that matters for retries: `cancelled` must not be retryable.
    expect(asApifyError(abort).retryable).toBe(false);
  });
});

describe("key-value records", () => {
  it("returns null for a missing key rather than failing", async () => {
    const { client } = clientWith([
      () => jsonResponse({ error: { message: "not found" } }, { status: 404 })
    ]);
    await expect(client.getKeyValueRecord("KV1", "OUTPUT")).resolves.toBeNull();
  });
});

describe("abort", () => {
  it("treats a finished run as success, not an error", async () => {
    const { client } = clientWith([
      () => jsonResponse({ error: { message: "already finished" } }, { status: 400 })
    ]);
    await expect(client.abortRun("RUN1")).resolves.toBeNull();
  });

  it("posts to the abort endpoint", async () => {
    const { client, calls } = clientWith([
      () => jsonResponse({ data: { id: "RUN1", actId: "A", status: "ABORTED" } })
    ]);
    await client.abortRun("RUN1");
    expect(calls[0].url).toContain("/v2/actor-runs/RUN1/abort");
    expect(calls[0].init.method).toBe("POST");
  });
});

describe("run status", () => {
  it("knows which states have settled", () => {
    for (const status of ["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]) {
      expect(isTerminalRunStatus(status)).toBe(true);
    }
    for (const status of ["READY", "RUNNING", "ABORTING", "TIMING-OUT"]) {
      expect(isTerminalRunStatus(status)).toBe(false);
    }
  });
});

describe("cancellation", () => {
  it("aborts the actor when the surrounding run is cancelled", async () => {
    const controller = new AbortController();
    const aborted: string[] = [];
    const client = {
      getRun: async () => ({ id: "RUN1", actId: "A", status: "RUNNING" }),
      abortRun: async (runId: string) => {
        aborted.push(runId);
        return null;
      }
    } as unknown as ApifyClient;

    controller.abort();
    const error = await waitForRun(
      client,
      { id: "RUN1", actId: "A", status: "RUNNING" },
      60,
      { signal: controller.signal }
    ).catch((e: unknown) => e);

    expect((error as ApifyError).kind).toBe("cancelled");
    // The wait unwinding is not enough — the actor is still billing until the
    // abort lands, which is the whole reason the cleanup exists.
    expect(aborted).toEqual(["RUN1"]);
  });

  it("aborts the actor when the run outlives its deadline", async () => {
    const aborted: string[] = [];
    const client = {
      getRun: async () => ({ id: "RUN2", actId: "A", status: "RUNNING" }),
      abortRun: async (runId: string) => {
        aborted.push(runId);
        return null;
      }
    } as unknown as ApifyClient;

    const error = await waitForRun(
      client,
      { id: "RUN2", actId: "A", status: "RUNNING" },
      0
    ).catch((e: unknown) => e);

    expect((error as ApifyError).kind).toBe("run_timed_out");
    expect(aborted).toEqual(["RUN2"]);
  });

  it("reports a failed run with its status and message", async () => {
    const client = {
      getRun: async () => ({ id: "R", actId: "A", status: "FAILED" })
    } as unknown as ApifyClient;
    const error = await waitForRun(
      client,
      {
        id: "R",
        actId: "A",
        status: "FAILED",
        statusMessage: "the site blocked us"
      },
      60
    ).catch((e: unknown) => e);
    expect((error as ApifyError).kind).toBe("run_failed");
    expect((error as ApifyError).message).toContain("the site blocked us");
  });
});
