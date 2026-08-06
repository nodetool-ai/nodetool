# Studio: the agentic-video carve-out

A niche product on the NodeTool platform: agentic video creation and editing
for absolute beginners. One shell, two creation paths (storyboard and script),
one finishing surface (the timeline editor), a curated model list, and a
credits display instead of provider pricing. Everything below the shell is
reused NodeTool.

> Status: prototype. The shell ships inside the main web app at `/studio`;
> carving it into a standalone deployable is a later step (see
> "From prototype to product").

## What the user sees

- **`/studio`** — home. Two cards: *Start with a storyboard* (describe an
  idea; the director agent breaks it into shots, renders stills, animates
  clips) and *Start with a script* (write or generate lines, cast voices,
  voice them). Below: recent projects across all three document types. The
  header always shows the credit balance.
- **`/studio/storyboard/:id`** — the storyboard editor (board + agent panel +
  generation queue) without the workspace sidebar or tabs. *Assemble*
  navigates to the Studio timeline page.
- **`/studio/script/:id`** — the script editor (document pane + cast /
  assistant dock). *Create video* in the header assembles the voiced takes
  into a timeline and navigates there.
- **`/studio/timeline/:id`** — the full timeline editor, the one finishing
  surface. Preview, tracks, inspector, agent panel and export all come from
  the platform editor unchanged.

## What is reused (all of it)

| Product piece | Platform code |
|---|---|
| Storyboard editing + agent | `web/src/components/storyboard/*`, `ui_storyboard_*` tools, `StoryboardStore`, server sync |
| Script editing + voicing | `web/src/components/script/*`, `ui_script_*` tools, `ScriptStore`, server sync |
| Timeline editing | `web/src/components/timeline/TimelineEditor`, `ui_timeline_*` tools |
| Storyboard → timeline | `useAssembleTimeline` → `buildStoryboardTimeline` (`@nodetool-ai/timeline`) |
| Script → timeline | `useAssembleScriptTimeline` → `buildScriptTimeline` (`@nodetool-ai/timeline`) |
| Agent chat in every editor | `ChatView` + per-document agent panels and bridges |
| Persistence | tRPC `storyboards` / `scripts` / `timeline` routers, autosave hooks |
| Cost data | prediction ledger (`nodetool_predictions`) via `costs.dashboard` |
| Headless QA | `nodetool timeline validate`, `storyboard`/`script` render tools, the tool-loop evals |

The Studio module itself is five small files in `web/src/studio/` plus four
routes in `web/src/index.tsx`. Nothing under `web/src/components/` changed.

## Curated models

`web/src/studio/curatedModels.ts` is the entire model policy: one language
model (screenplay direction + assistants), one still model, one clip model.
New Studio storyboards get them stamped on before the first generation, so
beginners never meet a model picker; the platform pickers still exist inside
the reused editors for users who dig, and `validate_workflow`'s
provider/model check rejects any id the catalogs don't know.

Changing the lineup is editing that file. If the product later needs per-plan
lineups (e.g. faster models on the free tier), the same shape can move to a
server-delivered config.

## Credits

Prototype semantics, in `web/src/studio/useStudioCredits.ts`:

- 1 credit = $0.01 of provider spend.
- Balance = flat grant (1,000 credits) minus everything in the prediction
  ledger for the last 90 days, read from `costs.dashboard`.
- Display-only: the chip in the Studio header. Nothing is blocked
  client-side.

The path to real enforcement already exists in the platform and is the next
step after the prototype validates:

1. **Server gate.** The `application_budgets` machinery
   (`packages/models/src/application-budget.ts`, enforced in
   `unified-websocket-runner.ts` with `BUDGET_EXCEEDED`) already does
   estimate → reserve → settle per invocation. Generalize the key from
   `application_id` to a user-scoped budget row and every generation path —
   storyboard stills/clips, voicing, timeline generate — is gated by the same
   code.
2. **Purchases.** A `credits` tRPC router (alongside `costsRouter`) exposing
   balance + top-ups; grants become ledger rows instead of a client constant.
3. **Estimates before spend.** `@nodetool-ai/model-pricing`
   (`getModelUnitPrice`) prices the curated models per unit, so shot cards
   and the voice-all button can show "≈ 3 credits" before the click.

## From prototype to product

- **Standalone shell.** The Studio routes live in the main bundle today. To
  ship a separate product surface: a `studio.html` Vite entry (the
  `app-preview.html` pattern) with only the Studio routes, or keep one bundle
  and gate by hostname/runtime config. The second is cheaper and keeps one
  deploy pipeline (the GHCR image).
- **Access control.** A Studio-only auth mode hides `/workspace`, the node
  editor, and settings; the reused editors already work without them.
- **Curated voices.** Script casting still offers the full TTS catalog;
  curate it the same way the image/video models are curated.
- **Known prototype seams.**
  - The reused assemble hooks also open a workspace tab (harmless in Studio;
    the tab is simply there if the user ever visits `/workspace`).
  - Model stamping re-applies if a user clears all three storyboard models.
  - The storyboard/script pages are desktop-first; the workspace surfaces'
    mobile pane-switchers were not carried over.
