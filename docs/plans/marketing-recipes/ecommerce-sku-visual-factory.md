# D3. Product catalogue assets: asset production plan

## SKU0. Assignment

Read [MASTERPLAN.md](MASTERPLAN.md) first. Produce the asset package for `ecommerce-sku-visual-factory` when dispatched. Do not edit the marketing pages or run the old workflow-based sample renderer.

You own the shared product reference used by this recipe and [D1 Product ad variants](viral-video-ad-engine.md). Release that reference early, after the required source review, so D1 can proceed independently. Continue your own production after the handoff.

Read `.claude/skills/product-commercial/SKILL.md` and `.claude/skills/launch-kit/SKILL.md` after storyboard-core. Use a stills-first commercial board, animate only the selected motion shot, and keep the product the same across the entire set.

The required result is one fictional SKU shown as an original source, transparent cutout, clean studio scene, seasonal scene, motion-ready still and clip, print-size image, and listing copy. The guided demonstration centers on **Storyboard / Commercial / Entities / Look**. Cutout, upscale and copy production are explicitly identified as preparation or finishing outside that guide.

Owner directories: `<run-root>/ecommerce-sku-visual-factory/` and `<run-root>/shared/product/`.

## SKU1. Capability check before production

| ID | Required capability | Proof to collect |
| --- | --- | --- |
| SKU-P1 | Generate an original unbranded product reference | Connected image model and a supported native image size |
| SKU-P2 | Create an entity from the accepted asset | Callable entity operation and successful returned ID |
| SKU-P3 | Generate stills conditioned on the entity image | Reference-capable image model, actual reference passed to generation |
| SKU-P4 | Produce a true transparent cutout | Supported background-removal/editor/media operation that returns an alpha channel |
| SKU-P5 | Animate a selected still | Image-to-video path available on the storyboard |
| SKU-P6 | Upscale the accepted image | Supported image-editor/agent media operation and actual output dimensions |
| SKU-P7 | Capture the guided flow and export board assets | Actual screens and Download ZIP or equivalent verified export |

Do not represent a white-background image as a transparent PNG. Do not create a node graph when a direct operation is missing. Record the unavailable item, produce unaffected work, and leave the package partial until the required result is available or the user accepts a reduced scope.

## SKU2. Generate and release the shared product reference

The default is a synthetic, unbranded demonstration object. If the execution instruction supplies a real product, stop using the default and make that supplied photo authoritative. Preserve its actual labels, geometry, and source attribution.

Reference-generation prompt:

```text
Studio reference photograph of one unbranded travel cup. Matte muted-olive
cylindrical body, subtly tapering toward a narrower base. A flat charcoal lid
with a single small rectangular drinking opening near the front rim. No handle.
No logo, lettering, measurement marks, badges, patterns, decorative ridges,
or extra accessories. Front three-quarter view at product height, the whole
cup including lid and base visible, occupying roughly two thirds of the
frame height. Plain very light gray background, soft even studio lighting,
small natural contact shadow, accurate straight geometry, sharp product edges.
Photographic realism. One object only.
```

| ID | Action | Required result |
| --- | --- | --- |
| SKU-R1 | Discover a connected model and generate a reference at its supported size, preferably at least 2048 px on the long edge | Original provider file and generation record |
| SKU-R2 | Inspect the object at full size | One lid, one opening, clean body, consistent taper, no illegible pseudo-brand marks |
| SKU-R3 | If needed, perform a targeted retry naming the defect | Accepted source plus rejected attempts retained in generation history |
| SKU-R4 | Create a product entity named `Olive Travel Cup` from the accepted image | Entity ID and exported metadata |
| SKU-R5 | Record the descriptor from the actual accepted image | Geometry and finish only. Do not add inferred specifications |
| SKU-R6 | Export the source package to the shared directory and notify the coordinator/D1 | Stable paths, checksums, entity ID/export, source status and review record |

Descriptor starting point, to be corrected to the actual accepted reference:

```text
Unbranded travel cup with a matte muted-olive body that narrows slightly toward
the base, and a flat charcoal lid with one small rectangular drinking opening.
No handle, lettering or decorations. Preserve the body proportions, lid shape,
opening orientation and matte finish from the reference image.
```

Required shared files:

| ID | Path under `shared/product/` | Content |
| --- | --- | --- |
| SKU-SH1 | `product-reference.<original-extension>` | Accepted full-quality original |
| SKU-SH2 | `product-reference.webp` | Viewable derivative, not a replacement for the original |
| SKU-SH3 | `product-entity.json` | Entity metadata and source asset ID |
| SKU-SH4 | `product-descriptor.txt` | Canonical accepted descriptor |
| SKU-SH5 | `source-manifest.json` | Hash, origin, provider/model, prompt path, review and version |
| SKU-SH6 | `product-cutout.png` | Add after its alpha inspection. D1 need not wait for this optional input |

A later change to the accepted reference requires a new source revision and notice to D1. Never replace the bytes under the accepted filename while another agent is using them.

## SKU3. Source cutout

Use the accepted source file as input to a supported background-removal operation. Preserve the source object and natural edge detail. The output must have a meaningful alpha channel, not a baked-in checkerboard or a white matte.

Inspect the cutout against light gray, charcoal, and a saturated diagnostic background. Look for missing lid corners, erased dark details, olive halos, jagged edges and residual background inside the drinking opening. Preserve the original source separately. A contact shadow may be delivered separately, but cannot obscure whether the object cutout has real transparency.

Save a diagnostic comparison sheet and machine-readable alpha inspection: image mode, dimensions, count or proportion of fully transparent pixels, partially transparent edge pixels, and opaque interior pixels. Check a known interior area as well as corners. An image with every pixel transparent must fail.

This is source preparation. The later storyboard guide should not show a fake background-removal step.

## SKU4. Commercial board direction

Use one square board with three still treatments. All three shots use the same accepted product entity. No character, generated brand label, or spoken script is needed for this recipe.

Board style:

```text
Photographic catalogue imagery of Olive Travel Cup. Faithful product geometry,
matte muted-olive body and charcoal lid, clear edges, controlled commercial
lighting, restrained neutral surroundings, no additional branding or text.
The product is the subject in every frame. No hands or people. Treat the source
image as the authority for the cup, lid and finish. Scene-specific lighting
is specified in each shot.
```

| Shot ID | Purpose | Action for the still | Motion instruction |
| --- | --- | --- | --- |
| SKU-S1 | Clean studio scene and print master source | Olive Travel Cup centered on a pale limestone plinth against a warm light-gray sweep. Front three-quarter view matching the reference. Entire lid and base visible. Broad soft key from upper left, neutral fill, precise contact shadow. No props. | Stills-only. Do not buy a video for this shot |
| SKU-S2 | Seasonal campaign scene | Olive Travel Cup on the same pale limestone plinth and from the same camera height. Low winter sunlight from the left makes a longer soft shadow. Cool pale background, one blurred bare branch far behind the cup. Product color, lid and geometry stay consistent with the reference. No snow on the product and no festive logos. | Stills-only. Do not buy a video for this shot |
| SKU-S3 | Motion-ready product hero | Olive Travel Cup on an uncluttered neutral studio surface. Three-quarter front view, room around the full silhouette, soft key with readable lid detail, no other props. Match the accepted source proportions. | A slow 30-degree camera arc around the stationary cup over approximately 6 seconds. The cup, lid and opening remain rigid. No full spin, opening lid, liquid, floating or morphing |

Call the motion asset a short product motion clip in handoff copy. Do not claim a full 360-degree turntable or accurate unseen backside reconstruction. This preserves a simple demonstration with a checkable reference.

The final still targets are 2048×2048 or the highest practical native square resolution supported by the chosen model. The print derivative target is 4096×4096 from SKU-S1. Label it as upscaled, not native capture or proof of print color accuracy.

## SKU5. Guided-flow steps and screenshots

| Capture ID | Actual surface | Action and content to capture |
| --- | --- | --- |
| SKU-C0 | Source preparation | Original and accepted alpha cutout, clearly labeled as preparation |
| SKU-C1 | Storyboard → Idea | Enter the brief below, click Continue |
| SKU-C2 | Story choices | Select Commercial and 3 shots, show Generate screenplay |
| SKU-C3 | Story review | Three shots matching SKU4. Edit away any invented product claims or dialogue, then click Set up entities |
| SKU-C4 | Entities | Select Olive Travel Cup. Show its reference and explicit assignment to the three shots |
| SKU-C5 | Look | Choose 1:1, controlled photographic styling and a reference-capable still model. Show the estimate and Generate your storyboard |
| SKU-C6 | Board | Three finished stills. Open one and compare its product detail to the reference |
| SKU-C7 | Shot inspector | Select SKU-S3 and generate its clip. Do not run Render clips for all three shots |
| SKU-C8 | Editor/agent finishing | Real upscaling operation on SKU-S1 and the measured 4096 px result |
| SKU-C9 | Agent/text document | Listing draft using supplied visual facts and explicitly unknown specifications |
| SKU-C10 | Board/export | Download ZIP and show the organized output set |

Brief for SKU-C1:

```text
Create three square catalogue images of Olive Travel Cup: a clean studio hero
on a pale stone plinth, a winter-light version in the same setting, and an
uncluttered three-quarter product view for a short motion clip. Use the product
reference I will select in Entities. Keep its geometry, olive body and charcoal
lid consistent. No people, logos, lettering, invented features, or dialogue.
```

Do not use the Image guide's Product shot card as proof of source-preserving edits. Its text-generation path is a different capability. Do not capture the Image to video action, which leads to a node canvas.

## SKU6. Production sequence

| ID | Action | Review before continuing |
| --- | --- | --- |
| SKU-G1 | Produce and release the source package | Reference passes SKU2, hash/version frozen |
| SKU-G2 | Produce the real alpha cutout | Composite against three backgrounds and inspect edges |
| SKU-G3 | Complete the actual Storyboard guide and capture its stages | Three shots, correct entity and no unnecessary dialogue |
| SKU-G4 | Render the three stills | Side-by-side comparison against the original. Reject duplicate lids, changed opening, new handle, stretched proportions or materially shifted color |
| SKU-G5 | Render only SKU-S3's motion | Inspect the whole clip. A short camera arc must not reveal inconsistent new geometry |
| SKU-G6 | Upscale accepted SKU-S1 | Verify actual dimensions and compare edges/texture to the original selected still. Do not upscale an unaccepted take |
| SKU-G7 | Write listing copy in a saved text document | Use the fact sheet below. Do not infer technical specifications from appearance |
| SKU-G8 | Export and compose the output overview | Each tile points to the actual asset ID and file |
| SKU-G9 | Record and edit the demonstration | Guide remains central. Preparation and finishing receive their own captions |

Retry only the defective asset within the master plan's iteration rules. A newly selected still invalidates any clip or upscale derived from the older take. Update the dependency map and regenerate only those dependent outputs when needed.

## SKU7. Listing copy and source facts

Create `documents/product-facts.md` and `documents/listing-copy.md`. The latter contains a short title, a one-paragraph description, three visual feature bullets, and a separate list of facts that would need the merchant's input.

Permitted facts:

| Fact ID | Fact |
| --- | --- |
| SKU-F1 | Product is an unbranded fictional travel cup for this demonstration |
| SKU-F2 | Visible body color is muted olive |
| SKU-F3 | Visible lid is charcoal and has a rectangular drinking opening |
| SKU-F4 | The photographed design has no handle or visible lettering |

Unknown facts include capacity, exact materials, insulation performance, leak resistance, dishwasher/microwave compatibility, dimensions, weight, certifications, price, warranty and availability. Put those in a merchant-input section. Do not turn plausible assumptions into product benefits.

Suggested title: `Olive travel cup with charcoal lid`.

Suggested description:

```text
A muted-olive cup with a clean tapered shape and a charcoal lid. The unbranded
design keeps the focus on its simple silhouette and contrasting finish.
```

The agent may improve the phrasing while preserving the factual limits. This copy is an output example, not a live listing.

## SKU8. Required deliverables

| Asset ID | Path or family | Requirements |
| --- | --- | --- |
| SKU-A1 | Shared files SKU-SH1–SKU-SH6 | Accepted source package and later alpha cutout |
| SKU-A2 | `sources/product-original.<ext>`, `product-cutout.png` | Recipe-local source copy or manifest link to immutable shared bytes |
| SKU-A3 | `documents/production-board.json`, `product-entity.json` | Real document exports and exact source reference |
| SKU-A4 | `selects/studio-hero.png`, `winter-scene.png`, `motion-hero.png` | Three selected stills at original resolution |
| SKU-A5 | `masters/product-motion.mp4` | Accepted 5–8-second square motion clip, native source retained |
| SKU-A6 | `web/product-motion.mp4`, `.webm`, `product-motion-poster.webp` | Silent web delivery with no audio track |
| SKU-A7 | `masters/studio-hero-print-4096.png` | Actual 4096×4096 upscaled output, with source ID and upscale settings |
| SKU-A8 | `documents/product-facts.md`, `listing-copy.md` | Reviewed copy and explicit unknowns |
| SKU-A9 | `web/studio-hero.webp`, `winter-scene.webp`, `motion-hero.webp` and 960 px derivatives | Page-ready stills |
| SKU-A10 | `web/source-to-set.webp` | Labeled source, cutout, studio, seasonal, motion still, and print detail |
| SKU-A11 | `web/seasonal-comparison.webp` | Accepted studio and seasonal images with consistent presentation |
| SKU-A12 | `web/recipe-card.webp`, `social-preview.webp` | Real-output compositions at common master-plan sizes |
| SKU-A13 | `captures/steps/sku-c0` through `sku-c10` | Full capture sequence, original PNG and WebP derivatives |
| SKU-A14 | `captures/walkthrough/catalogue-guided-flow.mp4`, `.webm`, `.vtt`, `poster.webp` | 40–60-second demonstration |
| SKU-A15 | `evidence/alpha-report.json`, `alpha-backgrounds.webp`, `product-consistency.webp`, `print-detail.webp` | Checks that can be independently inspected |
| SKU-A16 | `masters/catalogue-assets.zip` | Actual production outputs and listing text, plus a readable contents file |

Include the common manifest, capture log, handoff and QA files. Record that the product and scenes are synthetic. Avoid a claim that source pixels stayed unchanged during generative scene treatment.

## SKU9. Walkthrough edit

| Segment | Approximate time | Picture | Caption |
| --- | --- | --- | --- |
| SKU-W1 | 0–5 s | Whole output set | One product reference, several treatments. |
| SKU-W2 | 5–10 s | Source photo and cutout | Prepare the product reference. |
| SKU-W3 | 10–16 s | Idea and Commercial selection | Describe the images you need. |
| SKU-W4 | 16–23 s | Actual three-shot review | Review each treatment before rendering. |
| SKU-W5 | 23–30 s | Entities stage | Choose the same product for every shot. |
| SKU-W6 | 30–38 s | Look and finished still board | Set the look. Compare the results. |
| SKU-W7 | 38–46 s | One selected shot animated | Add motion to one selected image. |
| SKU-W8 | 46–55 s | Upscale, copy document, export set | Finish the print image and listing copy. |

The short opening source sequence and final finishing sequence must be identified as work outside setup. Do not make a fake five-click catalogue wizard by removing required screens from the record.

## SKU10. Acceptance and handoff

| Check ID | Pass condition |
| --- | --- |
| SKU-Q1 | Shared reference is accepted, versioned, and usable by D1 without new image generation |
| SKU-Q2 | Cutout has real alpha and passes transparent-corner, opaque-interior and edge-background checks |
| SKU-Q3 | Selected stills preserve recognizable product geometry and contain no invented labels, logos or features |
| SKU-Q4 | Seasonal change affects the scene and light without an unexplained change of product |
| SKU-Q5 | Motion clip stays coherent over its full duration and has no unexpected audio |
| SKU-Q6 | Print derivative measures 4096×4096, is labeled upscaled, and has no new artifacts that make it worse than the source |
| SKU-Q7 | Listing copy contains only supplied/visible facts and leaves unknown specifications explicit |
| SKU-Q8 | Capture sequence shows the real Entities stage and keeps cutout/upscale/copy outside the guided steps |
| SKU-Q9 | Every SKU-A item exists and the common M11 checks pass |

In `handoff.md`, recommend `studio-hero` as the initial page hero and `source-to-set` as the main proof image unless actual inspection favors another. Provide exact captions for the alpha, seasonal, motion and print comparisons. Document any remaining limitation before a page agent uses the assets.

## SKU11. Ready-to-dispatch task

```text
Produce D3 Product catalogue assets using the master plan and this recipe plan.
First generate and review the shared unbranded Olive Travel Cup reference,
create its entity, and release its immutable source package to D1. Then create
the cutout, three commercial storyboard stills, one motion clip, a 4096 px
print derivative, factual listing copy, real guided-flow captures, web
deliveries and evidence. Use the actual Storyboard Commercial flow. Identify
preparation and finishing outside it. Do not create node graphs, invent SKU
specifications, change the shared reference silently, or build marketing pages.
Honor the coordinator's execution authorization and finish with the asset handoff.
```
