# @nodetool-ai/model-pricing

Unit price for a model chosen on a generic node's provider-model property (e.g.
`model` on `nodetool.image.TextToImage`). The editor's cost preview and the
server-side pre-run budget estimate both call `getModelUnitPrice`, so a run is
gated on the same number the editor shows.

```ts
import { getModelUnitPrice } from "@nodetool-ai/model-pricing";

getModelUnitPrice({ id: "fal-ai/flux/schnell", provider: "fal_ai" });
// { unit_price: 0.003, billing_unit: "images", currency: "USD", source: "bundle" }
```

## Where the prices come from

Looked up in order, first hit wins:

1. **FAL** — `@nodetool-ai/fal-nodes/unit-pricing-catalog`, keyed by `endpoint_id`.
2. **kie** — `@nodetool-ai/kie-nodes/unit-pricing-catalog`, keyed by `model_id`,
   using the USD conversion (a raw credit figure has no fixed USD value).
3. **GenSpend** — `src/generated/genspend-pricing.json`, keyed
   `<provider_id>:<model_id>`.

FAL and kie come from the providers themselves, so they stay ahead of GenSpend.
GenSpend covers every other provider NodeTool can run and GenSpend tracks —
Replicate, AtlasCloud, Together, Gemini, OpenAI, MiniMax, ElevenLabs, xAI — plus
any FAL or kie model their own catalogs predate.

All three are imported as modules, not read off disk, so the estimate works
identically in the browser bundle and inside the packaged Electron backend (no
`PACKAGE_RUNTIME_ASSETS` entry needed).

## The GenSpend catalog

[GenSpend](https://genspend.io) tracks what image/video/audio models cost across
the providers that sell them, at `GET /api/v1/models` — public, read-only,
synced from providers every ~6 h or hand-verified weekly.

`scripts/sync-genspend-pricing.mjs` normalizes that catalog into the shipped
JSON:

```bash
npm run build:packages         # the sync reads the built providers
npm run sync:genspend          # rewrite the catalog
npm run sync:genspend:check    # exit 1 if it is stale
```

The `GenSpend Pricing Sync` workflow runs it nightly and opens a PR when a price
moved. Never hand-edit the generated file.

### Matching GenSpend models to NodeTool model ids

GenSpend keys models by its own slug (`seedance-2`); a run is priced by the
provider-native id on the node (`bytedance/seedance-2.0/text-to-video`). Each
entry records which of three routes bridged them, in descending order of trust:

- **`receipt`** — the offering's `sourceUrl` is a model page carrying the native
  id: `fal.ai/models/fal-ai/flux/schnell`, `replicate.com/black-forest-labs/flux-dev`.
  Exact, nothing interpreted.
- **`alias`** — pinned by hand in `scripts/genspend/aliases.json`. An array of
  ids pins a match the name comparison cannot see; `null` blocks a model for
  that provider.
- **`catalog`** — the model's normalized name exactly equals that of a model the
  provider itself enumerates in NodeTool (`getAvailableImageModels` and
  friends). That listing is the model picker's own source, so the sync can only
  ever emit ids NodeTool actually ships.

A catalog match prices the **model**, not one endpoint variant, so sibling task
endpoints (text-to-video, image-to-video, edit) share the number — which is what
GenSpend publishes: one price per model per provider.

Four guards keep a wrong number out of a budget decision:

- **Same modality only.** "Gemini 3.1 Flash Image" and "Gemini 3.1 Flash TTS"
  normalize alike once the task word is stripped; the modality guard is what
  keeps an image price off a TTS model.
- **Exact key equality**, never prefix or fuzzy — so `seedance-2` cannot price
  `seedance-2-mini`, and `kling-3-pro` cannot price `kling-3-turbo`.
- **Generation endpoints only.** Upscalers, lip-sync and voice-clone endpoints
  bill on their own basis and never inherit a model's generation price.
- **Ambiguity is dropped, not resolved.** A name hitting more than eight ids is
  a family name, not a model; it is reported instead of priced.

Anything left unresolved is printed by the sync and written to its `--report`
file, so the gap is visible rather than silently absent.

### What the numbers mean

`unit_price` is in the provider's own unit; prices are only comparable inside
one `unitClass`. Each entry keeps `unit_class` verbatim and maps it to a
`billing_unit` label ("images", "seconds", …) matching the FAL catalog's
vocabulary. Offerings that aren't `available` or carry no price are dropped.
When two offerings land on one key, a receipt match outranks a name match, and
otherwise the cheaper price wins.

Prices via [genspend.io](https://genspend.io).
