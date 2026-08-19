# Apify: external capabilities for the sandbox

NodeTool's sandbox has no network, no browser, no filesystem outside the
workspace, and no way to install a package. That is the point of it. But plenty
of real work needs exactly those things — read this site, drive this
JavaScript-heavy page, find these businesses, pull this video's transcript.

Apify closes that gap without opening the sandbox. Actors run on Apify's
machines; NodeTool exposes a typed, permission-aware, credential-free interface
to them, converts what comes back into ordinary NodeTool values and assets, and
never lets the guest touch the network or the token.

This is deliberately **one generic capability, not a shelf of scrapers**. There
is no `YouTubeDownloader` node, no `InstagramScraper` node. There is
`run_apify_actor`, plus a shipped catalog of actors that are known to work, plus
the discovery calls an agent needs to find and understand an actor it has not
seen before.

## Setting it up

1. Get a token at <https://console.apify.com/account/integrations>.
2. Settings → Secrets → `APIFY_API_TOKEN`.

`APIFY_API_KEY` is still read as a fallback, so an install configured before
this existed keeps working.

## What an agent gets

Eight capabilities in the `apify` namespace. They are agent tools and sandbox
imports at the same time — one spec behind both — so nothing can drift between
what a model is told and what guest code can call. The chat belt, the MCP
bridge, and the belt a `nodetool.code.Code` node and a JS script share all
carry them through `getApifyTools()`
(`packages/agents/src/tools/external-capability-tools.ts`), which is what
makes `nodetool.searchTools("apify")` find them: the search reads the belt,
and a module reachable only by import is invisible to it.

The Code node belt matters as much as the chat one, because the move a chat
teaches is "run it here, then put the same call in a node". It carried the
tools only in chat for a while, so that second step failed with QuickJS's
`TypeError: not a function` — naming neither the tool nor the belt — and read
as the sandbox having no reach at all.

| Capability | Does | Class |
|---|---|---|
| `search_apify_actors` | Find an actor by what it does | read |
| `get_apify_actor` | One actor's record, pricing, and whether it may run here | read |
| `get_apify_actor_schema` | The actor's input contract | read |
| `run_apify_actor` | Run it | external |
| `get_apify_run` | Poll a run started with `wait_for_finish: false` | read |
| `abort_apify_run` | Stop a run | external |
| `get_apify_dataset_items` | Page through a run's dataset | read |
| `get_apify_key_value_record` | Read non-tabular output (screenshots, `OUTPUT`) | read |

Only the two that act are classed `external`. Reading the store, an input
schema, or a dataset a run already produced spends nothing and changes nothing.

### From sandbox code

```js
import {
  get_apify_actor_schema,
  run_apify_actor
} from "@nodetool-ai/sandbox-nodetool/apify";

// Read the contract before constructing input for an unfamiliar actor.
const schema = await get_apify_actor_schema({
  actor_id: "apify/website-content-crawler"
});

const result = await run_apify_actor({
  actor_id: "apify/website-content-crawler",
  input: {
    startUrls: [{ url: "https://example.com" }],
    maxCrawlPages: 3
  }
});

return result.dataset.items.map((page) => page.markdown);
```

Exports carry the wire name — `run_apify_actor`, not `runActor` — because the
prompt, the MCP surface, `tools.*` and the import all name one string.

No token, no `fetch`, no polling loop. The host does all three.

## The intended loop

```
search_apify_actors("google maps businesses")
  → get_apify_actor_schema("compass/google-maps-extractor")
  → run_apify_actor({actor_id, input})
  → dataset preview + ids to read the rest
```

The middle step is not optional politeness. Every actor names its input fields
differently, and a wrong key is **not an error** — it starts a run that succeeds
and returns an empty dataset, having charged for it. The tool descriptions say
so, and say not to invent actor ids.

Costs differ by orders of magnitude between actors that look interchangeable, so
the descriptions also steer to the cheapest thing that works: a content crawl
beats an HTML scrape beats a full browser run. Keep the three ideas apart —
**search** finds URLs, **crawl** traverses pages, **browser** interacts with one.

## Permissions

Four modes, set with `NODETOOL_APIFY_MODE`:

| Mode | Store search | Runs |
|---|---|---|
| `disabled` | — | nothing |
| `allowlist` | the shipped catalog only | allowlisted actors |
| `discovery` **(default)** | the whole store | allowlisted directly; anything else asks the user |
| `unrestricted` | the whole store | anything |

`NODETOOL_APIFY_ALLOWED_ACTORS` is a comma-separated list **added to** the
shipped catalog, not replacing it, because the usual intent is "the normal ones
plus mine".

In `allowlist` mode, `search_apify_actors` answers from the shipped catalog
instead of the store and says so. Listing actors a model cannot run reliably
produces a plan built on one of them.

Approval in `discovery` mode goes through NodeTool's ordinary permission gate,
so an actor prompt looks like every other prompt and "allow for this chat"
works the way it does elsewhere.

## The shipped catalog

The default allowlist, chosen for being first-party or the long-standing
community actor for a capability with no official equivalent, with a documented
input schema:

| Actor | For |
|---|---|
| `apify/website-content-crawler` | Crawl a site to Markdown — the default for reading pages |
| `apify/cheerio-scraper` | Fast HTML-only extraction |
| `apify/web-scraper` | Browser-rendered extraction |
| `apify/playwright-scraper` | Full browser automation |
| `apify/google-search-scraper` | Search result pages |
| `compass/google-maps-extractor` | Businesses and places |
| `apify/instagram-scraper` | Public Instagram data |
| `trudax/reddit-scraper-lite` | Public Reddit data |
| `apify/screenshot-url` | Page screenshots |
| `streamers/youtube-scraper` | YouTube metadata and subtitles |

Prices move, so the catalog records only the *shape* of the bill
(`per-result`, `per-page`, `per-event`, `compute-time`).
`get_apify_actor` reads the live figure from the store.

## Cost control

Runs cost money and an autonomous agent can loop, so a session carries a budget
(a chat turn, a workflow execution, or a Code node action each get their own):

| Limit | Default | Env |
|---|---|---|
| Runs per session | 10 | `NODETOOL_APIFY_MAX_RUNS` |
| Dataset items per run | 1000 | `NODETOOL_APIFY_MAX_ITEMS` |
| Seconds per run | 300 | `NODETOOL_APIFY_MAX_RUN_SECONDS` |
| MB per run | 4096 | `NODETOOL_APIFY_MAX_MEMORY_MB` |
| USD per session | 5 | `NODETOOL_APIFY_MAX_COST_USD` |

Caller-supplied options are clamped down to these, never up. The policy decides
before the budget is charged and the budget is claimed before the run starts, so
a refused actor costs nothing and a refused budget starts nothing. Every
`run_apify_actor` result reports the session's remaining runs and spend.

## Cancellation

Stopping a workflow or an agent aborts the actor, it does not merely abandon the
wait. That is why NodeTool starts a run and polls it rather than using Apify's
synchronous endpoint: the run id exists from the first response, so there is
something concrete to abort. The abort deliberately runs on a fresh path — the
obvious version, passing the caller's signal to the abort request, cancels the
cleanup with the thing it is cleaning up.

Aborting a run that already finished does nothing and is not an error, so
cancellation is idempotent and safe to race.

## Results and assets

A run comes back as a **preview** of its dataset plus the ids needed to read the
rest — never the whole thing. Datasets reach six figures of rows; a summary says
`total: 14392, showing 20` and how to page. Two independent limits apply, a row
count and a serialized byte ceiling, because rows vary by orders of magnitude
between a Maps scrape and a full-page crawl. When the byte limit bites, whole
rows are dropped, never partial ones, and the result says so.

Files are different. Actors return URLs into Apify's storage and **those URLs
expire**, so binary output is fetched by the host through NodeTool's SSRF-screened
`safeFetch` and written to NodeTool storage, capped at 100 MB and cut off mid-
download if a server declares no length. Text and JSON come back inline —
storing a copy of a string just creates a second handle on it. An import that
fails reports itself and leaves the remote URL in place rather than discarding a
run that has already been paid for.

Two paths do the import. `run_apify_actor` walks its dataset preview for URLs
into Apify's key-value storage — every actor names its file field differently
(`downloadedFileUrl`, `screenshotUrl`, …), so it is the URL's shape that
identifies a produced file — and imports up to five of them, returned as
`files` with an `asset_url` each. `get_apify_key_value_record` imports a binary
record on read. Both give storage URLs; keeping one in the asset library is
`save_asset({name, source: asset_url})`, which copies host-side. The model is
told so in the result, because the alternative it reaches for otherwise is
`read_asset` → 600 KB of base64 → `save_asset`.

Every result carries provenance: actor id, run id, retrieval time, dataset and
key-value store ids, status, and cost. It carries no token and no actor input,
since an input can hold something a user typed.

## Security

The sandbox never gains what Apify has. The token lives in one file
(`packages/agents/src/apify/client.ts`), is attached to requests and never to
results, and is scrubbed from every error before it is thrown. Guest code calls
`run_apify_actor` and receives normalized values.

Actor inputs are screened for SSRF before a run starts. The walk covers the whole
input at any depth rather than a known set of URL fields, because every actor
names its URL field differently and a check that only knows `startUrls` is one a
model routes around by accident. Loopback, RFC1918, link-local, CGNAT, cloud
metadata, and the IPv6 forms that smuggle an IPv4 address are all refused; plain
`http` to a public host is allowed, since actors legitimately crawl such sites.

Apify running on Apify's machines does not make this moot: a self-hosted NodeTool
reachable from the internet, or an internal hostname that resolves inside a
customer VPC, are both real targets.

**Everything an actor returns is attacker-influenced text about to enter a
model's context.** Scraped pages carry whatever the page author wrote, including
instructions aimed at your agent. Treat actor output as data, keep previews
small, and prefer structured extraction over dumping whole pages.

## Errors

Failures are classified rather than surfaced as raw HTTP: `auth`, `disabled`,
`actor_not_found`, `actor_not_allowed`, `invalid_input`, `run_failed`,
`run_timed_out`, `run_aborted`, `dataset_failed`, `asset_download_failed`,
`rate_limited`, `budget_exceeded`, `network`, `cancelled`.

Only `rate_limited` and `network` are retried. Retrying a rejected token or an
input the actor's schema refuses spends the same failure twice, and a *run* is
never retried automatically, because a second start is a second charge.

## Example workflows

**Website research** — crawl to Markdown, summarize:

```js
const result = await run_apify_actor({
  actor_id: "apify/website-content-crawler",
  input: { startUrls: [{ url }], maxCrawlPages: 20 }
});
```

**Business discovery** — Maps to a table:

```js
const result = await run_apify_actor({
  actor_id: "compass/google-maps-extractor",
  input: { searchStringsArray: ["AI startups"], locationQuery: "Amsterdam" }
});
```

**Competitive research** — an agent composes search → crawl → extract → compare
across sites NodeTool has no integration for, which is the case the generic
primitive exists to serve.

## Limitations

- No dedicated NodeTool nodes yet. The capability is reachable from agents and
  from sandbox code; a graph node wrapping it, with a schema-driven
  configuration UI generated from `get_apify_actor_schema`, is the obvious next
  step.
- No streaming. A run's dataset is read after it finishes, so a long crawl
  reports nothing until it settles. `wait_for_finish: false` plus polling is the
  workaround.
- The budget is per capability run, not per user or per day. A user who starts
  many chat turns can spend many budgets.
- Actor pricing is read from the store record, which reports the pricing model
  rather than a predicted cost for a specific input.
- The SSRF screen resolves names at Apify's end, not ours, so DNS rebinding is
  not covered. It is defense in depth, not a complete mitigation.
