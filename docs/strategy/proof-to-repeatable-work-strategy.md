---
title: "NodeTool landing strategy: proof to repeatable work"
noindex: true
sitemap: false
---

# NodeTool landing strategy: proof to repeatable work

NodeTool should make its existing work easier to inspect and repeat before
expanding its page catalogue. A finished asset earns attention. A recorded
revision in the same project proves control. A working handoff into that project
turns interest into product use.

This execution strategy follows an audit of the current repository and the
landing-page patterns it should adopt or reject. It does not authorize production
spending, product implementation, or publication. D codes identify strategy
decisions, A codes assumptions to test, R codes risks, and Q codes unresolved
questions. These codes are local to this document. Competitor observations are
not evidence that a design increases conversion.

## Diagnosis and choices

F1. The gap is between evidence and action. Strong creative platforms frequently join an input,
a visible result, and a creation action. NodeTool already has recipe, app,
template, model, and task pages. Its [recipe detail implementation](../../marketing/src/app/recipes/%5Bslug%5D/page.tsx)
puts guided setup before production proof and sends its primary action to a
generic Cloud workspace. The bundle is present in data but absent from this
page. That is not a direct recreation path.

F2. The strongest differentiator is insufficiently demonstrated. The
[narrative](../../marketing/NARRATIVE.md#proof) calls for a backward edit and
verified run measurements. The [current production records](../../marketing/src/data/recipeEntries.generated.ts)
remain partial. A guided run and a legacy workflow sample are different evidence
sources. Their model lineage and reproduction promises cannot be interchanged.

F3. Page expansion has an opportunity cost. The
[SEO audit](../SEO_STRATEGY.md) prioritizes consolidation and improving existing
ranked pages. [App pages](../../marketing/src/app/apps/%5Bslug%5D/page.tsx) already
describe their input and output contracts but do not execute publicly.
More descriptive pages would leave this conversion gap intact.

| Decision | Choice and consequence                                                                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1       | Prioritize small production teams repeating paid ad, catalogue, and localization work. Lead the first proof release with the Olive Travel Cup ad and catalogue examples. Keep filmmaking as an entry route and developers as a separate acquisition track. |
| D2       | Preserve the category and homepage sequence in [NARRATIVE.md](../../marketing/NARRATIVE.md#order-of-the-page). Strengthen the recipe beat after the model wall, then demonstrate a revision. Do not restart the homepage design or put graphs first.       |
| D3       | Preserve `/recipes/*`, `/apps/*`, `/templates/*`, and `/models/*`. Improve these route families before introducing a new one. A recipe owns a complete job, an app owns its operation screen, and a template owns a workflow file.                         |
| D4       | Make every promoted example carry a truthful next action. Prefer the documented Studio entry for paid work. Keep Cloud explicitly labeled alpha. A generic workspace link must explain setup and cannot be labeled recreation.                             |
| D5       | Promote only what the record proves. Show partial status beside the media. Capture one complete request-to-revision sequence before advertising that complete sequence. Publish price and time only after reconciliation with run evidence.                |
| D6       | Improve app discovery first, then pilot public execution on one bounded operation. Public execution is a product workstream with its own security, billing, and reliability gate. It does not block publishing reviewed, recorded examples.                |
| D7       | Use proof completion and successful product handoffs as expansion gates. Page count, model coverage, and video plays alone do not justify another page family.                                                                                             |
| D8       | Keep detailed costs on `/pricing` and comparisons on `/alternatives/*`. Name providers where their settings and charges matter. Do not make a competitor's brand the homepage argument.                                                                    |
| D9       | Maintain generated data as the connection between product facts and pages. Change source manifests and generators, then regenerate. Do not hand-edit generated recipe or app entries.                                                                      |

### Reconciliation with existing plans

| Existing direction                                                                                                                                                    | Resolution in this strategy                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Positioning plan](../../marketing/POSITIONING_PLAN.md) includes an enemy section, a homepage calculator, illustrative recipe prices, and an earlier launch schedule. | Its own page-architecture section gives the narrative precedence. D2 and D8 follow the narrative. Illustrative prices never become run charges. Use the dependency gates below instead of restarting completed launch work.                                                                                        |
| Research proposes `/workflows/product-video`, broad category routes, and shipping recipe pages first.                                                                 | Recipe pages already exist. D3 improves their proof and handoff. No parallel `/workflows/*` namespace. Reuse existing task and use-case routes when their intent fits.                                                                                                                                             |
| Research proposes graph tabs and a full agent turn on recipe pages.                                                                                                   | The [recipe production plan](../plans/marketing-recipes/MASTERPLAN.md) requires guided flows and direct document operations for these examples. Their primary proof is script, board, and timeline. Workflow bundles remain a clearly labeled alternative. Graph-first execution proof belongs on developer pages. |
| Narrative recommends Studio and one primary download verb. Current recipe pages instead lead with “Open NodeTool” into Cloud.                                         | D4 explicitly chooses the narrative's Studio recommendation for this work. Implementers must reconcile page copy and narrative in the same change. “Download workflow” is a secondary file action. “Try now” may identify an actual alpha run, with its destination disclosed.                                     |
| Narrative retains sample-fidelity guidance for legacy samples. Current recipe entries have `sample: null` and separate production-run records.                        | Do not invent a fidelity ratio from a null sample or copy the old manifest's model list onto the new media. Extend evidence for the actual production run.                                                                                                                                                         |
| [Brand](../BRAND.md) defines workspace as the category and Studio as the desktop edition. Narrative's older phrasing rule says Studio is the product.                 | Use the brand's category in positioning. Name Studio or Cloud when the edition affects setup, hosting, or execution.                                                                                                                                                                                               |
| Positioning plan proposes a leaderboard and enterprise brand QA.                                                                                                      | Defer both. A benchmark needs a repeatable test set and measured runs. Enterprise claims need shipped controls and customer evidence. Neither is required for the first proof release.                                                                                                                             |

## Audience and jobs

The [audience definition](../../marketing/NARRATIVE.md#audience) selects buyers
by repeated work, not by interest in AI. The landing page must show the asset
they need and the revision they expect to make next.

| Audience                                | Trigger and job                                                                                                                   | Purchase or adoption test                                                                                    | First route and evidence                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Performance and social production teams | A product campaign needs fresh openings each week. Produce variants from one approved reference and reuse the accepted material.  | Can a director change one opening without rebuilding the campaign?                                           | `/recipes/viral-video-ad-engine`, three openings and the shared remaining footage.                                  |
| Catalogue teams                         | A product needs studio and seasonal treatments. Keep its identity legible across a deliverable set.                               | Do the selected views preserve the required product details, and can the next treatment reuse the reference? | `/recipes/ecommerce-sku-visual-factory`, source, cutout, treatments, and camera arc.                                |
| Localization studios                    | An approved recording must reach another market. Review wording and revise an individual voice line.                              | Can a language reviewer approve the words, audition the take, and inspect the final timing?                  | `/recipes/multilingual-video-dubber`, translation review and language comparison with pending acceptance disclosed. |
| Creative technologists and developers   | A team wants to repeat a media operation from its own tools. Connect an agent, inspect execution, and retain the editable result. | Does the documented client setup run the example, and does its correction update the retained artifact?      | `/developers`, then a gated `/developers/mcp` worked example.                                                       |
| Solo filmmakers                         | A story needs visual approval before motion production. Establish references and select a board.                                  | Can a shot be revised while the cast and location references remain available?                               | `/recipes/storyboard-to-trailer`, currently a board example rather than a completed trailer.                        |

Enterprise procurement is not a launch audience for this work. Route current
ownership and deployment questions to documented developer and edition pages.

## Information architecture and portfolio

Keep the primary header to Studio, Recipes, Apps, Developers, Pricing, and
Download. “Recipes” matches the outcome collection's route and avoids presenting
guided documents as workflow files. Put Templates and Tasks inside discovery
navigation. Use footer groups for creation jobs, models and providers,
developers, and company resources. Promotions require a working example.

| Page                     | Role and canonical route                                          | Scope of work                                                                                                                        | Exit                                                                          |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Homepage                 | `/` identifies the workspace and routes by job.                   | Improve existing recipe cards and the following project proof. Preserve the rest of the narrative.                                   | Recipe detail or Studio download.                                             |
| Recipe hub and details   | `/recipes` and the four existing recipe slugs.                    | Highest priority. Put the evidenced result before setup and connect it to the demonstrated entry path.                               | Documented Studio setup, matching export when verified, optional alpha entry. |
| Advertising vertical     | `/marketing`, retaining its existing aliases.                     | Summarize the repeated advertising job and use the same ad proof. No duplicate product-video landing route.                          | The ad or catalogue recipe.                                                   |
| App hub and details      | `/apps` and existing app slugs.                                   | Search and job filters, input/result previews, then one execution pilot.                                                             | App run when supported, otherwise explicit Studio setup.                      |
| Workflow templates       | `/templates/*`.                                                   | Preserve technical parameters, bundles, and related recipe links. Do not describe a workflow export as the guided project's export.  | Download that graph.                                                          |
| Tasks and models         | `/tasks/*`, `/models/*`, existing comparison slugs.               | Strengthen selected pages using verified recipe calls and operation examples.                                                        | A matching app, template, or recipe step.                                     |
| Developer integration    | Existing `/developers` and `/agents`, proposed `/developers/mcp`. | Add the child only when installation and a complete example are verified. Existing hubs introduce it without repeating the tutorial. | Supported setup and a runnable example.                                       |
| Pricing and alternatives | `/pricing`, `/alternatives/*`.                                    | Retain calculator and canonical comparison pages. Add measured recipe breakdowns when available.                                     | The matching recipe and Studio download.                                      |

Route changes must be checked against [redirects](../../marketing/next.config.mjs)
and the [page registry](../../marketing/src/data/registry.ts). Existing traffic
is not evidence that an old URL still resolves. No new generic `/ai-video` or
`/product-video` page is required for this portfolio.

## Page blueprints and usable examples

### Homepage proof and recipe detail

Use “How teams are using NodeTool” as the existing section label, with an
explicit “NodeTool example projects” descriptor until named customer stories
exist. Each card shows a job, result, review status, and one detail link. Audio
starts only on request. Moving previews need posters and a reduced-motion
fallback. The trailer card remains a still board.

For an ad detail page, the order is result and status, brief and references,
guided setup, editable documents, recorded revision, verified measurements,
next action, and related operations. Keep the setup concise and link to deeper
instructions. Missing revision or measurement sections stay absent, with their
absence disclosed where the page's claim would otherwise imply completeness.

| Example          | Draft headline and proof sequence                                                                                                                                                                                                                                                                                                                                          | Evidence boundary                                                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product ads      | “Three product ads. One shared reference.” Play [Variant A](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/viral-video-ad-engine/ad-a.mp4), show the [opening compositions](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/viral-video-ad-engine/hooks-contact-sheet.webp), then the guided Storyboard entry and shared footage. | Fictional Olive Travel Cup. Three editable cuts are recorded, but the app walkthrough is incomplete. Do not claim virality, sales, speed, or a production charge. Do not use the research's unverified “12 campaign assets” headline.  |
| Catalogue assets | “Build a catalogue set from one product reference.” Show [source to set](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/ecommerce-sku-visual-factory/source-to-set.webp), then the [six-second motion clip](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/ecommerce-sku-visual-factory/product-motion.mp4).                     | Generative treatments do not preserve source pixels unchanged. Call the motion a camera arc. Do not claim a 360-degree reconstruction or verified exact take linkage.                                                                  |
| Localization     | “Review the words. Revise one voice line.” Show [translation review](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/multilingual-video-dubber/translation-review.webp), then the [language comparison](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/multilingual-video-dubber/language-comparison.mp4).                        | Identify the presenter as synthetic. The recorded line-two revision is useful evidence, but native timeline preview failed and human audition and lip-sync acceptance remain pending. It cannot support a finished localization claim. |
| Storyboard       | “Review the story before animating it.” Show [entity references](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/storyboard-to-trailer/entity-references.webp) and the [six-shot board](../../marketing/public/recipes/runs/2026-09-10-marketing-recipes-01/storyboard-to-trailer/storyboard-board.jpg).                                               | No finished trailer exists in this production record. Do not substitute an older rendered trailer or imply that server-side takes have been exported.                                                                                  |

Reuse [RecipeProductionRun](../../marketing/src/components/RecipeProductionRun.tsx)
and the [recipe contract](../../marketing/src/data/recipes.ts). Move the essential
limitations beside the result, since an expandable review panel alone does not
qualify a headline. Label workflow downloads “Alternative workflow bundle”
until their relationship to the demonstrated guided project is verified.

The first new recording should revise an opening in the ad project, then show
the updated timeline and final cut. Capture the unchanged shared footage too.
Export and reopen the same project. If that sequence cannot be completed,
publish the reviewed partial example and record the specific product blocker.

### Apps

Start with Product, Video, Audio, Research, and Developer filters only where
existing entries support them. Derive mappings from the curated
[app data](../../marketing/src/data/miniAppEntries.generated.ts), with search
over names and task descriptions. Do not invent a Brand QA category without
matching runnable examples.

Use `/apps/product-reshoot` for product treatments,
`/apps/product-shot-video` for motion, and `/apps/vertical-cut` for reframing.
Preserve their actual input contracts. A recipe's media may illustrate the job,
but cannot be presented as that app's run until the app produced it.

Pilot `/apps/vertical-cut` first, subject to validating its shipped workflow.
It provides a bounded file-to-file operation without requiring a speculative
model allowance. Its detail hero should contain input requirements, the actual
controls, a labeled example/result comparison, progress and failure states,
and a resulting downloadable file. Show the underlying workflow afterward.
Until execution is available, show a recorded run and explicit Studio steps.
A prompt field that only redirects does not satisfy this blueprint.

### Developer and model pages

The MCP page should show supported-client setup, a complete request, tool
actions and validation, execution, result, and one correction to the same
artifact. Put copyable commands beside the recording. Verify each advertised
client independently. Count neither internal capabilities nor historical tool
totals as the number of tools a client sees.

A model detail page should lead with its actual output and exact operation,
then name the node, serving provider, accepted inputs, important parameters,
current price source, and a matching workflow. Use the existing
[model showcase](../../marketing/src/data/modelShowcase.ts) and
[detail template](../../marketing/src/app/models/%5Bslug%5D/page.tsx).
Only compare models on a common brief and settings with disclosed differences.
An upgrade or substitute in an older sample is not proof that the named model
made the new production asset.

## Delivery phases

Each phase has a role accountable for its gate. Assign people when implementation
starts. Do not treat the estimates in older launch plans as this work's schedule.

| Phase                                    | Owner and dependency                                                                                                                 | Deliverable                                                                                                                       | Acceptance criteria                                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0: establish the evidence and baseline  | Marketing lead with production reviewer and analytics engineer. No dependency.                                                       | Route-to-job map, proof inventory, CTA destination inventory, baseline dashboard, and event contract.                             | Every promoted asset maps to its production run, supported claim, limitation, and real destination. Enumerate source/data drift. Record the existing funnel before editing it. Empty evidence inventories fail review.                                                                                         |
| P1: repair existing proof and handoffs   | Marketing engineer and production reviewer. Depends on P0.                                                                           | Ad and catalogue recipe details, homepage proof cards, explicit partial localization and board examples, consistent edition copy. | Result and essential status appear before setup. Every promoted action reaches the named destination or explains the remaining setup. Downloaded bundles are opened and compared with their description. Preserve existing route canonicals. Pass page, media, keyboard, reduced-motion, and mobile checks.    |
| P2: prove revision and actual charges    | Production lead with runtime support. Depends on P0, can run alongside P1.                                                           | Complete ad revision recording, durable project export, generation ledger, measured elapsed time.                                 | Reviewer reopens the same project, identifies the changed opening and retained footage, and plays the updated cut. Reconcile provider charges including retries. Missing charges or failed playback block the corresponding claims, not unrelated P1 pages.                                                    |
| P3: improve discovery and test execution | Marketing engineer owns filters. Product engineer owns runner. Filters depend on P1, runner depends on an approved execution design. | App search/filter release, then the single `/apps/vertical-cut` pilot.                                                            | Filters match real entries and empty states work. Pilot validates files, isolates jobs, bounds resources, handles cancel/failure, and delivers the result plus workflow reference. No provider secrets or uploaded content enter marketing telemetry. Review public upload retention and access before launch. |
| P4: expand a proven cluster              | Content lead with developer advocate. Depends on P1 and the relevant P2 or P3 evidence.                                              | Improved task/model pages, one tutorial per distinct unmet question, and MCP page when its run passes.                            | Each page has distinct intent, unique evidence, a product action, a parent link, and a next-step link. Recheck affected canonicals, redirects, sitemap and structured data. Expand only after the metrics below show useful product entry.                                                                     |

P1 is the first useful release. Completing every recipe, public execution, a
leaderboard, and an enterprise page are not its prerequisites. Use
[marketing's scripts](../../marketing/package.json) for generated-data and page
checks, plus the repository's [mandatory verification](../../AGENTS.md#mandatory-post-change-verification)
when code changes begin. This document itself changes no product code.

## Proof and instrumentation contract

Each promoted run needs its brief, input provenance, edition and product
revision, durable document exports, model/provider identifiers, actual request
settings, selected takes, output checksums, and reviewer disposition. The
[production master plan](../plans/marketing-recipes/MASTERPLAN.md) owns capture
and artifact requirements. Use its evidence, not a second parallel manifest.

Record wall time from accepted execution to usable result, queue time, model
time, editing time, and external finishing separately. Record charge currency,
provider request IDs, rate source, failed attempts, retries, and cached stages.
A listed rate multiplied by units is an estimate. A reconciled charge is a
measurement. Do not describe one selected run as typical or cheapest.

The current [analytics wrapper](../../marketing/src/lib/analytics.ts) separates
`Download CTA` from `Download` and includes `Try Cloud` and
`Calculator Interaction`. Preserve these names. The older positioning plan's
snake-case names are not the implemented contract. `Download Recipe` is also
mentioned historically but is absent from this wrapper and the current recipe
page, so verify the receiver and reintroduce it deliberately if bundles return.

| Signal             | Event and minimum properties                                                                                         | Definition                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proof consumption  | Proposed `Proof View`, `Proof Play`, `Proof Revision View`: page, recipe/app slug, run ID, proof type, placement.    | View fires once after at least half the proof is visible for one second. A play requires deliberate interaction. Revision view requires reaching the changed-result segment. Autoplay impressions do not count as plays. |
| Intent             | Existing download/Cloud events, proposed recipe bundle and app-entry events: page, target, slug, edition, placement. | Keep installer click, recipe file click, and product entry separate. A click is not an installation, import, or successful run.                                                                                          |
| Discovery          | Proposed `App Search`, `App Filter`: category, result count, selected app.                                           | Record interaction and zero-result counts. Do not send raw search text, briefs, uploaded filenames, or prompt content.                                                                                                   |
| Product activation | Proposed product-side example import/open, run started, run succeeded/failed, result exported, revision succeeded.   | Requires verified product instrumentation and an optional referral identifier. Show website-only and linked product cohorts separately. Never infer a successful run from a Cloud click.                                 |

Implementation must prove events arrive once with correct properties, are absent
when tracking is disabled, and do not interrupt the action if analytics fails.
Use aggregate website measurement and voluntary product attribution. Do not
create cross-device identity tracking to make the funnel appear complete.

## SEO and content clusters

Use one canonical page per intent. First audit the actual
[route configuration](../../marketing/next.config.mjs), then use current query
data to prioritize the next edit. The older [SEO audit](../SEO_STRATEGY.md)
is evidence for consolidation, not a current traffic forecast.

| Cluster anchor           | Supporting content with a distinct purpose                                                                                                                                                                                   | Publication condition                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ad and catalogue recipes | Product reference preparation, opening revision, vertical reframing, app operation, model choice for the demonstrated step. Existing `/use-cases/product-video` stays a surface example only if its intent remains distinct. | Add a tutorial section to the recipe first. A separate page needs a deeper question and its own worked example. Link both recipes through the shared reference, without duplicating their proof narrative. |
| Localization recipe      | Existing `/tasks/lip-sync` and `/tasks/text-to-speech`, wording review, voice-line revision, subtitle finishing.                                                                                                             | Review audio and finishing before outcome claims. Avoid language-by-language clones unless each has tested pronunciation, review requirements, and distinct instructions.                                  |
| Storyboard recipe        | Reference continuity, board approval, shot revision, later motion and timeline finishing.                                                                                                                                    | Publish board instructions now. Gate trailer-completion content on accepted motion, score, timeline, and export evidence.                                                                                  |
| Developer integration    | `/developers/mcp` with client setup sections and links to existing CLI/API documentation.                                                                                                                                    | Verify setup and run before indexing. Client names alone do not justify duplicate landing pages.                                                                                                           |
| Task and model pages     | Existing tasks plus the exact models used by published examples.                                                                                                                                                             | Require a current product binding, parameter facts, price source, and a real operation example. Do not generate pages for a model/provider/industry Cartesian product.                                     |

Every new indexable page needs a named maintainer, distinct query intent, an
original example, a working action, and inbound links from its parent. Merge
overlapping content before adding aliases. Keep search/filter variants out of
the index. Treat retired or unsupported model pages individually: retain useful
reference material with a status, redirect only to a relevant equivalent, or
remove indexing when no useful answer remains. Internal strategy and production
plans must stay out of search and sitemaps.

## Measurement and expansion decisions

The numbers below are proposed operating thresholds, not measured results or
forecasts. P0 records a comparable baseline by route, traffic source, device,
and edition. At low volume, report counts and uncertainty rather than declaring
a conversion lift from a handful of events.

| Metric                                                                    | Type                         | Decision rule                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proof-complete promoted cards                                             | Leading, operational         | Target 100% with accessible media, nearby status, provenance, and tested action before release.                                                                                                                                                                                             |
| Detail visits leading to deliberate proof use and a qualified next action | Leading, acquisition         | Measure separate rates, not one blended engagement score. Seek a 20% relative lift in qualified actions over baseline as a planning target. Predefine experiment duration and sample needs after P0. Without sufficient volume, require repeated observed task completion before expansion. |
| Successful runs per started example                                       | Leading, product             | Pilot target at least 90% across 20 observed attempts with representative valid inputs. Report failure causes and small-sample uncertainty. A systematic supported-input failure blocks promotion regardless of the aggregate.                                                              |
| Exported result plus successful revision in the same project              | Lagging, activation          | Primary product outcome for recipe acquisition. Compare attributed cohorts before and after the release. If clicks rise but this falls, repair the entry or production flow before adding traffic.                                                                                          |
| Repeat job within 14 days                                                 | Lagging, retention           | A second job or meaningful revision after the first successful export, measured only in an observable, voluntary product cohort. Establish the baseline before setting a commercial target.                                                                                                 |
| Non-branded organic entry to successful product action                    | Lagging, acquisition quality | Track by cluster with branded and unrelated documentation queries separated. Rising impressions without qualified actions do not pass P4's expansion gate.                                                                                                                                  |
| Page performance and visitor friction                                     | Guardrail                    | Preserve the positioning plan's marketing LCP target below 1.8 seconds under an agreed test profile. Compare identical mobile and desktop profiles. Block release for broken keyboard controls, surprise audio, unusable alpha handoffs, or missing proof disclosures.                      |

Marketing reviews entry and proof data weekly. Product reviews failure causes
and attributed activation on the same cadence. Content reviews search cohorts
monthly, accounting for indexing delay. Website analytics cannot measure
offline Studio retention by itself. Until product attribution exists, report
the gap and use observed creator sessions as qualitative evidence.

## Assumptions, risks, and open questions

| Assumption | Test and consequence                                                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1         | Repeated-work teams value a visible revision more than another impressive result. Test both proof sequences with representative teams, then compare qualified actions. Keep the result-first structure if revision proof does not help comprehension. |
| A2         | Ad and catalogue examples are the strongest initial entry. Validate with source-segmented behavior and creator sessions. Change the featured order if another job drives more successful repeat work.                                                 |
| A3         | Studio setup is acceptable when the example and next steps are concrete. Observe first-run abandonment. If installation dominates losses, prioritize a verified alpha handoff without changing the paid-work recommendation silently.                 |
| A4         | Vertical Cut is suitable for the first public app. Confirm dependencies, resource limits, and output quality in P3. Choose another existing bounded operation if it fails, rather than weakening the execution gate.                                  |

| Risk | Response                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | Partial outputs look accepted when previews detach from disclosures. Bind status to every card and media placement, and review captions against supported claims.                                                |
| R2   | Recorded guided projects and downloadable graphs diverge. Label the distinction and verify imports independently. Export the demonstrated documents before promising recreation.                                 |
| R3   | Provider drift changes cost, availability, or behavior. Date run evidence, retain exact model identifiers, and recheck before reusing an old example for a new claim.                                            |
| R4   | Public uploads and execution create cost, privacy, and reliability obligations. Keep the first operation bounded and use existing product security boundaries. Do not collect provider keys in a marketing form. |
| R5   | More media slows discovery and filters manufacture thin pages. Lazy-load non-hero media, retain static alternatives, and keep filters within canonical catalogue routes.                                         |

| Question | Owner and default while unresolved                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1       | Can a visitor reopen the exact demonstrated project in Studio, and can an alpha link retain the selected recipe through setup? Product owner verifies this during P0. Until then, offer explicit setup instructions and label legacy bundles separately. |
| Q2       | What consented product events and attribution identifiers are already available? Analytics owner inventories them during P0. Until verified, measure website intent only and keep product activation unreported.                                         |
| Q3       | Who can approve the localization audition, product fidelity, and final playback, and who owns ongoing proof maintenance? Production lead assigns reviewers before P2. No review means the corresponding run remains partial.                             |
| Q4       | What execution budget and hosting boundary will support the public pilot? Product owner resolves this before P3 execution work. Search, filters, and recorded demonstrations can proceed without it.                                                     |

## Patterns to reject

D10. Do not copy launch-driven navigation, discount pressure, platform billing
units, unlimited offers, unverified customer counts, or enterprise promises.
Do not clone effect names, campaign copy, or media. Do not turn each keyword
variant into a page or surround a small example with repeated search phrases.
Do not advertise a public generator until it executes. These patterns either
conflict with [NodeTool's brand](../BRAND.md), obscure its product entry, or
require evidence and capabilities this strategy has not established.
