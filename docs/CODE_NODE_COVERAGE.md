# Nodes the Code Node Should Cover

An audit of the hand-written node catalog against `nodetool.code.Code`, the
sandboxed QuickJS JavaScript node. It asks: **which node classes exist only
because there was no way to write three lines of JavaScript, and which of those
already have a snippet standing in for them?**

Nothing here proposes taking a capability away from the user. The palette entry
stays. What changes is what is behind it — a TypeScript class with a metadata
entry, a test, and a registry row, or a Code node with the equivalent JS
prefilled.

## The mechanism already exists

Snippets are already virtual nodes. `web/src/config/codeSnippets.ts` holds 112
of them; `snippetMetadata.ts` turns each into a `NodeMetadata` under
`nodetool.<category>.<snippet_id>`, `useMetadata.ts` merges them into the
catalog the node menu reads, and `instantiatePaletteNode.ts` drops a Code node
with the snippet's code when one is placed. To the user it is a node: it is
searchable, it has a title, a description, tags, and inferred handles.

The file says what it is for:

> These replace the removed pure-JS wrapper nodes (boolean, math, text, list,
> dictionary, date, uuid, http, json) and add streaming patterns.

That already happened. `nodetool.math.*`, `nodetool.boolean.*`,
`nodetool.dictionary.*`, `nodetool.date.*`, and `nodetool.uuid.*` return **zero**
hits in the backend catalog today. The 112 snippets are where they went.

So this document is not proposing an approach. It measures how far the existing
one has left to run.

## The rule

**A node stays a node when it produces UI feedback or needs a capability the
sandbox lacks. It becomes a snippet when it is a pure function of its inputs
with a scalar, boolean, string, or plain-object output.**

UI feedback, concretely:

- a content card — image, video, audio, text, or 3D preview
  (`isContentCardNode`, `web/src/components/node_types/contentCardRegistry.ts`)
- a bespoke editing body — sketch, timeline, synth, code
- a value editor on a constant, or an asset/model/secret picker
- streamed progress, partial results, or per-item activity during a run

A node whose entire visible output is `true` or `"HELLO"` in a result overlay
has no UI feedback. It has a return value.

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

String, regex, date, math, path, JSON, CSV, HTML-selection, HTTP, hashing, and
workspace file work are all in reach. Anything needing `sharp`, `pdf-lib`,
`exceljs`, `compromise`, `tesseract`, `tfjs`, or an actor-model stream is not.

## Tier 1 — the snippet already exists, the node class is the duplicate

These are done except for the deletion. Each has a shipping snippet with
equivalent code; the node class is a second implementation of the same thing.

### `nodetool.text` — 34 of 50

| Node | Snippet |
| --- | --- |
| `ToUppercase` `ToLowercase` | Upper / Lower Case |
| `ToTitlecase` | Title Case |
| `CapitalizeText` | Capitalize |
| `TrimWhitespace` | Trim |
| `CollapseWhitespace` | Collapse Whitespace |
| `PadText` | Pad String |
| `TruncateText` | Truncate |
| `SurroundWith` | Surround / Wrap |
| `StripAccents` | Strip Accents |
| `RemovePunctuation` | Remove Punctuation |
| `Slugify` | Slugify |
| `Replace` | Replace |
| `Slice` `Extract` | Extract Substring |
| `Split` | Split |
| `Join` | Join Array |
| `IndexOf` | Index Of |
| `Length` | Measure Length |
| `Contains` | Contains |
| `StartsWith` | Starts With |
| `EndsWith` | Ends With |
| `IsEmpty` | Is Empty |
| `Equals` `Compare` | Compare Text (returns both ordering and `equal`) |
| `Chunk` | Chunk Text |
| `ToString` | To String |
| `ParseJSON` | Parse JSON |
| `ExtractJSON` | Extract JSONPath / Get JSON Path |
| `RegexMatch` | Regex Match |
| `RegexReplace` | Regex Replace |
| `RegexSplit` | Regex Split |
| `RegexValidate` | Regex Validate |
| `FindAllRegex` | Find All Matches |
| `ExtractRegex` | Extract Regex Groups |

`StripAccents` and `Slugify` look like the risky ones — they need
`normalize("NFKD")`, which QuickJS has. Confirmed by running it.

`HasLength` is the one text node in this class without a snippet; **Measure
Length** returns chars/words/lines and the comparison is one more expression.

The 15 that stay as classes: `Prompt` and `Template` (variable editors,
`{{var}}` substitution UI), `Concat` (dynamic-input card), `Collect` (streaming
fold), `Embedding`, `CountTokens` (js-tiktoken), `AutomaticSpeechRecognition`,
`HtmlToText` (html-to-text), `SaveText`, `SaveTextFile`, `LoadTextAssets`,
`LoadTextFolder` (asset system), `FilterString`, `FilterRegexString` (stream
operators).

### `nodetool.list` — 1 of 4

`Range` has the **Range** snippet. `RepeatEach`, `RepeatValue`, and `Tile` do
not, and belong in the List category beside it.

### `lib.datetime` — 4 of 5

`Now` → Today / Now, `Add` → Add Time, `Diff` → Date Difference, `Format` →
Format Date. `StartEnd` (start/end of day, week, month, year) has no snippet.

**Tier 1 total: 39 node classes whose replacement already ships.** Removing them
is a deletion plus a graph migration, not new authoring.

## Tier 2 — coverable, but no snippet exists yet

Write the snippet first, then remove the class. Most of these want a new
category; none fit the ten that exist.

| Group | Nodes | Category |
| --- | --- | --- |
| `lib.os` path helpers — `AbsolutePath` `Basename` `Dirname` `FileExtension` `FileName` `FileNameMatch` `FilterFileNames` `GetDirectory` `GetPathInfo` `JoinPaths` `NormalizePath` `PathToString` `RelativePath` `SplitExtension` `SplitPath` | 15 | **Path** (new) |
| `lib.svg` element builders — `Circle` `ClipPath` `DropShadow` `Ellipse` `GaussianBlur` `Gradient` `Line` `Path` `Polygon` `Rect` `Text` `Transform` | 12 | **SVG** (new) |
| `lib.http` — `GetText` `GetJSON` `GetBytes` `Post` `Put` `Patch` `Delete` | 7 | **HTTP** (new) |
| `lib.markdown` — all 6 extractors | 6 | **Markdown** (new) |
| `lib.html` — `BaseUrl` `ExtractAudio` `ExtractImages` `ExtractLinks` `ExtractMetadata` `ExtractVideos`, via `data.selectHtml` | 6 | **HTML** (new) |
| `lib.validate` — `Email` `IP` `URL` `String` `Sanitize` | 5 | **Validation** (new) |
| `lib.graphql` — `Query` `QueryWithAuth` `BatchQuery` `Introspection` | 4 | HTTP |
| `nodetool.list` — `RepeatEach` `RepeatValue` `Tile` | 3 | List |
| `nodetool.constant.Date` `nodetool.constant.DateTime` — constructors with integer props, not value editors, unlike the rest of `nodetool.constant.*` | 2 | Date & Time |
| `lib.datetime.StartEnd` | 1 | Date & Time |
| `nodetool.text.HasLength` | 1 | Text |
| `lib.secret.GetSecret` — `getSecret()` is in the sandbox; keep only if the node carries a secret *picker* | 1 | HTTP |

The HTTP category is the notable hole. The header comment in `codeSnippets.ts`
lists `http` among the wrappers it replaced, but there is **no snippet
containing `fetch(`** in the file, and `lib.http` and `lib.graphql` are still
real node classes. Whatever happened there, the replacement never landed.

`lib.svg` is the sharpest case in the catalog: twelve nodes each emit an element
string, and nothing renders until `Document` or `SVGToImage` — those two stay,
and they are where the preview is. A twelve-node graph produces markup a user
could type.

**Tier 2 total: 63 nodes, roughly 55 new snippets across six new categories.**

## Tier 3 — coverable, but blocked on a platform change

| Group | Nodes | Blocker |
| --- | --- | --- |
| `nodetool.data` transforms — `AddColumn` `Aggregate` `Append` `DropDuplicates` `DropNA` `ExtractColumn` `FillNA` `Filter` `FindRow` `FromList` `ImportCSV` `Join` `JSONToDataframe` `Merge` `Pivot` `Rename` `SelectColumn` `Slice` `SortByColumn` `ToList` | 20 | The `dataframe` type renders as a table. `snippetMetadata.ts` types every output of a snippet from one `CATEGORY_TYPE` entry, so a returned `{columns, data}` cannot declare itself a dataframe and keep the table view. Needs per-snippet output typing. |
| `lib.os` file operations — `ReadTextFile` `WriteTextFile` `ReadBinaryFile` `WriteBinaryFile` `ListFiles` `FileExists` `CreateDirectory` `GetFileSize` `IsFile` `IsDirectory` `AccessedTime` `CreatedTime` `ModifiedTime` `WorkspaceDirectory` `CopyFile` `MoveFile` | 16 | `workspace` covers read, write, list, `stat`, `mkdir`, `remove`, and the JSON category already ships Read File / Write File / List Files. Missing: **`workspace.copy` and `workspace.move`** — two bridge functions. |

`ShowNotification` and `OpenWorkspaceDirectory` stay — both are UI feedback by
definition.

Data nodes that stay regardless: `Describe` (content card), `ForEachRow` and
`FilterNone` (stream operators), `LoadCSVFile` `LoadCSVURL` `LoadCSVAssets`
`SaveDataframe` `SaveCSVDataframeFile` (asset pickers), `Schema`.

## Keep as node classes

| Group | Reason |
| --- | --- |
| `nodetool.constant.*` (except `Date`/`DateTime`), `nodetool.input.*`, `nodetool.output.*` | value editors, dropzones, pickers — pure UI |
| `nodetool.control.*` (22) | actor-model stream semantics: fan-out, per-item emission, back-pressure. The sandbox runs once and returns once. The five Streaming snippets cover the generator patterns one node can express; the rest is kernel-level. |
| `nodetool.image.*` `nodetool.audio.*` `nodetool.video.*` `nodetool.model3d.*` `lib.image.*` `lib.audio.*` `lib.grid.*` `nodetool.sketch/timeline/script` | content cards and bespoke editors; sharp/canvas/ffmpeg |
| `lib.nlp.*` (7) | compromise, AFINN, stemmers, TF-IDF — real libraries |
| `lib.pdf` `lib.docx` `lib.epub` `lib.pptx` `lib.excel` `lib.convert` `lib.ocr` `lib.charts` | native/binary document tooling |
| `lib.s3` `lib.supabase` `lib.notion` `lib.mail` `lib.twilio` `lib.google` `lib.apple` `apify.*` `search.*` `messaging.*` | credential pickers and non-trivial protocol handling; `fetch()` alone is not the same offer |
| `lib.rss` (2) | XML parsing, which the sandbox has no parser for |
| `lib.browser` `lib.sqlite` `lib.tensorflow` | CDP, better-sqlite3, tfjs |
| all provider/model namespaces | model pickers, streamed output, cost tracking |

## Totals

| Tier | Nodes | Work |
| --- | --- | --- |
| 1 | 39 | Delete the class, migrate saved graphs. The snippet ships today. |
| 2 | 63 | ~55 new snippets in six new categories, then delete. |
| 3 | 36 | `workspace.copy`/`move` (16) and per-snippet output typing (20), then delete. |

138 of the 733 hand-written node classes are functions wearing a card.

## Suggested order

1. **`lib.http` + `lib.graphql` → an HTTP category** (11). Closes the gap the
   header comment already claims is closed. `fetch()` plus `getSecret()`.
2. **Tier 1 deletions** (39). No new snippets needed — the win is dropping the
   duplicate implementation, and `nodetool.text` is the namespace users hit
   first.
3. **Path and SVG categories** (27). The two largest pure-string groups.
4. **`workspace.copy`/`workspace.move`, then `lib.os` file ops** (16). Two
   bridge functions unlock the rest of the namespace.
5. **Markdown, HTML, Validation** (17), plus the singles.
6. **Per-snippet output typing, then `nodetool.data`** (20). The one that needs
   design, not just authoring.

## What a removal needs alongside it

**Graph migration.** A saved workflow using `nodetool.text.Slugify` has to keep
running. Each removed class needs a rewrite to the equivalent Code node —
mechanical for Tier 1, because the snippet body *is* the replacement and the
node's properties map onto the Code node's dynamic inputs.

**Search parity.** A snippet is only a node if it is found like one.
`generateSnippetMetadata` writes the snippet's `tags` into the description the
node menu searches, so a removed node's name and keywords have to land in the
tags of the snippet replacing it. Otherwise searching "uppercase" stops working
and the change reads as a regression.

## Related

- `web/src/config/codeSnippets.ts` — the 112 snippets, and where new ones go.
- `web/src/config/snippetMetadata.ts` — snippet → `NodeMetadata`, and where
  per-snippet output typing would go.
- `web/src/utils/instantiatePaletteNode.ts` — snippet → Code node on the canvas.
- `packages/code-nodes/src/nodes/code-node.ts` — the node.
- `packages/agents/src/js-sandbox.ts` — the sandbox bridge, and the file to
  extend for Tier 3.
- [docs/plans/code-node-ai-authoring.md](plans/code-node-ai-authoring.md) — the
  other half: describing a result instead of picking a snippet.
- [CLOUD_NODE_CURATION.md](CLOUD_NODE_CURATION.md) — the cloud profile trims by
  namespace and admits the Code node by name.
