// The UI paths behind the marketing recipes. Keep labels aligned with
// web/src/components/setup/{storyboard,script}/use*SetupFlow.ts.
const runId = "2026-09-10-marketing-recipes-01";
const root = `/recipes/runs/${runId}`;

function capture(slug, file, alt, caption) {
  return {
    source: `recipe-assets/${runId}/${slug}/captures/${file}`,
    src: `${root}/${slug}/steps/${file.split("/").pop()}`,
    width: 3200,
    height: 2000,
    alt,
    caption
  };
}

const catalogue = (file, alt, caption) =>
  capture("ecommerce-sku-visual-factory", `steps/${file}.png`, alt, caption);
const dub = (file, alt, caption) =>
  capture("multilingual-video-dubber", `steps/${file}.png`, alt, caption);
const trailer = (file, alt, caption) =>
  capture("storyboard-to-trailer", `raw/${file}.png`, alt, caption);
const emotionalCup = (file, alt, caption) => ({
  source: `recipe-assets/2026-09-14-emotional-support-cup/captures/${file}.jpg`,
  src: `/recipes/runs/2026-09-14-emotional-support-cup/steps/${file}.jpg`,
  width: 1600,
  height: 900,
  alt,
  caption
});
const impossible = (file, alt, caption) => ({
  source: `recipe-assets/2026-09-14-impossible-product-worlds-dreamina/captures/${file}.jpg`,
  src: `/recipes/runs/2026-09-14-impossible-product-worlds-dreamina/steps/${file}.jpg`,
  width: 1600,
  height: 900,
  alt,
  caption
});
const campaign = (file, alt, caption) => ({
  source: `recipe-assets/2026-09-14-directed-campaign-kit-gpt25/captures/${file}.jpg`,
  src: `/recipes/runs/2026-09-14-directed-campaign-kit-gpt25/steps/${file}.jpg`,
  width: 1600,
  height: 900,
  alt,
  caption
});

export const recipeGuides = {
  "directed-campaign-kit": {
    name: "Directed campaign kit",
    outcome:
      "Turn one product image into a kinetic campaign hero, coordinated social formats, and one controlled revision.",
    audience: "Small brand and social teams",
    guide: {
      entry: "Directed Campaign Kit",
      stages: ["Brief", "Direction", "Hero", "Formats", "Revision"],
      introduction:
        "Start with a clean product reference, choose one bold visual world, then carry it through a hero, social formats, and a controlled revision.",
      inputs: [
        "One clear product image",
        "Optional campaign steer or reference image",
        "Language and image models configured in NodeTool"
      ],
      brief:
        "Create a premium launch campaign for the fictional olive travel cup in the supplied image. Audience: design-conscious commuters who want everyday objects to feel energizing. Message: carry momentum into the day. Visual direction: an olive cup on a cobalt circular platform above mirrored water, framed by monumental curved architecture and an amber mountain sunrise. Freeze fine droplets and use one diagonal streak of light for motion. Keep the exact cup recognizable. Leave clean dark-blue space for editable copy. No generated text, logos, extra cups, handles, or performance claims. Deliver a 16:9 hero, 1:1 social card, 9:16 story frame, and one controlled hero revision with reduced splash and wider copy space.",
      note: "GPT Image 2.5 Sunburst generated the hero through AtlasCloud. The square, story, revision, and clean product-reference frames were derived with the matching GPT Image 2.5 edit model. The cup is a fictional demonstration product and all copy remains editable outside the generated artwork.",
      steps: [
        {
          id: "upload",
          phase: "Brief",
          stage: "Product image",
          title: "Start with the product",
          description:
            "Open Directed Campaign Kit. Add an optional campaign steer first, then upload one clear product image. Uploading starts the language-model roundtrip automatically.",
          action: "Upload the product image",
          image: campaign(
            "01-product",
            "Clean olive travel cup product reference beside the approved campaign world.",
            "A clean reference fixes the cup's olive body, charcoal lid, silhouette, and finish before direction begins."
          )
        },
        {
          id: "review",
          phase: "Brief",
          stage: "AI draft",
          title: "Review the filled brief",
          description:
            "Check the inferred product name, audience, message, headline, and call to action. Edit any value that must be exact. The app keeps your non-empty values when you ask it to analyze again.",
          action: "Approve or edit the brief",
          image: campaign(
            "02-brief",
            "Directed Campaign Kit interface ready for a product image and campaign steer.",
            "The mini app turns one product image and an optional steer into the campaign brief and directions."
          )
        },
        {
          id: "direction",
          phase: "Direction",
          stage: "A, B, or C",
          title: "Choose one visual direction",
          description:
            "Compare the three written directions before generating an image. Select the route that best expresses the message and gives the product a clear role in the composition.",
          action: "Choose a direction",
          image: campaign(
            "03-direction",
            "Olive cup reference paired with the selected cobalt water and amber sunrise direction.",
            "The selected route keeps the product quiet and precise inside a much more energetic world."
          )
        },
        {
          id: "hero",
          phase: "Hero",
          stage: "Generate",
          title: "Generate and approve the hero",
          description:
            "Open Optional steering and models if you want a specific image model. Generate the 16:9 hero, compare it with the product image, and accept it only when identity, copy, and composition are sound.",
          action: "Accept the hero",
          image: campaign(
            "04-hero",
            "Wide campaign hero with an olive travel cup above mirrored water at sunrise.",
            "The accepted 16:9 hero leaves dark-blue space on the left for editable campaign copy."
          )
        },
        {
          id: "formats",
          phase: "Formats",
          stage: "1:1 and 9:16",
          title: "Build the campaign formats",
          description:
            "Create square and story versions from the accepted hero. The app keeps the copy editable and exports a campaign record that can reopen the project later.",
          action: "Build the formats",
          image: campaign(
            "05-formats",
            "Square and vertical campaign formats derived from the same olive cup hero.",
            "The 1:1 and 9:16 versions preserve the product, cobalt platform, water, and amber sunrise."
          )
        },
        {
          id: "revision",
          phase: "Revision",
          stage: "Compare",
          title: "Direct one bounded revision",
          description:
            "Describe one change, what must stay fixed, and what may respond. Choose the revision model if needed, generate the take, then compare it with the accepted original before choosing a final version.",
          action: "Accept the original or revision",
          image: campaign(
            "06-revision",
            "Original and revised wide campaign heroes shown side by side.",
            "The revision changes only the splash intensity and left-side copy space while holding the product and set fixed."
          )
        }
      ]
    }
  },
  "ugc-product-video": {
    name: "UGC product video",
    outcome:
      "Turn creator and product references into a 15-second day-in-the-life story where a cup becomes a reassuring companion.",
    audience: "Founder-led brands, creators, and paid social teams",
    guide: {
      entry: "UGC Product Video",
      stages: ["Angle", "References", "Generate", "Finish", "Review"],
      introduction:
        "Open with a self-aware product confession, show the cup following a chaotic day, then land on a warm verdict to camera.",
      inputs: [
        "One vertical creator image",
        "One clean product image",
        "Approved product facts",
        "A native-audio video provider"
      ],
      brief:
        "Make a 15-second vertical day-in-the-life UGC video with handheld phone framing, natural room tone, and no music. Keep the same woman, charcoal sweatshirt, olive cup, and grey lid throughout. Start with her speaking to camera in the kitchen, follow the cup as she rushes out, carries it through town, drinks at work, pauses outdoors, and ends at home holding it close. Dialogue: \"I bought this because it's green, which is ridiculous because I already have six. But then this morning got a bit chaotic, and suddenly it was my emotional support cup. It kept showing up like, don't worry, I've got you. So yeah, turns out I needed the green one.\" Keep the voice continuous across the cuts. No music, captions, logos, or extra products.",
      note: "The supplied finished video runs for 15.017 seconds at 1440×2560 with AAC stereo audio. It has no burned-in captions. The MP4 is flattened, so its cuts and speech are not editable on this page.",
      steps: [
        {
          id: "angle",
          phase: "Angle",
          stage: "Angle",
          title: "Build a feeling, not just a punchline",
          description:
            "Start with the slightly ridiculous reason she bought the cup, then let the day prove why she keeps reaching for it. The closing line should resolve the opening thought.",
          action: "Choose an angle",
          image: emotionalCup(
            "01-angle",
            "Five frames follow the creator from her kitchen through a busy day to a quiet evening with the olive cup.",
            "The story moves from confession to chaos, companionship, and a warm final verdict."
          )
        },
        {
          id: "creator",
          phase: "Creator",
          stage: "Creator",
          title: "Set the creator",
          description:
            "Use a clear front-camera frame with an unobstructed face and natural window light. Keep her hair, charcoal sweatshirt, and understated delivery consistent across the day.",
          action: "Add the creator",
          image: emotionalCup(
            "02-creator",
            "The creator speaks directly to a phone camera in a bright kitchen while holding the cup.",
            "The opening frame fixes the creator, wardrobe, phone look, and conversational tone."
          )
        },
        {
          id: "product",
          phase: "References",
          stage: "Product",
          title: "Set the product",
          description:
            "Use a clean image that shows the cup silhouette, finish, lid, and proportions.",
          action: "Add the product",
          image: emotionalCup(
            "03-product",
            "Clean product reference showing the olive cup's tapered body and fitted grey lid.",
            "The product reference fixes the cup independently from the creator and locations."
          )
        },
        {
          id: "dialogue",
          phase: "Generate",
          stage: "Generate",
          title: "Show the cup earning its nickname",
          description:
            "Direct visible actions instead of generic reactions: she leaves with the cup, carries it through town, drinks during work, and takes it outside for a pause.",
          action: "Generate the day-in-the-life sequence",
          image: emotionalCup(
            "04-generate",
            "Three vertical frames show the cup leaving home, travelling through town, and joining an outdoor pause.",
            "The middle earns the emotional-support idea through repeated physical use."
          )
        },
        {
          id: "finish",
          phase: "Finish",
          stage: "Edit",
          title: "Let one voice carry the cuts",
          description:
            "Keep the spoken thought continuous while the picture moves from home to street, work, outdoors, and evening. Preserve natural location sound and leave the frame free of captions.",
          action: "Finish in the timeline",
          image: emotionalCup(
            "05-edit",
            "Five sequential frames map the kitchen hook, departure, street, work break, and evening close.",
            "The voice bridges a compact series of everyday moments."
          )
        },
        {
          id: "inspect",
          phase: "Review",
          stage: "Review",
          title: "Review the reel",
          description:
            "Watch once with sound, then muted. Check voice continuity, creator identity, cup geometry, location changes, and whether the final smile completes the opening confession.",
          action: "Approve or regenerate",
          image: emotionalCup(
            "06-review",
            "The creator smiles at home in warm evening light while holding the olive cup close to camera.",
            "The quiet closing frame resolves the busier middle of the story."
          )
        }
      ]
    }
  },
  "impossible-product-worlds": {
    name: "Impossible product worlds",
    outcome:
      "Chase a swimmer into a pool hidden in a giant cup, then return to human scale as she drinks from it.",
    audience: "Brand teams and creative studios",
    guide: {
      entry: "Storyboard",
      stages: ["Idea", "Story", "Entities", "Look"],
      introduction:
        "Plan the product world in Storyboard, lock the cup and swimmer as entities, then direct the finished 15-second take in Dreamina.",
      inputs: [
        "One clear product photo with the full silhouette visible",
        "Dreamina video access with reference-image support",
        "A product name and approved closing line"
      ],
      brief:
        "Create a 15-second vertical 9:16 photorealistic surreal product commercial with energetic, controlled camera motion. @Image1 is only the product identity reference. Preserve the Olive Travel Cup's muted-olive tapered matte body, charcoal fitted flat lid, raised lid rim, and rectangular drinking opening. No handle, logo, lettering, duplication, or changing proportions.\n\n[00:00-00:06] Race low over golden dunes toward the cup at monumental scale. Climb its body, crest the lid rim, and tilt down to reveal a turquoise pool already recessed inside the fitted lid. Continue the same unbroken move as a woman in a cobalt swimsuit and open cream resort shirt runs along the pale stone deck.\n\n[00:06-00:09] Track beside her, orbit as she jumps, and follow her through a large realistic splash into the water.\n\n[00:09-00:15] Match cut through the splash to ordinary scale. Whip-pan to the same woman holding the same cup on a sunny resort terrace. Curve toward her as she raises it and drinks, then settle on a clear product view.\n\nUse warm hard sunlight, crisp shadows, realistic water and fabric, and an original rising percussion-and-bass score with wind, footsteps, splash, and underwater bubbles. Avoid product morphing, detached parts, extra objects, warped limbs, face changes, camera jitter, generated text, subtitles, logos, and watermarks.",
      note:
        "Dreamina supplied the finished 15.072-second video. The published file is a 720×1280 H.264 render with AAC stereo audio. The source is a flattened video, so the camera beats and soundtrack are not editable on the recipe page.",
      steps: [
        {
          id: "reference",
          phase: "Prepare",
          stage: "Product",
          title: "Choose the details that must survive",
          description:
            "Start with an unobstructed product photo. Record the silhouette, colour, lid, opening, and finish before adding the impossible setting.",
          action: "Choose the product reference",
          image: impossible(
            "01-product",
            "Clean reference image of the matte olive travel cup with its charcoal lid fitted.",
            "The source image defines the cup's shape, colour, lid, and drinking opening."
          )
        },
        {
          id: "idea",
          phase: "Guided setup",
          stage: "Idea",
          title: "Give the product an impossible setting",
          description:
            "Create a project and choose Storyboard. Describe the desert approach, the pool inside the giant cup, the woman's jump, and the closing drink as one short commercial.",
          action: "Continue",
          image: impossible(
            "02-prompt",
            "A monumental olive travel cup standing among sunlit desert dunes.",
            "The opening establishes the impossible scale before the pool appears."
          )
        },
        {
          id: "story",
          phase: "Guided setup",
          stage: "Story",
          title: "Time the reveal, jump, and drink",
          description:
            "Choose Commercial and plan the approach, reveal, jump, splash transition, and closing drink. Keep the whole sequence within the 15-second target.",
          action: "Review the story",
          image: impossible(
            "03-story",
            "Five frames show the desert approach, lid pool, running jump, underwater splash, and final drink.",
            "Five frames describe the complete 15-second arc."
          )
        },
        {
          id: "review",
          phase: "Guided setup",
          stage: "Review",
          title: "Make every scale change readable",
          description:
            "Keep the cup monumental through the splash, then use that splash as the cut to human scale. Do not let the product resize inside a shot.",
          action: "Check the transition",
          image: impossible(
            "04-review",
            "Five review frames show the giant cup, pool reveal, airborne woman, water transition, and final drink.",
            "The review strip makes the scale change and final payoff visible."
          )
        },
        {
          id: "entities",
          phase: "Guided setup",
          stage: "Entities",
          title: "Give each reference one job",
          description:
            "Create a product entity from the cup photo and a character entity for the swimmer. Reuse both through the jump and the closing drink before sending the direction to Dreamina.",
          action: "Choose the entities",
          image: impossible(
            "05-reference",
            "The clean olive cup reference beside the woman holding the generated cup at the pool.",
            "Compare the source product with the returned person-and-product frame."
          )
        },
        {
          id: "look",
          phase: "Guided setup",
          stage: "Look",
          title: "Keep the impossible world photographic",
          description:
            "Choose 9:16, warm hard sunlight, crisp shadows, turquoise water, pale stone, and realistic fabric. Keep the palette consistent across both scales.",
          action: "Generate the storyboard",
          image: impossible(
            "06-look",
            "A sunlit turquoise pool recessed into the charcoal lid of the giant cup.",
            "Warm sand, charcoal, olive, cream, and turquoise define the finished look."
          )
        },
        {
          id: "stills",
          phase: "Storyboard",
          stage: "Stills",
          title: "Check three frames before judging motion",
          description:
            "Compare the approach, pool reveal, and final drink. Check the cup silhouette, lid colour, wardrobe, light direction, and clear product read.",
          action: "Review the key frames",
          image: impossible(
            "07-frames",
            "Three tall frames show the giant desert cup, the lid pool, and the woman drinking from the cup.",
            "The three anchor frames cover setup, reveal, and payoff."
          )
        },
        {
          id: "motion",
          phase: "Finish",
          stage: "Motion",
          title: "Direct the camera around the action",
          description:
            "Use a low desert chase, steep climb, rim reveal, lateral run, midair orbit, and underwater follow. Give each move a subject and destination.",
          action: "Generate the full take",
          image: impossible(
            "08-motion",
            "The woman is airborne above the turquoise pool during the generated camera orbit.",
            "The jump gives the camera move a physical action to follow."
          )
        },
        {
          id: "edit",
          phase: "Finish",
          stage: "Timeline",
          title: "Inspect the returned rhythm",
          description:
            "Check the approach, reveal, jump, splash, and drink in order. If a beat is unclear, revise that time range before changing the whole direction.",
          action: "Review the five beats",
          image: impossible(
            "09-timeline",
            "Five sequential frames lay out the full video from desert approach to the closing drink.",
            "The frame strip is the edit map for the flattened Dreamina render."
          )
        },
        {
          id: "delivery",
          phase: "Finish",
          stage: "Delivery",
          title: "End on the product action",
          description:
            "Watch once with sound and once muted. Check the final cup, the drink, the soundtrack ending, and the 9:16 crop before publishing.",
          action: "Approve the final video",
          image: impossible(
            "10-delivery",
            "Close view of the woman drinking from the olive travel cup beside the desert pool.",
            "The final seconds return the impossible setting to a familiar product action."
          )
        }
      ]
    }
  },
  "viral-video-ad-engine": {
    name: "Product commercials",
    outcome:
      "Give your product a story. Direct the shots, shape the sound, and finish your ad in the timeline.",
    audience: "Product and brand marketing teams",
    guide: {
      entry: "Storyboard",
      stages: [
        "Idea",
        "Story",
        "Entities",
        "Look"
      ],
      introduction:
        "Plan three shots, lock the cast and product, render the clips, then finish the ad in NodeTool.",
      inputs: [
        "A clear product photograph",
        "A person and location reference",
        "Image and video models"
      ],
      brief:
        "Make a 13-second photographic commercial for the Olive Travel Cup: pour coffee, pause, then leave home. Keep the same woman, cup, clothes, and room. Use soft window light, restrained camera movement, and natural location sound. Widescreen 16:9. No generated lettering or product claims.",
      note:
        "Dreamina supplied the opening and exit. Seedance 2.0 supplied the middle shot. The edit and sound were finished in NodeTool.",
      steps: [
        {
          id: "idea",
          phase: "Guided setup",
          stage: "Idea",
          title: "Choose a moment the product belongs in",
          description:
            "Describe the person, place, product action, format, and sound.",
          action: "Write the brief",
          image: {
            src: "/recipes/runs/2026-09-14-photographic-commercial/steps/01-idea.jpg",
            alt: "NodeTool Storyboard setup showing the commercial idea prompt.",
            caption: "Start the commercial from one clear product moment.",
            width: 1960,
            height: 1225
          }
        },
        {
          id: "story",
          phase: "Guided setup",
          stage: "Story",
          title: "Plan the cuts and the sound together",
          description:
            "Give each shot one action: pour, pause, leave. Add the sound heard in each cut.",
          action: "Review the story",
          image: {
            src: "/recipes/runs/2026-09-14-photographic-commercial/steps/02-story.jpg",
            alt: "NodeTool Storyboard showing a generated commercial story and shot plan.",
            caption: "The story turns the brief into a short sequence of shots.",
            width: 1960,
            height: 1225
          }
        },
        {
          id: "entities",
          phase: "Guided setup",
          stage: "Entities",
          title: "Keep the product, person and room consistent",
          description:
            "Attach the cup, woman, and kitchen as reusable entities before rendering.",
          action: "Choose the entities",
          image: {
            src: "/recipes/runs/2026-09-14-photographic-commercial/steps/03-entities.jpg",
            alt: "NodeTool Entities step with product and character references selected for the commercial.",
            caption: "Shared entities keep the cast and product available across shots.",
            width: 1960,
            height: 1225
          }
        },
        {
          id: "look",
          phase: "Guided setup",
          stage: "Look",
          title: "Make the reference look photographed",
          description:
            "Choose 16:9, soft window light, natural texture, and a restrained camera style.",
          action: "Set the look",
          image: {
            src: "/recipes/runs/2026-09-14-photographic-commercial/steps/04-look.jpg",
            alt: "NodeTool Look step showing visual style choices for the product commercial.",
            caption: "The Look step sets one visual language for every shot.",
            width: 1960,
            height: 1225
          }
        },
        {
          id: "detail",
          phase: "Storyboard",
          stage: "References",
          title: "Check the physical interaction at close range",
          description:
            "Review the board before video. Check the cup, hand, framing, and continuity.",
          action: "Approve the board",
          image: {
            src: "/recipes/runs/2026-09-14-photographic-commercial/steps/05-board.jpg",
            alt: "NodeTool storyboard showing generated reference frames for the olive cup commercial.",
            caption: "Reference frames make continuity problems visible before motion.",
            width: 1960,
            height: 1225
          }
        },
        {
          id: "motion",
          phase: "Finish",
          stage: "Clips",
          title: "Render a directed scene",
          description:
            "Render each approved frame with simple subject, camera, and sound direction.",
          action: "Render the clips",
          image: {
            src: "/recipes/runs/2026-09-14-photographic-commercial/steps/06-clips.jpg",
            alt: "NodeTool storyboard showing rendered video clips beside their source frames.",
            caption: "Rendered clips stay connected to their storyboard shots.",
            width: 1960,
            height: 1225
          }
        },
        {
          id: "review",
          phase: "Finish",
          stage: "Review",
          title: "Judge movement as carefully as the still",
          description:
            "Watch every take with sound. Check motion, hands, cup shape, and continuity.",
          action: "Select the takes",
          image: {
            src: "/recipes/runs/2026-09-14-photographic-commercial/steps/07-review.jpg",
            alt: "NodeTool review view showing the selected commercial clips before editing.",
            caption: "Review the returned footage before committing it to the edit.",
            width: 1960,
            height: 1225
          }
        },
        {
          id: "timeline",
          phase: "Finish",
          stage: "Timeline",
          title: "Finish the actual returned footage",
          description:
            "Trim the three shots, balance their sound, and export the 13-second commercial.",
          action: "Finish the timeline",
          image: {
            src: "/recipes/runs/2026-09-14-photographic-commercial/steps/08-timeline.jpg",
            alt: "NodeTool timeline with the product commercial clips arranged for export.",
            caption: "The timeline holds the final picture and sound edit.",
            width: 1960,
            height: 1225
          }
        }
      ]
    }
  },
  "multilingual-video-dubber": {
    name: "Multilingual video",
    outcome:
      "Review a translation, choose a voice, and edit the delivery line by line. Finish with a new-language voiceover or a separate lip-sync pass.",
    audience: "Teams adapting videos for another language",
    guide: {
      entry: "Script",
      stages: ["Idea", "Format", "Voices"],
      introduction:
        "Prepare the translation with the agent, then review and voice it in the Script guide. Timing and lip sync come last.",
      inputs: [
        "A short source video you can use",
        "A reviewed transcript and translation",
        "A voice provider for the target language"
      ],
      brief:
        "Empieza con una breve descripción. Revisa el texto, elige una voz y escucha el resultado antes de exportarlo.\n\nSi necesitas cambiar una frase, edítala y vuelve a grabarla.\n\nTu guion sigue siendo editable, así que la siguiente versión parte del trabajo que ya tienes.",
      note: "Screenshots show a Spanish Script session using Kokoro ef_dora. The comparison video used the Inworld Ashley voice. Choosing a language in Voices does not translate the script.",
      steps: [
        {
          id: "translation",
          phase: "Prepare",
          stage: "Agent",
          title: "Prepare and review the translation",
          description:
            "Ask the agent to transcribe the source, then compare the text with the audio. Translate it into your target language and review the meaning, names, and pronunciation before opening Script.",
          action: "Review the translated words"
        },
        {
          id: "idea",
          phase: "Guided setup",
          stage: "Idea",
          title: "Bring your translated script",
          description:
            "Choose Script when creating a project. Paste or import the reviewed target-language text and keep the imported words. This example starts with three Spanish lines.",
          action: "Continue",
          image: dub(
            "du-c3",
            "Script Idea with three imported Spanish lines.",
            "The reviewed Spanish words are imported before the voice is chosen."
          )
        },
        {
          id: "format",
          phase: "Guided setup",
          stage: "Format",
          title: "Choose voiceover narration",
          description:
            "Select Voiceover narration and a length close to the source video. The example uses a custom 23-second target. Actual voice duration is measured after generation.",
          action: "Continue to review",
          image: dub(
            "du-c4",
            "Script Format with Voiceover narration selected and a 23-second target.",
            "Choose the format and target length while preserving the imported wording."
          )
        },
        {
          id: "review",
          phase: "Guided setup",
          stage: "Format",
          title: "Read every line",
          description:
            "Check the speaker and wording of each line. Make language corrections here, before paying to voice the script.",
          action: "Continue to voices",
          image: dub(
            "du-c5",
            "Script review showing the three Spanish narrator lines.",
            "Each line remains editable at the review step."
          )
        },
        {
          id: "voices",
          phase: "Guided setup",
          stage: "Voices",
          title: "Listen before choosing a voice",
          description:
            "Set the target language and pace. Choose an available voice model and narrator, then audition it on your own words. Check pronunciation before voicing all lines.",
          action: "Voice your script",
          image: dub(
            "du-c6",
            "Voices step with Spanish, Normal pace, Kokoro Spanish, and an ef_dora audition.",
            "The voice audition uses words from this script."
          )
        },
        {
          id: "takes",
          phase: "Script",
          stage: "Voice takes",
          title: "Review the generated takes",
          description:
            "Listen to each line in the Script editor. Check the delivery and actual duration against the source video rather than relying on the target length.",
          action: "Listen to each line",
          image: dub(
            "du-c7",
            "Script editor reporting three voiced lines in an editable Spanish script.",
            "This session produced three voiced lines with a total duration of 16.3 seconds."
          )
        },
        {
          id: "revise",
          phase: "Script",
          stage: "Revision",
          title: "Revoice only the line that needs it",
          description:
            "Change a line's direction or wording, generate another take, and choose the delivery you prefer. Keep the other accepted lines.",
          action: "Generate another take",
          image: dub(
            "du-c8",
            "Script editor with revised direction and two takes for the second line.",
            "Line 2 was redirected and revoiced without replacing the whole script."
          )
        },
        {
          id: "timeline",
          phase: "Finish",
          stage: "Timeline",
          title: "Fit the voice to the picture",
          description:
            "Send the voice takes to a timeline and add the original video. Mute the original speech, align each translated line, and adjust pauses. Play through the full result and export captions with the final timing.",
          action: "Send to timeline"
        },
        {
          id: "lip-sync",
          phase: "Finish",
          stage: "Lip sync",
          title: "Choose the final delivery",
          description:
            "Export a voiceover cut, or ask the agent for a separate supported lip-sync pass using the source picture and accepted target-language audio. Review mouth movement, timing, and pronunciation before using the result.",
          action: "Review and export"
        }
      ]
    }
  },
  "ecommerce-sku-visual-factory": {
    name: "Product catalogue assets",
    outcome:
      "Turn one product reference into a coordinated set of studio images, seasonal scenes, and a short motion clip.",
    audience: "Ecommerce and catalogue teams",
    guide: {
      entry: "Storyboard",
      stages: ["Idea", "Story", "Entities", "Look"],
      introduction:
        "Plan three product views in the Commercial storyboard guide, keep one product reference throughout, then prepare delivery files with the agent.",
      inputs: [
        "One clear product photo",
        "The views and formats you need",
        "Verified product facts for listing copy"
      ],
      brief:
        "Create three square catalogue views of the Olive Travel Cup. A clean studio hero on a pale limestone plinth, a winter-light scene with a blurred branch in the distance, and a three-quarter hero for a short camera move. Keep the olive body and charcoal lid consistent. No text, labels, or extra products.",
      note: "Screenshots show the real Commercial setup. Delivery images were generated separately from the same reference. Cutout, motion, upscale, and listing copy are agent-assisted.",
      steps: [
        {
          id: "source",
          phase: "Prepare",
          stage: "Product",
          title: "Start with a clear product photo",
          description:
            "Choose a complete, unobstructed view of the product. Keep this as the reference for the whole set. Ask the agent for a transparent cutout if your catalogue needs one.",
          action: "Choose your reference"
        },
        {
          id: "idea",
          phase: "Guided setup",
          stage: "Idea",
          title: "Describe the catalogue set",
          description:
            "Create a project and choose Storyboard. In Idea, describe the three views, the setting, and the details that must stay consistent.",
          action: "Continue",
          image: catalogue(
            "sku-c1",
            "Storyboard Idea containing the Olive Travel Cup catalogue brief.",
            "A short brief describes the whole product set."
          )
        },
        {
          id: "story",
          phase: "Guided setup",
          stage: "Story",
          title: "Choose Commercial and three shots",
          description:
            "Select Commercial and 3 shots. Generate a screenplay for a studio hero, a seasonal treatment, and a view that can become a motion clip.",
          action: "Generate screenplay",
          image: catalogue(
            "sku-c2",
            "Story step with Commercial and three shots selected.",
            "The Commercial format plans three views before rendering any stills."
          )
        },
        {
          id: "review",
          phase: "Guided setup",
          stage: "Story",
          title: "Review the three views",
          description:
            "Edit the shot descriptions so each has a clear purpose. Keep the product, scale, and lighting direction coherent across the set.",
          action: "Set up entities",
          image: catalogue(
            "sku-c3",
            "Review of the three-shot catalogue screenplay.",
            "Review the studio, winter-light, and motion-view descriptions."
          )
        },
        {
          id: "entities",
          phase: "Guided setup",
          stage: "Entities",
          title: "Use the same product in every shot",
          description:
            "Create or select the product entity from your reference photo. Assign it to all three shots so each generation uses the same reference.",
          action: "Choose the look",
          image: catalogue(
            "sku-c4",
            "Entities step assigning the Olive Travel Cup to all three catalogue shots.",
            "One product entity is assigned to each view."
          )
        },
        {
          id: "look",
          phase: "Guided setup",
          stage: "Look",
          title: "Choose a square photographic look",
          description:
            "Select 1:1 and a photographic style. Choose an image model that supports reference images, then generate the storyboard.",
          action: "Generate your storyboard",
          image: catalogue(
            "sku-c5",
            "Look step with square format, photographic style, and a reference-capable model.",
            "Set the format and image model once for the board."
          )
        },
        {
          id: "stills",
          phase: "Storyboard",
          stage: "Stills",
          title: "Review the set together",
          description:
            "Compare the three stills. Check the lid, silhouette, colour, and shadows. Revise only the view that needs another pass.",
          action: "Review each shot",
          image: catalogue(
            "sku-c6",
            "Storyboard containing the three rendered Olive Travel Cup catalogue views.",
            "The board keeps the three views together for review."
          )
        },
        {
          id: "motion",
          phase: "Finish",
          stage: "Motion",
          title: "Animate one product view",
          description:
            "Select the three-quarter hero and add a small camera arc. Review the product edges and shape throughout the clip. A short camera move is enough for this example.",
          action: "Render the selected clip",
          image: catalogue(
            "sku-c7",
            "Shot inspector for the selected product motion view.",
            "Choose one shot for motion rather than animating the whole set."
          )
        },
        {
          id: "delivery",
          phase: "Finish",
          stage: "Delivery",
          title: "Prepare the listing assets",
          description:
            "Ask the agent to upscale the selected studio image, prepare web copies, and write listing text using verified facts. Check the transparent cutout on light and dark backgrounds, then export the set.",
          action: "Review and export the set"
        }
      ]
    }
  },
  "storyboard-to-trailer": {
    name: "Storyboard to trailer",
    outcome:
      "Turn a story idea into a six-shot storyboard, then develop its voice, motion, and edit in the same workspace.",
    audience: "Filmmakers and small production teams",
    guide: {
      entry: "Storyboard",
      stages: ["Idea", "Story", "Entities", "Look"],
      introduction:
        "Start from a Mystery storyboard: review the story, cast character and location references, then choose the look.",
      inputs: [
        "A short story premise",
        "Character, location, and prop references",
        "Your chosen image, video, and voice providers"
      ],
      brief:
        "The Next Tide. A lighthouse keeper discovers a bottle carrying a message dated forty years in the future, written in her own hand. A restrained mystery on a blue-hour coast, with a warm amber keeper's room. Six shots for a short trailer. One central character, a lighthouse, a room, and a message bottle. No readable text inside generated pictures.",
      note: "This example stops at the six-shot storyboard. Motion, score, and the trailer are not in this run. The final steps explain how to continue.",
      steps: [
        {
          id: "idea",
          phase: "Guided setup",
          stage: "Idea",
          title: "Start with the story",
          description:
            "Create a project and choose Storyboard. Describe the central character, discovery, and mood. The example starts with a lighthouse keeper finding a message from the future.",
          action: "Continue",
          image: trailer(
            "tr-c1",
            "Storyboard Idea with The Next Tide mystery brief.",
            "The story begins as a short written premise."
          )
        },
        {
          id: "story",
          phase: "Guided setup",
          stage: "Story",
          title: "Choose Mystery and six shots",
          description:
            "Select Mystery and 6 shots. Generate the screenplay to turn the premise into scenes, framing, and actions.",
          action: "Generate screenplay",
          image: trailer(
            "tr-c2",
            "Story step with Mystery and six shots selected.",
            "Choose the genre and size of the storyboard."
          )
        },
        {
          id: "review",
          phase: "Guided setup",
          stage: "Story",
          title: "Shape the reveal",
          description:
            "Read the six shots in order. Establish the coast, discover the bottle, show the room and note, then build to the keeper's recognition. Keep each shot to one clear action.",
          action: "Set up entities",
          image: trailer(
            "tr-c3",
            "The reviewed six-shot screenplay for The Next Tide.",
            "Edit the scene and shot descriptions before generating pictures."
          )
        },
        {
          id: "entities",
          phase: "Guided setup",
          stage: "Entities",
          title: "Cast the character and places",
          description:
            "Create or select references for Elin, the lighthouse, the keeper's room, and the bottle. Assign each only to the shots where it appears.",
          action: "Choose the look",
          image: trailer(
            "tr-c4",
            "Entities step with reusable character, location, and prop references.",
            "References are assigned per shot to keep the cast and settings coherent."
          )
        },
        {
          id: "look",
          phase: "Guided setup",
          stage: "Look",
          title: "Set the visual direction",
          description:
            "Choose 16:9 and a cinematic style. Use cool coastal light outside and warm lamplight inside. Select a model that can use the entity references.",
          action: "Generate your storyboard",
          image: trailer(
            "tr-c5",
            "Look step for the widescreen cinematic mystery storyboard.",
            "The look is set before rendering the board."
          )
        },
        {
          id: "stills",
          phase: "Storyboard",
          stage: "Stills",
          title: "Review the six-frame story",
          description:
            "Read the pictures in sequence. Check Elin's appearance, the lighthouse, the room, and the bottle. Revise individual shots or ask the Storyboard Assistant for a change.",
          action: "Review the storyboard",
          image: trailer(
            "tr-c6",
            "The Next Tide six-shot storyboard beside the Storyboard Assistant.",
            "The example reaches this editable six-shot board."
          )
        },
        {
          id: "script",
          phase: "Continue",
          stage: "Script",
          title: "Develop the voiceover",
          description:
            "Open the linked script, or use Extract script. Write the narrator's lines, choose a voice, and audition the delivery. Match accepted voice takes to the shots they accompany.",
          action: "Open script"
        },
        {
          id: "motion",
          phase: "Continue",
          stage: "Clips",
          title: "Bring the chosen shots into motion",
          description:
            "Give each shot one restrained movement and render its clip. Check identity and continuity before assembling. This example's motion clips are still pending.",
          action: "Render clips"
        },
        {
          id: "timeline",
          phase: "Continue",
          stage: "Timeline",
          title: "Cut the trailer",
          description:
            "Once the clips and voice are ready, assemble the timeline. Add a separately generated score, balance the mix, and use editable title text. Play through the full cut before exporting the finished trailer.",
          action: "Assemble timeline"
        }
      ]
    }
  }
};
