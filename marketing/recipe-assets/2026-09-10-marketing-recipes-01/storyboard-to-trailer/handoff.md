# The Next Tide asset handoff

Package: /Users/mg/workspace/nodetool/marketing/recipe-assets/2026-09-10-marketing-recipes-01/storyboard-to-trailer

Status: partial. Do not publish or describe this package as a finished trailer.

## Reopen and document map

- Project efe9670e9d0b482fb2204089e4f32570, named Marketing recipes / storyboard-to-trailer / 2026-09-10-marketing-recipes-01.
- Storyboard 1420c5e4701a4269ba362c384813c2ec.
- Storyboard-linked script 2c8e71acd4ec4deaacec2cfb12c218a6.
- Voiced production script 69f547a6ec254068b417d6891c346530. It is not linked to the board.
- Local evidence: documents/brief.md, screenplay-reviewed.json, entities.json, entity-descriptors.md, voiceover.txt and shot-line-map.json.
- No accepted hero candidate, playable preview, timeline, or timeline take map exists.

The recipe-page recapture uses the original FAL keyframes: TR-S1 5bb892c8451b4112a11050f7c48828c7; TR-S2 88ac486fbc034e739f3caf0a7ee15187; TR-S3 9dc50d939de94fc9a46d102a447e048a; TR-S4 43375d2cb021491eb8b3b94b83cf1269; TR-S5 ff8e7d66c1f347c38674d64c6bb59a8d; TR-S6 2f8d02bef32c4406a480086ae4455be0. The later `*-selected-repaired` rows were rejected for this capture because their stored bytes did not match the trailer board.

## Asset-role map and suggested copy

- sources/entities/elin.jpg: character reference. Alt: “Portrait reference for Elin, a lighthouse keeper with short dark hair and a calm expression.”
- sources/entities/lighthouse.jpg: exterior reference. Alt: “Weathered white lighthouse and keeper's cottage on a blue-hour headland.”
- sources/entities/keepers-room.jpg: interior reference. Alt: “Stone-walled keeper's room with a wooden table, amber lamp, and twilight window.”
- sources/entities/message-bottle.jpg: prop reference. Alt: “Weathered clear bottle with a folded cream note and simple cork.”
- captures/raw/tr-c0.png through tr-c6.png: guided-flow evidence. Caption: “The Storyboard guide moves from a mystery brief through reviewed shots, reusable entities, a fixed look, and a six-frame board.”

Synopsis: A lighthouse keeper discovers a message from forty years in the future written in her own hand.

Safe page claim: “The Storyboard flow created a six-shot mystery board with reusable character, location, and prop references.” Do not claim completed animation, score, timeline, trailer or exports.

## Capture order and procedure

Use TR-C0, TR-C1, TR-C2, TR-C3-DRAFT, TR-C3, TR-C3-LOWER, TR-C4, TR-C5, TR-C6. Recipe-page captures TR-C1 through TR-C6 were recaptured from the live UI at a 1600×1000 viewport and 2× device pixel ratio, producing lossless 3200×2000 PNGs. TR-C0, TR-C3-DRAFT, and TR-C3-LOWER remain the legacy supplied captures. Preserve readable holds on Story review and Entities. TR-C6 omits generation waiting. Reuse only the stage pacing and framing, not this recipe's content.

## Generation totals

- Four FAL Seedream entity references completed at $0.04 USD each, $0.16 USD total.
- Three FAL Kokoro af_sarah voice takes completed: ff9d48e935224c7b83a62521ade9a362 (2.225 s), dd027f95956e4eaca17ec856454c865f (2.900 s), e2cd177694fa48beb28bbbb47b438e01 (2.575 s). Cost is unknown, not zero.
- Six initial and six recovery FAL Kling operations failed before provider job creation. Call/job IDs and cost are null.
- One FAL Beatoven request remains unresolved with no durable call/job/output/cost record. No recovery request was submitted before the CLI crashed.

## Exact recovery

1. Fix renderer storage/URI handling. Prove one repaired keyframe can pass renderer readback without spending, then render the six missing clips sequentially.
2. Export the six selected stills/clips to selects/ and probe dimensions, duration and frame rate.
3. Export the accepted voice takes. Reconcile Beatoven provider-side, then submit one recovery only if the original did not complete.
4. Link or copy accepted takes to the storyboard-linked script without regenerating them.
5. Assemble at 24 fps with six picture clips, separate voice/music tracks, muted shot audio and a two-second editable THE NEXT TIDE title. Trim to exactly 40 seconds and validate.
6. Export and probe masters, web files, posters, proof derivatives, TR-C7 through TR-C11 and the walkthrough.

No marketing page work is authorized until the completed package or an explicit reduced outcome is accepted.
