---
name: sandbox-apify
description: Run an Apify actor and read its dataset from a Code node or CodeAct action, with NodeTool's request builder running on the host
---

# Apify in the sandbox

Specifier: `@nodetool-ai/sandbox-apify`. Declare it in the node's `packages`
property and import it at the top of the body.

An Apify scrape is three calls, not one: start the actor, poll the run until it
settles, then read the dataset it filled. This pack builds each of the three —
including the actor id's `owner/name` → `owner~name` form, which is the single
most common reason a start returns 404.

**Nothing here sends a request, and nothing here polls.** The loop belongs in
the guest, where `sleep` and the fetch cap live.

## The whole flow

```js
import { startRun, runStatus, datasetItems } from "@nodetool-ai/sandbox-apify";

const token = await nodetool.secrets.get("APIFY_API_TOKEN");

const start = await startRun({
  token,
  actor: "apify/web-scraper",
  input: {
    startUrls: inputs.urls.map((url) => ({ url })),
    linkSelector: "a[href]",
    maxPagesPerCrawl: 10
  }
});
let run = (await fetch(start.url, start)).json.data;

const deadline = Date.now() + 300_000;
while (run.status === "READY" || run.status === "RUNNING") {
  if (Date.now() > deadline) throw new Error("Apify run timed out");
  await sleep(5000);
  const poll = await runStatus({ token, runId: run.id });
  run = (await fetch(poll.url, poll)).json.data;
}
if (run.status !== "SUCCEEDED") throw new Error(`Apify run ${run.status}`);

const items = await datasetItems({ token, datasetId: run.defaultDatasetId, limit: 1000 });
return { items: (await fetch(items.url, items)).json };
```

## startRun

Options: `token` and `actor` (required), `input` (the actor's own input
object), `build`, `memoryMbytes`, `timeoutSecs`.

`actor` takes either form of the id: `apify/web-scraper` or `apify~web-scraper`.

## runStatus

Options: `token` and `runId` (required). The response's `data.status` is what
the loop waits on, and `data.defaultDatasetId` is what it reads afterwards.

## datasetItems

Options: `token` and `datasetId` (required), `limit`, `offset`, `clean`,
`format` (default `json`).

## Gotchas

- **Every export is async.** A host call is a round trip.
- **Each poll costs a fetch.** The default cap is 20 calls per run, so poll
  every few seconds, not every few hundred milliseconds — and raise the node's
  timeout, not just the loop's deadline.
- **Each actor has its own input schema.** `apify/web-scraper` wants
  `startUrls` and `pageFunction`; `apify/google-search-scraper` wants
  `queries`. Read the actor's page — a wrong key starts a run that succeeds
  with an empty dataset.
- **A run costs money on Apify.** A poll loop that never exits keeps a paid
  actor alive; give it a deadline.
- **The dataset paginates.** `limit` tops out at 1000 per call; page with
  `offset`.
