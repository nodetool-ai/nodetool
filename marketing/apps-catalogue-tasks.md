# Apps Catalogue Tasks

**Companion plan:** [Apps Catalogue Strategy and Implementation Plan](apps-catalogue-plan.md)
**Status:** In progress, Phase 1 app quality

Tasks are ordered by dependency. Each task should leave a verifiable result that can be reviewed in the marketing site.

## Phase 0: Curation and proof ledger

### A1. Add the authored catalogue manifest

**Blocked by:** None
**Output:** A typed marketing manifest next to the generated mini-app data.

- [ ] Define publication role, job group, public job title, order, evidence state, prerequisites, next action, proof assets, and provenance fields.
- [ ] Preserve generated app facts as generated data. Do not hand-edit the generated file.
- [ ] Add validation for required fields by role.
- [ ] Make the hub and detail pages read editorial prominence from the manifest.

### A2. Classify the current app inventory

**Blocked by:** A1
**Output:** Every current entry has an explicit destination and publication status.

- [ ] Assign each entry to `flagship`, `supporting`, `secondary`, or `hold`.
- [ ] Assign a job group or record why the entry belongs outside the primary creative catalogue.
- [ ] Remove Study Buddy, Dataset Builder, Model Arena, Ask Your Documents, Research Desk, and Meeting Room from the primary creative route.
- [ ] Hold Dubbing Desk, SKU Factory, Trailer Room, and Viral Ad Engine until evidence and naming are resolved.
- [ ] Review overlap among Brand & Social, Concept Studio, Product Launch Kit, Video Restyle, and AI Spokesperson.
- [ ] Record missing screenshots, missing result media, provenance gaps, and revision gaps.

### A3. Reconcile proof provenance

**Blocked by:** A2
**Output:** A proof ledger that distinguishes NodeTool runs, imported examples, interface previews, and supplied media.

- [ ] Trace each flagship result to its source input and workflow run where available.
- [ ] Resolve the provenance of the UGC Product Video supplied MP4 before presenting it as an end-to-end run.
- [ ] Mark unsupported claims as limitations instead of filling gaps with generic copy.
- [ ] Record measured duration, dimensions, elapsed time, and cost only when those values are available from a run record.

## Phase 1: Flagship app quality

### A4. Upgrade the six flagship apps

**Blocked by:** A2
**Output:** Production-quality app paths ready for proof capture.

- [x] Review Directed Campaign Kit, Product Reshoot, Product Shot Video, Ad Maker, UGC Product Video, and Scene Builder in the actual app experience.
- [x] Replace toy inputs, generic sample data, and decorative controls with decisions that match a real production brief.
- [ ] Replace empty states, placeholder media, and unloaded players in the reviewed path with useful result states.
- [ ] Add or verify meaningful handoff, export, saved-project, or revision behavior for each job.
- [ ] Use branded or believable sample assets that preserve product identity across the workflow.
- [x] Record provider, model, and prerequisite requirements in the app and catalogue metadata.
- [x] Expose model pickers for every model-backed stage in the six flagship apps.
- [ ] Keep app changes scoped to the selected jobs. Do not redesign the App Builder or workflow runtime in this phase.

## Phase 2: Flagship evidence

### A5. Produce the Directed Campaign Kit proof bundle

**Blocked by:** A3 and A4
**Output:** One complete, reviewable flagship demonstration.

- [ ] Capture the source product image and the selected creative direction.
- [ ] Capture the accepted hero and coordinated campaign formats.
- [ ] Make one meaningful revision and preserve the rest of the project.
- [ ] Save the project, reopen it, and verify that the revision remains editable.
- [ ] Export or record the deliverables used by the marketing page.
- [ ] Review the bundle for attribution, product identity, continuity, and export usability.

### A6. Produce the remaining flagship proof bundles

**Blocked by:** A3 and A4
**Output:** Reviewed proof media for Product Reshoot, Product Shot Video, Ad Maker, UGC Product Video, and Scene Builder.

- [ ] Show a matching source and result for Product Reshoot.
- [ ] Show product geometry and a reviewed moving shot for Product Shot Video.
- [ ] Show a saved brief, campaign image, and run provenance for Ad Maker.
- [ ] Show actual caption and finishing stages for UGC Product Video, or label the example as supplied media.
- [ ] Show an approved still and the corresponding moving shot for Scene Builder.
- [ ] Keep Film Studio and Multi-Shot Video in the second wave until their assembled, editable proof is complete.

## Phase 3: Catalogue and homepage experience

### A7. Redesign the `/apps` hub around jobs and results

**Blocked by:** A1, A2, and A5
**Output:** A curated hub with a clear primary route.

- [ ] Replace the generic “AI mini apps anyone can use” framing with the approved result-first introduction.
- [ ] Render the flagship set first, grouped by production job.
- [ ] Use result media for discovery and readable interface captures for explanation.
- [ ] Remove the fixed top crop where it hides the useful part of the result.
- [ ] Use accurate action labels: “View app,” “Open in Studio,” or “Download Studio.”
- [ ] Keep supporting and secondary entries discoverable without giving them flagship prominence.

### A8. Align the homepage app strip

**Blocked by:** A1 and A2
**Output:** The homepage promotes the same curated jobs as `/apps`.

- [ ] Source cards and ordering from the authored catalogue manifest.
- [ ] Use verb-led job names rather than generic app names.
- [ ] Link each card to the relevant curated detail page.
- [ ] Confirm the strip does not promote held entries or unverified results.

### A9. Rebuild flagship detail pages

**Blocked by:** A5, A6, A7, and A8
**Output:** Result-first detail pages for the flagship set.

- [ ] Lead with the finished result and job statement.
- [ ] Show inputs and provider requirements before the action button.
- [ ] Explain the actual operation and deliverables instead of repeating generic steps.
- [ ] Show revision or reuse evidence when the entry claims it.
- [ ] Move workflow graph detail below the proof and use it to invite customization.
- [ ] Label imported, supplied, and interface-preview media accurately.

## Phase 4: Quality gates and measurement

### A10. Add catalogue publishing checks

**Blocked by:** A1, A2, and A4
**Output:** Automated checks that protect the editorial rules.

- [ ] Assert that no flagship entry lacks required proof fields.
- [ ] Assert that held entries do not render in the primary hub route.
- [ ] Assert that generated metadata and authored editorial metadata remain separate.
- [ ] Assert that public catalogue copy does not contain credit language, unverified “no settings” claims, or retired hype names.
- [ ] Add regression coverage for missing screenshots and missing result media.

### A11. Add browser and accessibility coverage

**Blocked by:** A7 and A9
**Output:** Browser checks for the hub and detail experience.

- [ ] Test the `/apps` hub on desktop and mobile widths.
- [ ] Test one flagship, one supporting, and one held entry.
- [ ] Verify result media, action labels, heading hierarchy, keyboard access, and accessible names.
- [ ] Verify that portrait and landscape proof assets remain legible and are not cropped into empty states.

### A12. Measure the new proof funnel

**Blocked by:** A7 and A9
**Output:** A baseline for whether the catalogue drives qualified use.

- [ ] Measure result view to app open.
- [ ] Measure app open to completed run.
- [ ] Measure subsequent reuse or revision.
- [ ] Keep download conversion as a secondary measure.
- [ ] Review the first results before expanding the flagship set.
