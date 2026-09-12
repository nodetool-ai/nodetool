---
title: "Proof and handoff audit"
noindex: true
sitemap: false
---

# Proof and handoff audit

Snapshot: 2026-09-12. This is a repository evidence audit for P0 and P1 of the
[proof-to-repeatable-work strategy](proof-to-repeatable-work-strategy.md#delivery-phases).
It does not establish production analytics counts or successful installs,
imports, or runs that are not recorded in the repository.

P0 is incomplete. The route, proof, action, source, and event inventories are
now recorded, but no analytics export establishes the current funnel baseline.
P1 is partial. Recipe pages put reviewed output and its status before setup, but
the exact demonstrated projects cannot yet be reopened from a public action.

## Route-to-job map

| Route | Visitor job | Current proof and exit | Audit status |
| --- | --- | --- | --- |
| `/` | Decide whether the workspace fits a repeatable media job. | Four production cards lead to their recipe details. A closing action leads to `/download`, with Cloud as a separately labelled alpha option. | Proof order is explicit in [RecipeShowcase](../../marketing/src/components/RecipeShowcase.tsx). The primary header still omits Recipes, Apps, and Download. |
| `/recipes` | Choose a complete production job. | The four cards lead to recipe details. The closing action opens the generic Cloud workspace. | The card paths are specific. The closing action does not retain a recipe or identify Cloud as alpha. |
| `/recipes/viral-video-ad-engine` | Make three editable vertical ad variants from one product reference. | Reviewed cuts and the shared-reference comparison appear before the guide. Actions lead to `/download` or the guide anchor. | Partial production evidence. No public exact-project or alternative-bundle action. |
| `/recipes/ecommerce-sku-visual-factory` | Turn one product reference into a catalogue set and short motion clip. | The source-to-set proof and motion clip appear before the guide. Actions lead to `/download` or the guide anchor. | Partial production evidence. No public exact-project or alternative-bundle action. |
| `/recipes/multilingual-video-dubber` | Review, revise, and assemble a translated voice track. | Translation review and a language comparison appear before the guide. Actions lead to `/download` or the guide anchor. | Explicitly partial. Human audio, lip-sync, and native-preview acceptance remain open. |
| `/recipes/storyboard-to-trailer` | Build and review a reusable six-shot storyboard. | The board and entity references appear before the guide. Actions lead to `/download` or the guide anchor. | Explicitly partial. The promoted endpoint is the reviewed board, not a trailer. |
| `/marketing` | Evaluate the product for repeated advertising work. | The main action leads to `/download`. “Try now” scrolls to a product-video section, whose detail action goes to `/use-cases/product-video`. | It does not route to the ad or catalogue production proof required by the strategy. |
| `/download` | Choose and install Studio. | Client-side release lookup resolves platform assets. Failure falls back to the GitHub releases page. The page then sends visitors to `/recipes`. | Edition copy recommends Studio for paid work, but the recipe-bundle copy promises a relationship that has not been verified. |
| `/studio` | Understand the local edition before installing it. | The primary action leads to `/download`. | Destination and edition agree. |
| `/cloud` | Understand the browser edition and its alpha status. | The primary product action opens `https://app.nodetool.ai`. | Destination and edition agree, but this product-entry click is not instrumented. |

The current recipe, download, Studio, Cloud, and marketing canonicals remain in
place. Existing advertising aliases continue to resolve to `/marketing` through
[Next configuration](../../marketing/next.config.mjs). No parallel route family
was introduced.

## Promoted proof inventory

All four public examples use run `2026-09-10-marketing-recipes-01` and are
labelled `partial`. The run record identifies app version `0.7.0-rc.40` and the
`local web` edition, not an installed Studio build. The public claim text is in
[the recipe presentation source](../../marketing/scripts/recipes.mjs), while the
production record is in [run.json](../../marketing/recipe-assets/2026-09-10-marketing-recipes-01/run.json).

| Example | Promoted assets | Supported public claim | Required limitation |
| --- | --- | --- | --- |
| Product ad variants | Card and comparison: [hooks contact sheet](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/viral-video-ad-engine/hooks-contact-sheet.webp). Playable result: [ad A](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/viral-video-ad-engine/ad-a.mp4). | Three editable 15-second variants have different openings and shared remaining footage. The same accepted fictional product reference appears across six shots. | The product is fictional. No speed, virality, sales, product-performance, price, or provider-cost claim is supported. Final viewing checks and the guided-flow walkthrough remain open. |
| Catalogue set | Card and proof: [source-to-set comparison](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/ecommerce-sku-visual-factory/source-to-set.webp). Playable result: [product motion](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/ecommerce-sku-visual-factory/product-motion.mp4). | One accepted reference produced a cutout, three stills, a short motion clip, a 4096-pixel derivative, and listing copy. | Scene treatments do not preserve source pixels. The clip is a camera arc, not a 360-degree reconstruction. Project identity, selected-take linkage, and capture acceptance remain open. |
| Multilingual video | Card and proof: [translation review](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/multilingual-video-dubber/translation-review.webp). Playable result: [language comparison](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/multilingual-video-dubber/language-comparison.mp4). | Three approved Spanish lines reached the Script flow. One line was revised and revoiced before three clips reached an editable 16.3-second timeline. | Native timeline preview failed. Human audition and lip-sync acceptance, five required captures, persistent document IDs, lossless originals, and the walkthrough remain open. |
| Storyboard | Card: [six-shot board](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/storyboard-to-trailer/storyboard-board.jpg). Proof: [entity references](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/storyboard-to-trailer/entity-references.webp). | The Storyboard flow created a six-shot mystery board with reusable character, location, and prop references. | No finished trailer exists. Motion, score, timeline, masters, previews, and later finishing evidence are missing. Selected keyframes and voice takes are not public exported deliverables. |

The [production run component](../../marketing/src/components/RecipeProductionRun.tsx)
shows the review label, status, claim list, essential limitation, and remaining
limitations. Video has visible controls and does not autoplay. The storyboard
example uses still evidence rather than implying that a playable trailer exists.

## Action destination inventory

| Source action | Actual destination | Measured event | Handoff assessment |
| --- | --- | --- | --- |
| Homepage production card | Matching `/recipes/<slug>` detail | None | Correct named detail, but proof interest is not measured. |
| Homepage “Explore all recipes” | `/recipes` | None | Correct collection. |
| Homepage “Download” | `/download` | `Download CTA`, property `os` | Correct intent step. Source page, placement, target, and edition are absent. |
| Homepage “Try Cloud in your browser (alpha)” | `https://app.nodetool.ai` | `Try Cloud`, no properties | Edition and alpha status are clear. Product activation is not measured. |
| Recipe “Download NodeTool Studio” | `/download` | None | Named destination is correct. The highest-intent recipe exit is not attributable to a recipe. |
| Recipe “See every step” | `#guided-flow` | None | Correct in-page destination. |
| Recipe hub “Open NodeTool” | `https://app.nodetool.ai/workspace` | None | Generic product entry loses the selected job and omits the alpha qualifier. |
| Advertising “Try now” | `#product-video` | None | It is an in-page scroll, not a runnable job. |
| Advertising workflow detail | `/use-cases/product-video` | None | It bypasses the ad and catalogue proof routes. |
| Download platform card | Matched GitHub release asset, or the latest-release page on lookup failure | `Download`, property `os` | The fallback remains reachable but is not a direct installer despite the card label. Successful installation is not measured. |
| Download-page Cloud link | `/cloud` | None | Correct edition information step. |
| Cloud primary action | `https://app.nodetool.ai` | None | Correct product destination, no product-entry event. |
| Announcement “Try it” | `/cloud` | `Try Cloud`, property `placement=announcement` | The event name conflates an information-page visit with entering the product. |
| Recipe workflow bundle | No rendered action | None | `entry.bundle` is generated but unused by the recipe hub and detail pages. |

## Source and data drift

The intended data path is production evidence and plans, then
[recipes.mjs](../../marketing/scripts/recipes.mjs) plus
[recipe-guides.mjs](../../marketing/scripts/recipe-guides.mjs), then
[generated page data](../../marketing/src/data/recipeEntries.generated.ts).
The generator validates promoted media paths and writes typed page data, but it
does not derive claim and limitation text from each production asset manifest.

- **F1. The aggregate verification snapshot is stale.**
  [VERIFICATION.md](../../marketing/recipe-assets/2026-09-10-marketing-recipes-01/VERIFICATION.md)
  says all ad UI captures are missing and no page files were changed. The newer
  [ad handoff](../../marketing/recipe-assets/2026-09-10-marketing-recipes-01/viral-video-ad-engine/handoff.md)
  records AD-C0 through AD-C11, and the current site publishes those captures.
  Reviewers cannot treat the aggregate file as the current production master.

- **F2. One public limitation retains the stale capture state.** The ad page
  says live app captures and the walkthrough are incomplete. The current
  handoff says the captures are present and only the walkthrough is missing.
  The disclosure is conservative, but it no longer maps exactly to the current
  evidence.

- **F3. Claims have two manually maintained representations.** Production
  `asset-manifest.json` files contain evidence decisions, while `recipes.mjs`
  retypes and paraphrases the selected claims and limitations. The generator
  checks referenced files and generated-data drift, not semantic agreement
  between these sources.

- **F4. Recorded edition and recommended edition differ.** The run was captured
  in `local web`, while every recipe handoff recommends Studio. The pages
  explain how to create a new Studio project, but no evidence proves that an
  installed Studio build reopens the exact demonstrated project.

- **F5. The download-page bundle description exceeds current evidence.** It
  says each imported recipe file comes with the run shown on the page. The four
  public files contain workflow graphs and zero assets. They are not exports of
  the demonstrated Storyboard, Script, or timeline documents.

`npm run gen:recipes -- --check --bundles` passed on this snapshot and reported
four recipes up to date. That proves generated data matches its source and that
bundle workflow names match the source step lists. It does not prove semantic
claim agreement or successful product import.

## Measurable funnel and gaps

[The analytics wrapper](../../marketing/src/lib/analytics.ts) is a typed,
client-only, fail-safe call to the Plausible queue. The root
[layout](../../marketing/src/app/layout.tsx) loads page-view, outbound-link,
file-download, page-property, and tagged-event support. The repository does not
show receiver goal configuration or received event data.

| Funnel stage | Current measurable signal | Gap |
| --- | --- | --- |
| Route arrival | Plausible page view is expected from the loaded script. | No checked-in export records route, source, and device baselines. |
| Studio intent | `Download CTA` on `SmartDownloadButton`, with detected `os`. | Recipe download links do not use it. Page, placement, target, slug, and edition are absent. |
| Installer exit | `Download` on a platform card, with `os`. | Direct asset and fallback release-page clicks share one event. Installation and launch are unobserved. |
| Cloud intent | `Try Cloud` on the homepage and announcement. | The event mixes product entry with an information-page visit. Recipe hub and Cloud primary actions are untracked. |
| Proof consumption | None. | No `Proof View`, deliberate `Proof Play`, or revision-view event. |
| Recipe handoff | None. | No detail-to-download, bundle, app-entry, import, open, run, revision, or export attribution. |
| Product outcome | None in the inspected marketing path. | Product activation and repeat work must remain unreported until consented product events and attribution are verified. |

No baseline dashboard, event export, or analytics-wrapper test was found in the
inspected repository. The wrapper catches analytics failures, but no test proves
once-only firing, disabled behavior, property shape, or that navigation remains
safe when the receiver throws.

## Bundle verification

The four files under `marketing/public/recipes/` were opened as ZIP archives.
`unzip -tq` passed for every file. Their manifests use bundle format version 2,
target NodeTool `0.7.0-rc.40`, and contain no assets.

| Public file | Workflow count | Manifest result | Relation to promoted proof |
| --- | ---: | --- | --- |
| `viral-video-ad-engine.nodetool` | 4 | Structurally valid, zero assets | Related ad workflow chain. It does not contain the recorded three timelines, shared clips, or page media. |
| `ecommerce-sku-visual-factory.nodetool` | 6 | Structurally valid, zero assets | Related catalogue workflow chain. It does not contain the recorded guided project or its accepted outputs. |
| `multilingual-video-dubber.nodetool` | 5 | Structurally valid, zero assets | Related localization workflow chain. It does not contain the recorded Script document, takes, or comparison media. |
| `storyboard-to-trailer.nodetool` | 4 | Structurally valid, zero assets | Related trailer workflow chain. It does not contain the reviewed six-shot board or server-side selected assets. |

General bundle import and export code and tests exist in the product, but this
audit did not import these four public files into Studio, run them, or compare
their output with the promoted examples. The public files therefore qualify as
alternative workflow bundles only. They must not be described as the exact
guided-project export.

## Existing checks and remaining blockers

[Marketing smoke coverage](../../marketing/tests/e2e/smoke.spec.ts) checks the
homepage proof order, status and limitation copy, deliberate video controls,
mobile card visibility, proof-before-guide order, guide input order, production
media responses and signatures, registered routes, structured data, and visible
download-platform links. The dedicated mobile-menu test covers keyboard Escape
for that menu. No proof-specific keyboard or reduced-motion browser test was
found. No browser test follows a recipe through download, import, reopen, run,
revision, or export.

- **F6. P0 has no observed baseline.** Obtain a Plausible export by route,
  source, and device before interpreting any lift. Record receiver goals and
  keep proof, installer, Cloud entry, and product activation as separate events.

- **F7. P1 has no exact-project handoff.** Export a demonstrated project or
  state that the visitor must create a new one. Verify the chosen Studio build
  opens it with the expected documents, IDs, assets, and editable state.

- **F8. Bundle acceptance is incomplete.** Label each current file
  “Alternative workflow bundle”, expose it only with that distinction, then
  download, import, inspect, and run each file in the supported Studio build.

- **F9. Several production reviews remain open.** The ad walkthrough and final
  playback review, catalogue identity and take linkage, localization audition
  and lip-sync review, and storyboard finishing work still block stronger
  claims. All four examples must remain `partial` until their own acceptance
  records change.

- **F10. P1 browser acceptance is incomplete.** Add proof-specific keyboard and
  reduced-motion checks, plus a destination test for every promoted action. Keep
  the existing media, mobile, canonical, and route-order checks.

P1 can ship as a partial-proof release only if actions and copy continue to
state these boundaries. Exact recreation, accepted playback, measured cost,
successful installation, successful import, and successful run remain
unsupported claims.
