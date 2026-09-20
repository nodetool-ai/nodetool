# Apps Catalogue Strategy and Implementation Plan

**Status:** Draft for review
**Scope:** Marketing homepage app strip, `/apps` catalogue, mini-app detail pages, catalogue metadata, proof assets, and related copy
**Companion:** [Apps catalogue tasks](apps-catalogue-tasks.md)

## Problem Statement

The current catalogue presents too many unrelated examples with equal prominence. Several entries show empty states, placeholder media, or generic interface chrome instead of a finished creative result. The card treatment crops screenshots to the form area, so visitors often see the least persuasive part of the app.

The current organizing idea, “AI mini apps anyone can use,” also conflicts with the product positioning. NodeTool is for small production teams doing paid, repeated work. The catalogue should show creative jobs that a team can run, inspect, revise, and reuse.

The current generated data treats a marketing screenshot and sufficient copy as evidence that an entry is indexable. That is a publishing rule, not a proof standard. It allows apps without marketing screenshots into the hub and gives weak examples the same authority as the strongest production workflows.

## Solution

Make `/apps` a curated showcase of repeatable creative jobs. Lead with finished work, show the operation that produced it, and make revision or reuse visible where the workflow supports it.

The first release will:

- Select at most six flagship apps for the primary catalogue route.
- Group the catalogue by jobs such as “Make campaign assets,” “Reshoot products,” and “Make video.”
- Give every public entry an explicit publication status, job title, evidence state, prerequisites, and next useful action.
- Separate finished result media from readable app-interface captures. A result image is for discovery. An interface capture explains how the result is made.
- Make the detail page result-first. It should show the result, inputs, operation, deliverables, and revision evidence before the workflow graph.
- Remove or demote weak, off-position examples from the main creative catalogue. Keep useful research, data, and agent examples discoverable through more appropriate surfaces.
- Preserve the existing visual language initially. The first quality gain comes from curation, evidence, hierarchy, and accurate copy.
- Upgrade the flagship apps themselves where the current experience is too shallow, generic, or incomplete. The catalogue should expose real production decisions, useful outputs, and a credible path to revision.

### Implementation surfaces

The primary code surfaces are `marketing/src/app/apps/page.tsx`, `marketing/src/app/apps/[slug]/page.tsx`, and `marketing/src/components/AppsSection.tsx`. Generated app facts come from `marketing/src/data/miniApps.ts` and `marketing/src/data/miniAppEntries.generated.ts`, with generation controlled by `marketing/scripts/generate-miniapp-entries.mjs`. Marketing proof assets live in `marketing/public/apps/`.

### Flagship set

The first flagship set is:

1. Directed Campaign Kit: turn a product image into a campaign that can be revised.
2. Product Reshoot: relight a product for a seasonal campaign.
3. Product Shot Video: turn a product photo into a moving shot.
4. Ad Maker: develop ad copy and a campaign image.
5. UGC Product Video: make a product video with captions.
6. Scene Builder: approve a scene, then animate it.

Film Studio and Multi-Shot Video remain candidates for a second wave. They should not lead until they show a real assembled film, an editable project, and a meaningful revision.

## User Stories

### Production team lead

I want to find a job that resembles the work my team repeats, so I can judge NodeTool by a relevant finished result rather than by a generic demo screen.

**Acceptance:** The catalogue presents curated job groups, finished result media, accurate prerequisites, and a clear route to the relevant app.

### Creative operator

I want to understand what I provide, what the app changes, and what I can take forward, so I can decide whether the workflow fits my brief.

**Acceptance:** Each flagship detail page shows inputs, the actual operation, deliverables, provider requirements, and the next action in that order.

### Returning creator

I want to know whether I can revise a result instead of starting over, so I can assess the app as part of a production process.

**Acceptance:** Flagship entries show a real revision or reuse path. Claims about editability are backed by a reopened project or an equivalent recorded run.

### Marketing maintainer

I want the catalogue to make evidence requirements explicit, so weak or incomplete apps do not become prominent by accident.

**Acceptance:** Catalogue data records role, job title, proof assets, provenance, prerequisites, and publication status. Incomplete entries cannot render as flagships.

## Implementation Decisions

### D1. Use an authored catalogue manifest alongside generated app metadata

Keep generated metadata for functional facts such as inputs, outputs, widget count, and source preview. Add an authored marketing manifest for selection, ordering, job language, evidence, role, prerequisites, and next actions.

The authored manifest is the source of truth for public prominence. Automatic sorting by `featured`, `indexable`, or name must not decide the marketing hierarchy.

### D2. Define publication roles and evidence gates

Use explicit roles such as `flagship`, `supporting`, `secondary`, and `hold`. A public entry must identify its evidence state.

An entry may be `supporting` only when it has:

- A result attributable to the workflow or a clearly labelled imported example.
- A matching input or source reference.
- Accurate provider and prerequisite information.
- A reviewed run record or an explicit limitation in the copy.

A `flagship` entry additionally needs:

- A result that is central to the job.
- A readable app capture.
- Evidence of revision, reuse, or an editable project when the page claims it.
- Review for product identity, continuity, caption accuracy, and export usability where relevant.

Imported or supplied media must be labelled as such. It must not be presented as proof of an end-to-end NodeTool run until provenance is confirmed.

### D3. Make the catalogue result-first

The hub card should show the job, the strongest result, and the next action. It should not use a fixed top crop that favours empty forms. Preserve portrait and landscape media proportions when they carry meaning.

The detail page should progress through:

1. Finished result and job statement.
2. Inputs and prerequisites.
3. What the app does.
4. Deliverables and formats.
5. Revision or reuse evidence.
6. Workflow detail and invitation to customize.

Use “View app” for an information page, “Open in Studio” only when the action works, and “Download Studio” for acquisition.

### D4. Organize around production jobs

Use job groups that match the target team's work:

- Make campaign assets.
- Reshoot products.
- Make video.
- Add localization only when the catalogue has evidence strong enough to support it.

The homepage strip should use the same job language and link to the curated catalogue. It should not independently promote a different set of examples.

### D5. Use specific, honest copy

Replace broad claims and generic labels with verb-led jobs. Avoid decorative emoji headings, blanket “no settings” claims, credit language, and hype-oriented names such as “Viral Ad Engine.” Use terms from the product vocabulary: Studio, agent, project, and workflow.

The proposed catalogue introduction is:

> Creative apps for work you make again.

> Make product imagery, campaign assets, and video in NodeTool. Start with a ready-made app, then adapt the workflow to your next brief.

### D6. Build one complete proof route before expanding

Directed Campaign Kit is the first end-to-end proof route. It should show the source product image, chosen direction, accepted hero, coordinated formats, a revision, a saved project, and a reopened edit.

The remaining flagship entries can use the same evidence pattern. Their promotion should wait when the result, provenance, or revision evidence is missing.

### D7. Improve the flagship apps before publishing them

The six flagship apps are not only marketing subjects. Each must earn its place through a focused product pass. The work should improve the app experience without turning into a broad platform rewrite.

Each flagship app should have:

- A specific production job and a verb-led name.
- Inputs that reflect a real brief rather than a toy form.
- Branded or believable sample data and media.
- A visible, useful result state with no placeholder output in the reviewed path.
- Controls for the decisions a production team actually needs to make.
- A clear handoff, export, or saved project state.
- A revision or reuse path where the job requires it.
- Honest provider, model, and prerequisite information.

The first app-quality pass should focus on Directed Campaign Kit, Product Reshoot, Product Shot Video, Ad Maker, UGC Product Video, and Scene Builder. Simpler utilities can remain supporting entries until they meet the same evidence standard.

### D8. Keep broad runtime and app-builder changes out of the first pass

This work does not redesign the App Builder, workflow runtime, provider integrations, or app execution model. It can update the selected app definitions, sample inputs, result states, and workflow configuration needed to make the flagship jobs credible. Broader platform changes may become follow-up work if the proof route exposes product gaps.

## Testing Decisions

The implementation is complete only when the catalogue can enforce its own publishing rules.

- Add data validation for role, job group, evidence state, proof assets, prerequisites, and next action.
- Fail or exclude entries that claim flagship status without the required evidence.
- Verify that held entries and entries without approved proof do not appear in the primary catalogue route.
- Verify that public copy does not reintroduce banned or misleading terms such as credits, “no settings,” or unverified end-to-end claims.
- Add browser coverage for the hub, one flagship detail page, one supporting entry, and one held entry.
- Check desktop and mobile composition, image cropping, result visibility, heading hierarchy, keyboard access, and accessible names.
- Manually review the six flagship proof bundles for attribution, product identity, continuity, caption accuracy, and export usability.
- Measure result view to app open, app open to completed run, and subsequent reuse or revision. Keep download conversion as a secondary measure.

## Out of Scope

- Rebuilding the underlying apps or their workflow graphs.
- Redesigning the App Builder or the NodeTool Studio workspace.
- Publishing unverified claims about cost, duration, provider performance, or customer outcomes.
- Adding new catalogue categories before the current flagship set has proof.
- Keeping research, meeting, document, and data examples in the primary creative catalogue solely to increase entry count.
- Replacing the existing brand system before evidence and hierarchy are corrected.

## Further Notes

The catalogue should be treated as a product proof surface, not a complete inventory of every example in the repository. A smaller set of credible, revisable workflows is more useful to the target audience than a larger set of shallow demos.

The generator should continue to own facts derived from app-preview files. The authored manifest should own editorial decisions. The boundary between the two should remain visible in code so a regenerated file cannot silently undo catalogue curation.
