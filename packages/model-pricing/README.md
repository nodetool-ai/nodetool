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
GenSpend is what prices Replicate models and any FAL endpoint the codegen
catalog predates.

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
npm run sync:genspend          # rewrite the catalog
npm run sync:genspend:check    # exit 1 if it is stale
```

The `GenSpend Pricing Sync` workflow runs it nightly and opens a PR when a price
moved. Never hand-edit the generated file.

Two things the normalizer will not do, because both would put a wrong number in
front of a spend decision:

- **Guess a model id.** GenSpend keys models by its own slug (`seedance-2`).
  What NodeTool can match is the provider-native id in an offering's `sourceUrl`
  receipt — `fal.ai/models/fal-ai/flux/schnell` → `fal-ai/flux/schnell`,
  `replicate.com/black-forest-labs/flux-dev` → `black-forest-labs/flux-dev`.
  Providers whose receipt is a generic pricing table yield no id and are dropped.
- **Convert units.** `priceUsd` is in the provider's own unit, and prices are
  only comparable inside one `unitClass`. Each entry keeps `unit`/`unit_class`
  verbatim and maps the class to a `billing_unit` label ("images", "seconds", …).

Offerings that aren't `available` or carry no price are dropped too. When two
offerings collapse to one key, the cheaper one wins.

Prices via [genspend.io](https://genspend.io).
