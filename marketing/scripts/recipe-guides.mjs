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
const ad = (file, alt, caption) =>
  capture("viral-video-ad-engine", `raw/${file}.png`, alt, caption);
const dub = (file, alt, caption) =>
  capture("multilingual-video-dubber", `steps/${file}.png`, alt, caption);
const trailer = (file, alt, caption) =>
  capture("storyboard-to-trailer", `raw/${file}.png`, alt, caption);

export const recipeGuides = {
  "directed-campaign-kit": {
    name: "Directed campaign kit",
    outcome:
      "Turn one product image into an approved campaign hero, two ready-to-edit formats, and one controlled revision.",
    audience: "Small brand and social teams",
    guide: {
      entry: "Directed Campaign Kit",
      stages: ["Brief", "Direction", "Hero", "Formats", "Revision"],
      introduction:
        "Upload a product image. The app writes the brief and three directions. Approve the hero, then make formats and revisions.",
      inputs: [
        "One clear product image",
        "Optional campaign steer or reference image",
        "Language and image models configured in NodeTool"
      ],
      brief:
        "Create a campaign for the product in the supplied image. Infer a concise product name, audience, message, headline, and call to action. Propose three distinct visual directions. Keep the product recognizable and avoid unsupported performance claims.",
      note: "The product image is the only required input. Add exact copy or audience details before uploading when they must not be inferred. Model selection stays available in the app.",
      steps: [
        {
          id: "upload",
          phase: "Brief",
          stage: "Product image",
          title: "Start with the product",
          description:
            "Open Directed Campaign Kit. Add an optional campaign steer first, then upload one clear product image. Uploading starts the language-model roundtrip automatically.",
          action: "Upload the product image"
        },
        {
          id: "review",
          phase: "Brief",
          stage: "AI draft",
          title: "Review the filled brief",
          description:
            "Check the inferred product name, audience, message, headline, and call to action. Edit any value that must be exact. The app keeps your non-empty values when you ask it to analyze again.",
          action: "Approve or edit the brief"
        },
        {
          id: "direction",
          phase: "Direction",
          stage: "A, B, or C",
          title: "Choose one visual direction",
          description:
            "Compare the three written directions before generating an image. Select the route that best expresses the message and gives the product a clear role in the composition.",
          action: "Choose a direction"
        },
        {
          id: "hero",
          phase: "Hero",
          stage: "Generate",
          title: "Generate and approve the hero",
          description:
            "Open Optional steering and models if you want a specific image model. Generate the 16:9 hero, compare it with the product image, and accept it only when identity, copy, and composition are sound.",
          action: "Accept the hero"
        },
        {
          id: "formats",
          phase: "Formats",
          stage: "4:5 and 9:16",
          title: "Build the campaign formats",
          description:
            "Create portrait and story versions from the accepted hero. The app keeps the copy editable and exports a campaign record that can reopen the project later.",
          action: "Build the formats"
        },
        {
          id: "revision",
          phase: "Revision",
          stage: "Compare",
          title: "Direct one bounded revision",
          description:
            "Describe one change, what must stay fixed, and what may respond. Choose the revision model if needed, generate the take, then compare it with the accepted original before choosing a final version.",
          action: "Accept the original or revision"
        }
      ]
    }
  },
  "ugc-product-video": {
    name: "UGC product video",
    outcome:
      "Turn creator and product references into a branded 15-second vertical testimonial whose voice and lip movement are generated together.",
    audience: "Founder-led brands, creators, and paid social teams",
    guide: {
      entry: "UGC Product Video",
      stages: ["Angle", "References", "Generate", "Brand", "Review"],
      introduction:
        "Keep the creator on camera for the full Reel, generate voice and lip-sync in the same MiniMax H3 pass, limit the cup to one proof beat of no more than about three seconds, and finish with an exact branded close.",
      inputs: [
        "One vertical creator image you have permission to send to AtlasCloud",
        "One clean product reference you have permission to send to AtlasCloud",
        "Approved product facts and one audience",
        "An exact brand name and slogan",
        "OpenAI and AtlasCloud providers configured in NodeTool"
      ],
      brief:
        "Create a 15-second vertical UGC testimonial with the creator speaking to camera throughout. Generate voice, mouth movement, and picture together in one MiniMax H3 native-audio pass on AtlasCloud. Image 1 controls the creator and room. Image 2 controls only the product. Keep the cup fully out of frame from 0.0 to 4.5 seconds, show it once from 4.5 to 7.0 seconds without blocking the face, and keep it fully out of frame from 7.0 to 15.0 seconds. Preserve the phone-shot character of the source. Do not add generated logos, music, unsupported claims, or cutaway product shots.",
      note:
        "The app sends both reference images to AtlasCloud. It does not license a person's likeness or product artwork. The performance and product motion are generative and must be checked before publishing.",
      steps: [
        {
          id: "angle",
          phase: "Angle",
          stage: "Three routes",
          title: "Choose one believable promise",
          description:
            "Describe the offer and compare the plain, playful, and premium routes. Pick one product truth that can be shown on camera. Rewrite it as a curiosity-led hook and a short verdict rather than reading the ad copy verbatim.",
          action: "Explore three angles"
        },
        {
          id: "creator",
          phase: "Creator",
          stage: "Reference image",
          title: "Lock the creator before generating",
          description:
            "Use a vertical image with a clear face, natural light, and the intended room. Keep the product out of this reference so the opening can begin on the creator alone.",
          action: "Add the creator image"
        },
        {
          id: "product",
          phase: "References",
          stage: "Product image",
          title: "Assign each reference one job",
          description:
            "Add a clean product image as image 2. It controls only silhouette, finish, lid, and proportions. Its background must not transfer to the creator scene.",
          action: "Add the product image"
        },
        {
          id: "dialogue",
          phase: "Generate",
          stage: "15-second script",
          title: "Write and generate in one pass",
          description:
            "Keep the hook short enough to land before 4.5 seconds, support it with one or two product truths, and end with one recommendation. MiniMax H3 generates the exact dialogue, native voice, lip-sync, and picture together.",
          action: "Make the 15-second testimonial"
        },
        {
          id: "brand",
          phase: "Brand",
          stage: "Closing lockup",
          title: "Add the exact brand and slogan",
          description:
            "Keep generated lettering out of the MiniMax H3 prompt. Add the brand and slogan locally during the final 3.25 seconds so the words remain legible and editable while the native audio stays unchanged.",
          action: "Add the closing brand"
        },
        {
          id: "inspect",
          phase: "Review",
          stage: "Timing and identity",
          title: "Check the complete Reel",
          description:
            "Watch once for voice and lip-sync, then scrub the opening, 4.5-second entrance, 7.0-second exit, and close. Reject a take if the cup appears outside the 2.5-second window, blocks the face, or drifts from image 2.",
          action: "Approve or regenerate"
        }
      ]
    }
  },
  "impossible-product-worlds": {
    name: "Impossible product worlds",
    outcome:
      "Fly above a giant product to reveal a luxury pool in its lid, then return to a clean hero shot in a short surreal commercial.",
    audience: "Brand teams and creative studios",
    guide: {
      entry: "Storyboard",
      stages: ["Idea", "Story", "Entities", "Look"],
      introduction:
        "Three shots: one continuous drone flight over a giant cup that reveals a pool in its lid, then ordinary tabletop scale, then a packshot.",
      inputs: [
        "One clear product photo with the full silhouette visible",
        "A product name and approved closing line",
        "Your chosen image and video providers, plus a music provider if needed"
      ],
      brief:
        "Small object. Big escape. Create a three-shot surreal commercial for the Olive Travel Cup, a fictional unbranded olive-green travel cup with a charcoal lid. Use the supplied product reference throughout.\n\n1. An eight-second continuous drone flight. Begin low in golden dunes facing a monumental cup. Fly forward, rise above its rim, and tilt down to reveal a luxury turquoise pool built into its fitted lid, with pale stone coping, two cream loungers, and a beige parasol. Keep the same cup visible throughout. The pool already exists and is revealed by the camera angle. No cut, lid detachment, or object transformation.\n2. Four seconds at ordinary scale: the cup on a sunlit tabletop with its lid beside it. A small lateral camera slide establishes familiar scale.\n3. Three seconds on a cobalt-blue studio background: cup upright, lid fitted, clear space above for the closing line.\n\nVertical 9:16. Target 15 seconds: 8, 4, and 3. Warm directional light and sharp shadows. No people, generated lettering, extra handles, or product-performance claims. Add Small object. Big escape. as editable text over the final hero.",
      note: "The example is a silent 15-second concept film, rendered through AtlasCloud and assembled locally. Product proportions vary between shots.",
      steps: [
        {
          id: "reference",
          phase: "Prepare",
          stage: "Product",
          title: "Choose the details that must survive",
          description:
            "Start with an unobstructed product photo. Note its silhouette, colour, lid, and materials. If you use another product, adapt the hidden pool to a visible feature such as a cap or recess.",
          action: "Choose your product reference"
        },
        {
          id: "idea",
          phase: "Guided setup",
          stage: "Idea",
          title: "Give the product an impossible setting",
          description:
            "Create a project and choose Storyboard. Paste the example brief into Idea, then replace the product details with your own. Keep the drone approach and pool reveal in one continuous opening shot, followed by a tabletop shot and final hero.",
          action: "Continue"
        },
        {
          id: "story",
          phase: "Guided setup",
          stage: "Story",
          title: "Plan a three-shot Commercial",
          description:
            "Select Commercial and 3 shots. Generate the screenplay. Use the 15-second target to keep the concept focused, then set the exact shot lengths when you edit the clips.",
          action: "Generate screenplay"
        },
        {
          id: "review",
          phase: "Guided setup",
          stage: "Review",
          title: "Make the scale change readable",
          description:
            "Keep the cup visible while the camera rises above its rim. The pool should already exist inside the fitted lid and become visible as the camera tilts down. Use the next cut to return to ordinary tabletop scale.",
          action: "Set up entities"
        },
        {
          id: "entities",
          phase: "Guided setup",
          stage: "Entities",
          title: "Anchor every world to one product",
          description:
            "Create or select a product entity using your photo and assign it to all three shots. Describe the fitted lid, its rim, and drinking opening so the pool reveal retains the product's identity.",
          action: "Choose the look"
        },
        {
          id: "look",
          phase: "Guided setup",
          stage: "Look",
          title: "Make the impossible feel photographed",
          description:
            "Choose 9:16 and a photographic style with warm directional light, sharp shadows, golden sand, and deep blue backgrounds. Select an image model that supports entity references, then generate the board.",
          action: "Generate your storyboard"
        },
        {
          id: "stills",
          phase: "Storyboard",
          stage: "Stills",
          title: "Review the product before the spectacle",
          description:
            "Compare every still with the source photo. Check the silhouette, lid geometry, and colour. Begin the drone shot below the lid rim so the pool is hidden. Keep the lid attached throughout the reveal. Regenerate a still if it changes the product's silhouette.",
          action: "Accept one still per shot"
        },
        {
          id: "motion",
          phase: "Finish",
          stage: "Motion",
          title: "Move the camera through each scene",
          description:
            "Render the opening as one eight-second clip: approach the cup, ascend above its rim, then tilt down to reveal the luxury pool, narrow deck, loungers, and parasol. Keep the cup stationary and the camera path continuous. Render the tabletop slide and near-static hero separately.",
          action: "Render and review each clip",
          image: {
            src: "/recipes/runs/2026-09-11-impossible-product-worlds/pool-poster.webp",
            alt: "The drone camera reveals a luxury pool inside the giant cup's fitted lid.",
            caption:
              "A frame from the continuous drone reveal in the rendered example.",
            width: 540,
            height: 960
          }
        },
        {
          id: "edit",
          phase: "Finish",
          stage: "Timeline",
          title: "Cut from impossible to familiar",
          description:
            "Assemble the three accepted clips and trim them to 8, 4, and 3 seconds. Use a direct cut for the return to tabletop scale. Add your approved closing line as editable text over the final hero and check its position in the vertical frame.",
          action: "Assemble the 15-second edit"
        },
        {
          id: "delivery",
          phase: "Finish",
          stage: "Delivery",
          title: "Finish with sound and a clear product read",
          description:
            "If the cut needs music, ask the agent for a sparse instrumental score covering the full edit, with a change at the tabletop reveal. Balance it in the timeline. Watch once with sound and once muted, check the final product and closing line, then export the vertical film.",
          action: "Review and export"
        }
      ]
    }
  },
  "viral-video-ad-engine": {
    name: "Product commercials",
    outcome:
      "Give your product a story. Direct the shots, shape the sound, and finish your ad in the timeline.",
    audience: "Social and performance marketing teams",
    guide: {
      entry: "Storyboard",
      stages: ["Idea", "Story", "Entities", "Look"],
      introduction:
        "A quiet-morning example: four shots, one product, three opening variations.",
      inputs: [
        "One clear product photo",
        "A short creative brief",
        "Your chosen image, video, and voice providers"
      ],
      brief:
        "Create a quiet morning commercial for the Olive Travel Cup. Four shots: a cup on a pale kitchen worktop, a close view of the lid, the cup beside a plain cream book, and a final hero view. Warm window light. Keep the cup's shape and colour consistent. Vertical 9:16, for a 15-second ad. No generated lettering or product-performance claims.",
      note: "These steps show the quiet-morning commercial, a separate example from Tiny Film Crew above.",
      steps: [
        {
          id: "idea",
          phase: "Guided setup",
          stage: "Idea",
          title: "Describe the ad",
          description:
            "Create a project and choose Storyboard. Paste the brief below into Idea. Describe the setting, product, and feeling you want.",
          action: "Continue",
          image: ad(
            "ad-c1",
            "Storyboard Idea step containing the quiet morning Olive Travel Cup commercial brief.",
            "The ad starts as a specific product, setting, mood, and format brief."
          )
        },
        {
          id: "story",
          phase: "Guided setup",
          stage: "Story",
          title: "Choose Commercial and four shots",
          description:
            "Select Commercial and set the shot count to 4. NodeTool drafts the scenes and shot descriptions before making any images.",
          action: "Generate screenplay",
          image: ad(
            "ad-c2",
            "Storyboard Story step with Commercial selected, four shots, and GPT-5.6-Sol as the screenplay model.",
            "Commercial framing and four shots are chosen before any still is rendered."
          )
        },
        {
          id: "review",
          phase: "Guided setup",
          stage: "Story",
          title: "Review the shot list",
          description:
            "Keep one action per shot: opening, lid detail, cup beside a book, and the closing hero. Edit the descriptions and remove any invented product claims.",
          action: "Set up entities",
          image: ad(
            "ad-c3",
            "Storyboard review showing the four-shot Olive Travel Cup screenplay.",
            "The four planned shots are reviewed as editable text before generation."
          )
        },
        {
          id: "entities",
          phase: "Guided setup",
          stage: "Entities",
          title: "Give every shot the same product",
          description:
            "Create a product entity from your photo, or select an existing one. Assign it to all four shots so the image model has the same visual reference.",
          action: "Choose the look",
          image: ad(
            "ad-c4",
            "Storyboard Entities step with the Olive Travel Cup assigned to the product shots.",
            "One product entity supplies the visual reference across the storyboard."
          )
        },
        {
          id: "look",
          phase: "Guided setup",
          stage: "Look",
          title: "Set the vertical look",
          description:
            "Choose 9:16, a photographic style, and an image model that supports references. Use warm window light and a pale worktop throughout.",
          action: "Generate your storyboard",
          image: ad(
            "ad-c5",
            "Storyboard Look step configured for a portrait photographic product commercial with a FAL image model.",
            "The portrait format, photographic treatment, and FAL image model are fixed together."
          )
        },
        {
          id: "stills",
          phase: "Storyboard",
          stage: "Stills",
          title: "Choose the pictures",
          description:
            "Check the cup silhouette, lid, lighting, and space for captions. Revise individual shots until the four pictures belong together.",
          action: "Review each shot",
          image: ad(
            "ad-c6",
            "Storyboard board showing six generated Olive Travel Cup stills in a warm kitchen setting.",
            "The core sequence and alternate openings are reviewed on one storyboard."
          )
        },
        {
          id: "script",
          phase: "Finish",
          stage: "Script",
          title: "Write and voice the short script",
          description:
            "Open the linked script, or use Extract script. Try the opening “Make a little room for your morning.” Choose a narrator, audition the voice, and check each line before generating the rest.",
          action: "Open script",
          image: ad(
            "ad-c7",
            "Script editor showing four short narrator lines for the Olive Travel Cup ad.",
            "The short voiceover remains editable line by line before delivery."
          )
        },
        {
          id: "motion",
          phase: "Finish",
          stage: "Clips",
          title: "Add a little movement",
          description:
            "Animate the chosen stills with a slow push-in or a small camera move. Keep product motion simple and review each clip for changes in shape.",
          action: "Render clips",
          image: ad(
            "ad-c8",
            "Storyboard clip review with the first Olive Travel Cup shot selected.",
            "Rendered clips are checked against the selected stills and restrained motion directions."
          )
        },
        {
          id: "timeline",
          phase: "Finish",
          stage: "Timeline",
          title: "Make the first 15-second cut",
          description:
            "Assemble the shots in the timeline. Arrange picture and voice, trim to 15 seconds, and add editable captions and the closing line “Take it with you.” Play the full cut before exporting.",
          action: "Assemble timeline",
          image: ad(
            "ad-c9",
            "Timeline A showing portrait product clips, voice waveforms, and a 15-second sequence.",
            "Picture, voice, and the end card are arranged in the first 15-second cut."
          )
        },
        {
          id: "variants",
          phase: "Finish",
          stage: "Variants",
          title: "Change the opening, keep the rest",
          description:
            "Ask the agent for two alternate openings: a wider shadow composition and an elevated lid view. Make two more cuts using those openings and new hook lines, reusing the remaining footage and voice.",
          action: "Create two alternate cuts",
          image: ad(
            "ad-c11",
            "Timeline C showing the elevated Olive Travel Cup opening with the shared remaining edit.",
            "The third cut changes its opening and hook while retaining the shared sequence structure."
          )
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
