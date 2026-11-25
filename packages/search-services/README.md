# Search services

The library index and its query, shared by the HTTP server, the agent tools
and the CLI. The design is in
[Library search for documents and assets](../../docs/plans/library-search.md).
This package implements delivery step A1: the lexical layer.

## What is indexed

Every asset and every document a person owns becomes an item in
`nodetool_search_items`, with its text split into passages in
`nodetool_search_chunks`. Step A1 indexes what the source row holds:

- Assets and entities: the name, the generation prompt, the entity descriptor
  and description, `metadata.description`, and the tags in `metadata.tags`.
- Workflows, apps, sketches, scripts, storyboards, timelines, JS scripts and
  games: the name, and the description and tags where the table has them.

Folders and shipped entity presets are not library items. File content is
indexed by the extractors of step A2.

The lexical index is an FTS5 table on SQLite and a generated `tsvector`
column on PostgreSQL, both created by the `create_library_search_index`
migration in `packages/models`.

## Keeping the index current

- `startLibraryIndexWrites()` subscribes to `ModelObserver` and rewrites an
  item after each create, save and delete of its source row. The server calls
  it at startup.
- `reconcileLibraryIndex()` compares every source row with its item and
  rewrites what is missing or out of date, and removes items whose row is
  gone. The server runs it at startup and every 15 minutes. A raw Drizzle
  update produces no change signal, so the reconcile is what makes the index
  correct.
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

`searchAssets` returns asset rows for the asset surfaces: `assets.search`,
`asset_search`, `asset_list`, `list_images`, `list_assets` and
`list_model3ds`.

## Tests

```bash
npm run test --workspace=packages/search-services
```

The suite runs every case on SQLite and on PGlite with the production
PostgreSQL migrations.
