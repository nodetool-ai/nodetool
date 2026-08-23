# Nodes the Code Node Should Cover

An audit of the hand-written node catalog against `nodetool.code.Code`, the
sandboxed QuickJS JavaScript node. It asks: **which node classes exist only
because there was no way to write three lines of JavaScript, and which of those
already have a snippet standing in for them?**

**Status:** `nodetool.list` (`Range`, `Tile`, `RepeatEach`, `RepeatValue`),
`lib.datetime` (all 5), and `lib.validate` (all 5) have been removed — their
Tier 1/Tier 2 entries below are historical. `lib.rss` (`FetchRSSFeed`,
`ExtractFeedMetadata`) and the 27 `nodetool.data.*` dataframe verbs were also
removed, on the same rationale but outside this audit's original scope: the
sandbox's `@nodetool-ai/sandbox-xml` and `@nodetool-ai/sandbox-csv` packs
(papaparse) now cover that ground directly.

Nothing here proposes taking a capability away from the user. The palette entry
stays. What changes is what is behind it — a TypeScript class with a metadata
entry, a test, and a registry row, or a Code node with the equivalent JS
prefilled.

## The mechanism already exists

Snippets are already virtual nodes. `web/src/config/codeSnippets.ts` holds 183
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
hits in the backend catalog today. The snippets are where they went.

So this document is not proposing an approach. It measures how far the existing
one has left to run.

## Status

Tier 2 is authored: **70 snippets across seven new categories** — Files, Path,
SVG, HTTP, Markdown, HTML, Validation — bringing `codeSnippets.ts` from 112 to
182. Every one was executed in the real QuickJS sandbox before landing
(`scripts/verify-snippets.mts`); the SVG set was additionally diffed
byte-for-byte against `process()` on the real node classes.

Authoring them turned up three things the paper audit had wrong. They are
folded into the tiers below, and the short version is:

- **`lib.http` and `lib.graphql` cannot be removed.** The snippets are an
  addition, not a replacement. See Tier 2.
- **Three `lib.os` path nodes are only partly reproducible** — anything needing
  a working directory or filesystem access.
- **A comment in `codeSnippets.ts` recorded the opposite decision** for HTML
  and validation, on a premise that has since expired. See below.

### The rationale that expired

The bottom of `codeSnippets.ts` carried this:

> Date & Time, HTML parsing, and validation snippets have been removed — the
> corresponding work is done by dedicated nodes (`lib.datetime.*`, `lib.html.*`,
> `lib.validate.*`) so the JS sandbox can stay library-free.

Two problems. It was already **wrong about Date & Time** — that category never
went away; seven snippets sit in the file above the comment. And its stated
reason no longer holds: `d8c5d2c` added the cheerio (`data.selectHtml`) and
papaparse (`data.parseCsv`) bridges, so HTML parsing is now a first-class
sandbox capability rather than a library the guest would have to carry.
Validation never needed a library at all — `core-nodes` has zero dependencies
and hand-rolls its regexes.

The comment is replaced by the new sections. Flagging it because it was a
deliberate decision by someone, and this reverses it.

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
| `getSecret()`, `sleep()`, `progress()` | yes |
| `crypto.digest/hmac/randomUUID/getRandomValues` | yes |
| CSV, HTML, XML, XLSX, YAML, zip, dates, diffs | yes — `import` from the matching `@nodetool-ai/sandbox-*` pack, declared on the node |
| `format.number/date/relativeTime/list` (host `Intl` bridge) | yes |
| `toBase64/fromBase64/toHex/fromHex`, `assetToSandbox/sandboxToAsset` | yes |
| `Intl` directly in the guest | **no** — use `format.*` |
| `eval`, `Function` | **no** — deleted |
| native modules, ffmpeg | **no** |
| Streaming operators (fan-out, per-item emission) | **no** — kernel-level |

String, regex, date, math, path, JSON, CSV, HTML-selection, HTTP, hashing, and
workspace file work are all in reach. Anything needing `sharp`, `pdf-lib`,
`exceljs`, `compromise`, `tesseract`, `tfjs`, or an actor-model stream is not.

## Tier 1 — the snippet already exists, the node class is the duplicate

These are done except for the deletion. Each has a shipping snippet with
equivalent code; the node class is a second implementation of the same thing.

### `nodetool.text` — 33 of 50

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

The 13 that stay as classes: `Prompt` and `Template` (variable editors,
`{{var}}` substitution UI), `Concat` (dynamic-input card), `Collect` (streaming
fold), `Replace` (avoids QuickJS startup for frequent single-node calls),
`Embedding`, `AutomaticSpeechRecognition`,
`SaveText`, `SaveTextFile`, `LoadTextAssets`,
`LoadTextFolder` (asset system), `FilterString`, `FilterRegexString` (stream
operators). HTML-to-text conversion moved to the `@nodetool-ai/sandbox-html`
sandbox pack's `toText` export.

`CountTokens` was on that list and is not any more. It was kept because
js-tiktoken is a real library, which is the same reason cheerio and exceljs
were kept — and the answer for those turned out to be a host pack, not a node
class. `@nodetool-ai/sandbox-tokens` is that pack: one encoding's BPE ranks are
several megabytes, far past the 1 MB guest-bundle cap, so it runs on the host
behind `count` / `encode` / `decode`. A saved graph is rewritten to a Code node
importing it. `Join` went too — it was `list.join(sep)`.

### `nodetool.list` — removed (was 1 of 4)

`Range` had the **Range** snippet. `RepeatEach`, `RepeatValue`, and `Tile` did
not. All four node classes are now removed; the List category snippets stand
in for them.

### `lib.datetime` — removed (was 4 of 5)

`Now` → Today / Now, `Add` → Add Time, `Diff` → Date Difference, `Format` →
Format Date. `StartEnd` (start/end of day, week, month, year) had no snippet.
All five node classes are now removed.

**Tier 1 total: 39 node classes whose replacement already ships.** Removing them
is a deletion plus a graph migration, not new authoring.

## Tier 2 — coverable, but no snippet exists yet

Write the snippet first, then remove the class. Most of these want a new
category; none fit the ten that exist.

| Group | Nodes | Category |
| --- | --- | --- |
| `lib.os` path helpers — `AbsolutePath` `Basename` `Dirname` `FileExtension` `FileName` `FileNameMatch` `FilterFileNames` `GetDirectory` `GetPathInfo` `JoinPaths` `NormalizePath` `PathToString` `RelativePath` `SplitExtension` `SplitPath` | 15 → 12 snippets | **Path** (new). Three pairs are the same operation and merged. `AbsolutePath`, `RelativePath` and `GetPathInfo` are only partly reproducible — see below. |
| `lib.svg` element builders — `Circle` `ClipPath` `DropShadow` `Ellipse` `GaussianBlur` `Gradient` `Line` `Path` `Polygon` `Rect` `Text` `Transform` | 12 | **SVG** (new) |
| `lib.markdown` — all 6 extractors | 6 | **Markdown** (new) |
| `lib.html` — `BaseUrl` `ExtractAudio` `ExtractImages` `ExtractLinks` `ExtractMetadata` `ExtractVideos`, via `@nodetool-ai/sandbox-html` | 6 | **HTML** (new) |
| `lib.validate` — `Email` `IP` `URL` `String` `Sanitize` (removed) | 5 | **Validation** (new) |
| `nodetool.list` — `RepeatEach` `RepeatValue` `Tile` (removed) | 3 | List |
| `nodetool.constant.Date` `nodetool.constant.DateTime` — constructors with integer props, not value editors, unlike the rest of `nodetool.constant.*` | 2 | Date & Time |
| `lib.datetime.StartEnd` (removed) | 1 | Date & Time |
| `nodetool.text.HasLength` | 1 | Text |

**Tier 2 total: 51 nodes, 46 snippets.** Three `lib.os` pairs are the same
operation and merged into one snippet each.

### The HTTP exception — what the snippets do not carry over

`lib.http` (7) and `lib.graphql` (4) got a **HTTP** category of 12 snippets,
verified against live endpoints, and the nodes were removed with them (#4644,
`lib-http.ts` and `lib-graphql.ts` deleted). The snippets are not a like-for-like
replacement, and this is the one place the paper audit was wrong rather than
incomplete.

The sandbox `fetch` is deliberately not the host `fetch`. Guest code is
untrusted, so `assertFetchUrlAllowed` (`js-sandbox.ts`) blocks loopback,
link-local and private ranges, bodies are capped at `MAX_RESPONSE_BODY_SIZE`
(1 MB, appending `...[truncated]`), a run gets 20 fetch calls, and
`FETCH_TIMEOUT_MS` is 15 s. `lib-http.ts` was trusted host code: raw `fetch`, no
SSRF guard, no size or call limit, a 30 s timeout, and a hardcoded Chrome
`User-Agent`.

So a workflow pointing at `http://localhost:8000` or an internal `10.x` service
ran on the node and fails on a snippet; a `GetBytes` download over 1 MB
truncates silently. That is a behavioral regression, not a gap to close — the
guard is the point. `lib.secret.GetSecret` did stay a node, because its value is
the picker rather than the call.

Two loose ends worth a follow-up. `GetBytes` in the guest yields a real
`Uint8Array` but serializes as a numeric-keyed object at the node boundary, so
the Code node's bytes handle wants checking for a downstream type mismatch. And
GraphQL batching could not be proven end-to-end — no reachable public endpoint
accepts batched operations — which was also true of the removed
`lib.graphql.BatchQuery` itself.

### What the Path snippets could not reproduce

`AbsolutePath` and `RelativePath` need `process.cwd()`, and `~` expansion needs
`os.homedir()`; the guest has neither, so both snippets take a `const base`
knob instead. `GetPathInfo`'s `exists`/`is_file`/`is_dir`/`is_symlink` need
I/O, so its snippet returns only the pure path components — though
`workspace.stat` could supply those four for workspace-relative paths, which is
worth trying before deciding the node stays.

The glob→RegExp conversion mirrors `wildcardToRegExp` in `lib-os.ts` exactly,
including its quirks: `*` crosses `/`, and `[...]` classes are escaped rather
than honored.

### Why SVG came out clean

All 12 element nodes output the same `svg_element` type, so the single
`CATEGORY_TYPE` entry per category is exact rather than lossy — `"SVG":
"svg_element"` means the snippets connect straight into the surviving
`Document` / `SVGToImage` nodes, which take `list[svg_element]`. The snippets
emit the structured `{name, attributes, children, content}` object, not markup:
a raw string would still render, but would not connect, and `Transform` /
`ClipPath` need object input.

Two consequences to know about. Dynamic *inputs* get the same category type, so
`cx`, `radius` and `fill` are typed `svg_element` in the menu metadata and lose
their int/color affordance — cosmetic, since the Code node accepts anything at
runtime, but inherent to one-type-per-category. And the snippets deliberately
do not escape text: `elementToString` applies `escapeXmlText` at document time,
so escaping earlier would double-escape.

## Tier 3 — coverable, but blocked on a platform change

| Group | Nodes | Blocker |
| --- | --- | --- |
| `lib.os` file operations — `ReadTextFile` `WriteTextFile` `ReadBinaryFile` `WriteBinaryFile` `ListFiles` `FileExists` `CreateDirectory` `GetFileSize` `IsFile` `IsDirectory` `AccessedTime` `CreatedTime` `ModifiedTime` `WorkspaceDirectory` `CopyFile` `MoveFile` | 16 | `workspace` covers read, write, list, `stat`, `mkdir`, `remove`, and the JSON category already ships Read File / Write File / List Files. Missing: **`workspace.copy` and `workspace.move`** — two bridge functions. |

`ShowNotification` and `OpenWorkspaceDirectory` stay — both are UI feedback by
definition.

`nodetool.data` transforms — `AddColumn` `Aggregate` `Append` `DropDuplicates`
`DropNA` `ExtractColumn` `FillNA` `Filter` `FilterNone` `FindRow` `FromList`
`ImportCSV` `JSONToDataframe` `Join` `LoadCSVFile` `LoadCSVURL` `Merge` `Pivot`
`Rename` `SaveCSVDataframeFile` `SaveDataframe` `Schema` `SelectColumn` `Slice`
`SortByColumn` `ToList` — 27 nodes — were removed outright rather than waiting
on per-snippet output typing (the blocker this document originally raised for
the `dataframe` table view): the `@nodetool-ai/sandbox-csv` (papaparse) pack
now covers this ground from inside a Code node. `ForEachRow` and
`LoadCSVAssets` stay, as stream operator and asset picker respectively.

## Keep as node classes

| Group | Reason |
| --- | --- |
| `nodetool.constant.*` (except `Date`/`DateTime`), `nodetool.input.*`, `nodetool.output.*` | value editors, dropzones, pickers — pure UI |
| `nodetool.control.*` (22) | actor-model stream semantics: fan-out, per-item emission, back-pressure. The sandbox runs once and returns once. The five Streaming snippets cover the generator patterns one node can express; the rest is kernel-level. |
| `nodetool.image.*` `nodetool.audio.*` `nodetool.video.*` `nodetool.model3d.*` `lib.image.*` `lib.audio.*` `lib.grid.*` `nodetool.sketch/timeline/script` | content cards and bespoke editors; sharp/canvas/ffmpeg |
| `lib.nlp.*` (7) | compromise, AFINN, stemmers, TF-IDF — real libraries |
| `lib.pdf` `lib.charts` | PDF text extraction and page rasterization, and a chart renderer |
| `lib.mail` `lib.apple` `messaging.*` | IMAP/SMTP, AppleScript, and long-lived bot connections — none of them a `fetch` call |
| `lib.google` | **Removed.** Drive, Gmail, Docs, Sheets and Calendar are the `google` capability module: `import { drive_search } from "@nodetool-ai/sandbox-nodetool/google"`. The OAuth session stays host-side — the guest never holds the token. |
| `lib.s3` `lib.supabase` `lib.notion` `lib.twilio` `messaging.*.SendMessage` `lib.mail.SendEmail` | **Removed.** Each was one authenticated HTTP call, so each is a Code node now: `fetch`, `nodetool.secrets.get(name)`, and the auth-helper packs (`@nodetool-ai/sandbox-aws` for SigV4, `-notion`, `-supabase`, `-twilio`). `lib.mail.SendEmail` went with them and has no guest path — SMTP is not HTTP; a script sends mail through an HTTP email API. |
| `apify.*` `search.*` | **Removed.** Apify and SerpAPI are capability modules: `@nodetool-ai/sandbox-nodetool/apify` and `.../serpapi`. The token stays host-side — the guest never holds it. |
| `lib.docx` `lib.epub` `lib.pptx` `lib.convert` | **Removed.** Reading and building these formats is what the `-docx`, `-mammoth`, `-epub` and `-pptx` packs offer a script. |
| `lib.browser` `lib.sqlite` | CDP, and the database path a script needs |
| all provider/model namespaces | model pickers, streamed output, cost tracking |

## Totals

| Tier | Nodes | State |
| --- | --- | --- |
| 1 | 39 | Snippet ships today. Left: delete the class, migrate saved graphs. |
| 2 | 51 | **Snippets authored** (46, six new categories). Left: delete the class, migrate saved graphs. |
| HTTP | 11 | **Snippets authored** (12). The nodes stay — the sandbox's SSRF guard, 1 MB body cap and 15 s timeout are not gaps to close. |
| 3 | 36 | Blocked: `workspace.copy`/`move` (16), per-snippet output typing (20). |

137 of the 733 hand-written node classes are functions wearing a card. 11 more
are worth a snippet without losing the node.

## Suggested order

The six new categories are authored, so what remains is deletion and migration.

1. **Tier 1 deletions** (39). No new snippets needed — the win is dropping the
   duplicate implementation, and `nodetool.text` is the namespace users hit
   first.
2. **`lib.svg` deletion** (12). The cleanest of the new categories: one output
   type, byte-identical markup, and the two rendering nodes stay.
3. **Tier 2 deletions** (39 more) — Path, Markdown, HTML, Validation and the
   singles, once each has a graph migration.
4. **`workspace.copy`/`workspace.move`, then `lib.os` file ops** (16). Two
   bridge functions unlock the rest of the namespace.
5. **Per-snippet output typing, then `nodetool.data`** (20). The one that needs
   design, not just authoring.

`lib.http`, `lib.graphql` and `lib.secret.GetSecret` are deliberately absent
from this list — their snippets shipped, their nodes stay.

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

- `web/src/config/codeSnippets.ts` — the 183 snippets, and where new ones go.
- `scripts/verify-snippets.mts` — runs snippet code through the real sandbox.
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
