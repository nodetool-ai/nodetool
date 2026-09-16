---
layout: page
title: "AI Video Production"
permalink: /ai-video-production
description: "Plan a product or social video, generate up to three takes per shot, compare the results, and finish the accepted cut in NodeTool."
---

Turn a product brief into an editable video without leaving NodeTool. Start with
a beat plan, a storyboard, or a script. Add the references that should guide
the images, review every shot before generation, then choose which generated
takes enter the cut.

Generated takes are previews until you choose **Use** or approve a draft. You
can compare options without changing the current edit.

## Before you start

Connect the models needed for your route:

- A language model plans beats, scenes, and shots.
- An image model renders storyboard stills.
- A video model generates clips. Reference-based shots need a model that
  supports reference-to-video input.
- An on-camera performance needs a model that supports audio-driven or lip-sync
  video, plus prepared speech audio and source footage of the performer.

See [Models and providers](models-and-providers.md) for setup. The
[Quick Start](getting-started.md) explains the language, image, and video model
roles and how provider billing works.

Add product photos, character images, logos, and style frames to the Asset
Explorer before you begin. See [Asset Management](asset-management.md) for
import and organization.

## Choose where to start

### Video: plan beats and land on the timeline

Choose **Video** when you want a short ad, explainer, or social clip organized
as timed beats.

1. Describe the video in **What's the video?**
2. Open **Creative context (optional)**. Add the product name, audience,
   objective, tone, approved claims, and claims to avoid.
3. Choose **Add product reference**, **Add character reference**, or **Add
   style reference**. After adding an asset, you can change its role to product,
   character, location, or style.
4. Continue to **Review your beats**. Edit the direction, duration, transition,
   and voiceover for each beat.
5. Set the production choices described in
   [Review the production plan](#review-the-production-plan), then continue to
   the look and generation step.

The result opens in the timeline, where each beat remains a separate clip.

### Storyboard: direct each shot before animation

Choose **Storyboard** when reference consistency and shot-by-shot control
matter more than speed.

1. Describe the story in **What's your story?** and add creative context and
   references.
2. Review **Your screenplay**. Edit scene headings, action, dialogue, and shot
   duration before rendering.
3. Set the editorial purpose, visual treatment, speech mode, production
   direction, and requested takes for each shot.
4. In **Entities**, assign reusable characters and other references to the
   shots that need them.
5. In **Look**, choose the aspect ratio, art style, still model, and video
   model. **Add your own style** can build a look from one to three reference
   images.
6. Render stills, approve the framing you want, then generate clips.

A product close-up needs a product reference. A reference-based character or
lifestyle shot needs the matching character, product, location, or style asset
and a video model that accepts references.

### Script: write and cast the words first

Choose **Script** when dialogue, narration, or voice casting should drive the
video.

1. Write or import the script.
2. In **Production context**, add the product, audience, objective, tone, and
   claim rules. These notes travel with the script without changing its words.
3. Assign speakers and voices, then generate the speech takes you want to use.
4. Create a storyboard from the script when you want visual shots. The linked
   storyboard keeps the script lines, speakers, entities, voices, and selected
   speech takes.
5. Add or confirm visual references in the storyboard before generating clips.

Edit linked words and voices in Script. The storyboard treats them as source
material instead of silently rewriting them.

## Review the production plan

The Video and Storyboard review screens add the same production choices to
each beat or shot:

- **Editorial purpose** identifies the job of the section, such as Hook,
  Demonstration, Proof, or Call to action.
- **Visual treatment** chooses Actor to camera, Product close-up, Lifestyle
  B-roll, or Generated scene.
- **Speech mode** chooses None, Off-camera, or On-camera.
- **Production direction** adds local camera or performance notes.
- **Requested takes** asks for one, two, or three alternatives.

Review these choices before continuing. If you change the brief, references,
or production choices later, NodeTool asks you to review the plan again before
it generates media.

### Narration and on-camera speech

Use **Off-camera** for narration or voiceover that plays over a product shot,
B-roll, or another scene. The speaker does not need to appear to say the line.
This is the usual choice for a product demo assembled in the guided editors.

Use **On-camera** only when the visible performer must match the recorded line.
That route needs all of the following:

- the exact speech take or recorded audio,
- a character entity with a character reference,
- a source face video for the performance,
- an audio-driven or lip-sync model available through a connected provider,
- enough time in the shot for the complete speech take.

NodeTool does not turn an unsupported on-camera request into narration. If the
guided flow cannot resolve the required audio, character, source video, or
model capability, it shows the missing requirement and blocks generation. Use
off-camera speech for that shot, prepare the missing inputs, or ask the agent
to prepare the audio-driven performance after the speech take and visual
sources exist.

Speech must fit inside its beat or shot. Shorten the line, choose a shorter
speech take, or lengthen the section when NodeTool reports a timing conflict.

## Generate and compare takes

Generation creates the requested one to three options for each destination.
Options can finish in any order without changing their take numbers.

In Storyboard:

1. Open **View takes** on a shot.
2. Select a **Preview** chip to audition that clip without replacing the
   accepted clip.
3. Choose **Use** beside the take you want.

In the timeline:

1. Select a clip and open **History** in the Inspector.
2. Choose **Preview Candidate** to audition an option in place.
3. Choose **Use take** to make that option active for the selected clip.

The agent can also collect one preview for each destination into a draft. Ask
it to show the draft first, then tell it to **Use draft** when the selection is
right. NodeTool checks the complete draft before applying it, so a failed or
outdated choice leaves the timeline unchanged.

Accepting a take changes only its destination. It does not replace other clips,
rewrite the source script, or modify the character or product entity. Other
generated options remain available until you remove them.

## Retry failed generations

A failed option does not discard successful takes from the same run.

- Use **Retry N failed** in the Storyboard toolbar to retry failed shots.
- Use **Retry N failed** above the timeline to retry failed generated clips.
- Retry a single destination when only one take needs attention.

The error appears on the affected shot or clip. Common causes include a missing
reference, a model without the required video capability, missing performance
audio, a missing character or source face video, and speech that is longer than
the target slot.

## Example: a 15-second vertical product ad

This example makes a three-beat social ad for a reusable water bottle.

1. Add a clean product photo, a lifestyle photo of the recurring character,
   and two warm daylight style frames to the Asset Explorer.
2. Start **Video** and choose a 15-second vertical social format. Enter: “A
   quick product ad for the Northline bottle, aimed at commuters who want cold
   water all day.”
3. In **Creative context**, add the product name, audience, tone, the approved
   claim “keeps drinks cold for 24 hours,” and any claim the ad must avoid.
   Attach the product, character, and style references.
4. Review three five-second beats:
   - Hook: Lifestyle B-roll of the character leaving home, with off-camera
     narration.
   - Demonstration: Product close-up showing the cap and condensation.
   - Call to action: Product and character together with the final line.
5. Request two takes for the product close-up and one take for the other beats.
   Choose a reference-capable video model and generate.
6. Preview both close-up options. Choose **Use** or **Use take** for the better
   one. Retry only the failed beat if a generation fails.
7. Continue in the timeline. Trim the accepted clips, adjust audio, add
   captions, and export the vertical cut.

To make the final line an on-camera performance, first generate or record its
speech in Script and prepare a source face video for the character. Then use a
connected audio-driven model. If those inputs or that model route are missing,
keep the line off-camera.

## Finish the cut

Accepted takes are ordinary timeline media. You can trim and reorder clips,
mix narration and music, add captions and transitions, and export without
changing the unused candidates. See the [Video Editor](video-editor.md) for
timeline controls and [AI Timeline Editing](ai-timeline-editing.md) for
generation history and local media edits.
