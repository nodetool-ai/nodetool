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
  "viral-video-ad-engine": {
    name: "Product ad variants",
    outcome:
      "One product, three openings. Build a short ad in a storyboard, then reuse its shots and voice across different cuts.",
    audience: "Social and performance marketing teams",
    guide: {
      entry: "Storyboard",
      stages: ["Idea", "Story", "Entities", "Look"],
      introduction:
        "Start with a four-shot Commercial storyboard. Review the pictures, add a script, and finish three 15-second cuts in the timeline.",
      inputs: [
        "One clear product photo",
        "A short creative brief",
        "Your chosen image, video, and voice providers"
      ],
      brief:
        "Create a quiet morning commercial for the Olive Travel Cup. Four shots: a cup on a pale kitchen worktop, a close view of the lid, the cup beside a plain cream book, and a final hero view. Warm window light. Keep the cup's shape and colour consistent. Vertical 9:16, for a 15-second ad. No generated lettering or product-performance claims.",
      note: "The screenshots show the live Storyboard, Script, and Timeline documents behind the three finished ads. A recorded video walkthrough is not included.",
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
        "Prepare the translated words with the agent, then use the Script guide to review and voice them. Video timing and lip sync are finishing steps.",
      inputs: [
        "A short source video you can use",
        "A reviewed transcript and translation",
        "A voice provider for the target language"
      ],
      brief:
        "Empieza con una breve descripción. Revisa el texto, elige una voz y escucha el resultado antes de exportarlo.\n\nSi necesitas cambiar una frase, edítala y vuelve a grabarla.\n\nTu guion sigue siendo editable, así que la siguiente versión parte del trabajo que ya tienes.",
      note: "The screenshots show a Spanish Script session using Kokoro ef_dora. The comparison video was produced separately with felipe_es. Choosing a language in Voices does not translate the script.",
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
        "Use the Commercial storyboard guide to plan three product views. Carry the same product reference through the set, then prepare the delivery files with the agent.",
      inputs: [
        "One clear product photo",
        "The views and formats you need",
        "Verified product facts for listing copy"
      ],
      brief:
        "Create three square catalogue views of the Olive Travel Cup. A clean studio hero on a pale limestone plinth, a winter-light scene with a blurred branch in the distance, and a three-quarter hero for a short camera move. Keep the olive body and charcoal lid consistent. No text, labels, or extra products.",
      note: "The screenshots show the real Commercial setup. The higher-resolution delivery images were generated separately with the same product reference. Cutout, motion, upscale, and listing copy are agent-assisted finishing steps.",
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
        "Start with a Mystery storyboard. Review the story, cast reusable character and location references, and choose the look before moving into motion and editing.",
      inputs: [
        "A short story premise",
        "Character, location, and prop references",
        "Your chosen image, video, and voice providers"
      ],
      brief:
        "The Next Tide. A lighthouse keeper discovers a bottle carrying a message dated forty years in the future, written in her own hand. A restrained mystery on a blue-hour coast, with a warm amber keeper's room. Six shots for a short trailer. One central character, a lighthouse, a room, and a message bottle. No readable text inside generated pictures.",
      note: "This example reaches the six-shot storyboard. Motion, score, and the finished trailer are not available in this run. The final steps explain how to continue from the board.",
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
