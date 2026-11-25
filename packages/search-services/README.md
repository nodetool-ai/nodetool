# Search services

The library index and its query, shared by the HTTP server, the agent tools
and the CLI. The design is in
[Library search for documents and assets](../../docs/plans/library-search.md).
This package implements delivery steps A1 and A2: the lexical layer and the
indexer that extracts file and document content.

## What is indexed

Every asset and every document a person owns becomes an item in
`nodetool_search_items`, with its text split into passages in
`nodetool_search_chunks`. The item is written at once with what the source
row holds:

- Assets and entities: the name, the generation prompt, the entity descriptor
  and description, `metadata.description`, and the tags in `metadata.tags`.
- Workflows, apps, sketches, scripts, storyboards, timelines, JS scripts and
  games: the name, and the description and tags where the table has them.

The indexer then extracts the content into body passages, each with a
locator:

| Source | Passages | Locator |
|---|---|---|
| Text file | Paragraphs packed to about 800 characters | `start`, `end` |
| Markdown file | Blocks, never across a heading | `start`, `end`, `headings` |
| PDF | Each page's text layer | `page`, `start`, `end` |
| Word file (`.docx`, needs the optional `mammoth` package) | Paragraphs | `start`, `end` |
| Workflow | Text in node properties | `node_id` |
| Storyboard, timeline, sketch | Text in shots, clips or layers | `shot_id`, `clip_id`, `layer_id` |
| App, script | Text in blocks | `block_id` |
| JS script | Code by line | `line_start`, `line_end` |

Files over 50 MB, more than 2,000 PDF pages and extractions over two minutes
are not read. Such an item is `skipped` and stays findable by its name and
metadata. Folders, shipped entity presets and workflows that are not listed
in the library are `excluded` and never appear in results.

The lexical index is an FTS5 table on SQLite and a generated `tsvector`
column on PostgreSQL, both created by the `create_library_search_index`
migration in `packages/models`.

## Keeping the index current

- `startLibraryIndexWrites()` subscribes to `ModelObserver` and rewrites an
  item after each create, save and delete of its source row. The server calls
  it at startup.
- `reconcileLibraryIndex()` compares every source row with its item and
  rewrites what is missing or out of date, and removes items whose row is
  gone. A raw Drizzle update produces no change signal, so the reconcile is
  what makes the index correct.
- `runLibraryIndexer()` reconciles at start and every 15 minutes, then claims
  `pending` items and extracts their content. The item row is the queue: a
  claim is a lease with a version, so several indexers can share one
  database. A failure retries with backoff and becomes `failed` after five
  attempts. A person's own change goes ahead of backfill.
- The server runs the indexer in a child process of its own entry, chosen by
  `NODETOOL_SEARCH_INDEXER` (see
  [environment variables](../../docs/environment-variables.md)). Writes in the
  server wake it over IPC.
- `searchLibrary()` reconciles the caller's own items first, at most once a
  minute per owner, so a host that runs no sweep, such as the CLI, still
  searches a complete index.

## Query

```ts
import { searchLibrary, searchAssets } from "@nodetool-ai/search-services";

const result = await searchLibrary({
  userId,
  query: "red fox",
  kinds: ["image", "video"],
  projectId,
  filter: { tags: ["hero"], provider: "fal" },
  limit: 20
});
// result.hits[n].matches: [{ field: "prompt", snippet: "…red fox…", locator }]
// result.index: { mode: "hybrid" | "semantic" | "keyword", pending, failed, note? }
```

A query matches an item when one passage holds every word as a word prefix,
or when its title contains the query. Full-text hits rank first. A query of
one or two characters matches the start of a title. An empty query lists
items newest first. Matching is case-insensitive on both dialects.

## Search by meaning

When an embedding model is set (`NODETOOL_SEARCH_SEMANTIC`,
`NODETOOL_SEARCH_EMBEDDING_PROVIDER` and `NODETOOL_SEARCH_EMBEDDING_MODEL`, as
settings in the `Library Search` group or as
[environment variables](../../docs/environment-variables.md)), the indexer
embeds every chunk after extracting it, and a query runs a vector search beside
the lexical one. The two rankings merge by reciprocal rank fusion and
`index.mode` is `hybrid`. `mode: "keyword"` skips the vector layer and
`mode: "semantic"` ranks by meaning alone.

- Vectors live in managed collections of the default vector provider, one per
  owner and model, named with the `nodetool_library__` prefix and partitioned
  by project. A record holds the chunk id, the vector, and the item and
  project ids. Authoring surfaces (the collections router and REST route, the
  collection tools, `nodetool collections` and the `vector.*` nodes) refuse
  them. `nodetool search status` shows them.
- A vector hit is joined to its item under the caller's user id and filters,
  so it can never return another owner's item. A hit whose chunk is gone is
  dropped and its vector deleted.
- The host installs the embedder. In a server, local models (Transformers.js,
  node-llama-cpp) load only in the indexer process, and the server asks it for
  query vectors over IPC. A hosted model runs through the generation seam, so
  its cost lands in the prediction ledger. When no vector is available the
  query matches words and `index.note` says why.
- Each chunk records the space its vector is in. Changing the model embeds the
  chunks again into a new collection while the old one keeps answering. When
  none is left, the old collection is dropped.
- `libraryIndexStatus(userId)` reports items by state and vector coverage.
  `rebuildLibraryIndex(userId, "vectors" | "all")` queues a rebuild.

The headless commands are `nodetool search query|read|status|setup|rebuild|indexer`
([CLI reference](../../docs/cli.md#nodetool-search)).

## Reading a passage

`readLibraryPassage({ userId, id, locator, before, after })` returns the
passage at a match's locator and its neighbours, from the index, without
reading the file again. `id` is the resource id or the item id, in full or
as a 12-character prefix.

`searchAssets` returns asset rows for the asset surfaces: `assets.search`,
`asset_search`, `asset_list`, `list_images`, `list_assets` and
`list_model3ds`. `assets.search` returns each row's best match as `match`,
so the asset browser and the mobile Assets screen show the prompt or passage
that matched when it was not the name.

## App surfaces

The `search` tRPC router in `packages/websocket` serves the apps:

| Procedure | Calls |
|---|---|
| `search.query` | `searchLibrary`, for the command palette's library group |
| `search.read` | `readLibraryPassage` |
| `search.status` | `libraryIndexStatus`, plus whether the caller may set up search and the size of the default local model |
| `search.rebuild` | `rebuildLibraryIndex` |
| `search.setup` | `setupLibrarySemanticSearch`. The cloud profile refuses it |

`libraryIndexStatus` reports `semantic.choice` as `unset` until someone turns
search by meaning on or off. On desktop, the command palette offers the local
model once while it is `unset`: download it, use a provider model, or not now.
Settings, Integrations, Library search shows the counts, failures, model and
rebuild actions.

## Agent tools

The `search` capability module in `packages/agents` exposes `search` and
`search_read` on the chat, CLI and MCP belts, in `run_search`, and in CodeAct
as `nodetool.search.query` and `nodetool.search.read`. `asset_search`,
`asset_list`, `list_images` and the `query` of the document list tools call
the same query with a fixed kind.

## Tests

```bash
npm run test --workspace=packages/search-services
```

The suite runs every case on SQLite and on PGlite with the production
PostgreSQL migrations. `tests/retrieval.test.ts` is the retrieval eval: a
labeled corpus and query set that must rank each relevant item first, and it
prints recall at the agent's default limit. The `library-search` harness runs
this suite and the agent capability suite.
