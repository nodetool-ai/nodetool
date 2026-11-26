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
// result.index: { mode: "keyword", pending, failed }
```

A query matches an item when one passage holds every word as a word prefix,
or when its title contains the query. Full-text hits rank first. A query of
one or two characters matches the start of a title. An empty query lists
items newest first. Matching is case-insensitive on both dialects.

`readLibraryPassage({ userId, id, locator, before, after })` returns the
passage at a match's locator and its neighbours, from the index, without
reading the file again. `id` is the resource id or the item id, in full or
as a 12-character prefix.

`searchAssets` returns asset rows for the asset surfaces: `assets.search`,
`asset_search`, `asset_list`, `list_images`, `list_assets` and
`list_model3ds`.

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
