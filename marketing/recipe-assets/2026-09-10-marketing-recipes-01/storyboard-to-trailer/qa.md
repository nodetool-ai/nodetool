# D4 QA

Status: partial. The package is not ready for review or page use.

## Common verification

- V1: fail. Four entity references and ten raw captures decode and are hashed. Selected-still exports, clips, local voice/score files, timeline, masters, web derivatives, walkthrough and evidence files are absent.
- V2: partial. Project, storyboard, script, entity and shot IDs are recorded. No timeline or final-picture provenance exists.
- V3: partial. Raw TR-C0 through TR-C6 captures follow the actual guided setup flow. TR-C7 through TR-C11 are missing. See capture-log.json.
- V4: blocked. No assembled film exists to watch or hear.
- V5: partial. Entity references were inspected at 4096×2304. No full-size selected-still continuity review export exists.
- V6: partial. The exact lines and accepted FAL Kokoro take IDs are recorded. No local audio, subtitle cues or final transcript check exists.
- V7: partial. Canonical documents remain reopenable by ID but have no truthful local exports. No timeline exists to validate.
- V8: blocked. No master or page-use derivative exists.
- V9: pass for the single safe setup claim in asset-manifest.json; the completed-trailer claim is explicitly unsafe.
- V10: pass for available captures. No node graph appears in TR-C0 through TR-C6. The missing walkthrough cannot be checked.

## Recipe checks

- TR-Q1: partial. Six stills express the sequence on the canonical board, but no motion cut exists.
- TR-Q2: pass at document level. Explicit exterior/interior entity assignments match the recipe map.
- TR-Q3: pending. No exported full-size selected-still comparison exists.
- TR-Q4: blocked. Six original and six exact-byte-reimport Kling attempts failed before provider job creation.
- TR-Q5: partial. The three exact lines were voiced with FAL Kokoro af_sarah. No final mix exists and the voiced script is not linked to the board.
- TR-Q6: blocked. No timeline, title card or 40-second export exists.
- TR-Q7: blocked. The Beatoven request is unresolved and has no durable job, output or cost record.
- TR-Q8: partial. Real setup captures include Idea, Story selection/review, Entities, Look and the six-still board. Editor/finishing captures are missing.
- TR-Q9: fail. TR-A3 through TR-A17 remain incomplete as detailed in the manifest.

## Recovery evidence

The CLI recovery copied the exact selected-still bytes into new NodeTool assets and selected them: TR-S1 84964523369a46129d4f03519b53300c; TR-S2 f616fa0ddd3542c38c48c5caf91c5bc0; TR-S3 c77d52a608b144db969d26f5fc29a8bb; TR-S4 9255e1466ad1428e82e9e180c44e3cd2; TR-S5 ec85bd3ec03a468391da2d70637b2886; TR-S6 e5cd97d4c44f487f81bc5c74557933d5.

Direct asset readback succeeded. The renderer still rejected each repaired asset before FAL submission. No clip generation/job ID or spend record was created. The CLI later terminated with a Node heap out-of-memory error while testing another storage alias. No node graph or marketing page was created.
