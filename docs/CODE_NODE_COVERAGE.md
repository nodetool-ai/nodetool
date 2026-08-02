# Nodes the Code Node Should Cover

An audit of the hand-written node catalog against `nodetool.code.Code`, the
sandboxed QuickJS JavaScript node. The question it answers: **which nodes exist
only because there was no way to write three lines of JavaScript?**

Those nodes cost more than they give. Each one is a class, a metadata entry, a
test, a search-index row, and a card the user has to find, read, and wire before
learning it does `text.toUpperCase()`. Ten of them in a row is a workflow that
would read better as one Code node.

The nodes that earn their card do something the canvas can *show*: a preview, an
editor, a picker, a progress stream. That is the line this document draws.

## The rule

**Keep a node when it produces UI feedback or uses a capability the sandbox does
not have. Retire it when it is a pure function of its inputs with a scalar,
boolean, string, or plain-object output.**

UI feedback, concretely, is any of:

- a content card — image, video, audio, text, or 3D preview
  (`isContentCardNode`, `web/src/components/node_types/contentCardRegistry.ts`)
- a bespoke editing body — sketch, timeline, synth, code
- a value editor on a constant, or an asset/model/secret picker
- streamed progress, partial results, or per-item activity during a run

A node whose entire visible output is `true` or `"HELLO"` in a result overlay has
no UI feedback. It has a return value.

## What the sandbox can actually do

Verified against `packages/agents/src/js-sandbox.ts` by running code in it:

| Capability | Available |
| --- | --- |
| ES2023 syntax, `String.normalize("NFKD")`, `/\p{L}/u` regex, `localeCompare` | yes |
| `Date`, ISO parse/format | yes |
| `fetch()` (host-mediated, rate-limited) | yes |
| `workspace.read/write/readBytes/writeBytes/list/stat/mkdir/remove` | yes |
| `getSecret()`, `uuid()`, `sleep()`, `progress()` | yes |
| `crypto.digest/hmac/randomUUID/getRandomValues` | yes |
| `data.parseCsv` (papaparse), `data.selectHtml` (cheerio) | yes |
| `format.number/date/relativeTime/list` (host `Intl` bridge) | yes |
| `toBase64/fromBase64/toHex/fromHex`, `assetToSandbox/sandboxToAsset` | yes |
| `Intl` directly in the guest | **no** — use `format.*` |
| `eval`, `Function` | **no** — deleted |
| npm packages, native modules, canvas, ffmpeg | **no** |
| Streaming operators (fan-out, per-item emission) | **no** — kernel-level |

So: string, regex, date, math, path, JSON, CSV, HTML-selection, HTTP, hashing,
and workspace file work are all in reach. Anything that needs `sharp`, `pdf-lib`,
`exceljs`, `compromise`, `tesseract`, `tfjs`, or an actor-model stream is not.

## Tier A — retire, fully covered (99 nodes)

Pure functions with no preview, no editor, no library. Each is one Code-node
expression.

### `nodetool.text` — 35 of 50

`ToUppercase` `ToLowercase` `ToTitlecase` `CapitalizeText` `TrimWhitespace`
`CollapseWhitespace` `PadText` `TruncateText` `SurroundWith` `StripAccents`
`RemovePunctuation` `Slugify` `Replace` `Slice` `Extract` `Split` `Join`
`IndexOf` `Length` `Contains` `StartsWith` `EndsWith` `IsEmpty` `HasLength`
`Equals` `Compare` `RegexMatch` `RegexReplace` `RegexSplit` `RegexValidate`
`FindAllRegex` `ExtractRegex` `ParseJSON` `ToString` `Chunk`

`StripAccents` and `Slugify` look like the risky ones — they need
`normalize("NFKD")`, which QuickJS has. Confirmed.

The 15 that stay: `Prompt` and `Template` (variable editors, `{{var}}`
substitution UI), `Concat` (dynamic-input card), `Collect` (streaming fold),
`Embedding`, `CountTokens` (js-tiktoken), `AutomaticSpeechRecognition`,
`HtmlToText` (html-to-text), `ExtractJSON` (see Tier B), `SaveText`,
`SaveTextFile`, `LoadTextAssets`, `LoadTextFolder` (asset system),
`FilterString`, `FilterRegexString` (stream operators).

### `nodetool.list` — all 4

`Range` `RepeatEach` `RepeatValue` `Tile`

`Array.from({length: n}, ...)` and `flatMap` cover the set.

### `lib.validate` — all 5

`Email` `IP` `URL` `String` `Sanitize`

Hand-rolled regex today (`core-nodes` has no dependencies at all), so there is
nothing to lose in the move.

### `lib.markdown` — all 6

`ExtractBulletLists` `ExtractCodeBlocks` `ExtractHeaders` `ExtractLinks`
`ExtractNumberedLists` `ExtractTables`

Regex over a string, returning arrays.

### `lib.datetime` — all 5

`Add` `Diff` `Format` `Now` `StartEnd`

Also dependency-free hand-rolled arithmetic. `Format`'s token syntax is a
reimplementation of what `format.date` already bridges to host `Intl`.

### `lib.html` — 6 of 8

`BaseUrl` `ExtractAudio` `ExtractImages` `ExtractLinks` `ExtractMetadata`
`ExtractVideos`

`data.selectHtml` is cheerio, the same engine. `HTMLToText` and
`WebsiteContentExtractor` stay — they need html-to-text and Readability.

### `lib.http` — all 7

`GetText` `GetJSON` `GetBytes` `Post` `Put` `Patch` `Delete`

Thin wrappers over a request. `fetch()` is in the sandbox and is the thing users
already know.

### `lib.os` path helpers — 15 of 33

`AbsolutePath` `Basename` `Dirname` `FileExtension` `FileName` `FileNameMatch`
`FilterFileNames` `GetDirectory` `GetPathInfo` `JoinPaths` `NormalizePath`
`PathToString` `RelativePath` `SplitExtension` `SplitPath`

String surgery on a path. Fifteen cards for what is `split("/")` and `pop()`.

### `lib.svg` primitives — 12 of 14

`Circle` `ClipPath` `DropShadow` `Ellipse` `GaussianBlur` `Gradient` `Line`
`Path` `Polygon` `Rect` `Text` `Transform`

Each emits an SVG element string. Nothing renders until `Document` or
`SVGToImage` — those two stay, and they are where the preview lives. Building a
twelve-node graph to produce markup a user could type is the clearest case in
the catalog.

### `lib.graphql` — all 4

`Query` `QueryWithAuth` `BatchQuery` `Introspection`

A POST with `{query, variables}`. `fetch()` plus `getSecret()`.

## Tier B — retire once one gap closes (40 nodes)

Covered in principle; each needs a decision or a small sandbox addition first.

### `nodetool.data` transforms — 20 of 29

`AddColumn` `Aggregate` `Append` `DropDuplicates` `DropNA` `ExtractColumn`
`FillNA` `Filter` `FindRow` `FromList` `ImportCSV` `Join` `JSONToDataframe`
`Merge` `Pivot` `Rename` `SelectColumn` `Slice` `SortByColumn` `ToList`

All are array-of-objects manipulation, and `data.parseCsv` already handles
`ImportCSV`. **The gap is typing, not capability**: the `dataframe` type renders
as a table, and the Code node's dynamic outputs would need to declare that type
for a returned `{columns, data}` to keep its table view. Close that and the
twenty go.

Staying regardless: `Describe` (content card), `ForEachRow` (stream operator),
`LoadCSVFile` `LoadCSVURL` `LoadCSVAssets` `SaveDataframe`
`SaveCSVDataframeFile` (asset pickers), `Schema`, `FilterNone` (stream).

### `lib.os` file operations — 16 of 33

`ReadTextFile` `WriteTextFile` `ReadBinaryFile` `WriteBinaryFile` `ListFiles`
`FileExists` `CreateDirectory` `GetFileSize` `IsFile` `IsDirectory`
`AccessedTime` `CreatedTime` `ModifiedTime` `WorkspaceDirectory` `CopyFile`
`MoveFile`

The `workspace` bridge covers reads, writes, listing, `stat`, `mkdir`, and
`remove` — so most of these are already expressible. **Missing:
`workspace.copy` and `workspace.move`.** Two bridge functions retire sixteen
nodes. `ShowNotification` and `OpenWorkspaceDirectory` stay — both are UI
feedback by definition.

### Singles

- `nodetool.text.ExtractJSON` — JSONPath has no sandbox equivalent, but plain
  property access and `filter` are what most users want anyway. Retire and
  document the idiom, or keep if JSONPath expressions are load-bearing in
  shipped examples.
- `lib.secret.GetSecret` — `getSecret()` is in the sandbox. The node's value is
  the secret *picker*; if it has one, keep it, otherwise retire.
- `nodetool.constant.Date`, `nodetool.constant.DateTime` — these are
  constructors with integer props, not value editors. Unlike the rest of
  `nodetool.constant.*`, nothing about them is a widget.

## Tier C — keep

Not because they are large, but because each has a reason:

| Group | Reason |
| --- | --- |
| `nodetool.constant.*` (except `Date`/`DateTime`), `nodetool.input.*`, `nodetool.output.*` | value editors, dropzones, pickers — pure UI |
| `nodetool.control.*` (22) | actor-model stream semantics: fan-out, per-item emission, back-pressure. The sandbox runs once and returns once. |
| `nodetool.image.*`, `nodetool.audio.*`, `nodetool.video.*`, `nodetool.model3d.*`, `lib.image.*`, `lib.audio.*`, `lib.grid.*`, `nodetool.sketch/timeline/script` | content cards and bespoke editors; sharp/canvas/ffmpeg |
| `lib.nlp.*` (7) | compromise, AFINN, stemmers, TF-IDF — real libraries |
| `lib.pdf` `lib.docx` `lib.epub` `lib.pptx` `lib.excel` `lib.convert` `lib.ocr` `lib.charts` | native/binary document tooling |
| `lib.s3` `lib.supabase` `lib.notion` `lib.mail` `lib.twilio` `lib.google` `lib.apple` `apify.*` `search.*` `messaging.*` | credential pickers and non-trivial protocol handling; `fetch()` alone is not the same offer |
| `lib.rss` (2) | XML parsing, which the sandbox has no parser for |
| `lib.browser` `lib.sqlite` `lib.tensorflow` | CDP, better-sqlite3, tfjs |
| all provider/model namespaces | model pickers, streamed output, cost tracking |

## Totals

| Tier | Nodes | Verdict |
| --- | --- | --- |
| A | 99 | Retire — Code node covers them today |
| B | 40 | Retire after one sandbox or typing change |
| C | rest | Keep |

139 of the 733 hand-written node classes are functions wearing a card.

## Suggested order

1. **`lib.svg` primitives and `lib.http`** (19). The most obviously redundant,
   and neither has downstream typing questions.
2. **`nodetool.text` Tier A** (35). The biggest single win, and the namespace
   users hit first.
3. **`workspace.copy`/`workspace.move`, then `lib.os`** (31). One small bridge
   change unlocks the whole namespace.
4. **Dataframe output typing on the Code node, then `nodetool.data`** (20). The
   one that needs design, not just deletion.
5. **The remainder** — `lib.validate`, `lib.markdown`, `lib.datetime`,
   `lib.html`, `lib.graphql`, `nodetool.list`, singles (34).

## Two things worth doing alongside

**Migration, not just removal.** A saved workflow using `nodetool.text.Slugify`
must not break. Each retired node needs a graph-level rewrite to an equivalent
Code node, the way `nodetool validate` already knows every node type — the
mapping is mechanical for Tier A because each node is one expression.

**Discoverability.** Deleting `ToUppercase` only helps if a user searching
"uppercase" lands on the Code node with a filled-in snippet. Keyword aliases
from retired types to Code-node templates should ship in the same change, or
the removal reads as a regression.

## Related

- [CLOUD_NODE_CURATION.md](CLOUD_NODE_CURATION.md) — the cloud profile already
  trims by namespace and admits the Code node by name. This audit is the same
  argument applied to the OSS catalog.
- `packages/code-nodes/src/nodes/code-node.ts` — the node.
- `packages/agents/src/js-sandbox.ts` — the sandbox bridge, and the file to
  extend for Tier B.
