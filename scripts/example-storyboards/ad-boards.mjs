// Advertising storyboards in the same shape as the Seedance boards in
// `seedance-boards.mjs`, which appends them to `SEEDANCE_STORYBOARDS`.
//
// Each board is a 15-second ad of four or five shots, one action per shot, at
// most two characters, and no legible text, logo or brand in frame. The product
// is described by its look only, so a board never names a real brand.

export const AD_STORYBOARDS = [
  {
    slug: "cold-brew-pour",
    name: "Cold Brew Pour",
    description: "An iced cold brew ad built on one slow pour and the first cold sip.",
    tags: ["advertising", "food", "beverage", "vertical"],
    brief:
      "An iced cold brew ad built on one slow pour. Ice, coffee and condensation carry the whole film, and the last shot is the reward: a long, cold sip.",
    style:
      "Premium beverage commercial, macro photography, shallow depth of field. Cool morning light from frame right, deep amber coffee against pale cream milk, crisp highlights on the glass.",
    aspectRatio: "9:16",
    setting:
      "Pale stone counter in a sunlit kitchen, a window blurred behind, a folded linen cloth at the edge",
    cast: [
      {
        name: "the glass",
        look: "tall clear glass packed with large clear ice cubes, beaded with cold condensation"
      },
      {
        name: "the drinker",
        look: "woman in her late 20s, hair tied up, white shirt sleeves rolled, only her hand and lower face ever show"
      }
    ],
    continuity:
      "Same tall glass, same clear ice, same stone counter and cool window light in every shot. Coffee is deep amber, milk is pale cream. After the cream pour the drink always looks the same: amber cold brew with thick pale cream swirls marbled through the whole glass. No cup lid, no straw packaging, no printed text anywhere.",
    music: "Soft lo-fi beat with a warm bass, calm and fresh",
    shots: [
      {
        slug: "ice-drop",
        action:
          "A single large ice cube falls into the tall glass that already holds a few clear ice cubes, water droplets leaping from the impact. Only ice cubes in the glass: no coffee and no milk yet.",
        motion: "hold",
        camera: { framing: "macro close-up", movement: "static, slow motion" },
        durationSeconds: 3,
        beat: "The cube lands and a crown of droplets rises and settles; light flares through the glass.",
        sound: "single clink of ice in glass"
      },
      {
        slug: "coffee-pour",
        action:
          "Dark cold brew pours into the iced glass in a thick stream, clouds of coffee blooming through the ice.",
        motion: "track",
        camera: { framing: "close-up", movement: "slow tilt down following the pour" },
        durationSeconds: 4,
        beat: "The stream fills the glass; swirls of coffee curl between the cubes.",
        sound: "liquid pouring over ice, crackle of cooling ice"
      },
      {
        slug: "cream-swirl",
        action:
          "A ribbon of cream is poured in and spirals down through the amber coffee, glowing in the window light.",
        motion: "push-in",
        camera: { framing: "extreme close-up", movement: "slow push in" },
        durationSeconds: 4,
        beat: "The cream unfurls into soft marbled clouds that slowly drift and blend.",
        sound: "soft liquid hush"
      },
      {
        slug: "cold-sip",
        action:
          "The drinker lifts the glass to her lips and drinks, condensation sliding down the glass over her fingers. The glass shows the same drink as the previous shot: amber cold brew with thick swirls of pale cream marbled through it and a cream layer at the top.",
        motion: "hold",
        camera: { framing: "medium close-up", movement: "static" },
        durationSeconds: 4,
        beat: "She drinks, lowers the glass, and breathes out with a small satisfied smile.",
        sound: "ice shifting in the glass, a relaxed exhale"
      }
    ]
  },
  {
    slug: "silent-arrival",
    name: "Silent Arrival",
    description: "An electric car crosses a desert at dawn with almost no sound at all.",
    tags: ["advertising", "automotive", "electric", "cinematic"],
    brief:
      "An electric car ad about silence. A sleek car crosses a desert road at dawn and the film lets the quiet do the selling: sand barely stirs, a bird is louder than the engine.",
    style:
      "Cinematic car commercial, anamorphic lens flares, golden-hour backlight with a long soft haze. Warm orange sand against a cool teal sky, slow confident camera moves.",
    aspectRatio: "21:9",
    setting:
      "A straight desert highway at dawn, red rock mesas on the horizon, thin mist lying in the low ground",
    cast: [
      {
        name: "the car",
        look: "sleek low electric coupe in pearl white, smooth closed grille, thin light bar across the nose, no badges or lettering"
      },
      {
        name: "the driver",
        look: "man in his 40s, grey linen jacket, calm expression, only seen through the side window"
      }
    ],
    continuity:
      "Same pearl-white coupe, same empty road and red mesas, same low golden sun from frame left in every shot. No license plate text, no badges, no signs.",
    music: "Slow ambient pad with a single piano note, sparse and open",
    shots: [
      {
        slug: "empty-road",
        action:
          "A long straight desert road at first light, heat haze rising, the white car a tiny shape far down the asphalt.",
        motion: "hold",
        camera: { framing: "extreme wide shot", movement: "static" },
        durationSeconds: 4,
        beat: "Mist drifts across the road as the car grows slowly larger in the distance.",
        sound: "wind over sand, one distant bird"
      },
      {
        slug: "low-pass",
        action:
          "The car glides past very close to the camera at road level, sand lifting in a thin line behind it.",
        motion: "track",
        camera: { framing: "low-angle wide shot", movement: "static, car passes through frame" },
        durationSeconds: 3,
        beat: "The car passes in near silence; the loudest sound is the tires on the asphalt.",
        sound: "soft tire hum, faint air rush"
      },
      {
        slug: "calm-driver",
        action:
          "Through the side window the driver rests one hand on the wheel, golden light sliding across his face.",
        motion: "track",
        camera: { framing: "medium close-up", movement: "tracking alongside the window" },
        durationSeconds: 4,
        beat: "He glances at the horizon and the corner of his mouth lifts; the window reflects the mesas.",
        sound: "near-silence, a quiet breath"
      },
      {
        slug: "dawn-flare",
        action:
          "The car crests a rise into the rising sun, a long anamorphic flare stretching across the frame.",
        motion: "crane-up",
        camera: { framing: "wide shot", movement: "slow crane up over the road" },
        durationSeconds: 4,
        beat: "The car dwindles into the light as the flare blooms and the camera rises over the desert.",
        sound: "a single rising piano note, wind"
      }
    ]
  },
  {
    slug: "movement-in-gold",
    name: "Movement in Gold",
    description: "A luxury watch seen as a living mechanism, from gears to wrist.",
    tags: ["advertising", "luxury", "product", "macro"],
    brief:
      "A luxury watch ad that treats the movement as the star. Macro shots of gears and a sweeping second hand build to one calm shot of the watch on a wrist.",
    style:
      "High-end watch commercial, probe macro lens, black studio with a single warm key light and crisp gold highlights. Deep blacks, brushed metal, razor-thin depth of field.",
    aspectRatio: "16:9",
    setting:
      "Black studio void, a dark slate surface with a soft reflection, a thin haze catching the key light",
    cast: [
      {
        name: "the watch",
        look: "round gold watch, champagne dial with thin baton markers, no numerals, no logo, brown leather strap, visible polished bezel"
      }
    ],
    continuity:
      "Same gold watch, same champagne dial with no numerals or lettering, same single warm key light from frame left. Backgrounds are always black and clean. Motion rule: seen from the outside, only the thin second hand moves. The crown, the case, the strap, the hour hand and the minute hand never move. Inside the movement, only the gear wheels rotate.",
    music: "Minimal ticking pulse under a slow string swell",
    shots: [
      {
        slug: "gear-turn",
        action:
          "Extreme macro of a gold gear train filling the whole frame, tiny red jewels glowing between the wheels. Only gears, no watch case or dial in the shot.",
        motion: "push-in",
        camera: { framing: "extreme macro", movement: "slow push in" },
        durationSeconds: 4,
        beat: "The gear wheels rotate steadily, each wheel turning against the next, while light slides along the metal. Only the gear wheels and the balance move.",
        sound: "fine mechanical ticking"
      },
      {
        slug: "second-hand",
        action:
          "The thin second hand sweeps across the champagne dial, catching a bright glint at each marker.",
        motion: "rack-focus",
        camera: { framing: "macro close-up", movement: "rack focus from the hand to the dial edge" },
        durationSeconds: 4,
        beat: "Only the thin second hand moves, sweeping smoothly around the dial. The hour and minute hands, the crown, the case and the strap stay completely still.",
        sound: "smooth sweep, soft tick"
      },
      {
        slug: "crown-detail",
        action:
          "The knurled gold crown of the watch stands perfectly still on the case edge, the gold shimmering as light glides across it, the thin second hand sweeping on the champagne dial behind. No people and no hands in the shot.",
        motion: "orbit",
        camera: { framing: "close-up", movement: "slow orbit left" },
        durationSeconds: 3,
        beat: "The crown does not move and nobody touches it. Only the camera orbit changes the reflections, and the second hand keeps sweeping.",
        sound: "gentle crown ratchet clicks"
      },
      {
        slug: "on-the-wrist",
        action:
          "The watch lies on a dark table edge on a folded charcoal wool cloth, the dial glowing. No people, no wrist and no hands in the shot.",
        motion: "pull-back",
        camera: { framing: "medium close-up", movement: "slow pull back" },
        durationSeconds: 4,
        beat: "The watch lies still while the camera eases back. Only the second hand keeps sweeping on the dial.",
        sound: "single soft tick, fading strings"
      }
    ]
  },
  {
    slug: "dew-drop-serum",
    name: "Dew Drop Serum",
    description: "A skincare ad that follows one drop of serum onto skin.",
    tags: ["advertising", "beauty", "skincare", "vertical"],
    brief:
      "A skincare ad that follows a single drop of serum from the dropper to glowing skin. Clean, soft, tactile, with no packaging text in frame.",
    style:
      "Clean beauty commercial, soft diffused daylight, pale peach and white palette, macro skin texture, slow and weightless.",
    aspectRatio: "9:16",
    setting:
      "Bright minimal bathroom shelf, white marble, a pale peach wall, a soft window glow from frame right",
    cast: [
      {
        name: "the bottle",
        look: "small frosted-glass dropper bottle with a pale gold cap, no label, no lettering"
      },
      {
        name: "the model",
        look: "woman in her early 30s, bare dewy skin, hair pinned back, white towel wrap, only her cheek, jaw and hand are shown"
      }
    ],
    continuity:
      "Same unlabeled frosted bottle, same white marble and peach wall, same soft window light in every shot. Serum is clear with a faint golden shimmer. No printed text.",
    music: "Airy synth pad with soft chimes, gentle and clean",
    shots: [
      {
        slug: "bottle-reveal",
        action:
          "The frosted dropper bottle stands on white marble, morning light glowing through the glass and a soft haze behind it.",
        motion: "push-in",
        camera: { framing: "close-up", movement: "slow push in" },
        durationSeconds: 3,
        beat: "Light slides across the frosted glass as the camera eases closer.",
        sound: "soft airy chime"
      },
      {
        slug: "drop-falls",
        action:
          "Close-up of the model's face tilted slightly up with eyes closed, a glass dropper held above her cheekbone, a round golden serum drop hanging at its tip and about to fall onto her dewy skin.",
        motion: "hold",
        camera: { framing: "close-up", movement: "static, slow motion" },
        durationSeconds: 4,
        beat: "The drop trembles at the tip of the dropper and falls toward her cheek in slow motion.",
        sound: "single glassy drip"
      },
      {
        slug: "skin-touch",
        action:
          "The drop lands on a cheek; fingertips spread it in a slow circle, leaving a soft dewy sheen.",
        motion: "track",
        camera: { framing: "extreme close-up", movement: "slow glide following the fingertips" },
        durationSeconds: 4,
        beat: "The serum melts into the skin and a gentle glow follows the fingertips.",
        sound: "soft skin touch, quiet shimmer"
      },
      {
        slug: "glow-smile",
        action:
          "The model turns her face toward the window light with eyes closed and a small calm smile, her skin radiant.",
        motion: "pull-back",
        camera: { framing: "close-up", movement: "slow pull back" },
        durationSeconds: 4,
        beat: "She opens her eyes slowly and the light catches her cheek.",
        sound: "gentle exhale, fading chimes"
      }
    ]
  },
  {
    slug: "noise-off",
    name: "Noise Off",
    description: "A rush-hour train goes silent the moment the headphones go on.",
    tags: ["advertising", "tech", "audio", "lifestyle"],
    brief:
      "A headphone ad about quiet. A packed morning train is loud and chaotic until she puts the headphones on, and the whole world drops into slow, silent calm.",
    style:
      "Lifestyle tech commercial, shallow depth of field, cool blue train interior with warm window light. Chaotic handheld energy that resolves into smooth still frames.",
    aspectRatio: "16:9",
    setting:
      "One fixed crowded metro carriage in the morning: pale blue walls and doors, blue vinyl bench seats along the windows, silver vertical poles, rectangular windows with warm morning sun from the right, long fluorescent ceiling strips, no signs or printed text. The same background commuters in every shot, always blurred and anonymous: a man in a navy hoodie with a backpack, a woman with a ponytail and a grey scarf, and a man in a tan jacket",
    cast: [
      {
        name: "the commuter",
        look: "woman in her late 20s with a chin-length straight dark brown bob and a side-swept fringe, light olive skin, brown eyes, an olive green wool coat with wide lapels over a black top, calm expression, matte black over-ear headphones without any logo when she wears them"
      }
    ],
    continuity:
      "Same commuter with the same chin-length dark brown bob and fringe, same face, same olive wool coat and matte black logo-free headphones in every shot. Same pale blue carriage with blue bench seats, silver poles and sun from the right in every shot. The same three background commuters (navy hoodie with backpack, ponytail with grey scarf, tan jacket) stay blurred and anonymous. No printed text or signs.",
    music: "Frantic city noise that drops to a slow warm piano loop",
    shots: [
      {
        slug: "rush-hour-chaos",
        action:
          "A packed train in motion, commuters jostling, hands gripping poles, flashes of motion blur. The commuter wears no headphones yet and has bare ears.",
        motion: "handheld",
        camera: { framing: "medium shot", movement: "shaky handheld" },
        durationSeconds: 3,
        beat: "The camera lurches with the train; the commuter looks overwhelmed in the middle of the crowd.",
        sound: "loud train rattle, overlapping chatter, brake squeal"
      },
      {
        slug: "headphones-on",
        action:
          "The commuter lifts one pair of matte black over-ear headphones from her bag and lowers them over her ears. Exactly one pair of headphones is in frame.",
        motion: "push-in",
        camera: { framing: "close-up", movement: "slow push in" },
        durationSeconds: 3,
        beat: "As the pads settle on her ears the shake of the camera stops dead.",
        sound: "pads settling, noise cutting out"
      },
      {
        slug: "silence-falls",
        action:
          "The carriage freezes into slow motion around her: commuters drift in soft focus, light motes float, her face is calm.",
        motion: "orbit",
        camera: { framing: "medium shot", movement: "smooth slow orbit around her" },
        durationSeconds: 5,
        beat: "She breathes out and her shoulders drop while everything around her moves in slow motion.",
        sound: "muffled hush, a warm piano note"
      },
      {
        slug: "window-smile",
        action:
          "She leans her head against the window as golden city light slides over her face and she smiles faintly.",
        motion: "hold",
        camera: { framing: "close-up", movement: "static" },
        durationSeconds: 4,
        beat: "She closes her eyes and nods softly to the music; light passes across her cheek.",
        sound: "soft piano melody, faint heartbeat"
      }
    ]
  },
  {
    slug: "dawn-run",
    name: "Dawn Run",
    description: "A runner crosses a quiet city bridge at sunrise in one unbroken stride.",
    tags: ["advertising", "sport", "running", "vertical"],
    brief:
      "A running shoe ad shot like a short film. One runner, one bridge, one sunrise, and the shoes are the quiet hero of every frame.",
    style:
      "Sports commercial, anamorphic warmth, golden sunrise backlight with long haze, crisp motion, slight film grain. Teal shadows against orange light.",
    aspectRatio: "9:16",
    setting:
      "A long city bridge at sunrise, empty road, river mist below, a pale skyline glowing in the distance",
    cast: [
      {
        name: "the runner",
        look: "athletic man in his 30s, grey running shirt and black shorts, short dark hair, orange-and-white running shoes with no logos"
      }
    ],
    continuity:
      "Same runner in the same grey shirt, black shorts and orange-and-white logo-free shoes, on the same bridge with the same low golden sunrise from frame left. No signs or printed text.",
    music: "Driving build with a steady drum pulse, rising and hopeful",
    shots: [
      {
        slug: "first-stride",
        action:
          "The runner starts down the empty bridge, mist lifting from the river on both sides, his breath visible in the cold.",
        motion: "track",
        camera: { framing: "wide shot", movement: "tracking backward in front of him" },
        durationSeconds: 3,
        beat: "He settles into a steady stride as the sun clears the skyline behind him.",
        sound: "steady footfalls, soft breath, distant gulls"
      },
      {
        slug: "shoe-strike",
        action:
          "An orange-and-white running shoe strikes the wet asphalt, spray and a flare of sunlight bursting from the impact.",
        motion: "hold",
        camera: { framing: "extreme close-up", movement: "static, slow motion" },
        durationSeconds: 3,
        beat: "The shoe lands, flexes and lifts again in slow motion, droplets hanging in the light.",
        sound: "single heavy footfall, water splash"
      },
      {
        slug: "steady-pace",
        action:
          "The runner in profile pushes along the rail, golden light skimming across his shoulder and face, skyline beyond.",
        motion: "track",
        camera: { framing: "medium shot", movement: "tracking alongside at his speed" },
        durationSeconds: 4,
        beat: "His eyes stay forward; the bridge cables pulse past in rhythm.",
        sound: "pounding rhythm, steady breath"
      },
      {
        slug: "sun-crest",
        action:
          "The runner climbs the crest of the bridge into the full sunrise, a flare filling the frame as he lifts his chin.",
        motion: "crane-up",
        camera: { framing: "wide shot", movement: "slow crane up as he reaches the crest" },
        durationSeconds: 3,
        beat: "He slows to a walk at the top, hands on hips, breathing hard and smiling.",
        sound: "music peaks, exhale, a bird calling"
      },
      {
        slug: "the-view",
        action:
          "He turns to look back along the empty bridge as the light floods the city, the shoes planted on the glowing asphalt.",
        motion: "pull-back",
        camera: { framing: "wide shot", movement: "slow pull back" },
        durationSeconds: 2,
        beat: "He nods once and the camera drifts back to reveal the whole bridge in gold.",
        sound: "music resolving, wind"
      }
    ]
  },
  {
    slug: "suite-morning",
    name: "Suite Morning",
    description: "A hotel suite wakes up to an ocean view, from curtains to balcony coffee.",
    tags: ["advertising", "travel", "hospitality", "lifestyle"],
    brief:
      "A boutique hotel ad about the perfect first morning. A drone reveals the hotel and its coastline, a guest wakes in the sunlit suite, coffee waits on the terrace, and she steps out to take in the ocean.",
    style:
      "Luxury travel commercial, natural morning light from frame right, soft airy whites and sand tones with a deep blue sea, golden glow, gentle slow camera moves, shallow depth of field.",
    aspectRatio: "16:9",
    setting:
      "A small white limestone boutique hotel on a seaside cliff above a deep blue bay, with turquoise coves, green headlands and distant blue mountains. The suite has fixed geometry. A king bed stands centred against the far wall with its headboard to the wall: white linen duvet, four white pillows, a sand-coloured throw folded across the foot, and a round oak bedside table with a small white ceramic lamp on each side. The right wall holds two floor-to-ceiling white-framed French doors with six glass panes each, standing open outward onto the terrace, with sheer white linen curtains on a black iron rod. The floor is wide light-oak planks with a cream wool rug under the foot of the bed. The walls are warm white plaster with no pictures. Beyond the doors is a pale limestone terrace with a white limestone balustrade with a rounded top rail, a small round black wrought-iron bistro table with two chairs, and a terracotta pot with a small olive tree. The calm deep blue sea beyond has its horizon one third from the top of the frame. Warm morning sun always enters from the right of the frame",
    cast: [
      {
        name: "the guest",
        look: "woman in her 30s, loose cream linen pajama set, tousled brown hair, relaxed and smiling"
      }
    ],
    continuity:
      "The hotel, suite and terrace never change between shots: the same small white limestone hotel, the same terrace on its sea side, same king bed centred against the far wall, same two open French doors on the right wall, same oak floor and cream rug, same limestone terrace, balustrade, bistro table and olive tree, same calm blue sea and warm morning sun from frame right in every shot. Only the guest appears and only in shots 3 and 4, always in the same cream linen pajamas. The coffee is one white ceramic cup and one croissant. No printed text, no signage, no logos.",
    music: "Bright acoustic guitar with soft percussion, easy and warm",
    shots: [
      {
        slug: "hotel-from-above",
        action:
          "A drone shot starts close above the sea-facing terrace of the small white limestone hotel: two open white French doors with sheer curtains, the bistro table, the olive tree and the white balustrade at the cliff edge, the deep blue sea beyond. No people.",
        motion: "pull-back",
        camera: { framing: "aerial shot widening to an extreme wide shot", movement: "one long drone move that pulls far back and rises, zooming out from the terrace to the whole cliff, bay and coastline" },
        durationSeconds: 6,
        beat: "The drone pulls steadily back and up. The terrace shrinks, then the whole hotel on its cliff, then the turquoise coves, white surf, green headlands and distant blue mountains open up in a huge breathtaking panorama. The hotel ends small in the frame.",
        sound: "soft wind rising, distant waves, gulls, guitar intro"
      },
      {
        slug: "terrace-table",
        action:
          "On the limestone terrace a white ceramic cup of coffee with a thin curl of steam and a single golden croissant on a white plate rest on the round black bistro table, the calm blue sea behind. Nobody in the shot.",
        motion: "hold",
        camera: { framing: "close-up", movement: "static, shallow depth of field" },
        durationSeconds: 3,
        beat: "Steam rises slowly from the cup and a light breeze moves the olive leaves in the soft background. Nothing else moves.",
        sound: "cup on saucer, gulls, gentle waves"
      },
      {
        slug: "guest-wakes",
        action:
          "The guest sits up in the king bed against the white pillows, smiling softly as she turns her face toward the open doors and the light.",
        motion: "hold",
        camera: { framing: "medium shot", movement: "static, very slow drift to the right" },
        durationSeconds: 3,
        beat: "She stretches one arm up, takes a slow breath of sea air and smiles. The camera stays on the bed.",
        sound: "soft sheets, a contented sigh, distant waves"
      },
      {
        slug: "balcony-view",
        action:
          "The guest stands at the limestone balustrade with her back to the camera, holding the coffee cup, looking out over the calm blue sea in the morning sun.",
        motion: "crane-up",
        camera: { framing: "wide shot", movement: "slow crane up and back to reveal the coast" },
        durationSeconds: 3,
        beat: "She lifts the cup, sips and gazes out while the breeze moves her hair. The camera rises to show the whole sunlit coast.",
        sound: "waves, warm guitar swell, gulls"
      }
    ]
  },
  {
    slug: "bowl-time",
    name: "Bowl Time",
    description: "A dog hears the kibble hit the bowl and the whole house knows it.",
    tags: ["advertising", "pets", "food", "comedy"],
    brief:
      "A pet food ad told from the dog's point of view of dinner time. A sleepy golden retriever hears one sound and bursts into joyful action, ending with one clean bowl.",
    style:
      "Warm family-brand commercial, soft natural kitchen light, golden tones, slightly low camera at dog height, playful and clean.",
    aspectRatio: "16:9",
    setting:
      "A cozy family kitchen with light wood floors, warm afternoon sun through a window, a ceramic bowl by the cabinets",
    cast: [
      {
        name: "the dog",
        look: "friendly golden retriever, fluffy cream-gold coat, brown eyes, red bandana, always expressive and happy"
      },
    ],
    continuity:
      "Same golden retriever with the red bandana, same wooden kitchen and warm afternoon sun in every shot. The bowl is plain ceramic with no text and no brand. No printed text anywhere. No people appear anywhere in the film. Strict order of events: 1 the dog sleeps alone on the living room rug and there is no bowl yet. 2 hard cut to the kibble pouring into the bowl, with no dog in the shot. 3 the dog sits at the full bowl and eats. 4 the bowl is empty and the dog looks up. The dog does not eat before shot 3, and the bowl is not full again after shot 3.",
    music: "Playful ukulele with light claps, upbeat and silly",
    shots: [
      {
        slug: "sleepy-dog",
        action:
          "The golden retriever dozes alone on a rug in the living room in a patch of afternoon sun, eyes closed, both soft floppy ears hanging down relaxed against his head. No people and no bowl in the shot.",
        motion: "hold",
        camera: { framing: "low-angle medium shot", movement: "static at dog height" },
        durationSeconds: 4,
        beat: "He sleeps peacefully and breathes slowly with both ears hanging down. In the last second one ear lifts up and stands alert at a faint sound, the other ear stays down, and his eyes stay closed.",
        sound: "quiet kitchen, soft breathing"
      },
      {
        slug: "kibble-sound",
        action:
          "Kibble pours from a scoop at the top edge of the frame into a plain ceramic bowl on the wooden floor, bouncing and rattling as it fills. Only the bowl and the falling kibble are in frame, with no people and no dog.",
        motion: "hold",
        camera: { framing: "close-up", movement: "static, slow motion" },
        durationSeconds: 4,
        beat: "Hard cut. Pieces tumble into the bowl until it is full, a few bouncing out onto the floor. This is the sound the dog hears.",
        sound: "kibble rattling into a bowl"
      },
      {
        slug: "happy-eating",
        action:
          "The dog sits alone in front of the bowl with a wagging tail and digs in, kibble crunching as he eats happily. No people in the shot.",
        motion: "push-in",
        camera: { framing: "close-up", movement: "slow push in" },
        durationSeconds: 5,
        beat: "He arrives at the full bowl, sits, and eats with his whole body wiggling at each bite while his tail thumps the floor.",
        sound: "happy crunching, tail thumping"
      },
      {
        slug: "clean-bowl",
        action:
          "The empty bowl sits spotless on the floor while the dog looks up at the camera with a hopeful grin and a tilted head.",
        motion: "hold",
        camera: { framing: "medium close-up", movement: "static" },
        durationSeconds: 2,
        beat: "The bowl is now completely empty and clean. He licks his nose, looks up at the camera, tilts his head and gives one happy bark.",
        sound: "single happy bark, ukulele sting"
      }
    ]
  }
];
