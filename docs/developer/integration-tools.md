---
layout: page
title: "Integration Tools"
permalink: /developer/integration-tools
description: "Agent tools, sandbox imports, results, errors and code locations for the Google Workspace, Apify and SerpAPI integrations."
---

**Navigation**: [Developer Guide](index.md) → **Integration Tools**

This page is for engineers who call the integration tools from Code nodes, JS scripts or MCP, or who change them. For setup and what to ask the agent, see [Google Workspace](../google-workspace.md), [Apify](../apify-integration.md) and [SerpAPI](../serpapi-integration.md). Server variables are in [Integrations on Your Server](../integrations-hosting.md).

Each tool is one capability spec: the same name is an agent tool, an MCP tool, and a sandbox export.

```js
import { gmail_search } from "@nodetool-ai/sandbox-nodetool/google";

const mail = await gmail_search({ query: "is:unread newer_than:7d", max_results: 10 });
return mail.messages.map((m) => m.subject);
```

## Google Workspace

The `google` module is offered to the chat agent, the MCP agent tools, and Code nodes on servers where the integration is on (see [Integrations on Your Server](../integrations-hosting.md#google-workspace)). Code imports the tools from `@nodetool-ai/sandbox-nodetool/google`.

Every tool has the `external` permission category, reads included, because each acts on a third-party account. A failure comes back as an `error` result instead of a thrown exception, so an agent can reconnect or try another file. A missing or expired credential returns `No Google account connected`.

| Tool | What it does |
|---|---|
| `google_drive_search` | Search Drive with a plain phrase or Drive query syntax. Up to 100 files |
| `google_drive_get_file` | Get name, MIME type, size, owners and link for a file |
| `google_drive_read_file` | Read a file as text. Docs, Sheets and Slides export to plain text or CSV |
| `google_drive_create_file` | Create a text file, optionally in a folder (default is the My Drive root) |
| `gmail_search` | Search with Gmail query syntax such as `from:alice@example.com is:unread newer_than:7d`. Up to 50 messages with subject, sender, date and body |
| `gmail_get_message` | Fetch one message by id |
| `gmail_send_message` | Send a plain-text email with `to`, `subject`, `body`, optional `cc` and `bcc` |
| `gmail_modify_labels` | Add or remove labels on a message. Remove `INBOX` to archive and `UNREAD` to mark read |
| `gmail_list_labels` | List label ids and names |
| `google_docs_read` | Read a document's title and text |
| `google_docs_create` | Create a document, optionally with starting text. Returns the id and URL |
| `google_docs_append` | Append text to the end of a document |
| `google_sheets_read` | Read an A1 range such as `Sheet1!A1:D50` |
| `google_sheets_append` | Append rows below the last populated row of a range |
| `google_sheets_update` | Overwrite a range with new values |
| `google_sheets_create` | Create a spreadsheet, optionally seeded with rows from A1. Returns the id and URL |
| `google_calendar_list_calendars` | List calendar ids and names |
| `google_calendar_list_events` | List events in a time window, soonest first. Times are RFC3339 and the start defaults to now. Up to 250 events |
| `google_calendar_create_event` | Create an event with a summary, start, end, and optional description, location and attendees |
| `google_calendar_delete_event` | Delete an event by id |

Calendar tools use the primary calendar unless the call passes `calendar_id`. Calendar times are RFC 3339 strings.

The consent screen requests the `drive`, `gmail.modify`, `gmail.send`, `documents`, `spreadsheets` and `calendar` scopes. The server stores one OAuth credential per Google account. The settings card calls `/api/oauth/google/session`, `/api/oauth/google/tokens` and `/api/oauth/google/disconnect`. The token route returns metadata only, never the token. See [API Reference](../api-reference.md).

## Apify

The `apify` module runs [Apify](https://apify.com) actors on Apify's machines. There is one generic `run_apify_actor` plus discovery calls, and no per-site nodes. Code imports from `@nodetool-ai/sandbox-nodetool/apify`. The token is read from `APIFY_API_TOKEN`, with `APIFY_API_KEY` as a fallback.

### What an agent gets

Eight capabilities in the `apify` namespace. Each is both an agent tool and a sandbox import from one spec. The chat belt, the MCP bridge, and the belt shared by `nodetool.code.Code` nodes and JS scripts all carry them through `getApifyTools()` (`packages/agents/src/tools/external-capability-tools.ts`), which is what `nodetool.searchTools("apify")` searches.

| Capability | Does | Category |
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

#### From sandbox code

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

### The intended loop

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
### Results and assets

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

### Security

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

### Errors

Failures are classified rather than surfaced as raw HTTP: `auth`, `disabled`,
`actor_not_found`, `actor_not_allowed`, `invalid_input`, `run_failed`,
`run_timed_out`, `run_aborted`, `dataset_failed`, `asset_download_failed`,
`rate_limited`, `budget_exceeded`, `network`, `cancelled`.

Only `rate_limited` and `network` are retried. Retrying a rejected token or an
input the actor's schema refuses spends the same failure twice, and a *run* is
never retried automatically, because a second start is a second charge.
### Limitations

- No dedicated graph nodes. The capability is reachable from agents and sandbox code.
- No streaming. A run's dataset is read after it finishes, so a long crawl
  reports nothing until it settles. `wait_for_finish: false` plus polling is the
  workaround.
- The budget is per capability run, not per user or per day. A user who starts
  many chat turns can spend many budgets.
- Actor pricing is read from the store record, which reports the pricing model
  rather than a predicted cost for a specific input.
- The SSRF screen resolves names at Apify's end, not ours, so DNS rebinding is
  not covered. It is defense in depth, not a complete mitigation.

## SerpAPI

The `serpapi` module calls SerpAPI's `GET /search.json?engine=...` for any engine SerpAPI ships. There is one generic `serpapi_search` plus discovery calls, and no per-engine tools. Code imports from `@nodetool-ai/sandbox-nodetool/serpapi`. The key is read from `SERPAPI_API_KEY`, which the `web_search` SerpAPI backend also reads.

### What an agent gets

Five capabilities in the `serpapi` namespace, each both an agent tool and a sandbox import.

| Capability | Does | Class |
|---|---|---|
| `list_serpapi_engines` | Every engine SerpAPI ships, and what each requires | read |
| `get_serpapi_engine_schema` | One engine's parameters, types, and allowed values | read |
| `serpapi_search` | Run one search on any engine | read |
| `get_serpapi_account` | Plan and searches left this month | read |
| `get_serpapi_locations` | Canonical values for the `location` parameter | read |

All five are `read`. A search spends a plan credit but changes nothing on the
other side — the class `web_search` already sits in, and this is the same call
with the engine chosen by the caller instead of by the install.

#### The order that matters

list → schema → search. It is in the tool descriptions because skipping it is
expensive in a way that does not look like an error: **SerpAPI ignores a
parameter it does not recognize.** A call that says `query` where the engine
wants `q` does not fail; it succeeds, bills a search, and returns results for an
empty query. So `serpapi_search` checks the parameter bag against the engine's
catalogued contract first, and an unknown key, a missing required one, or a
value outside an enumerated set comes back as a message with no HTTP call behind
it.

#### From sandbox code

```js
import {
  get_serpapi_engine_schema,
  serpapi_search
} from "@nodetool-ai/sandbox-nodetool/serpapi";

// Read the contract before constructing parameters for an unfamiliar engine.
const schema = await get_serpapi_engine_schema({ engine: "google_scholar" });

const result = await serpapi_search({
  engine: "google_scholar",
  params: { q: "attention is all you need", as_ylo: 2020 },
  fields: ["organic_results"],
  max_items: 10
});
```

A response is a whole results page — `google` alone answers with organic
results, ads, a knowledge graph, related questions, and inline images — so
`serpapi_search` trims it. `fields` picks the top-level keys to return and
`max_items` caps each result array. Nothing is dropped silently: `available_keys`
lists everything the engine returned, `omitted` names the keys left out, and
`truncated` counts the entries cut from each array.
### Where the key lives

In the host, and nowhere else.

- Guest code calls `serpapi_search`; it never sees `SERPAPI_API_KEY`. The whole
  HTTP path is `packages/agents/src/serpapi/client.ts`, which takes the key as a
  private constructor field.
- `api_key` and `output` are host-owned. A caller that sets either is refused
  rather than obeyed, so the credential slot cannot be overwritten and the
  response cannot be switched to HTML this layer cannot parse.
- Errors are redacted before they are constructed. SerpAPI echoes the request
  URL in some failure bodies, and the key rides on the query string, so an error
  that reaches a model, a tool result, or a log line has the key replaced.

### How discovery works, and how it fails

SerpAPI publishes no schema endpoint. Its playground page, however, ships every
engine and every parameter — name, label, description, required flag, type, and
allowed values — as one JSON blob in a `data-react-props` attribute.
`packages/agents/src/serpapi/catalog.ts` reads that, flattens the documentation
markup to text, and caches the result process-wide for six hours (one fetch is
~3 MB; contracts change on SerpAPI's release schedule, not per call).

That is a page, not a documented API, so the parse is defensive and the failure
is **named**: a page whose markup changed comes back as `catalog_unavailable`
with "the catalog parser needs updating", not as an empty engine list that reads
like SerpAPI ships nothing. `packages/agents/tests/serpapi-catalog.test.ts` runs
the parser against a real playground response, trimmed to three engines and
otherwise byte-for-byte as SerpAPI served it, so a shape change fails a test
rather than a user's run.

Two parameters SerpAPI's own table marks *required* are dropped from every
engine's caller-facing contract: `api_key` and `engine`. The first is the
host's, the second is the selector that chose the contract. Leaving them in
would make every checked call demand the one field a caller must never set.

### Code

| What | Where |
|---|---|
| Capability specs (descriptions, schemas, classes) | `packages/agents/src/capabilities/serpapi.specs.ts` |
| Capability implementations | `packages/agents/src/capabilities/serpapi.ts` |
| Belt tools (chat runner, MCP bridge) | `packages/agents/src/tools/external-capability-tools.ts` |
| HTTP client — the only holder of the key | `packages/agents/src/serpapi/client.ts` |
| Engine catalog and its parser | `packages/agents/src/serpapi/catalog.ts` |
| Response trimming and parameter checking | `packages/agents/src/serpapi/normalize.ts` |
| Classified failures | `packages/agents/src/serpapi/errors.ts` |
| `web_search`'s SerpAPI backend (shares the client) | `packages/agents/src/tools/serp-providers/serpapi-provider.ts` |
