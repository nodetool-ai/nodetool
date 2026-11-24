# Library search for documents and assets

## Outcome

One query finds any document or asset a person owns, by name, by content, by how it was made, or by meaning. An agent calls the same search through one tool and gets handles it can open, each with the passage that matched. Nobody names a collection, picks a chunk size, or starts an indexing run. Keyword search works with no setup. Search by meaning needs one choice, an embedding model.

Terms used below:

- **Library index.** The system-owned index over a person's documents and assets. It is separate from the collections a person creates for RAG workflows, which keep working as they do now.
- **Item.** One indexed resource: an asset, a document of any kind, an entity, or a project-folder file.
- **Chunk.** A passage of an item's text with a locator that says where it came from.
- **Embedding space.** A provider, model and dimension. Vectors from different spaces cannot be compared.
- **Managed collection.** A vector collection the indexer creates, migrates and deletes.

## Current state

- **F1. Asset search matches the name only.** `Asset.searchAssetsGlobal` in [`asset.ts`](../../packages/models/src/asset.ts) runs `LIKE` on `name`. The `assets.search` procedure, the `asset_search`, `asset_list`, `list_images` and `list_model3ds` tools, the mobile screen and the document embed dialog all call it. The generation prompt, the rest of `metadata`, entity tags and file content are not searched.
- **F2. That path has defects.** In [`routers/assets.ts`](../../packages/websocket/src/trpc/routers/assets.ts), `search` drops the folder paths the model computes while [`GlobalSearchResults.tsx`](../../web/src/components/assets/GlobalSearchResults.tsx) renders `folder_path`. It accepts `workflow_id` and never filters by it. `total_count` is the page length. The tool spec in [`assets.specs.ts`](../../packages/agents/src/capabilities/assets.specs.ts) promises a case-insensitive match, and plain `LIKE` is case-sensitive on Postgres.
- **F3. Documents have no server-side search.** `listDocumentIndex` in [`document-index.ts`](../../packages/models/src/document-index.ts) returns ids and names per kind. The agent list tools load rows and filter them in memory. `list_workflows` in [`workflows.ts`](../../packages/agents/src/capabilities/workflows.ts) ignores `query` for a person's own workflows. Nothing searches the content of a workflow, script, storyboard or text document. The command palette in [`CommandMenu.tsx`](../../web/src/components/menus/CommandMenu.tsx) lists workflows by name and has no asset or document group.
- **F4. Neither database has a full-text index.** There is no FTS5 table and no `tsvector` column. Every text match is `LIKE`.
- **F5. A collection is only what the vector store holds.** There is no relational record. The embedding model and owner are free-form metadata keys, and [`collection-access.ts`](../../packages/vectorstore/src/collection-access.ts) treats a collection with no owner as visible to everyone.
- **F6. Several indexing paths store no vectors.** The `vector.*` nodes in [`vector.ts`](../../packages/core-nodes/src/nodes/vector.ts), apart from `IndexEmbedding` and `IndexAggregatedText`, and the CLI in [`collections.ts`](../../packages/cli-workflow/src/commands/collections.ts) open a collection without an embedding function. On sqlite-vec they store null embeddings and query with `LIKE`.
- **F7. The sqlite-vec provider lacks what a system index needs.** In [`sqlite-vec-provider.ts`](../../packages/vectorstore/src/sqlite-vec-provider.ts) a metadata filter throws `UnsupportedFilterError`, `score` is never set, and the dimension is not recorded. Deletion is by record id only, so re-indexing a shorter file leaves stale chunks. [`sqlite-vec-store.ts`](../../packages/vectorstore/src/sqlite-vec-store.ts) sets WAL mode and no `busy_timeout`.
- **F8. Indexing runs inside the request.** `POST /api/collections/:name/index` in [`collection-api.ts`](../../packages/websocket/src/collection-api.ts) embeds inline and accepts UTF-8 text only. The web UI uploads files one by one and keeps progress in the browser. No indexing state is stored.
- **F9. There is no worker process and no general queue.** Background work is `setInterval` loops in [`server.ts`](../../packages/websocket/src/server.ts). Three patterns are reusable. The generation lease in [`durable-generation.ts`](../../packages/models/src/durable-generation.ts) claims a row with a conditional update and a version. [`project-hash-job.ts`](../../packages/project-services/src/project-hash-job.ts) keeps no state and treats every row without a hash as work left to do. `VideoProxyQueue` in [`video-proxy.ts`](../../packages/websocket/src/lib/video-proxy.ts) is a serial in-process queue, and its header says a cloud deployment would need a worker.
- **F10. Change signals are not durable.** `ModelObserver` in [`base-model.ts`](../../packages/models/src/base-model.ts) fires in process on create, save and delete, and a raw Drizzle update skips it. [`resource-change-bus.ts`](../../packages/websocket/src/lib/resource-change-bus.ts) forwards changes to clients and, on Postgres, to other replicas. [`project-watch.ts`](../../packages/project-services/src/project-watch.ts) watches a local folder only while a client has the project open.
- **F11. Embeddings have two separate paths.** [`embedding.ts`](../../packages/vectorstore/src/embedding.ts) calls hosted providers and Ollama with `fetch`. The runtime providers implement `generateEmbedding`, including the local Transformers.js path in [`embeddings.ts`](../../packages/transformers-js-provider/src/embeddings.ts) and node-llama-cpp. [`pack-source.ts`](../../packages/websocket/src/pack-source.ts) does not register the Transformers.js provider in production. No path produces an image embedding.
- **F12. Useful metadata exists and is not searchable.** Asset rows carry the prompt, provider and model ([`asset-generation.ts`](../../packages/protocol/src/asset-generation.ts)), the workflow, node and job ids, a content hash and a folder path. [`document-refs.ts`](../../packages/models/src/schema/document-refs.ts) records which documents use an asset. Entities carry a descriptor and tags. Assets have no tags field of their own.
- **F13. Non-media files in a project folder have no asset row.** The reconciler creates rows for image, video, audio and 3D files only ([Project folders](../workspaces.md)). A Markdown file or PDF in the folder is reachable by the `grep` tool and by nothing else.
- **F14. Setup pieces exist in parts.** [`setting-catalog.ts`](../../packages/config/src/setting-catalog.ts) holds every setting, and the group name `Search` already belongs to the web-search providers and is hidden in [`RemoteSettingsMenu.tsx`](../../web/src/components/menus/RemoteSettingsMenu.tsx). The desktop app has no first-run wizard. The collections UI has an embedding model picker, and `runTransformersJsModelDownload` reports download progress.
- **F15. Production runs two replicas on one database** ([Production Deploy](../docker-production-deploy.md)). The vector provider used there is not stated in this repository.

## Design

### Index

- **D1. Two layers, one index.** A lexical layer in the main database covers names, metadata and extracted text. It is always on and needs no model. A semantic layer in the vector store adds search by meaning once an embedding space is configured. A query uses both when both exist. Search never waits for the semantic layer.
- **D2. Two tables in the main database, in both dialects.**
  - `nodetool_search_items` has one row per item: owner, project, resource type and id, title, content type, the filter columns (created and updated time, provider, model, workflow id, favorite, folder path), the metadata document from D5, and the indexing state from D3. It is unique on owner, resource type and resource id.
  - `nodetool_search_chunks` has one row per chunk: item id, ordinal, field (`title`, `prompt`, `description`, `body`, `caption`, `transcript`), text, locator, and the embedding space of its vector, if any.
  - The lexical index is an FTS5 table over the chunks on SQLite and a generated `tsvector` column with a GIN index on Postgres. Both get a prefix form for type-ahead.
  - The index lives in the main database so it follows the vault path on desktop and the shared database in the cloud.
- **D3. The item row is the queue.** Each row records the source version it was built from (the content hash when the asset has one, otherwise `updated_at`), an extractor version, a state (`pending`, `ready`, `failed`, `skipped`), an attempt count, a next-attempt time, a priority and a lease. Work left to do is every row whose recorded versions differ from the current ones. This is the stateless shape of the hash job in F9, so a restart loses nothing and a missed change signal is repaired by the next sweep.
- **D4. The server writes the metadata fields inline.** When an asset or document is created, renamed or deleted, the server upserts its item row and its `title` and `prompt` chunks in the same request, through a `ModelObserver` subscription. That is one small write with no extraction. A new asset is findable by name and prompt at once, as it is today, even when the indexer is down. Everything slower belongs to the indexer.

### Metadata

- **D5. One metadata schema, `SearchMetadata`, in `packages/protocol`.** Every item gets the same shape, filled from data that exists today (F12):

  | Group | Fields | Source |
  |---|---|---|
  | Identity | kind, title, content type, project id and name, folder path, URI | asset and document rows |
  | Media | width, height, duration, size, page count | asset row and metadata |
  | Provenance | origin (generated, imported, external, folder file), prompt, provider, model, capability, workflow id and name, node type, job id, generation id | `metadata.generation`, row columns, predictions |
  | Usage | documents that use the item, favorite | `nodetool_document_refs`, row |
  | Entity | entity kind, descriptor, tags | `metadata.nodetool_entity` |
  | Time | created, updated | rows |
  | Derived | caption, transcript language, text language | D15 enrichment |

  Every field in the first six groups is a filter. Hits return a compact subset. The prompt is the main reason generated media becomes findable, and it costs nothing to index.
- **D6. One extractor per kind turns content into chunks with locators.**

  | Kind | Text indexed | Locator |
  |---|---|---|
  | Text and Markdown assets | full text, split on headings | character range, heading path |
  | PDF, DOCX | extracted text ([`document-processing`](../../packages/document-processing/src/index.ts), the DOCX path in [`routes/documents.ts`](../../packages/websocket/src/routes/documents.ts)) | page |
  | Workflow | name, description, node titles, comments, prompt-like string properties | node id |
  | Script, storyboard, timeline | script text, shot descriptions and prompts, clip names | block, shot or clip id |
  | Application, sketch, JS script, game | name, description, layer names or source text | none or line range |
  | Image, video, audio, 3D model | prompt, plus caption or transcript when enrichment is on | time range for transcripts |
  | Entity | name, descriptor, description, tags | none |
  | Project-folder file with no asset row (F13) | as its file type above, keyed by project and path | as above |

  The repository has three text splitters today. The index uses one, with a target of a few hundred tokens and a small overlap, and prepends the item title and heading path to each chunk before embedding.

### Managed collections

- **D7. The indexer owns the vector collections.** It creates one collection per owner and embedding space, under a reserved name prefix and a `managed` metadata key. A record holds a chunk id, its vector, and the item and project ids. The chunk text stays in the main database and is not copied into the vector store.
- **D8. Managed collections are hidden from every authoring surface.** The collections router, the REST route, `list_collections`, `query_collection`, `create_collection`, `delete_collection`, the CLI and the `vector.Collection` node skip or reject the reserved prefix. `nodetool search status` is the way to inspect them.
- **D9. The project is a pre-filter.** sqlite-vec scans every vector in a table, and most queries are scoped to one project. Add a partition option to `CreateCollectionOptions`. sqlite-vec maps it to a `vec0` partition key column, and Supabase maps it to its existing metadata filter. Confirm with a test that the pinned sqlite-vec accepts partition keys. If it does not, create one managed collection per project instead.
- **D10. Embeddings come from the runtime providers.** The indexer calls `generateEmbedding` and upserts precomputed vectors. That gives the local Transformers.js and node-llama-cpp models, and records hosted cost through the same prediction ledger as `embed_text`. The `fetch` path in `vectorstore` stays for collections people author.
- **D11. Changing the embedding space rebuilds in the background.** The indexer creates the collection for the new space, re-embeds chunks into it, and keeps answering from the old one. When the new one is complete it switches and drops the old one. The space id on each chunk row makes the rebuild resumable.
- **D12. Deletion follows the source.** A deleted asset or document marks its item for removal. The indexer deletes its chunks and vector records by id. Deleting a project or an account removes its items and, with them, its managed collections.

### Indexer process

- **D13. Indexing runs in its own OS process.** PDF parsing and local embedding are CPU-bound and hold a model in memory, so they must not share the server's event loop or its failure domain.
  - The server starts one indexer child and restarts it with backoff. The child is the same backend entry started in an indexer role, so the packaged desktop backend needs no second bundle.
  - The database is the queue. The indexer claims a batch of pending rows with a conditional update and a lease version, as `claimGenerationLease` does. Two replicas can each run a child without doing the same work twice.
  - The server wakes the child over the child-process IPC channel when it writes a pending row. The child also polls, and on Postgres it listens on the existing resource-change channel.
  - `NODETOOL_SEARCH_INDEXER` selects `child` (the default), `external` or `off`. With `external`, a deployment runs `nodetool search indexer` as its own container and the API replicas spawn nothing.
  - A local embedding model is loaded in the indexer only. The server asks the child for a query embedding over IPC. If the child is not running, the query falls back to the lexical layer and says so.
- **D14. The indexer does its work in a fixed order.**
  1. Reconcile. Compare source rows with item rows, add missing items, mark changed ones pending, and mark removed ones for deletion. It runs at start and on a timer. It also walks project folders through `Workspace.list` for files with no row.
  2. Extract. Read bytes through `readAssetFileBytes`, run the extractor, and replace the item's chunks in one short transaction.
  3. Embed. Batch chunks that lack a vector in the current space.
  4. Enrich, when enabled (D15).

  Rows changed by a person's current action come first, then recent rows, then backfill. A failed row retries with backoff up to a limit, then stays `failed` with its reason. Size, page and time limits bound each extraction. The child runs at low OS priority and one embedding batch at a time on desktop. Hosted embedding has a rate limit and a daily spend limit in settings.
- **D15. Enrichment is opt-in.** Captions for images without a prompt and transcripts for audio and video cost compute or provider money, so both are off by default and set per deployment. They produce `caption` and `transcript` chunks that the other steps treat like any text. The Whisper provider and the image-to-text nodes are the starting points.

### Query

- **D16. One query function serves every surface.** It lives in a new `packages/search-services` package beside the other HTTP-independent services. It takes a query, filters, a scope and a limit, and returns ranked items.
  - The lexical query and the vector query run in parallel. Results merge by reciprocal rank fusion. The repository has two fusion formulas today, and this uses one.
  - Chunk hits are grouped by item, so one long PDF cannot fill the page. Each item keeps its best few passages.
  - Filters apply in SQL on the item table. Vector hits are joined to item rows by id under the caller's user id, so a vector hit can never return another owner's item.
  - Hits are hydrated from the source rows at query time. A row deleted since indexing drops out.
  - A query shorter than three characters is a prefix match on titles.
  - The response states the mode used (`hybrid` or `keyword`) and the number of pending and failed items, so a caller knows when results may be incomplete.

### Agent interface

- **D17. Two tools.**

  `search` finds items:

  ```ts
  search({
    query: string,              // words or a question. May be empty when a filter is set.
    kinds?: SearchKind[],       // image, video, audio, model_3d, document, workflow, application,
                                // sketch, script, storyboard, timeline, jsscript, game, entity, file
    scope?: "project" | "all",  // default: the run's project, as asset_search resolves it today
    filter?: {
      created_after?, created_before?, provider?, model?, workflow_id?,
      used_by?, tags?, favorite?, folder?, content_type?
    },
    mode?: "auto" | "keyword" | "semantic",
    limit?: number,             // default 8, maximum 50
    cursor?: string
  })
  ```

  ```ts
  {
    hits: [{
      id, kind, title, uri,                 // id in the short form every other tool accepts
      project: { id, name }, path, created_at,
      matches: [{ field, snippet, locator }],  // why it matched and where
      meta: { provider, model, width, height, duration, used_by, tags },
      open_with                             // the tool that reads this kind, such as view_image
    }],
    next_cursor,
    index: { mode, pending, failed }
  }
  ```

  `search_read({ id, locator?, before?, after? })` returns the text of a passage and its neighbouring chunks from the index. An agent reads page 4 of a PDF without extracting the file again.
- **D18. Rules for the result.**
  - A hit says why it matched. The `field` and `snippet` let the agent judge relevance without opening the item.
  - A hit says how to open it. `open_with` names the existing tool, and the `id` and `uri` follow the [resource ID principles](../../AGENTS.md#resource-id-principles): one id form per result, and the full id or an exact short prefix accepted on input.
  - Results are ordered and carry no score. A fused rank is not a probability, and agents treat a number as one.
  - Output is bounded: a small default limit, short snippets, and a cursor for more.
  - Snippets are text from files and are untrusted. They are returned in the reference-data wrapper the pack guides use, so indexed text cannot instruct the agent.
  - The `index` field replaces a status tool. With `mode: "keyword"` the agent knows a search by meaning did not run.
- **D19. Existing tools keep their names and call the same function.** `asset_search`, `asset_list`, `list_images` and the `query` parameter of the document list tools become thin calls with a fixed `kinds` value, which fixes F2 and F3. `search` and `search_read` are a new `search` capability module, declared like the modules in the [built-in capabilities table](../AGENTS.md#built-in-capabilities), with category `read`. That puts them on the chat, CLI and MCP belts, which share one session builder. They also join the `run_search` allowlist in [`run-search-tool.ts`](../../packages/agents/src/tools/run-search-tool.ts) and CodeAct as `nodetool.search.query` and `nodetool.search.read` in [`nodetool-api.ts`](../../packages/agents/src/codeact/nodetool-api.ts). `query_collection` stays for authored collections. The [RAG skill](../../packages/system-skills/nodetool-rag-indexing/SKILL.md) description points to `search` for finding stored items.

### Human interface

Read the [UX Guidelines](../UX_GUIDELINES.md) and the [Design System](../DESIGN.md) before building these.

- **D20. The command palette gets a library group.** Typing in Cmd/Ctrl+K sends a debounced query to the server. Results show a thumbnail or kind icon, the title, the matched snippet, and the project and folder. Enter opens the item. A second action reveals it in the asset browser.
- **D21. The asset browser uses the same query.** `useAssetSearch` in [`useAssetSearch.ts`](../../web/src/serverState/useAssetSearch.ts) calls the new procedure. The type, project, model and favorite filters move to the server, and a date range joins them. When the match is not in the name, the row shows what matched, such as the prompt or a page number. The mobile screen calls the same procedure.
- **D22. Index state is visible and quiet.** While backfill runs, the search surface shows one line with the count indexed and the count left. Settings show the embedding model, the pending and failed counts with reasons, and a rebuild action.
- **D23. The API is tRPC.** `search.query`, `search.read`, `search.status` and `search.rebuild`. Status changes reach clients as `resource_change` events.

### Setup

- **D24. Keyword search has no setup.** The migration creates the tables and the indexer backfills.
- **D25. Search by meaning asks once, where search is used.** On desktop, the first time a person opens search, one inline card offers to download a local embedding model and states its size from the model card and that content stays on the machine. The other choices are a provider model and not now. There is no wizard. Choosing a provider model shows the number of chunks to embed and states that their text is sent to that provider.
- **D26. A cloud deployment sets the model in configuration.** `NODETOOL_SEARCH_EMBEDDING_PROVIDER` and `NODETOOL_SEARCH_EMBEDDING_MODEL` select the space for every account. People see no prompt.
- **D27. Settings live in a new group, `Library Search`.** The name `Search` is taken (F14). The group holds the on/off switch, the embedding model, the two enrichment switches, excluded projects, and the spend limit.
- **D28. Headless setup is a CLI command.** `nodetool search setup --model <id>` does what the card does.

### CLI and harness

- **D29. Every part is drivable headlessly**, as [Harness-First Engineering](../HARNESS_FIRST.md) requires.
  - `nodetool search query|read|status|setup|rebuild|indexer`, each with `--json`, in a new command feature.
  - A registry entry and a keyless selfcheck: index a fixture corpus with the fake embedding provider, run fixed queries, and compare the ranked ids.
  - A surface entry that covers `packages/search-services`, and capability-table entries for the two tools.
  - A retrieval eval with a labeled query set that reports recall at the default limit for keyword, semantic and hybrid modes. The default model, chunk size and fusion settings are chosen by this eval.
  - Agent tasks for `nodetool jtbd`, such as finding an asset from a description of its prompt and answering a question from a PDF in the project.

## Delivery

Each step ships with its tests and harness entry, and each leaves search better than before it.

- **A1. Lexical index and query.** The package, the two tables and migrations, `SearchMetadata`, the inline writes (D4), a reconcile that runs in the server for now, the query function in keyword mode, and the rerouted `assets.search` and asset tools. Fixes F1 and F2 for names, prompts and metadata. Runs against both dialects.
- **A2. Indexer process.** The indexer role, supervision, leases, wake signals and status (D13, D14). Reconcile and backfill move into it. Extractors for text, Markdown, PDF, DOCX and every document kind. `search_read`.
- **A3. Agent interface.** `search` and `search_read` on the belts, in CodeAct and in the capability table (D17 to D19). The retrieval eval and the agent tasks.
- **A4. Semantic layer.** Managed collections, the vector store changes (partition option, `busy_timeout`, recorded dimension), embedding through the runtime providers, fusion, the setup card, settings and the rebuild on model change (D7 to D12, D24 to D28).
- **A5. Human interface.** The palette group, the asset browser, mobile and index status (D20 to D22).
- **A6. Enrichment and reach.** Captions, transcripts, project-folder files with no row, and a `similar_to` argument that finds items near a given one.

## Risks

- **R1. A second process writes to SQLite.** The main database sets a `busy_timeout` and the vector store database sets none (F7). Keep indexer transactions short, one item at a time, and set the timeout on the vector store.
- **R2. A full scan per query on sqlite-vec.** Measure query time at several corpus sizes before choosing a dimension. The project partition (D9), a smaller dimension and quantized vectors are the available reductions.
- **R3. Hosted embedding sends content to a provider and costs money.** The setup card says so, the spend limit bounds it, and excluded projects are never sent.
- **R4. A model change re-embeds the whole library.** The rebuild is resumable and answers from the old space until it finishes (D11). The settings screen states the size of the job before it starts.
- **R5. The packaged desktop backend.** The indexer role adds a start mode and an in-memory model to the bundle. Run `npm run backend:smoke` and measure memory with the model loaded.
- **R6. Missed change signals.** Raw Drizzle updates and folder edits made while a project is closed produce no event (F10). The reconcile sweep is the correctness mechanism, and events only shorten the delay.
- **R7. Tokenization of languages without spaces.** The default FTS5 and `tsvector` tokenizers split on whitespace and punctuation. A trigram tokenizer is the fallback, and the semantic layer covers part of the gap. The eval set needs non-English queries.
- **R8. Files that cannot be extracted.** Encrypted, scanned or very large files end in `failed` or `skipped` with a reason shown in status. They stay findable by name and metadata.
- **R9. Indexed text reaching an agent.** A document can contain instructions. Snippets and passages are wrapped as untrusted data (D18).

## Open questions

- **Q1. Which local model is the default?** The candidates are the embedding models already recommended in [`recommended-models.ts`](../../packages/transformers-js-nodes/src/recommended-models.ts). Recommendation: decide in A4 by the retrieval eval and the R2 measurement, and include a multilingual candidate.
- **Q2. Who pays for embeddings in the cloud?** Recommendation: one deployment-level model on the operator's key, metered through the prediction ledger, with no per-account choice.
- **Q3. Do chat threads and memories belong in the index?** Recommendation: not in A1 to A5. The item model accepts new kinds later, and `memory_search` stays as it is.
- **Q4. Should assets get tags that people and agents can edit?** Recommendation: yes, as a `tags` array in asset metadata written through `update_asset`, added in A1 because the filter is cheap once the field exists.
- **Q5. Which vector provider does production use?** A4 needs the answer. The Supabase provider supports equality filters, and Pinecone is a stub.
- **Q6. Should the `vector.*` nodes and the collections CLI be fixed here (F6)?** Recommendation: no. They are defects in authored collections and deserve their own change.
