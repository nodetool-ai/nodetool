# Agent Resource Links in Chat — Concept

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-03

---

## 1. Summary

When the agent builds something — an asset, a storyboard, a script, a sketch,
a timeline, a mini app — the chat has no way to point at it. Tool results
carry ids inside JSON (that's fine, and stays as-is), but the agent's *prose*
can only describe the thing: "I've added three shots to the storyboard" with
nothing to click. Following progress means expanding tool cards and reading
JSON; giving feedback means describing the target in words.

The fix is a **resource URI** the agent can drop into ordinary markdown,
generalizing the `asset://` scheme the codebase already uses — the kind is
the scheme:

```
storyboard://sb_01hxyz
asset://as_01hab2
timeline://tl_01hqrs#clip=cl_9
```

The chat renders any such link as a compact inline **resource chip** — kind
icon, label, a thumbnail for assets — and clicking it opens the resource in
its editor tab or viewer. The agent learns the scheme from its system prompt
and from tool results, which gain one string field (`url`) carrying the
ready-made link. The same URIs work inbound: one pasted or inserted into the
composer tells the agent exactly which document — or which shot, clip, or
layer — the user means.

No new message types, no tool-result restructuring, no server changes beyond
a line in the system prompt.

## 2. Design goals

1. **Progress is legible in prose.** "Rendered the intro → `[intro v2]`" reads
   like a sentence, with the artifact one click away. The narrative stays the
   agent's; links decorate it.
2. **Feedback has a target, both directions.** The user clicks a chip to open
   the resource, or references it in a reply; the agent receives the same URI
   back and can act on precisely that document and sub-target.
3. **Tool results stay JSON.** No card layer derived from result shapes. The
   only result change is additive: a `url` string field so the agent can copy
   a correct link instead of composing one.
4. **One vocabulary.** URI kinds map 1:1 onto the existing `UiSurfaceType` /
   `UiDocumentRef` types and `WorkspaceTabsStore.openTab` — no parallel
   naming scheme.
5. **Degrades to text.** In any renderer that doesn't know the scheme (logs,
   CLI, eval transcripts, old clients), the link is still a legible
   `[label](timeline://…)` markdown link.

## 3. Current state (what the concept builds on)

- **`ChatMarkdown.tsx` already special-cases links.** Its `a` component
  override renders image hrefs as inline images and audio hrefs as players
  (`web/src/components/chat/message/ChatMarkdown.tsx:81-109`). A resource
  scheme is a third branch in the same switch.
- **An asset scheme already exists.** `asset://<id>` resolves to
  `/api/storage/<id>` via `resolveUri` (`web/src/utils/imageUtils.ts`), and
  backend media tools already return `asset_uri: "asset://…"` from
  `persistOutput`.
- **The document vocabulary exists.** `UiSurfaceType` / `UiDocumentRef` in
  `packages/protocol/src/api-types.ts` name every editor surface;
  `WorkspaceTabsStore.openTab({type, ref})` opens any of them — the pattern
  `ui_storyboard_assemble_timeline` already uses.
- **Sub-targets are addressable.** Every surface has selection tools
  (`ui_timeline_select_clip`, `ui_storyboard_select_shot`,
  `ui_sketch_select_layer`, …), so a link fragment can both *name* and
  *select* a sub-target on open.
- **Caveat:** react-markdown's default `urlTransform` strips unknown URL
  schemes for safety — resource links vanish unless their schemes are
  explicitly allowlisted in the `ReactMarkdown` props.

## 4. The URI scheme

```
<kind>://<id>[#<param>=<value>]

kind  := asset | workflow | timeline | storyboard | sketch | script
         | app | model3d | collection | thread
id    := the resource's database id
#…    := optional sub-target, kind-specific:
         #shot=<id>   (storyboard)   #clip=<id>|t=<seconds> (timeline)
         #layer=<id>  (sketch)       #scene=<n>             (script)
         #node=<id>   (workflow)     #component=<id>        (app)
```

Rules:

- `kind` values are the `UiSurfaceType` union plus `asset` and `collection`.
  Adding a kind means extending one union in `@nodetool-ai/protocol`.
- Parsing and formatting live in one module in protocol
  (`parseResourceUri` / `formatResourceUri`), shared by web, the eval
  bridges, and the CLI — no per-surface regex.
- `asset://` is simply the asset kind's scheme — existing tool results keep
  working unchanged. The legacy long form `nodetool://<kind>/<id>` still
  parses (links persisted by earlier builds), but nothing emits it; the
  `nodetool://` scheme is otherwise reserved by the mobile app's deep links.
- Unknown kind or malformed URI → rendered as plain text, never a broken
  chip.

## 5. Architecture

```
Agent emits markdown: "Added the opening shots — [Beach intro](storyboard://sb_x#shot=s3)"
       │
       ▼
ChatMarkdown `a` override
  href parses as resource URI? → <ResourceChip uri=… label=children/>
  else                         → today's <a> handling (image / audio / plain)
       │
       ▼
ResourceChip
  icon + label (+ thumbnail for assets, via resolveUri)
  click → openResource(uri):
    WorkspaceTabsStore.openTab({type: kind, ref: id})
    then apply sub-target via the surface's selection bridge
       │
       ▼  inbound
Composer: chip pasted/inserted → URI travels as plain text in the
user message; the agent parses it with the same module. Optionally the
client mirrors it into ui_context.referenced for the system prompt.
```

### 5.1 Where the agent gets the links

Two sources, both cheap:

1. **Tool results.** Every mutating tool's result gains one field:
   `url: "<kind>://<id>"` (sub-target variants where natural, e.g.
   `ui_storyboard_add_shot` → `…#shot=<newId>`). Backend media tools emit it
   from `persistOutput` next to the existing `asset_uri`. The JSON stays
   JSON — the model copies the string into its prose when it wants to link.
2. **System prompt.** `buildChatAgentSystemPrompt` gets a short section:
   the scheme, the rule ("when you create or change a resource, link it once
   in your reply with a human label"), and the anti-rule (don't link on every
   sentence; one link per resource per reply). The per-surface agent panels
   (timeline, storyboard, sketch) inherit the same section.

### 5.2 Rendering: `ResourceChip`

New component in `web/src/components/chat/message/`, built from
`ui_primitives`, small enough to sit inline in a sentence:

- **All kinds:** kind icon (reuse `getToolVisual`'s icon/accent map) +
  the link's own text as label. No lookup needed to render — the chip is
  useful even offline.
- **Assets:** a small inline thumbnail when the mime is imagey — resolved
  through the existing `resolveUri`; hover shows a larger preview. This
  covers "generated images should be visible in chat" without touching tool
  result rendering.
- **Optional enrichment:** a TanStack Query lookup (existing
  `useAssets`/document queries) can replace a stale label with the current
  name and mark deleted resources (struck-through chip, no navigation).
  Failure of the lookup never breaks the chip.
- Same treatment everywhere markdown renders: chat thread, memory
  sidebar, agent-panel chats — they all go through `ChatMarkdown`.

`urlTransform` is extended to pass resource-URI schemes through untouched; everything else keeps react-markdown's default sanitization.

### 5.3 Navigation: `openResource`

One helper (`web/src/lib/chat/openResource.ts`):

- `kind` → `openTab({type, ref: id})` for document kinds; assets open the
  asset viewer; `collection` opens the collections panel; `thread` switches
  chat threads.
- Sub-target application reuses the agent bridges' selection handlers after
  the tab mounts (`getTimelineAgentHandler(id).selectClip(...)` etc.). If the
  editor isn't mounted yet, the sub-target is applied on bridge registration
  — a one-shot pending-selection map, mirroring how `useAssembleTimeline`
  already sequences open-then-act.

### 5.4 Inbound: the user links back

- The composer accepts the same URIs: pasting one renders a chip in the
  input; an **"insert reference"** action on each rendered chip (and on the
  editor tabs' context menus, later) drops the URI into the composer.
- On send, the URI simply rides in the message text — the agent already
  reads text, and the system-prompt section teaches it to parse the scheme.
  Additionally the client appends the parsed refs to the existing
  `ui_context` (extend `UiContext` with `referenced?: UiDocumentRef[]`), so
  the server's `formatUiContext` can state it plainly in the system prompt.
- This makes "make **this** darker" precise: the message carries
  `storyboard://sb_x#shot=s3`, and the agent's first tool call can
  be `ui_storyboard_select_shot` on exactly that shot.

### 5.5 What this is not

- **Not a card system.** Tool results render as they do today. The chip is
  an inline text element, not a block; there is no coalescing, no preview
  pipeline, no per-kind summary machinery.
- **Not automatic navigation.** The agent linking a resource never opens or
  focuses it; clicking does.
- **Not a web URL.** The scheme is internal to the app. If shareable deep
  links are wanted later, the same `parseResourceUri` can back a
  `/#/resource/<kind>/<id>` route — out of scope here.

## 6. Server involvement

- One additive section in `buildChatAgentSystemPrompt`
  (`packages/websocket/src/unified-websocket-runner.ts`).
- `processToolResult` already passes string fields through — `url` survives
  as-is. Nothing to change.
- Persistence: URIs live inside ordinary message text. Old threads render
  chips retroactively wherever an agent happened to emit a URI; no
  migration.

## 7. Phasing

1. **Phase 1 — render + navigate.** `parseResourceUri` in protocol;
   `urlTransform` allowlist; `ResourceChip` (icon + label, asset
   thumbnails); `openResource` without sub-targets; system-prompt section.
   Agent-emitted links become clickable.
2. **Phase 2 — tools hand out links.** `url` field from `persistOutput` and
   the mutating `ui_*` tools (per-bridge helper, one line per return site);
   sub-target fragments + pending-selection on open.
3. **Phase 3 — inbound references.** Composer chips, insert-reference
   action, `UiContext.referenced`.
4. **Phase 4 (optional).** Label freshness via query lookup; deep-link
   route; links in memory summaries.

## 8. Testing

- Unit: `parseResourceUri`/`formatResourceUri` round-trip incl. malformed
  input (Vitest, in protocol); `ResourceChip` per kind and `ChatMarkdown`
  integration incl. the `urlTransform` allowlist (Jest + RTL, next to the
  existing markdown tests).
- Eval: the tool-loop suites can assert that mutating-tool results carry a
  well-formed `url`, and a prompt-adherence case can check the model links
  the resource it created (string match on the transcript — no browser).
- Navigation: a jsdom test that `openResource` calls `openTab` with the
  right `{type, ref}` per kind, and that a fragment queues a selection until
  the bridge registers.

## 9. Open questions

1. **Link discipline.** Is the system-prompt rule enough to keep models from
   over-linking, or do we cap chips rendered per message defensively?
2. **`thread` and `collection` kinds** are speculative — include in the
   union from day one, or start with the six editor surfaces plus `asset`?
3. **Sub-target selection on open** touches per-surface bridge code — worth
   Phase 2, or ship links that open the document only and add fragments when
   a surface asks for them?
