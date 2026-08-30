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

1. **GenSpend, when its entry is parameter-priceable** —
   `src/generated/genspend-pricing.json`, keyed `<provider_id>:<model_id>`. An
   entry qualifies when it publishes a grid (a resolution ladder, a duration
   rung, an audio axis, an input surcharge), or bills per second, per character,
   or per token. Those rows say what a *rung* costs, so they price the run
   rather than one unit of it.
2. **FAL** — `@nodetool-ai/fal-nodes/unit-pricing-catalog`, keyed by `endpoint_id`.
3. **kie** — `@nodetool-ai/kie-nodes/unit-pricing-catalog`, keyed by `model_id`,
   using the USD conversion (a raw credit figure has no fixed USD value).
4. **GenSpend's flat scalar** — one number per generation, nothing to narrow.

FAL and kie come from the providers themselves, but each carries a single scalar
per endpoint, and for the 260 FAL rows billed per second that scalar is a rate:
reported as the price of a run it understated a 4-second clip by 40×. So a
published GenSpend grid wins, and a FAL/kie scalar is converted here — multiplied
by the duration, output size, or text length the node states, and declined
outright for a unit with no fixed value per run (credits) or a rate the node
states nothing about (compute seconds, training steps).

GenSpend covers every other provider it tracks and NodeTool can run — today
that is Replicate, AtlasCloud, Together, Gemini, OpenAI, MiniMax, and
ElevenLabs — plus any FAL or kie model their own catalogs predate. xAI is wired
into `scripts/genspend/match.mjs`'s `PROVIDER_IDS_BY_GENSPEND_SLUG`, but the
shipped catalog holds no `xai:` entries: GenSpend's own catalog has nothing to
match against that slug. Topaz, Reve, Aki, Meshy, and Rodin are enumerated by
the sync's model inventory (`scripts/genspend/inventory.mjs`) but are not yet
in `PROVIDER_IDS_BY_GENSPEND_SLUG`, so none of the five has priced entries
either.

## Speech models: characters, not runs

The 22 text-to-speech rows are billed `1m_chars` — ElevenLabs' $100 per million.
That is a rate, and as a per-run figure it read as $100 to voice one line, so
these rows are multiplied by the `characters` a caller states and decline when
none was given. The six rows billed `1m_tokens` decline outright: a speech
model's tokens are the audio it produced, and no text length converts into them.
Passing off the block price as a run's cost is the failure mode both rules
exist to prevent.

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
entry records which of five routes bridged them, in descending order of trust:

- **`alias`** — pinned by hand in `scripts/genspend/aliases.json`. An array of
  ids pins a match the name comparison cannot see; `null` blocks a model for
  that provider.
- **`variant`** — a `variants[]` row whose `spec` names a model NodeTool ships.
  Best of the automatic routes, because the row carries that endpoint's *own*
  price: `fal-ai/flux-pro/v1.1` bills $0.04 and `…/v1.1-ultra` $0.06, and both
  get their real number instead of sharing the model's headline price.
- **`provider-id`** — GenSpend's `providerModelId`, the id the provider's own API
  invokes and bills with, on a receipt-or-null contract. Verified against the
  provider's NodeTool listing before use, so an id for a model NodeTool doesn't
  ship (`resemble-ai/chatterbox`) resolves to nothing instead of a bad key.
- **`receipt`** — the offering's `sourceUrl` is a model page carrying the native
  id: `fal.ai/models/fal-ai/flux/schnell`, `replicate.com/black-forest-labs/flux-dev`.
  Ranks below `provider-id` because it infers the id from a URL path.
- **`catalog`** — the model's normalized name exactly equals that of a model the
  provider itself enumerates in NodeTool (`getAvailableImageModels` and
  friends). That listing is the model picker's own source, so the sync can only
  ever emit ids NodeTool actually ships.

GenSpend prices a model once per provider, but a provider ships it as several
task endpoints and only one of those is what `providerModelId` or a receipt
names. So the name tier runs even when an exact id was found, carrying the price
to the model's sibling endpoints at `catalog` trust — capability-checked, so a
task the model cannot do gets nothing. AtlasCloud's Seedance 2.0 ends up with its
text-to-video endpoint priced exactly and image-to-video and reference-to-video
priced by inference, each labelled for what it is.

Five guards keep a wrong number out of a budget decision:

- **Published capabilities are respected.** GenSpend's receipted task flags
  (`t2i`/`i2i`/`t2v`/`i2v`/`r2v`/`v2v`) drop an endpoint whose task the model
  cannot do — `qwen-image` reports `i2i: false`, so its price never lands on
  kie's image-edit endpoint. Only an explicit `false` blocks; `null` is unknown,
  not refuted.
- **Same modality, and speech is not music.** "Gemini 3.1 Flash Image" and
  "Gemini 3.1 Flash TTS" normalize alike once the task word is stripped; the
  modality guard keeps them apart, and `capabilities.kind === "music"` keeps a
  music model off a provider's text-to-speech listing.
- **Exact key equality**, never prefix or fuzzy — so `seedance-2` cannot price
  `seedance-2-mini`, and `kling-3-pro` cannot price `kling-3-turbo`. A model's
  published `aliases[]` are matched too, which is how Nano Banana Pro and Gemini
  3 Pro Image find each other.
- **Generation endpoints only.** Upscalers, lip-sync and voice-clone endpoints
  bill on their own basis and never inherit a model's generation price.
- **Ambiguity is dropped, not resolved.** A name hitting more than eight ids is
  a family name, not a model; it is reported instead of priced.
- **A video-input variant never prices a text-to-video endpoint.**
  `videoInput: true` is a billing axis, not a spec note — providers charge more
  when a video goes in, so applying such a row to a t2v endpoint would
  undercharge. The headline price stands instead.
- **Tier ambiguity resolves upward.** Where a provider selects tier by parameter,
  Pro and Standard share one callable id, so one NodeTool node could run either.
  Two equally-trusted models on one id keep the dearer price; the same model
  listed twice keeps the cheaper, which is what a run actually pays.

Anything left unresolved is printed by the sync and written to its `--report`
file, so the gap is visible rather than silently absent.

### Fetching

The sync requests `?envelope=1` (so the payload carries its own `generatedAt`)
and sends the stored ETag as `If-None-Match`; a 304 ends the run as a no-op.
Two wrinkles, both handled:

- A compressing intermediary marks GenSpend's strong ETag weak in transit, and
  the origin then compares strongly and misses. The sync stores and sends the
  strong form.
- The ETag covers the envelope's `generatedAt`, which turns over with the 60 s
  edge cache, so a nightly run usually gets a fresh body anyway. `etag` and
  `catalogGeneratedAt` are therefore frozen alongside the prices — otherwise
  the shipped file would change every night and open a PR with no price movement.

### What the numbers mean

`unit_price` is in the provider's own unit; prices are only comparable inside
one `unitClass`. Each entry keeps `unit_class` verbatim and maps it to a
`billing_unit` label ("images", "seconds", …) matching the FAL catalog's
vocabulary. Offerings that aren't `available` or carry no price are dropped.
When two offerings land on one key, a receipt match outranks a name match, and
otherwise the cheaper price wins.

Prices via [genspend.io](https://genspend.io).
