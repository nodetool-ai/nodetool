# SerpAPI: search any engine

The `serpapi` capability calls SerpAPI's `GET /search.json?engine=...` endpoint for any engine it ships: Google and its verticals, Bing, YouTube, Amazon, Yelp, the app stores, and others, each with its own parameters. There is one generic `serpapi_search` tool plus two discovery calls. There are no per-engine tools.

> **Runs:** cloud, on SerpAPI. **Needs:** the `SERPAPI_API_KEY` secret. **Cost:** each search counts against your SerpAPI plan. `get_serpapi_account` reports searches left this month.
{: .callout-note}

`list_serpapi_engines` and `get_serpapi_engine_schema` read SerpAPI's own engine table, so a new engine is callable without a change to NodeTool.

## Set up

1. Create a key at <https://serpapi.com/manage-api-key>.
2. Store it as the `SERPAPI_API_KEY` secret in **Settings → Secrets**.

The `web_search` capability's SerpAPI backend reads the same secret.

## What an agent gets

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

### The order that matters

list → schema → search. It is in the tool descriptions because skipping it is
expensive in a way that does not look like an error: **SerpAPI ignores a
parameter it does not recognize.** A call that says `query` where the engine
wants `q` does not fail; it succeeds, bills a search, and returns results for an
empty query. So `serpapi_search` checks the parameter bag against the engine's
catalogued contract first, and an unknown key, a missing required one, or a
value outside an enumerated set comes back as a message with no HTTP call behind
it.

### From sandbox code

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

## `serpapi_search` or `web_search`?

`web_search` is one query against whichever SERP provider this install
configured (`SERP_PROVIDER`: SerpAPI, DataForSEO, Brave, Apify, OpenAI, or
Gemini), normalized to title/url/snippet — the two model-backed providers
answer in prose and their citations are what gets normalized. Reach for it for
a plain web question — it is provider-agnostic and its results are already in
the shape an agent wants.

`serpapi_search` is the layer under that, for the questions a plain web search
cannot ask: a citation count, a maps listing's hours, a product's price history,
a job posting's apply link, a flight itinerary. It needs a SerpAPI key
specifically, and it returns the engine's own fields rather than a normalized
subset.

## Where the key lives

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

## How discovery works, and how it fails

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

## Code

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
