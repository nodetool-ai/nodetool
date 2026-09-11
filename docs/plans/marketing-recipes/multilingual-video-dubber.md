# D2. Multilingual video: asset production plan

## DU0. Assignment

Read [MASTERPLAN.md](MASTERPLAN.md) first. When dispatched, produce the asset package for `multilingual-video-dubber`. Do not change the marketing page, product UI, or old recipe generator.

Produce an English presenter source clip, a reviewed Spanish translation and back-translation, editable source and target scripts, voiced Spanish lines, timed subtitles, a Spanish voiceover cut, and a lip-synced Spanish cut. The comparison must use the same source presenter footage. Capture the real Script guided flow for the translated words and identify transcription, translation, and lip sync as separate work.

Read `.claude/skills/script-video/SKILL.md` after storyboard-core. This recipe works on existing picture. Do not derive a new storyboard from the translated script or generate replacement scenes and call that dubbing. Source preparation may use a small storyboard to create the synthetic demonstration footage, but that is recorded as preparation and is not the main recipe walkthrough.

Owner directory: `<run-root>/multilingual-video-dubber/`. This task has no dependency on D1 or D3.

## DU1. Validate the complete route early

Lip sync is a required output for the existing recipe promise. It is not a verified step of Script setup. Test the available route before spending on a long source or final voice set.

| ID | Capability | Required confirmation |
| --- | --- | --- |
| DU-P1 | Presenter source | A supplied, reusable clip or a connected way to generate an original synthetic source |
| DU-P2 | Transcription | Actual audio extraction/transcription operation and returned transcript |
| DU-P3 | Script import | TXT or SRT/VTT import preserves text and speaker/cue structure on the execution revision |
| DU-P4 | Spanish speech | Actual Spanish-capable voice and readable output from a short audition |
| DU-P5 | Lip sync | A callable NodeTool agent/media/editor operation accepts the source video and target audio or supported equivalent inputs |
| DU-P6 | Audio/timeline finishing | Supported import, mute/replace source speech, align new audio, add captions, export video |
| DU-P7 | Guided capture | Real Script screens and the correct edition's finishing controls are available |

Discover the actual tool/model schema for lip sync. Do not assume `find_model` has a `lip_sync` capability or invent an endpoint. Query the supported model registry/tool descriptions, then inspect the relevant primary provider documentation if needed. Record the selected route and exact input contract.

Run a short pilot through that route with authorized sample media. Compare mouth closure on plosives, sentence starts and stops, jaw stability and face identity. Reuse an accepted pilot segment in the final source if possible. A request ID or completed job without inspected output does not pass this check.

If no direct supported route exists, complete the scripts, target audio, subtitles and voiceover cut. Record the lip-sync output as blocked and leave the package partial. Do not build a graph, hide the mouth, substitute unrelated native-audio video, or silently rename the voiceover version as lip-synced.

## DU2. Source and visual direction

Prefer a source clip explicitly provided for this task. If none is provided, create the following synthetic demonstration. Keep its origin disclosed in the manifest and comparison caption. Do not use a real person's likeness or clone a voice without explicit authorization.

Default presenter: an original adult in their thirties with short dark curly hair, a plain muted-blue crew-neck shirt, and a calm conversational delivery. Chest-up, centered, facing the camera, eyes near the top third, mouth unobscured. Soft neutral studio background, diffuse frontal light, no logos, jewelry, microphone crossing the mouth, hands near the face, or moving background.

Reference prompt:

```text
Photographic casting reference of an original adult presenter in their
thirties, short dark curly hair, plain muted-blue crew-neck shirt, chest-up,
looking toward the camera with a relaxed neutral expression. Soft frontal
studio lighting and an unobtrusive warm-gray background. Face and mouth fully
visible. No microphone, hands near the face, text, logos, or resemblance to a
named person. Natural skin detail, straight-on composition, ordinary speaking
posture rather than a fashion pose.
```

If generated, create an entity named `Demo Presenter` from the selected reference. The face/hair descriptor comes from that reference. Keep wardrobe and lighting fixed throughout source production. The entity is a source-production asset, not a feature of the Script guide.

Source motion: locked camera, small natural head movements, occasional blink, shoulders stable, hands outside the frame. Preserve the full face and mouth. Avoid dramatic gestures that make a dubbing comparison harder to interpret.

Target source length is approximately 24 seconds, 1920×1080, 25 or 30 fps according to the actual source. Use the provider's real supported lengths. If one continuous source is unavailable, create three matching segments with visible straight cuts between complete sentences. Record the segment boundaries and do not call it a single take.

The source may be generated with verified native English speech or built from a silent synthetic presenter performance plus English speech and a verified lip-sync operation. Record that entire preparation chain. The final English source must visibly and audibly speak the English script before it becomes the recipe input.

## DU3. Exact source text and translation draft

Use these lines as the source production script. Speak naturally with brief pauses. The times are planning targets, not provider guarantees or final subtitle timings.

| Line ID | Approximate source window | English source |
| --- | --- | --- |
| DU-L1 | 0–8 s | Start with a short brief. Review the words, choose a voice, and listen before you export. |
| DU-L2 | 8–16 s | When one line needs a change, edit that line and record it again. |
| DU-L3 | 16–24 s | Your script stays editable, so the next version starts from work you already have. |

Spanish target is Spain-oriented neutral Spanish. Use a compatible voice if available. If only another Spanish variety is available, record the choice and adjust any page language accordingly rather than claiming a specific accent.

| Line ID | Spanish working translation | Expected meaning |
| --- | --- | --- |
| DU-L1 | Empieza con una breve descripción. Revisa el texto, elige una voz y escucha el resultado antes de exportarlo. | Start with a brief description, review the text, choose a voice, listen before export |
| DU-L2 | Si necesitas cambiar una frase, edítala y vuelve a grabarla. | Edit and record an individual line again when it needs a change |
| DU-L3 | Tu guion sigue siendo editable, así que la siguiente versión parte del trabajo que ya tienes. | The script remains editable and the next version starts from the existing work |

These translations are production drafts. Review them against the transcribed actual source, which may differ slightly from the prompt. Do not silently substitute the intended script for words the source never spoke.

## DU4. Transcription and translation review

| ID | Action | Required result |
| --- | --- | --- |
| DU-T1 | Export the final English source and extract its actual audio | Original source video, source audio and measured duration |
| DU-T2 | Transcribe the source audio | Machine transcript with timing and model provenance |
| DU-T3 | Listen through and correct the transcript | Reviewed source transcript, cue boundaries and difference notes |
| DU-T4 | Translate the reviewed source line by line | Spanish draft with stable DU-L IDs and speaker mapping |
| DU-T5 | Back-translate in a separate pass that receives the Spanish but not the source wording | Independent English back-translation, prompt/model recorded |
| DU-T6 | Compare source, Spanish and back-translation | Saved review table with meaning, omissions, additions, tone and timing notes |
| DU-T7 | Accept the target wording under the execution review rules | Frozen Spanish import file and source/target hash |

The review document must have these columns: line ID, actual English source, Spanish target, independent back-translation, timing target, reviewer note, and status. Use a normal saved text/table document or generated comparison sheet, not a fabricated native translation UI.

Review the product terms in context: `brief` means a short description, `line` means a script line, and `editable` must remain explicit. Do not add claims about automatic timing, perfect translation, or voice cloning.

Record who reviewed language and pronunciation. An agent check is an agent check. Do not label it native-speaker or human approval without that review having happened.

## DU5. Script guided flow

Create the translated script through the actual guide and capture it. Bring the already translated text into Idea. The Language selector in Voices must not be described as translating the source.

| Capture ID | Screen or surface | What to do and show |
| --- | --- | --- |
| DU-C0 | Source playback | Play the English presenter clip, with a source-language label outside the video |
| DU-C1 | Transcription/review preparation | Show the actual source transcript and corrected words |
| DU-C2 | Translation review document | Show one source/Spanish/back-translation row and its real review note |
| DU-C3 | Script → Idea | Use Paste your script or Import subtitles with the accepted Spanish. Show the imported-words panel |
| DU-C4 | Format selection | Choose Voiceover narration. Select a custom target length corresponding to the measured source if appropriate. Show the actual preparation button |
| DU-C5 | Format review | Show the accepted Spanish lines, speaker and imported timing where present. Make a genuine necessary correction if one exists, then Continue to voices |
| DU-C6 | Voices | Set Spanish, choose an available voice and pace, audition it reading actual target words |
| DU-C7 | Voice your script → editor | Generate the lines, then show loaded playable takes and the line structure |
| DU-C8 | Script editor | Revoice one genuinely corrected/adjusted line if needed and export actual SRT |
| DU-C9 | Timeline | Show original picture, replacement speech, captions and measured source duration |
| DU-C10 | Separate lip-sync operation | Capture the real agent/editor operation and completed output. Identify it as finishing outside setup |
| DU-C11 | Comparison | Play English source and Spanish result in a clearly labeled comparison |

Notes for the writer field:

```text
This is an approved Spanish translation of an English presenter clip. Keep the
imported words exactly. One presenter reads all lines. Preserve line IDs and
subtitle cue timing when the import provides it. Prepare the lines for voice
review without rewriting, summarizing, or translating them again.
```

Use an attributed subtitle or script format supported by the actual importer. If IDs cannot be embedded in that format, maintain the DU-L-to-imported-line mapping in `documents/line-map.json`.

An import preserves text, but its target times do not prove that a voice take will fit them. Record and measure every returned take.

## DU6. Voice, timing, lip sync, and export

| ID | Operation | Detailed instruction |
| --- | --- | --- |
| DU-G1 | Audition a Spanish voice | Use DU-L1 or a representative segment. Listen for clear pronunciation, natural stress and an appropriate pace. Choose one voice for the entire target script |
| DU-G2 | Voice the accepted script | Set the speaker's provider/model/voice explicitly, then generate lines without conflicting global overrides |
| DU-G3 | Measure takes against source windows | Record duration and leading/trailing silence per line. Place sentence boundaries deliberately. Shorten the translation only through another documented meaning review |
| DU-G4 | Assemble a Spanish voice track | Keep the speech editable per line. Use natural pauses and small timing adjustments. Do not trim phonemes, stack overlapping words or conceal unnatural time-stretching |
| DU-G5 | Export Spanish voiceover cut | Keep the original picture unchanged. Mute original speech. Add the new voice and optional room tone without doubling the English audio |
| DU-G6 | Run the accepted lip-sync route | Use the original English source picture and the accepted Spanish audio as required by the verified tool contract. If segmented, retain exact segment boundaries and consistent settings |
| DU-G7 | Inspect synchronization | Watch at normal speed and frame-step at starts, stops, plosives and transitions. Compare identity, mouth region, teeth and face edges against source. Retry only the failing segment |
| DU-G8 | Generate subtitles from final delivery timing | Use the final aligned Spanish track, not approximate source cue windows. Verify every subtitle's words and timing. Preserve SRT and VTT |
| DU-G9 | Finish the lip-synced timeline | Use the accepted lip-sync outputs, accepted Spanish speech and editable captions. Avoid accidentally keeping the source's English audio |
| DU-G10 | Export both target versions and comparison | Retain clean and captioned versions. Equalize comparison loudness and identify English, Spanish voiceover, and Spanish lip-synced versions correctly |

Do not create music for this recipe. Clear speech is the comparison. Native source ambience may be retained only when it does not include residual English speech or obscure the target voice.

Make the side-by-side comparison a 1920×1080 composition containing two uncropped 16:9 source views scaled to fit, with readable language labels. Play the English source first and Spanish result second, or provide separate sections so the voices never compete. Also deliver the individual files so the page can use an accessible language switch later.

## DU7. Required deliverables

| Asset ID | Path or family | Requirements |
| --- | --- | --- |
| DU-A1 | `sources/presenter-reference.<ext>`, `presenter-entity.json` | Required for synthetic source production, or supplied-source provenance in their place |
| DU-A2 | `sources/source-en.mp4`, `source-en-audio.wav` | Accepted English presenter source and actual audio |
| DU-A3 | `documents/source-transcript.md`, `source-en.srt` | Corrected transcript and actual cue timing |
| DU-A4 | `documents/translation-review.md`, `target-es.txt`, `back-translation.md` | Traceable source/target/meaning review |
| DU-A5 | `documents/script-en.json`, `script-es.json`, `line-map.json` | Editable source/target documents and stable line/take mapping |
| DU-A6 | `masters/voice-es/`, `masters/voice-es.wav` | Original target takes and final aligned voice stem |
| DU-A7 | `masters/dub-es-voiceover-clean.mp4`, `dub-es-voiceover-captioned.mp4` | Same source picture with replacement Spanish speech |
| DU-A8 | `masters/dub-es-lipsync-clean.mp4`, `dub-es-lipsync-captioned.mp4` | Inspected lip-synced output. Required, not replaceable by DU-A7 |
| DU-A9 | `documents/timeline-voiceover.json`, `timeline-lipsync.json` | Editable finishing documents and dependencies |
| DU-A10 | `web/source-en.mp4`, `dub-es-voiceover.mp4`, `dub-es-lipsync.mp4` and WebM siblings | Web deliveries with sound and individual posters |
| DU-A11 | `web/dub-es.srt`, `dub-es.vtt`, `source-en.vtt` | Final aligned subtitle/caption files |
| DU-A12 | `masters/language-comparison.mp4`, `web/language-comparison.mp4`, `.webm`, `poster.webp` | Labeled before/after with one audible version at a time |
| DU-A13 | `web/translation-review.webp` | Legible excerpt from the actual reviewed translation table |
| DU-A14 | `web/recipe-card.webp`, `social-preview.webp` | Real presenter result and language labels, common dimensions |
| DU-A15 | `captures/steps/du-c0` through `du-c11` | Screenshots of real preparation, guide, finishing and comparison |
| DU-A16 | `captures/walkthrough/dubbing-guided-flow.mp4`, `.webm`, `.vtt`, `poster.webp` | 45–60-second demonstration with explicit stage boundaries |
| DU-A17 | `evidence/timing-report.json`, `lipsync-review.md`, `language-review.md`, `source-provenance.json` | Measured timing, visual sync review, actual review status, source chain |

Include common manifest, capture log, handoff and QA. If the source is synthetic, the comparison caption must say so. Do not describe the voice as cloned or identical to the presenter unless that was actually authorized and performed.

## DU8. Walkthrough edit

| Segment | Approximate time | Picture | Caption |
| --- | --- | --- | --- |
| DU-W1 | 0–6 s | English and Spanish result excerpts | The same presenter clip in another language. |
| DU-W2 | 6–14 s | Actual transcript and translation review | Review the transcript and translation first. |
| DU-W3 | 14–21 s | Script Idea import | Bring the approved words into Script. |
| DU-W4 | 21–28 s | Format and line review | Keep the wording editable, line by line. |
| DU-W5 | 28–37 s | Voices, language, actual audition | Hear the voice before generating the script. |
| DU-W6 | 37–44 s | Loaded takes and target subtitles | Review the delivery and subtitles. |
| DU-W7 | 44–52 s | Actual separate lip-sync operation and timeline | Finish the dubbed picture. |
| DU-W8 | 52–59 s | Spanish result | Preview the complete version. |

If DU-P5 is blocked, edit only a clearly titled voiceover demonstration and mark it partial. Do not silently remove DU-W7 and continue to claim the complete recipe is ready.

## DU9. Acceptance and handoff

| Check ID | Pass condition |
| --- | --- |
| DU-Q1 | English source visibly speaks the transcribed words, and its synthetic/supplied origin is traceable |
| DU-Q2 | Spanish preserves every source claim and adds none. Independent back-translation and review notes exist |
| DU-Q3 | Imported Spanish was preserved through the guide. Language selection is shown as voice setup, not translation |
| DU-Q4 | Voice is intelligible and natural, no clipped syllables or residual English audio in target versions |
| DU-Q5 | Subtitles match actual final words and timing. Cue times increase, end after start, and remain within video duration |
| DU-Q6 | Lip-synced output uses the same source performance and passes a full viewing plus checks at speech boundaries |
| DU-Q7 | No obvious facial identity drift, flickering mouth/teeth, face-edge seams or frame discontinuities remain in the selected output |
| DU-Q8 | Before/after comparison is fairly framed and loudness-matched, with no simultaneous competing speech |
| DU-Q9 | All DU-A assets are present and the common M11 checks pass. Missing lip sync means partial, not accepted |

In `handoff.md`, separate supported claims about translation, voice editing, subtitles and lip sync. State the actual target language/voice variety and language-review status. Recommend the individual language videos as the main page interaction assets and the comparison film as a standalone proof clip. Include a factual synthetic-source caption and a short description of each finishing step outside setup.

## DU10. Ready-to-dispatch task

```text
Produce D2 Multilingual video assets using the master plan and this recipe
plan. Check the direct lip-sync route early. Create or use the authorized
English presenter source, transcribe and review it, translate it into Spanish,
back-translate independently, import the accepted target through Script setup,
choose and generate voices, and deliver editable scripts, aligned subtitles,
voiceover and lip-synced cuts, comparisons, real guided-flow captures and QA.
Keep transcription/translation/lip sync visibly separate from the Script guide.
Do not invent a translation button, clone an unauthorized identity, use node
graphs, or build marketing pages. If a required operation is unavailable,
complete the independent assets and report an explicit partial handoff.
```
