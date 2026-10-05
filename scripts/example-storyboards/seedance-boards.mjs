// Seedance-ready storyboards, written ahead of their stills.
//
// Each entry has the same shape as a board in `boards.mjs` (slug, name,
// description, tags, brief, style, aspectRatio, shots with slug, action,
// motion, camera and durationSeconds), plus what a Seedance multi-shot
// generation needs: the cast and setting, a continuity line, the music, and
// per shot the `beat` (what moves during the shot), the `sound` and any
// `dialogue`.
//
// Every board is 15 seconds of four or five shots, one action per shot, at
// most two characters, and no legible text in frame, which is what Seedance
// holds together best.
//
// These boards are not built or shipped yet: a shipped example must arrive
// with a still per shot (see `build-example-storyboards.mjs`). To ship one,
// render its stills with `nodetool generate`, add the board to
// `EXAMPLE_STORYBOARDS`, and run the build.

const SHOT_CLOSE =
  "Constraints: no subtitles, no on-screen text, no logos, no watermark. One main action per shot.";

/**
 * The Seedance prompt for a board, meant to sit beside a storyboard grid image
 * of the board's stills (Image 1). `[a-bs]` timecodes are Seedance 2.5 syntax;
 * pass `timecodes: false` for 2.0, which reads shot numbers only.
 */
export function seedancePrompt(board, { timecodes = true } = {}) {
  const duration = board.shots.reduce(
    (sum, shot) => sum + shot.durationSeconds,
    0
  );
  const cast = board.cast
    .map((member) => `${member.name}: ${member.look}`)
    .join("; ");
  const lines = [
    `${duration}-second video, ${board.aspectRatio}. Style: ${board.style}`,
    "Image 1 is a storyboard grid. Read each numbered panel as a separate shot and play them in order as one continuous film. Do not animate the grid, the borders or the panel numbers.",
    `Characters: ${cast}.`,
    `Setting: ${board.setting}.`,
    ""
  ];
  let start = 0;
  board.shots.forEach((shot, index) => {
    const end = start + shot.durationSeconds;
    const time = timecodes ? ` [${start}-${end}s]` : "";
    const line = shot.dialogue
      ? `${shot.beat} {English: "${shot.dialogue}"}`
      : shot.beat;
    const framing =
      shot.camera.framing[0].toUpperCase() + shot.camera.framing.slice(1);
    lines.push(
      `Shot ${index + 1}${time}: ${framing}, ${shot.camera.movement}. ${shot.action} ${line} <${shot.sound}>`
    );
    start = end;
  });
  lines.push(
    "",
    `Continuity: ${board.continuity}`,
    `Music: (${board.music})`,
    SHOT_CLOSE
  );
  return lines.join("\n");
}

export const SEEDANCE_STORYBOARDS = [
  {
    slug: "diver-and-the-whale",
    name: "The Diver and the Whale",
    description:
      "A free diver hangs in open blue water as a humpback glides close enough to touch.",
    tags: ["nature", "underwater", "documentary"],
    brief:
      "A free diver hangs in open blue water as a humpback glides close enough to touch. Slow motion reads natural underwater, so the 4-second shots never feel stalled. Keep the whale's scale huge in every shot.",
    style:
      "Photoreal underwater documentary, natural light, gentle film grain. Cool blue water but warm golden rays from above; soft caustics on skin.",
    aspectRatio: "16:9",
    setting:
      "Open ocean, deep cobalt blue, no seabed visible, sunlight rays from the surface",
    cast: [
      {
        name: "the diver",
        look: "woman in her 30s, black wetsuit, long black fins, short dark hair floating loose, no mask, small silver nose clip"
      }
    ],
    continuity:
      "Same diver, same black wetsuit and silver nose clip in every shot. Whale is a single humpback with white pectoral fins and barnacles on the chin.",
    music: "Low ambient pad, no beat",
    shots: [
      {
        slug: "diver in the blue",
        action:
          "Tiny figure of the diver suspended in endless blue, sun rays fanning down from the top of frame.",
        motion: "hold",
        camera: {
          framing: "extreme wide shot",
          movement: "static, slight drift"
        },
        durationSeconds: 4,
        beat: "She hangs motionless, fins slowly sculling; rays shimmer.",
        sound: "muffled ocean ambience"
      },
      {
        slug: "shadow below",
        action:
          "Diver in profile, hair drifting, head turned down; a vast dark shape fills the lower third below her.",
        motion: "orbit",
        camera: {
          framing: "medium shot",
          movement: "slow orbit left"
        },
        durationSeconds: 3,
        beat: "She turns her head downward as the shadow rises toward her.",
        sound: "distant whale song"
      },
      {
        slug: "whale passes",
        action:
          "Humpback passes left to right across frame, its eye level with the diver, who is small at frame right.",
        motion: "track",
        camera: {
          framing: "wide shot",
          movement: "track alongside the whale"
        },
        durationSeconds: 4,
        beat: "The whale glides past slowly; long pectoral fin sweeps under her.",
        sound: "whale song swells, water pressure hum"
      },
      {
        slug: "almost touching",
        action:
          "Diver's open hand in the foreground, inches from the whale's ridged grey skin; bubbles drift up.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static"
        },
        durationSeconds: 4,
        beat: "Her hand stops just short of touching; a few bubbles leave her lips and rise.",
        sound: "single exhale of bubbles"
      }
    ]
  },
  {
    slug: "morning-syrup",
    name: "Morning Syrup",
    description: "A pancake ad built on one perfect pour of maple syrup.",
    tags: ["advertising", "food", "vertical"],
    brief:
      "A pancake ad built on one perfect pour of maple syrup. Viscous pouring and pooling is one of Seedance's strongest effects. No packaging or branding in frame.",
    style:
      "Premium food commercial, macro photography, shallow depth of field. Warm golden morning window light from frame left, amber highlights, warm grade in every shot.",
    aspectRatio: "9:16",
    setting:
      "Rustic oak table by a window, linen napkin, blurred kitchen behind",
    cast: [
      {
        name: "the stack",
        look: "three thick golden pancakes on a matte white plate, a square pat of butter on top"
      }
    ],
    continuity:
      "Same three pancakes, same white plate and butter pat throughout. Syrup is deep amber and translucent. Warm light only, never blue.",
    music: "Light acoustic guitar, warm and slow",
    shots: [
      {
        slug: "the stack",
        action:
          "The pancake stack centred, butter pat on top, steam wisps, warm window light raking from the left.",
        motion: "push-in",
        camera: {
          framing: "close-up",
          movement: "slow push in"
        },
        durationSeconds: 3,
        beat: "Camera eases in; steam curls up.",
        sound: "soft kitchen ambience"
      },
      {
        slug: "syrup on butter",
        action:
          "A thick amber ribbon of syrup falling from the top of frame onto the butter pat.",
        motion: "hold",
        camera: {
          framing: "extreme close-up",
          movement: "static"
        },
        durationSeconds: 4,
        beat: "Syrup folds onto the butter in a glossy coil; the butter starts to melt and slide.",
        sound: "slow viscous pour"
      },
      {
        slug: "the pool",
        action:
          "Syrup running down the stack's edges, pooling on the plate in a glossy ring.",
        motion: "orbit",
        camera: {
          framing: "medium close-up",
          movement: "orbit 90 degrees right"
        },
        durationSeconds: 4,
        beat: "Rivulets run down all sides and pool; camera orbits to the side profile.",
        sound: "gentle drip"
      },
      {
        slug: "fork lift",
        action:
          "A silver fork lifting a wedge cut from the stack, syrup strings stretching, one drip mid-fall.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static"
        },
        durationSeconds: 4,
        beat: "Fork cuts and lifts the wedge; the syrup string thins and a drop falls back to the plate.",
        sound: "fork tap on ceramic"
      }
    ]
  },
  {
    slug: "puddle-strike",
    name: "Puddle Strike",
    description:
      "A sneaker ad where one stride through a city puddle becomes a crown of water.",
    tags: ["advertising", "product", "vertical"],
    brief:
      "A sneaker ad where one stride through a city puddle becomes a crown of water. Splash physics plus a hero product moment. Seedance may make the splash smaller than asked, so the prompt calls it big.",
    style:
      "Night sports commercial, wet asphalt, high contrast, crisp detail. Orange sodium streetlights and blue dusk sky, strong reflections.",
    aspectRatio: "9:16",
    setting:
      "Empty city street at dusk after rain, wet asphalt, puddle reflecting orange streetlights and a deep blue sky",
    cast: [
      {
        name: "the runner",
        look: "only legs seen: black running tights, bright white unbranded sneakers with a red heel tab"
      }
    ],
    continuity:
      "Same white sneakers with red heel tab in every shot. Shoes stay unbranded with no visible logos or text.",
    music: "Deep bass pulse building to a hit",
    shots: [
      {
        slug: "still puddle",
        action:
          "Ground-level view of a still puddle in the foreground reflecting streetlights; empty street beyond.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "low static, ground level"
        },
        durationSeconds: 3,
        beat: "Puddle surface is still; a car's light passes far behind.",
        sound: "distant traffic hum"
      },
      {
        slug: "the stride",
        action:
          "Runner's legs mid-stride from the knee down, white sneakers, wet road blurring past.",
        motion: "track",
        camera: {
          framing: "medium shot",
          movement: "low tracking alongside"
        },
        durationSeconds: 3,
        beat: "Legs run toward the puddle, camera tracking at shoe height.",
        sound: "rhythmic footsteps"
      },
      {
        slug: "splash crown",
        action:
          "Sneaker sole striking the puddle centre, a crown of water exploding outward, droplets catching orange light.",
        motion: "hold",
        camera: {
          framing: "extreme close-up",
          movement: "static, ground level"
        },
        durationSeconds: 4,
        beat: "The foot lands; the splash crown rises and breaks into droplets.",
        sound: "big splash, bass hit"
      },
      {
        slug: "droplets settle",
        action:
          "Droplets falling around the planted sneaker, reflection reforming in the rippling puddle.",
        motion: "tilt-up",
        camera: {
          framing: "close-up",
          movement: "tilt up"
        },
        durationSeconds: 5,
        beat: "Droplets rain down; ripples settle; the sneaker lifts out of frame.",
        sound: "droplets patter"
      }
    ]
  },
  {
    slug: "the-interrogation",
    name: "The Interrogation",
    description:
      "Two people, one table, one lie exposed in two lines of dialogue.",
    tags: ["film", "dialogue", "noir"],
    brief:
      "Two people, one table, one lie exposed in two lines of dialogue. A lip-sync test: two short quoted lines, one speaker each. The photo is face-down so no image or text needs rendering.",
    style:
      "Neo-noir crime drama, 35mm film look, deep shadows. Single warm overhead lamp, hard top light, falloff to black at the edges.",
    aspectRatio: "16:9",
    setting:
      "Bare concrete interrogation room, metal table, two chairs, one hanging lamp",
    cast: [
      {
        name: "the detective",
        look: "woman in her 50s, grey bob, charcoal blazer, reading glasses pushed up on her head"
      },
      {
        name: "the suspect",
        look: "man in his late 20s, stubble, wrinkled navy hoodie, nervous eyes"
      }
    ],
    continuity:
      "Detective always on the left side of the table, suspect always on the right. Same clothes, same lamp. Only one person speaks per shot; all other mouths stay closed.",
    music: "No music",
    shots: [
      {
        slug: "the room",
        action:
          "Symmetrical wide: detective on the left, suspect on the right, lamp hanging over the table between them.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "static, centred"
        },
        durationSeconds: 3,
        beat: "Both sit still; the lamp sways very slightly.",
        sound: "electric lamp buzz"
      },
      {
        slug: "home at nine",
        action: "Detective in close-up, calm, eyes fixed on the suspect.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "The detective speaks; the suspect stays silent off-screen.",
        sound: "chair creak",
        dialogue: "You said you were home at nine."
      },
      {
        slug: "i was",
        action: "Suspect in close-up, eyes down at the table.",
        motion: "push-in",
        camera: {
          framing: "close-up",
          movement: "slow push in"
        },
        durationSeconds: 3,
        beat: "The suspect answers without looking up; the detective's mouth stays closed.",
        sound: "lamp buzz",
        dialogue: "I was."
      },
      {
        slug: "the photo",
        action:
          "Detective's hand sliding a face-down photograph across the metal table.",
        motion: "hold",
        camera: {
          framing: "insert shot",
          movement: "top-down static"
        },
        durationSeconds: 3,
        beat: "The photo slides to the centre of the table and stops.",
        sound: "paper slides on metal"
      },
      {
        slug: "the look up",
        action:
          "Suspect's face lifting, eyes widening, a drop of sweat at his temple.",
        motion: "push-in",
        camera: {
          framing: "close-up",
          movement: "quick push in"
        },
        durationSeconds: 3,
        beat: "He looks up slowly. No one speaks.",
        sound: "lamp buzz cuts out to silence"
      }
    ]
  },
  {
    slug: "mars-greenhouse",
    name: "Mars Greenhouse",
    description:
      "An astronaut finds the first tomato ripening in a greenhouse on Mars.",
    tags: ["film", "science-fiction"],
    brief:
      "An astronaut finds the first tomato ripening in a greenhouse on Mars. Strong colour story (red, green, white) and one emotional beat.",
    style:
      "Grounded sci-fi feature film, anamorphic look, subtle lens flares. Warm magenta-white grow lights inside, pale butterscotch sky outside.",
    aspectRatio: "16:9",
    setting:
      "Inflatable dome greenhouse on rust-red Martian dunes, rows of green plants in hydroponic troughs",
    cast: [
      {
        name: "the astronaut",
        look: "woman in her 40s, short curly hair, white and orange flight suit with sleeves rolled up, helmet off"
      }
    ],
    continuity:
      "Same astronaut, same white and orange suit, same single tomato. Interior light stays warm.",
    music: "Soft rising strings",
    shots: [
      {
        slug: "dome on the dunes",
        action:
          "A glowing translucent dome alone on red dunes under a pale sky.",
        motion: "push-in",
        camera: {
          framing: "extreme wide shot",
          movement: "slow push in"
        },
        durationSeconds: 3,
        beat: "Dust drifts across the dunes; the dome glows steadily.",
        sound: "thin Martian wind"
      },
      {
        slug: "between the rows",
        action:
          "Astronaut walking between rows of leafy plants, helmet tucked under her arm.",
        motion: "track",
        camera: {
          framing: "medium shot",
          movement: "steadicam follow from behind"
        },
        durationSeconds: 3,
        beat: "She walks slowly down the row, scanning the plants.",
        sound: "ventilation fans hum"
      },
      {
        slug: "first tomato",
        action: "A single ripe red tomato hanging among green leaves.",
        motion: "rack-focus",
        camera: {
          framing: "close-up",
          movement: "rack focus from leaves to fruit"
        },
        durationSeconds: 3,
        beat: "Focus pulls from the leaves to the tomato.",
        sound: "soft fan hum"
      },
      {
        slug: "cupped in hand",
        action:
          "Astronaut cupping the tomato in her hand, a quiet smile, warm light on her face.",
        motion: "hold",
        camera: {
          framing: "medium close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "She gently cups the tomato and smiles.",
        sound: "a small breath of laughter"
      },
      {
        slug: "storm on the horizon",
        action:
          "The dome seen from above, tiny figure inside, a dust storm on the horizon.",
        motion: "crane-up",
        camera: {
          framing: "wide shot",
          movement: "crane up and back"
        },
        durationSeconds: 3,
        beat: "Camera rises away; the distant storm rolls on.",
        sound: "wind rising"
      }
    ]
  },
  {
    slug: "fox-in-snow",
    name: "Fox in Snow",
    description:
      "A red fox hears a mouse beneath the snow and dives head first.",
    tags: ["nature", "wildlife", "documentary"],
    brief:
      "A red fox hears a mouse beneath the snow and dives head first. Single animal and one clear motion per shot. The empty snowfield gives Seedance nothing to confuse.",
    style:
      "Wildlife documentary, telephoto lens, crisp winter light. Low pink-gold sunrise, long blue shadows on the snow.",
    aspectRatio: "16:9",
    setting: "Open snowfield at dawn, birch trees far in the background",
    cast: [
      {
        name: "the fox",
        look: "adult red fox, thick orange winter coat, white chest, black legs, bushy white-tipped tail"
      }
    ],
    continuity:
      "One fox only, same coat colour and white-tipped tail throughout. Morning light stays low and warm.",
    music: "No music",
    shots: [
      {
        slug: "trot across the snow",
        action:
          "The fox trotting left to right across the snowfield, breath visible.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "static, telephoto"
        },
        durationSeconds: 3,
        beat: "The fox trots across the snow, leaving a line of prints.",
        sound: "soft snow crunch"
      },
      {
        slug: "listening",
        action:
          "Fox frozen mid-step, ears swivelled forward, head tilted toward the snow.",
        motion: "hold",
        camera: {
          framing: "medium close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "It stops dead, tilts its head left, then right.",
        sound: "silence, faint wind"
      },
      {
        slug: "the leap",
        action:
          "Fox mid-air in a high arc, front paws tucked, nose pointed down.",
        motion: "track",
        camera: {
          framing: "medium shot",
          movement: "tracking the leap"
        },
        durationSeconds: 3,
        beat: "It springs straight up into a high arc.",
        sound: "whoosh"
      },
      {
        slug: "nose dive",
        action:
          "Fox buried head first in the snow, only the hind legs and tail sticking out.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "It dives nose first into the snow; the tail waves.",
        sound: "muffled thump"
      },
      {
        slug: "shake off",
        action: "Fox's head popping up, face dusted with snow.",
        motion: "hold",
        camera: {
          framing: "medium close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "It pulls free and shakes snow off its head.",
        sound: "snow shake"
      }
    ]
  },
  {
    slug: "clockwork-heart",
    name: "Clockwork Heart",
    description:
      "A macro journey into a brass mechanical heart as it starts to beat.",
    tags: ["animation", "macro", "steampunk"],
    brief:
      "A macro journey into a brass mechanical heart as it starts to beat. Interlocking mechanical motion and metal reflections hold up well, and there's no face to drift.",
    style:
      "Macro steampunk, polished brass, candlelit, shallow depth of field. Warm candlelight, glinting highlights on metal, dust motes.",
    aspectRatio: "16:9",
    setting: "Dark workshop bench, candle, scattered tools",
    cast: [
      {
        name: "the heart",
        look: "anatomical heart built from brass gears, copper pipes and steel springs, about fist sized, under a glass bell dome"
      }
    ],
    continuity:
      "Same heart design throughout: brass gears, two copper pipes on top, one winding key on the right side.",
    music: "Ticking that becomes a heartbeat rhythm",
    shots: [
      {
        slug: "still gears",
        action: "Still brass gears in macro, dust motes in candlelight.",
        motion: "push-in",
        camera: {
          framing: "extreme close-up",
          movement: "slow push in"
        },
        durationSeconds: 3,
        beat: "Nothing moves except drifting dust.",
        sound: "faint candle flicker"
      },
      {
        slug: "the key turns",
        action: "A small brass winding key in the side of the heart.",
        motion: "rack-focus",
        camera: {
          framing: "extreme close-up",
          movement: "rack focus"
        },
        durationSeconds: 4,
        beat: "The key turns once by itself; the first gear clicks.",
        sound: "single loud click"
      },
      {
        slug: "gears cascade",
        action: "Gears, cogs and pistons in motion across the heart's surface.",
        motion: "orbit",
        camera: {
          framing: "close-up",
          movement: "slow orbit"
        },
        durationSeconds: 4,
        beat: "Motion cascades from gear to gear; a spring tightens; the copper chambers pulse.",
        sound: "ticking speeding up"
      },
      {
        slug: "the heart beats",
        action:
          "The whole brass heart beating under its glass dome on the bench.",
        motion: "pull-back",
        camera: {
          framing: "medium shot",
          movement: "pull back"
        },
        durationSeconds: 4,
        beat: "The heart beats in a steady rhythm; candlelight flickers.",
        sound: "mechanical heartbeat"
      }
    ]
  },
  {
    slug: "empty-pool-dawn",
    name: "Empty Pool Dawn",
    description:
      "A skater drops into an empty backyard pool for one clean carve at sunrise.",
    tags: ["action", "sport", "skate"],
    brief:
      "A skater drops into an empty backyard pool for one clean carve at sunrise. Fisheye skate grammar is iconic and easy to describe. One rider, one line.",
    style:
      "90s skate video, fisheye lens, sun flare, light grain. Low orange sunrise behind the pool, long shadows.",
    aspectRatio: "16:9",
    setting:
      "Drained kidney-shaped backyard pool, pale blue tiles, rounded coping, palm trees",
    cast: [
      {
        name: "the skater",
        look: "young man, green beanie, oversized white T-shirt, baggy tan trousers, black skate shoes, maple board with red wheels"
      }
    ],
    continuity:
      "Same skater outfit and red-wheeled board in every shot. Tiles are plain, with no graffiti or text.",
    music: "Lo-fi punk guitar riff",
    shots: [
      {
        slug: "empty pool",
        action:
          "Empty pool from the shallow end, clean blue tiles, sun rising behind the far wall.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "static wide"
        },
        durationSeconds: 3,
        beat: "Leaves blow across the pool floor.",
        sound: "birds at dawn"
      },
      {
        slug: "tail tap",
        action:
          "Skater on the coping with the board's tail hanging over the edge.",
        motion: "handheld",
        camera: {
          framing: "medium shot",
          movement: "fisheye handheld"
        },
        durationSeconds: 3,
        beat: "He taps the tail on the coping twice.",
        sound: "tail tap"
      },
      {
        slug: "drop in",
        action: "Skater dropping in down the wall, crouched, arms out.",
        motion: "track",
        camera: {
          framing: "wide shot",
          movement: "fisheye follow"
        },
        durationSeconds: 4,
        beat: "He drops in and carves across the deep end.",
        sound: "urethane roll, rising"
      },
      {
        slug: "coping grind",
        action: "Red wheels and truck grinding along the coping.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static low"
        },
        durationSeconds: 2,
        beat: "Truck grinds along the coping, sparks of grit.",
        sound: "coping grind"
      },
      {
        slug: "roll out",
        action:
          "Skater rolling out on the flat, kicking the board up into his hand.",
        motion: "hold",
        camera: {
          framing: "medium shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "He rolls out, kicks the board up and catches it.",
        sound: "board clack"
      }
    ]
  },
  {
    slug: "duel-in-the-wheat",
    name: "Duel in the Wheat",
    description:
      "Two swordsmen face off in a windblown wheat field. One strike.",
    tags: ["film", "action", "samurai"],
    brief:
      "Two swordsmen face off in a windblown wheat field. One strike. Classic face-off structure keeps the two fighters in separate shots until one beat of contact, which Seedance handles better than sustained fighting.",
    style:
      "Epic samurai cinema, golden hour, wind-swept, painterly realism. Low golden sun from behind the ronin, long shadows, warm haze.",
    aspectRatio: "21:9",
    setting: "Endless golden wheat field, a single bare tree on the horizon",
    cast: [
      {
        name: "the ronin",
        look: "lean man, faded indigo kimono, straw-tied topknot, scar over left eye"
      },
      {
        name: "the duelist",
        look: "broad man, crimson kimono, black hakama, shaved head"
      }
    ],
    continuity:
      "Ronin in indigo always on the left, duelist in crimson always on the right until they cross. Same costumes throughout. They touch only in shot 4.",
    music: "Taiko drum, single hit at the strike",
    shots: [
      {
        slug: "two in the wheat",
        action:
          "Two small figures far apart in the wheat, the ronin on the left, the duelist on the right, the tree between them on the horizon.",
        motion: "hold",
        camera: {
          framing: "extreme wide shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "Wind sends waves through the wheat.",
        sound: "wind through wheat"
      },
      {
        slug: "the ronin",
        action:
          "Ronin's eyes, scar over the left one, hair stirring in the wind.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "He narrows his eyes. No movement otherwise.",
        sound: "wind"
      },
      {
        slug: "hand on the hilt",
        action: "Duelist's hand tightening on the hilt of his sheathed sword.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "His knuckles whiten as he grips the hilt.",
        sound: "leather creak"
      },
      {
        slug: "one strike",
        action:
          "Both men running toward each other through the wheat, then passing in a blur of one slash.",
        motion: "track",
        camera: {
          framing: "wide shot",
          movement: "fast lateral track"
        },
        durationSeconds: 3,
        beat: "They charge and cross; one flash of steel.",
        sound: "steel ring, taiko hit"
      },
      {
        slug: "the fall",
        action:
          "Both standing back to back, far apart, swords out; wheat settling.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "A beat of stillness, then the duelist in crimson drops to one knee.",
        sound: "silence, then wind returns"
      }
    ]
  },
  {
    slug: "clay-monday",
    name: "Clay Monday",
    description:
      "A claymation character drags himself out of bed and makes coffee.",
    tags: ["animation", "claymation", "comedy"],
    brief:
      "A claymation character drags himself out of bed and makes coffee. The stop-motion look forgives imperfect motion and stays consistent.",
    style:
      "Stop-motion claymation, visible thumbprints, slightly choppy 12 fps feel. Soft warm morning light through the round window.",
    aspectRatio: "16:9",
    setting:
      "Tiny clay bedroom-kitchen, mustard walls, round window, felt bedspread",
    cast: [
      {
        name: "Pip",
        look: "round-bodied clay man, sky-blue pyjamas, messy orange hair, big white eyes with small black pupils"
      }
    ],
    continuity:
      "Same clay character: sky-blue pyjamas, orange hair. Same yellow mug. Visible clay texture in every shot.",
    music: "Plucky pizzicato strings",
    shots: [
      {
        slug: "alarm",
        action:
          "Pip asleep in bed under a felt cover; a round alarm clock on the nightstand.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "The alarm clock rattles and hops on the nightstand.",
        sound: "tinny alarm ring"
      },
      {
        slug: "out of bed",
        action: "Pip flopped face down on the floor beside the bed.",
        motion: "hold",
        camera: {
          framing: "medium shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "He rolls out of bed and flops onto the floor.",
        sound: "soft clay flop"
      },
      {
        slug: "the kettle",
        action: "Pip shuffling to a tiny kettle on the counter.",
        motion: "pan-right",
        camera: {
          framing: "medium shot",
          movement: "pan right"
        },
        durationSeconds: 3,
        beat: "He shuffles over and presses the kettle switch.",
        sound: "kettle click, rising whistle"
      },
      {
        slug: "the pour",
        action: "Coffee pouring into a yellow mug, sculpted clay steam.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "Coffee pours; clay steam curls up.",
        sound: "pour"
      },
      {
        slug: "first sip",
        action: "Pip sipping from the yellow mug.",
        motion: "push-in",
        camera: {
          framing: "close-up",
          movement: "push in"
        },
        durationSeconds: 3,
        beat: "He sips; his eyes pop wide open and his hair stands up.",
        sound: "slurp, boing"
      }
    ]
  },
  {
    slug: "ink-dragon",
    name: "Ink Dragon",
    description: "A drop of black ink in water blooms into a sumi-e dragon.",
    tags: ["animation", "fluid", "ink"],
    brief:
      "A drop of black ink in water blooms into a sumi-e dragon. Ink in water is fluid physics at its prettiest, and the style change happens once.",
    style:
      "Macro liquid photography that turns into Chinese sumi-e ink painting. Soft white diffused light, pure white background.",
    aspectRatio: "16:9",
    setting: "A clear glass of water on white rice paper",
    cast: [
      {
        name: "the dragon",
        look: "long serpentine Chinese dragon made of black ink, with whiskers, antlers and a flowing mane"
      }
    ],
    continuity: "Ink stays pure black on white throughout. One dragon only.",
    music: "Low resonant gong, then guzheng",
    shots: [
      {
        slug: "clear water",
        action: "Clear glass of still water against a pure white background.",
        motion: "hold",
        camera: {
          framing: "extreme close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "A single drop of ink falls from above.",
        sound: "drip"
      },
      {
        slug: "ink drop",
        action:
          "Black ink plume blooming down through the water in curling tendrils.",
        motion: "hold",
        camera: {
          framing: "extreme close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "The ink curls and unfurls downward.",
        sound: "low gong"
      },
      {
        slug: "dragon forms",
        action:
          "Ink tendrils forming the head and coiling body of a dragon inside the glass.",
        motion: "orbit",
        camera: {
          framing: "close-up",
          movement: "slow orbit"
        },
        durationSeconds: 4,
        beat: "The tendrils shape themselves into a dragon that opens its eyes.",
        sound: "guzheng phrase"
      },
      {
        slug: "onto the paper",
        action:
          "The ink dragon flowing out of the glass onto the rice paper as brush strokes.",
        motion: "pull-back",
        camera: {
          framing: "wide shot",
          movement: "pull back"
        },
        durationSeconds: 5,
        beat: "The dragon swims out of the glass and becomes a sumi-e painting across the paper.",
        sound: "brush whisper"
      }
    ]
  },
  {
    slug: "mountain-pass-drift",
    name: "Mountain Pass Drift",
    description:
      "A lone car drifts a hairpin at night, headlights carving through fog.",
    tags: ["action", "automotive", "night"],
    brief:
      "A lone car drifts a hairpin at night, headlights carving through fog. Tyre smoke and light in fog are easy wins. One car means no collision to get wrong.",
    style:
      "Night car film, cinematic, wet road sheen, haze. Headlights and red taillights only, cool blue moonlight.",
    aspectRatio: "16:9",
    setting: "Mountain switchback road, guardrails, pine forest, low fog",
    cast: [
      {
        name: "the car",
        look: "boxy 90s Japanese coupe, matte white paint, pop-up headlights, no badges or plates"
      },
      {
        name: "the driver",
        look: "only hands seen: black fingerless driving gloves"
      }
    ],
    continuity:
      "One white coupe, no badges or plates. Same road and guardrails throughout.",
    music: "Synth bassline",
    shots: [
      {
        slug: "switchbacks",
        action:
          "Switchback road snaking down the mountain, a single pair of headlights.",
        motion: "hold",
        camera: {
          framing: "extreme wide shot",
          movement: "high drone, static"
        },
        durationSeconds: 3,
        beat: "The headlights wind down the road toward the hairpin.",
        sound: "distant engine"
      },
      {
        slug: "into the hairpin",
        action: "The white coupe sideways in the hairpin, tyre smoke pouring.",
        motion: "track",
        camera: {
          framing: "medium shot",
          movement: "tracking side"
        },
        durationSeconds: 3,
        beat: "The car slides into the corner sideways.",
        sound: "engine scream, tyre squeal"
      },
      {
        slug: "countersteer",
        action: "Gloved hands countersteering the wheel.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static inside the car"
        },
        durationSeconds: 3,
        beat: "Hands whip the wheel the opposite way.",
        sound: "tyres screech"
      },
      {
        slug: "taillights in fog",
        action: "Red taillights snaking through fog.",
        motion: "track",
        camera: {
          framing: "wide shot",
          movement: "drone follow from behind"
        },
        durationSeconds: 3,
        beat: "The car exits the corner and accelerates away.",
        sound: "gear shift"
      },
      {
        slug: "smoke hangs",
        action: "Empty hairpin with tyre smoke hanging in the headlight glow.",
        motion: "hold",
        camera: {
          framing: "extreme wide shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "The smoke drifts and thins.",
        sound: "engine echo fading"
      }
    ]
  },
  {
    slug: "dust-ballet",
    name: "Dust Ballet",
    description:
      "A dancer performs alone in an abandoned theatre lit through holes in the roof.",
    tags: ["film", "dance", "atmosphere"],
    brief:
      "A dancer performs alone in an abandoned theatre lit through holes in the roof. One performer, an orbit move and volumetric light all play to Seedance's strengths.",
    style:
      "Arthouse film, volumetric light, muted palette, 35mm. Hard shafts of daylight through holes in the roof, dust glowing in the beams.",
    aspectRatio: "16:9",
    setting:
      "Ruined opera house, rows of torn red velvet seats, broken roof, dusty wooden stage",
    cast: [
      {
        name: "the dancer",
        look: "woman in her 20s, pale grey leotard, long chiffon skirt, hair in a low bun, worn pink pointe shoes"
      }
    ],
    continuity:
      "Same dancer and costume throughout. Light always comes from above.",
    music: "Distant solo piano",
    shots: [
      {
        slug: "ruined theatre",
        action:
          "Ruined theatre from the back rows, light shafts falling onto the empty stage.",
        motion: "hold",
        camera: {
          framing: "extreme wide shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "Dust swirls slowly in the light beams.",
        sound: "creaking building"
      },
      {
        slug: "en pointe",
        action:
          "The dancer rising en pointe inside a light shaft, arms in an arc.",
        motion: "orbit",
        camera: {
          framing: "medium shot",
          movement: "steadicam orbit"
        },
        durationSeconds: 4,
        beat: "She rises en pointe and sweeps her arms; dust swirls around her.",
        sound: "piano begins"
      },
      {
        slug: "pointe shoes",
        action: "Pointe shoes turning on dusty floorboards.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static, floor level"
        },
        durationSeconds: 3,
        beat: "Her feet pivot, scattering dust.",
        sound: "shoe scrape"
      },
      {
        slug: "final spin",
        action:
          "Dancer in a final spin, skirt flaring, inside the brightest shaft.",
        motion: "crane-up",
        camera: {
          framing: "wide shot",
          movement: "crane up"
        },
        durationSeconds: 5,
        beat: "She spins and stops; dust hangs in the light.",
        sound: "last piano note"
      }
    ]
  },
  {
    slug: "under-the-bed",
    name: "Under the Bed",
    description:
      "A kid shines a flashlight under the bed and finds a monster more scared than she is.",
    tags: ["animation", "family"],
    brief:
      "A kid shines a flashlight under the bed and finds a monster more scared than she is. The flashlight reveal is a strong storyboard beat, and the stylised 3D look stays consistent.",
    style:
      "Stylised 3D animated family film, soft shading, rich moonlit colour. Blue moonlight, warm yellow flashlight beam.",
    aspectRatio: "16:9",
    setting:
      "Kid's bedroom at night, moonlight through the window, toys on a rug",
    cast: [
      {
        name: "Mia",
        look: "girl about 7, curly black hair, yellow star-print pyjamas"
      },
      {
        name: "the monster",
        look: "small round fuzzy purple monster with huge green eyes and two stubby horns"
      }
    ],
    continuity:
      "Same Mia and pyjamas, same purple monster. The flashlight beam is always warm yellow.",
    music: "Music box melody",
    shots: [
      {
        slug: "moonlit bedroom",
        action:
          "Dark bedroom in moonlight, Mia sitting up in bed holding a flashlight.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "A creak; Mia's head turns toward the edge of the bed.",
        sound: "floorboard creak"
      },
      {
        slug: "flashlight on",
        action: "Mia leaning over the edge of the bed, flashlight in hand.",
        motion: "push-in",
        camera: {
          framing: "medium shot",
          movement: "slow push in"
        },
        durationSeconds: 3,
        beat: "She clicks the flashlight on and leans down.",
        sound: "flashlight click"
      },
      {
        slug: "eyes under the bed",
        action:
          "Flashlight beam under the bed revealing two big glowing green eyes in the dark.",
        motion: "handheld",
        camera: {
          framing: "point-of-view shot",
          movement: "handheld"
        },
        durationSeconds: 3,
        beat: "The beam sweeps across dust and toys and lands on the eyes.",
        sound: "tiny gasp"
      },
      {
        slug: "scared monster",
        action:
          "The purple monster covering its eyes with its paws, trembling.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "The monster shivers and peeks through its paws.",
        sound: "small whimper"
      },
      {
        slug: "the teddy",
        action:
          "Mia holding out her teddy bear under the bed; the monster reaching for it.",
        motion: "hold",
        camera: {
          framing: "medium shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "Mia offers the teddy; the monster slowly takes it.",
        sound: "music box resumes"
      }
    ]
  },
  {
    slug: "summit-reveal",
    name: "Summit Reveal",
    description: "A climber pulls onto a summit as the clouds break below.",
    tags: ["nature", "adventure"],
    brief:
      "A climber pulls onto a summit as the clouds break below. The crane-up reveal is the payoff. The prompt ties the move to her standing up so it lands.",
    style:
      "Epic adventure documentary, high altitude, crisp air, IMAX feel. Sunrise, warm orange on the snow, deep blue sky.",
    aspectRatio: "21:9",
    setting: "Knife-edge snowy summit ridge above a sea of clouds",
    cast: [
      {
        name: "the climber",
        look: "climber in a bright red down jacket, black helmet, mirrored goggles, ice axe"
      }
    ],
    continuity: "Same red jacket and black helmet throughout. One climber.",
    music: "Orchestral swell on the reveal",
    shots: [
      {
        slug: "final hold",
        action: "Gloved hand gripping the final rock, frost on the glove.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "The hand grips and pulls.",
        sound: "wind, heavy breath"
      },
      {
        slug: "onto the ridge",
        action: "Climber hauling onto the summit ridge, breathing hard.",
        motion: "hold",
        camera: {
          framing: "medium shot",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "She drags herself up onto the ridge and kneels.",
        sound: "panting"
      },
      {
        slug: "goggles up",
        action: "Climber standing and pushing her goggles up.",
        motion: "orbit",
        camera: {
          framing: "medium shot",
          movement: "slow orbit"
        },
        durationSeconds: 3,
        beat: "She stands and lifts her goggles onto the helmet.",
        sound: "wind gust"
      },
      {
        slug: "sea of clouds",
        action:
          "Tiny red figure on the summit above a vast sea of clouds and distant peaks at sunrise.",
        motion: "crane-up",
        camera: {
          framing: "extreme wide shot",
          movement: "crane up and back"
        },
        durationSeconds: 6,
        beat: "Camera rises and pulls back, revealing the clouds and peaks.",
        sound: "music swell"
      }
    ]
  },
  {
    slug: "silk-and-glass",
    name: "Silk and Glass",
    description:
      "A perfume ad built on falling silk and water droplets on glass.",
    tags: ["advertising", "fragrance", "vertical"],
    brief:
      "A perfume ad built on falling silk and water droplets on glass. Cloth and water on glass are signature Seedance textures. The unbranded bottle avoids text errors.",
    style:
      "Luxury fragrance commercial, macro, glossy black studio. Single soft key light from above, rim light, light flares across the glass.",
    aspectRatio: "9:16",
    setting: "Seamless glossy black studio surface",
    cast: [
      {
        name: "the bottle",
        look: "faceted clear glass perfume bottle, pale rose liquid, round gold cap, no label"
      }
    ],
    continuity:
      "Same bottle, rose liquid and gold cap. No label, text or logo anywhere.",
    music: "Airy synth, slow",
    shots: [
      {
        slug: "droplets on glass",
        action:
          "Water droplets beaded on the bottle's facets, rose liquid glowing inside.",
        motion: "hold",
        camera: {
          framing: "extreme close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "One droplet trembles.",
        sound: "quiet room tone"
      },
      {
        slug: "silk falls",
        action: "Deep red silk falling over the bottle.",
        motion: "orbit",
        camera: {
          framing: "close-up",
          movement: "slow orbit"
        },
        durationSeconds: 4,
        beat: "The silk falls and drapes over the bottle.",
        sound: "silk whisper"
      },
      {
        slug: "silk slides away",
        action:
          "Silk sliding off the bottle; a droplet running down the glass.",
        motion: "hold",
        camera: {
          framing: "medium close-up",
          movement: "static"
        },
        durationSeconds: 4,
        beat: "The silk slides away; a droplet runs down.",
        sound: "droplet tap"
      },
      {
        slug: "the bottle alone",
        action: "The bottle alone on black, a light flare sweeping across it.",
        motion: "pull-back",
        camera: {
          framing: "close-up",
          movement: "slow pull back"
        },
        durationSeconds: 4,
        beat: "Light sweeps across the bottle; the reflection glows.",
        sound: "synth swell"
      }
    ]
  },
  {
    slug: "rooftop-run",
    name: "Rooftop Run",
    description: "A parkour runner crosses three rooftops at golden hour.",
    tags: ["action", "parkour"],
    brief:
      "A parkour runner crosses three rooftops at golden hour. One runner and one clear direction; every shot has a single verb.",
    style:
      "Action film, golden hour, handheld energy, warm haze. Low golden sun, warm orange, long shadows.",
    aspectRatio: "16:9",
    setting: "Flat city rooftops with AC units and water tanks, skyline behind",
    cast: [
      {
        name: "the runner",
        look: "young woman, black hoodie with the hood down, grey joggers, white trainers, braided hair"
      }
    ],
    continuity:
      "Same runner and outfit throughout. She always runs left to right.",
    music: "Driving electronic beat",
    shots: [
      {
        slug: "across the roof",
        action: "Runner sprinting across a flat rooftop toward the edge.",
        motion: "track",
        camera: {
          framing: "wide shot",
          movement: "drone follow from behind"
        },
        durationSeconds: 3,
        beat: "She sprints across the roof.",
        sound: "footfalls"
      },
      {
        slug: "the vault",
        action: "Runner vaulting over a metal AC unit.",
        motion: "track",
        camera: {
          framing: "medium shot",
          movement: "tracking side"
        },
        durationSeconds: 3,
        beat: "She vaults the AC unit in one move.",
        sound: "hands slap metal"
      },
      {
        slug: "the gap",
        action:
          "Runner mid-air leaping a gap between two buildings, street far below.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "static side, wide"
        },
        durationSeconds: 4,
        beat: "She leaps across the gap.",
        sound: "wind rush"
      },
      {
        slug: "the roll",
        action: "Runner rolling on landing.",
        motion: "hold",
        camera: {
          framing: "medium shot",
          movement: "static"
        },
        durationSeconds: 2,
        beat: "She lands and rolls forward to her feet.",
        sound: "impact, gravel"
      },
      {
        slug: "at the edge",
        action:
          "Runner standing at the roof edge, silhouetted against the sun.",
        motion: "pull-back",
        camera: {
          framing: "extreme wide shot",
          movement: "drone pull back"
        },
        durationSeconds: 3,
        beat: "She stands still, catching her breath; camera pulls away.",
        sound: "breath, beat drops out"
      }
    ]
  },
  {
    slug: "the-long-hallway",
    name: "The Long Hallway",
    description:
      "A night-shift nurse sees something at the end of a hospital corridor.",
    tags: ["film", "horror"],
    brief:
      "A night-shift nurse sees something at the end of a hospital corridor. Dolly zoom is a named move Seedance knows, and the scare comes from light, not complex action.",
    style:
      "Psychological horror, cold desaturated look, fluorescent green tint. Flickering fluorescent tubes, green-white cast.",
    aspectRatio: "16:9",
    setting: "Long empty hospital corridor, closed doors, linoleum floor",
    cast: [
      {
        name: "the nurse",
        look: "woman in her 30s, teal scrubs, hair in a ponytail, clipboard"
      },
      {
        name: "the figure",
        look: "indistinct dark silhouette, barely visible at the far end"
      }
    ],
    continuity:
      "Same nurse and teal scrubs. The figure never moves or shows a face.",
    music: "Low drone",
    shots: [
      {
        slug: "the corridor",
        action: "Long empty corridor, one fluorescent tube flickering.",
        motion: "hold",
        camera: {
          framing: "wide shot",
          movement: "static, centred"
        },
        durationSeconds: 3,
        beat: "The light flickers twice.",
        sound: "fluorescent buzz"
      },
      {
        slug: "walking away",
        action: "Nurse walking away from camera down the corridor.",
        motion: "track",
        camera: {
          framing: "medium shot",
          movement: "tracking from behind"
        },
        durationSeconds: 3,
        beat: "She walks steadily down the corridor.",
        sound: "footsteps on linoleum"
      },
      {
        slug: "she stops",
        action: "Nurse stopping, eyes widening.",
        motion: "hold",
        camera: {
          framing: "medium close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "She stops dead and stares ahead.",
        sound: "footsteps stop"
      },
      {
        slug: "dolly zoom",
        action: "The corridor stretching, a dark figure at the far end.",
        motion: "dolly-zoom",
        camera: {
          framing: "point-of-view shot",
          movement: "dolly zoom"
        },
        durationSeconds: 3,
        beat: "The corridor warps with a dolly zoom; the figure stays still.",
        sound: "rising drone"
      },
      {
        slug: "lights out",
        action: "Nurse's face lit by flickering light.",
        motion: "hold",
        camera: {
          framing: "close-up",
          movement: "static"
        },
        durationSeconds: 3,
        beat: "The light cuts out to black.",
        sound: "sudden silence"
      }
    ]
  }
];
