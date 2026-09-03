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
| Linked board + script → timeline | `buildLinkedTimeline` (`@nodetool-ai/timeline`) — shot-aligned picture, one voiceover clip per line, no narration draft clip |
| Agent chat in every editor | `ChatView` + per-document agent panels and bridges |
| Persistence | tRPC `storyboards` / `scripts` / `timeline` routers, autosave hooks |
| Cost data | prediction ledger (`nodetool_predictions`) via `costs.dashboard` |
| Headless QA | `nodetool timeline validate`, `storyboard`/`script` render tools, the tool-loop evals, and the `script-storyboard-link` harness selfcheck (`packages/cli/src/harness/registry.ts`) the gate runs on diffs touching either surface |

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

## Credits and plans

Server-owned, in `packages/models/src/credits.ts` (`@nodetool-ai/models`):

- **1 credit = $0.01 of provider spend.** Spend is never double-booked: the
  balance is `sum(grant ledger) - ceil(prediction spend / 1¢)`, read straight
  from the `nodetool_predictions` rows every provider call already writes.
- **Ledger** (`nodetool_credit_ledger`) holds grants only: the welcome grant,
  monthly plan accruals, top-ups, adjustments. Grants are keyed so the lazy
  accrual (run on every status read) is idempotent by primary key — no cron:
  `signup:<userId>` once ever, `plan:<userId>:<planId>:<YYYY-MM>` per month.
- **New users get free credits.** The first balance read for a user inserts
  `NODETOOL_SIGNUP_CREDITS` (default 500) as a welcome grant, on top of the
  free plan's monthly accrual. Raising the amount later reaches users who have
  not signed up yet; it never re-grants one who already has the row. `0`
  switches the welcome grant off.
- **Plans** (`nodetool_user_subscriptions`, catalog `CREDIT_PLANS`): Free
  300/mo, Creator 3,000/mo ($12), Pro 10,000/mo ($40). Switching is instant
  and unbilled; a payment provider integration replaces the `topup` mutation
  with a checkout session and writes ledger rows from its webhook.
- **API**: `trpc.credits.status | setPlan | topup`
  (`packages/websocket/src/trpc/routers/credits.ts`, schemas in
  `packages/protocol/src/api-schemas/credits.ts`).
- **The `nodetool` provider is what gets metered.** NodeTool's own managed
  models are a real provider (`packages/runtime/src/providers/nodetool-provider.ts`,
  id `nodetool`): each curated model (`NODETOOL_MODELS` in
  `@nodetool-ai/protocol`) names a delegate provider+model, and the provider
  runs the delegate on *platform-owned* keys (`NODETOOL_PLATFORM_FAL_KEY`,
  `NODETOOL_PLATFORM_ANTHROPIC_KEY`) rather than the user's. Cost is absorbed
  from the delegate at the delegate's price, and
  `@nodetool-ai/model-pricing` translates `nodetool/...` ids to the delegate
  before lookup so estimates are real numbers. Models appear in the pickers
  only when their platform key is set.
- **The operator picks which models the platform sells.**
  `NODETOOL_CREDIT_MODELS` is a comma/whitespace-separated list of curated
  model ids (`nodetool/flux-schnell nodetool/kokoro`); unset means the whole
  catalog, which is what a local install wants. A model outside the list is
  hidden by the provider's listers, refused by `delegateFor` before a platform
  key is used, and refused by the gate before a run starts
  (`MODEL_NOT_AVAILABLE`, not `BUDGET_EXCEEDED` — a full balance does not
  change the answer). Parsing is `packages/config/src/credit-policy.ts`; the
  surviving ids reach clients as `spendableModels` on `credits.status`, and
  Studio's dropdowns show only those. `nodetool/director` drives the in-editor
  assistants and is not user-selectable, so a whitelist that leaves it out
  turns them off — name it alongside the models you sell.
- **Enforcement follows the provider, not the deployment**
  (`packages/websocket/src/credit-gate.ts`): a workflow run is gated only on
  the slice of its estimate whose provider is `nodetool`
  (`estimateNodetoolSpend` → `admitCreditRun`, next to the
  application-budget gate); the direct `generate_media`/`generate_text`/
  `transcribe_audio` RPCs are gated only when called with
  `provider: "nodetool"`. BYOK
  providers are never gated — credits and bring-your-own-key coexist on one
  server, per user, per call. The gate fails open on its own errors.
- **UI**: the header chip reads `credits.status` and links to
  `/studio/account` — balance, usage, plan cards, and the (clearly labeled)
  test top-up.

Still open, in order of value:

1. **Per-action estimates.** `@nodetool-ai/model-pricing`
   (`getModelUnitPrice`) prices the curated models per unit, so shot cards
   and the voice-all button can show "≈ 3 credits" before the click.
2. **Payments.** Stripe (or similar) in front of `setPlan`/`topup`; the
   ledger and gate don't change — a webhook writes `topup` rows and flips
   `plan_id`, and the balance is read the same way.
3. **Direct-RPC metering.** Done: `generate_media`, `generate_text` and
   `transcribe_audio` each write a prediction row on the managed provider
   (`direct.<mode>`, `direct.text`/`direct.structured`, `direct.transcription`),
   so their spend decrements the balance the gate reads.

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
