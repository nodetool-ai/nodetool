/**
 * `@nodetool-ai/sandbox-apify` — the Apify run-and-poll shape, on the host.
 *
 * An Apify scrape is three calls, not one: start the actor, poll the run until
 * it settles, then read the dataset it filled. The helper builds each of the
 * three requests — including the actor id's `owner/name` → `owner~name` form,
 * which is the single most common reason a start returns 404. The polling loop
 * itself belongs in the guest, where `sleep` and the fetch cap live.
 *
 * ```js
 * import { startRun, runStatus, datasetItems } from "@nodetool-ai/sandbox-apify";
 *
 * const token = await nodetool.secrets.get("APIFY_API_TOKEN");
 * const start = await startRun({ token, actor: "apify/web-scraper", input });
 * let run = (await (await fetch(start.url, start)).json).data;
 *
 * while (run.status === "RUNNING" || run.status === "READY") {
 *   await sleep(5000);
 *   const poll = await runStatus({ token, runId: run.id });
 *   run = (await (await fetch(poll.url, poll)).json).data;
 * }
 * if (run.status !== "SUCCEEDED") throw new Error(`Apify run ${run.status}`);
 *
 * const items = await datasetItems({ token, datasetId: run.defaultDatasetId });
 * return { items: await (await fetch(items.url, items)).json };
 * ```
 */

import { optionsOf } from "./limits.js";
import {
  jsonBody,
  requireString,
  withQuery,
  type PreparedRequest
} from "./prepared-request.js";

const APIFY_BASE = "https://api.apify.com";

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Start an actor run.
 *
 * `actor` takes either form of the id: `apify/web-scraper` or the
 * `apify~web-scraper` the API path wants.
 */
export async function startRun(options?: unknown): Promise<PreparedRequest> {
  const where = "apify.startRun";
  const opts = optionsOf(options);
  const token = requireString(where, opts.token, "token");
  const actor = requireString(where, opts.actor, "actor").replace(/\//g, "~");

  const url = new URL(`/v2/acts/${encodeURIComponent(actor)}/runs`, APIFY_BASE);
  withQuery(url, {
    build: opts.build,
    memory: opts.memoryMbytes,
    timeout: opts.timeoutSecs
  });

  return {
    url: url.toString(),
    method: "POST",
    headers: { ...bearer(token), "Content-Type": "application/json" },
    body: jsonBody(where, opts.input ?? {})
  };
}

/**
 * Read one run's record — `data.status` is what a poll loop waits on, and
 * `data.defaultDatasetId` is what it reads afterwards.
 */
export async function runStatus(options?: unknown): Promise<PreparedRequest> {
  const where = "apify.runStatus";
  const opts = optionsOf(options);
  const token = requireString(where, opts.token, "token");
  const runId = requireString(where, opts.runId, "runId");

  return {
    url: new URL(
      `/v2/actor-runs/${encodeURIComponent(runId)}`,
      APIFY_BASE
    ).toString(),
    method: "GET",
    headers: bearer(token)
  };
}

/** Read a dataset's items as JSON. */
export async function datasetItems(options?: unknown): Promise<PreparedRequest> {
  const where = "apify.datasetItems";
  const opts = optionsOf(options);
  const token = requireString(where, opts.token, "token");
  const datasetId = requireString(where, opts.datasetId, "datasetId");

  const url = new URL(
    `/v2/datasets/${encodeURIComponent(datasetId)}/items`,
    APIFY_BASE
  );
  withQuery(url, {
    format: opts.format ?? "json",
    clean: opts.clean,
    limit: opts.limit,
    offset: opts.offset
  });

  return { url: url.toString(), method: "GET", headers: bearer(token) };
}
