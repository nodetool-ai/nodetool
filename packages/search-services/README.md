# Search services

The library index and its query, shared by the HTTP server, the agent tools
and the CLI. The design is in
[Library search for documents and assets](../../docs/plans/library-search.md).
This package implements delivery steps A1 to A6: the lexical layer, the
indexer that extracts file and document content, search by meaning,
captions and transcripts, and files in project folders.

## What is indexed

Every asset and every document a person owns becomes an item in
`nodetool_search_items`, with its text split into passages in
`nodetool_search_chunks`. The item is written at once with what the source
row holds:

- Assets and entities: the name, the generation prompt, the entity descriptor
  and description, `metadata.description`, and the tags in `metadata.tags`.
- Workflows, apps, sketches, scripts, storyboards, timelines, JS scripts and
  games: the name, and the description and tags where the table has them.
- Text, Markdown, PDF and Word files in a project folder that no asset or
  document names: the file name and its folder. The resource type is
  `project_file` and the resource id is `<project id>:<path>`.

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

## Files in project folders

The host installs a `ProjectFileSource` with `setProjectFileSource()`. The
server's indexer process installs one that lists each local project folder by
the rule a cloud send uses (`listWorkspaceFiles`), so the files assets and
documents name are not indexed twice. The reconcile adds, re-reads and removes
these items. A folder it cannot read keeps its items, and a process without a
source leaves them alone, so the server never removes them. A folder on object
storage is not read. A new file is found at the next reconcile, within 15
minutes.

## Captions and transcripts

Enrichment is off until a model is set: `NODETOOL_SEARCH_CAPTION_MODEL` for
images and `NODETOOL_SEARCH_TRANSCRIPT_MODEL` for audio and video, each
`provider:model`, as settings in the `Library Search` group or as
[environment variables](../../docs/environment-variables.md).

- `runEnrichPass()` runs after the embed pass. It captions images without a
  prompt and transcribes audio and video, writing `caption` and `transcript`
  chunks that every other step treats like extracted text. A transcript
  passage's locator is its time range in seconds, `{ start, end }`.
- An item records what it was enriched from in `enriched_version`
  (`<source version>|<model>`). A rename keeps the chunks without another
  model call. A changed file or a changed model enriches again.
- A failure is retried on later passes, three times in all, and the reason is
  kept in `enrich_error`. A new version of the file resets the count.
- Projects in `NODETOOL_SEARCH_EXCLUDED_PROJECTS` are not enriched. The daily
  spend limit counts captions and transcripts with embedding.
- The host installs the model calls with `setLibraryEnricher()`. The server's
  indexer process runs a caption through `generate_message` with the image
  and a transcript through `automatic_speech_recognition` on 16 kHz mono
  audio, both with a `library-search-` job id so their cost is recorded.

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
- `similarTo` (`similar_to` over tRPC, `search`, and `--similar-to` in the
  CLI) ranks items by nearness in meaning to one item, without that item. It
  needs search by meaning, and otherwise returns no hits and a note.
- `libraryIndexStatus(userId)` reports items by state and vector coverage.
  `rebuildLibraryIndex(userId, "vectors" | "all")` queues a rebuild.

The headless commands are `nodetool search query|read|status|setup|rebuild|indexer`
([CLI reference](../../docs/cli.md#nodetool-search)).

## Image vectors

An image model embeds the pictures themselves, so a text query finds an image
by what it shows and `similarTo` compares images by how they look, with no
caption. It is off until `NODETOOL_SEARCH_IMAGE_EMBEDDING_MODEL` names a model
as `provider:model`, as a setting in the `Library Search` group, an
[environment variable](../../docs/environment-variables.md), or
`nodetool search setup --image-model`. The model must embed text into the same
space, because queries are embedded with it too:

| Model | Runs |
|---|---|
| `transformers_js:Xenova/clip-vit-base-patch32` | Locally, in the indexer process, with quantized weights |
| `jina:jina-clip-v2` | At Jina. Image files are sent to the provider |
| `voyage:voyage-multimodal-3` | At Voyage. Image files are sent to the provider |
| `cohere:embed-v4.0` | At Cohere. Image files are sent to the provider |

- `runImageEmbedPass()` runs after the text embed pass. It embeds each PNG,
  JPEG, WebP or GIF image asset up to 20 MB through `embedImages` of the
  installed embedder, which calls `generateImageEmbedding` on the provider. A
  hosted call runs under the budget lease and counts toward the daily spend
  limit. Projects in `NODETOOL_SEARCH_EXCLUDED_PROJECTS` are not embedded, and
  their vectors are removed.
- Each image item has one vector, id `<item id>_image`, in the owner's image
  collection for that model. Image collections carry the role `image` in
  their metadata and a name ending in `_img`, so a text model change never
  drops them. The item records what the vector was made from in
  `image_embedded_version` (`<source version>|<project id>|<model>`). A
  changed file, a move to another project, or a new model embeds it again.
  When an owner has no image left to embed, image collections of older models
  are dropped. Until then, queries read the new model's collection only.
- A failure is retried on later passes, three times in all, with the reason in
  `image_embed_error`. A format no model reads is recorded once and not sent.
- A query embeds its text in the image space beside the text space and fuses
  the image ranking with the passage ranking. An image hit is joined to its
  item under the caller's user id and filters. A hit that matched by its
  picture alone has one match with field `image` and an empty snippet. The
  similarity floor is 0.2 instead of 0.25: text and images share a space but
  never sit close in it.
- `similarTo` on an image reads its stored vector, so it finds images that
  look alike. On another item, its title stands for it in the image space.
- `libraryIndexStatus(userId).semantic.images` reports the model, the images
  embedded and the images left.

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
