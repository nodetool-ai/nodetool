/**
 * The Game flow's designer contract (game-prd § 5.2).
 *
 * The designer writes text and nothing else: a title, a premise, the loop, the
 * cast, and one subject line per asset slot. It places no node and starts no
 * job, which is what makes acceptance criterion 3 assertable — the creator
 * reads and edits the whole design before a single pixel is paid for.
 *
 * Three pieces, all pure:
 *
 * - {@link buildGameDesignSchema} pins the manifest's slot ids into the
 *   structured-output schema as enums, so a model cannot invent a slot the
 *   template has no place for;
 * - {@link parseGameDesign} reads an answer back, fills anything the model
 *   skipped from the manifest's own prompts, and reports what it filled;
 * - {@link GAME_INSPIRATION_CHIPS} carries one pinned design per shipped
 *   template, so a keyless install walks the whole flow and the harness has
 *   something to build against.
 *
 * The slot ids in the chips are written out rather than read from a template
 * package: protocol sits below game nodes in the dependency order.
 * `game-design.test.ts` reads the fixture manifests off disk
 * and fails when a chip stops covering one.
 */

import { isRecord, isString } from "./predicates.js";
import {
  GAME_LEVEL_DIFFICULTIES,
  GAME_LEVEL_SIZES,
  gameDesign,
  gameDesignLayout,
  type GameDesign,
  type GameSetupStage
} from "./api-schemas/workflows.js";
import type { GameAssetManifest, GameSlotSpec } from "./game-assets.js";

// ── The designer's contract ─────────────────────────────────────────────────

export const GAME_DESIGN_TOOL_NAME = "game_design";

export const GAME_DESIGN_TOOL_DESCRIPTION =
  "The written design for one game: its premise, loop, cast, enemies and level, plus the subject of every asset the chosen template needs.";

export const GAME_DESIGNER_SYSTEM_PROMPT = [
  "You design small 2D games for a native game template. You write text; you",
  "build nothing.",
  "",
  "You are given the template's asset manifest — every slot it needs, that",
  "slot's kind, its pixel cell size, and the placeholder prompt the template",
  "ships with — and one sentence from the creator. Return a design that fits",
  "that template exactly.",
  "",
  "Rules:",
  "- One cast entry per spritesheet slot, keyed by that slot's id. A cast",
  "  descriptor is silhouette, colours and proportions — never a pose, never a",
  "  camera angle, never a style word. It is pasted into every frame of that",
  "  character's sheet, so it has to hold across all of them.",
  "- One enemy entry per slot whose id starts with `enemy`, naming what it does",
  "  in the loop, not what it looks like.",
  "- One prompt per slot in the manifest, keyed by the slot id.",
  "- A slot prompt is the SUBJECT ONLY. No style words, no palette, no pixel",
  "  size, no frame counts, no words like `sprite sheet`, `tileset` or",
  "  `seamless`. The graph adds all of that from the slot spec and the chosen",
  "  style. A prompt that carries its own style fights the style the creator",
  "  picked and the game stops reading as one game.",
  "- Keep the premise to two or three sentences and the core loop to what the",
  "  player does every ten seconds.",
  "- Win and lose are one line each.",
  "- `layout` sets the level the build generates. `size` is small (six",
  "  rooms), medium (nine) or large (twelve). `difficulty` is relaxed, normal",
  "  or hard and sets the player's health, how fast enemies move and how many",
  "  hazards there are. Pick the pair the brief implies; a cosy or short brief",
  "  is small and relaxed, a tense or long one is large and hard.",
  "- For the top-down template, the level is rooms joined by corridors. The",
  "  player collects every gem, which opens the exit, and leaves through it.",
  "  Some enemies patrol a room and others chase the player on sight; each",
  "  touch costs one health, and floor hazards hurt the same way. Write the",
  "  premise, loop, win and lose so they describe that game in the brief's",
  "  world, and say in the level text what the rooms look like."
].join("\n");

const slotIdsOf = (manifest: GameAssetManifest): string[] =>
  manifest.slots.map((slot) => slot.id);

const spritesheetSlotsOf = (manifest: GameAssetManifest): GameSlotSpec[] =>
  manifest.slots.filter((slot) => slot.kind === "spritesheet");

/** Slots the designer must write an enemy for: the ones the template names so. */
export const GAME_ENEMY_SLOT_PREFIX = "enemy";

const enemySlotsOf = (manifest: GameAssetManifest): GameSlotSpec[] =>
  manifest.slots.filter((slot) => slot.id.startsWith(GAME_ENEMY_SLOT_PREFIX));

/**
 * The structured-output schema the designer asks for, with this template's
 * slot ids pinned as enums.
 */
export function buildGameDesignSchema(
  manifest: GameAssetManifest
): Record<string, unknown> {
  const slotIds = slotIdsOf(manifest);
  const castIds = spritesheetSlotsOf(manifest).map((slot) => slot.id);
  const enemyIds = enemySlotsOf(manifest).map((slot) => slot.id);
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "premise",
      "core_loop",
      "player_verbs",
      "enemies",
      "level",
      "win",
      "lose",
      "cast",
      "slot_prompts",
      "layout"
    ],
    properties: {
      title: { type: "string" },
      premise: { type: "string" },
      core_loop: { type: "string" },
      player_verbs: { type: "array", items: { type: "string" } },
      enemies: {
        type: "array",
        minItems: enemyIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["slot_id", "name", "behaviour"],
          properties: {
            slot_id: { type: "string", enum: enemyIds },
            name: { type: "string" },
            behaviour: { type: "string" }
          }
        }
      },
      level: { type: "string" },
      win: { type: "string" },
      lose: { type: "string" },
      cast: {
        type: "array",
        minItems: castIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["slot_id", "name", "descriptor"],
          properties: {
            slot_id: { type: "string", enum: castIds },
            name: { type: "string" },
            descriptor: { type: "string" }
          }
        }
      },
      layout: {
        type: "object",
        additionalProperties: false,
        required: ["size", "difficulty"],
        properties: {
          size: { type: "string", enum: [...GAME_LEVEL_SIZES] },
          difficulty: { type: "string", enum: [...GAME_LEVEL_DIFFICULTIES] }
        }
      },
      slot_prompts: {
        type: "array",
        minItems: slotIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["slot_id", "prompt"],
          properties: {
            slot_id: { type: "string", enum: slotIds },
            prompt: { type: "string" }
          }
        }
      }
    }
  };
}

export interface ParsedGameDesign {
  design: GameDesign;
  /**
   * Slot ids the parser had to fill from the manifest, as
   * `slot_prompts.<id>` and `cast.<id>`. The review step shows these so the
   * creator knows which lines are the template's words and not the designer's.
   */
  filled: string[];
}

const nonEmpty = (value: unknown): string | null =>
  isString(value) && value.trim().length > 0 ? value : null;

/**
 * Read a designer answer into a design.
 *
 * Returns null when the answer is not a design shape at all, so the caller
 * reports a refused run rather than opening an empty review.
 *
 * A slot the model skipped — or answered with whitespace — is filled from the
 * manifest's own prompt, and a spritesheet slot with no cast entry gets the
 * slot id as its name and the manifest prompt as its descriptor. Both are
 * reported in `filled`: the flow shows placeholder text as placeholder text
 * instead of shipping it as the designer's work. Entries for a slot id the
 * manifest does not have are dropped — the schema pins the ids, so one only
 * arrives from a model that ignored it, and keeping it would place a chain for
 * a slot the export node has no input for.
 */
export function parseGameDesign(
  raw: unknown,
  manifest: GameAssetManifest
): ParsedGameDesign | null {
  if (!isRecord(raw)) {
    return null;
  }
  const known = new Map(manifest.slots.map((slot) => [slot.id, slot]));
  const filled: string[] = [];

  const rawPrompts = Array.isArray(raw["slot_prompts"]) ? raw["slot_prompts"] : [];
  const prompts = new Map<string, string>();
  for (const entry of rawPrompts) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = nonEmpty(entry["slot_id"]);
    const prompt = nonEmpty(entry["prompt"]);
    if (id === null || prompt === null || !known.has(id) || prompts.has(id)) {
      continue;
    }
    prompts.set(id, prompt);
  }

  const rawCast = Array.isArray(raw["cast"]) ? raw["cast"] : [];
  const cast = new Map<string, { name: string; descriptor: string }>();
  for (const entry of rawCast) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = nonEmpty(entry["slot_id"]);
    const name = nonEmpty(entry["name"]);
    const descriptor = nonEmpty(entry["descriptor"]);
    if (id === null || name === null || descriptor === null) {
      continue;
    }
    if (known.get(id)?.kind !== "spritesheet" || cast.has(id)) {
      continue;
    }
    cast.set(id, { name, descriptor });
  }

  const rawEnemies = Array.isArray(raw["enemies"]) ? raw["enemies"] : [];
  const enemies = rawEnemies.filter((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    const id = nonEmpty(entry["slot_id"]);
    return id !== null && known.has(id);
  });

  for (const slot of manifest.slots) {
    const fallback = nonEmpty(slot.prompt) ?? slot.id;
    if (!prompts.has(slot.id)) {
      prompts.set(slot.id, fallback);
      filled.push(`slot_prompts.${slot.id}`);
    }
    if (slot.kind === "spritesheet" && !cast.has(slot.id)) {
      cast.set(slot.id, { name: slot.id, descriptor: fallback });
      filled.push(`cast.${slot.id}`);
    }
  }

  const layout = gameDesignLayout.safeParse(raw["layout"]);
  const parsed = gameDesign.safeParse({
    ...raw,
    layout: layout.success ? layout.data : undefined,
    enemies,
    cast: manifest.slots
      .filter((slot) => cast.has(slot.id))
      .map((slot) => ({ slot_id: slot.id, ...cast.get(slot.id)! })),
    slot_prompts: manifest.slots.map((slot) => ({
      slot_id: slot.id,
      prompt: prompts.get(slot.id)!
    }))
  });
  return parsed.success ? { design: parsed.data, filled } : null;
}

/**
 * What a stored design was written from, so the template step can tell "keep
 * it" from "re-design". Mirrors the Workflow flow's plan source key: template
 * first, then the brief, so changing either invalidates the design.
 */
export function designSourceOf(template: string, brief: string): string {
  return `${template}\n${brief}`;
}

/** The stage a fresh design lands on. */
export const GAME_DESIGN_STAGE: GameSetupStage = "review";

// ── Shipped inspiration chips (game-prd § 4.1) ──────────────────────────────

export interface GameInspirationChip {
  id: string;
  /** The chip's label, which is also the brief it writes. */
  brief: string;
  /** Manifest template id the chip picks. */
  template: string;
  /** The design pressing it produces with no model call. */
  design: GameDesign;
}

/**
 * The three starting points step 1 offers.
 *
 * Pinned rather than generated for the same reason the Workflow flow pins its
 * plans: criterion 5 builds each one against the live registry and grades the
 * graph, so a chip that stops covering its template fails there instead of in
 * front of a creator. Pressing a chip still re-designs from the brief when a
 * language provider is configured; the pinned design is the fallback and the
 * thing the harness grades.
 */
export const GAME_INSPIRATION_CHIPS: readonly GameInspirationChip[] = [
  {
    id: "fox-platformer",
    brief: "A fox platformer through an autumn forest",
    template: "platformer",
    design: {
      title: "Ember Run",
      premise:
        "A young fox wakes to find the forest's last warm wind dying out and the leaves already going grey. She runs east along the ridge to reach the ember tree before the cold does. The forest floor is waking up too, and not everything on it wants her to get there.",
      core_loop:
        "Run right along broken platforms, jump the gaps, and stomp or dodge the beetles patrolling them; a missed jump costs height and a hit costs a life, so the player is always trading speed for a safe landing.",
      player_verbs: ["run", "jump", "stomp", "fall"],
      enemies: [
        {
          slot_id: "enemy.walker",
          name: "Husk beetle",
          behaviour:
            "Walks a fixed platform back and forth at half the fox's speed, turning at the edge. Harmless from above, damaging from the side, so it forces the player to commit to a jump rather than run through."
        }
      ],
      level:
        "A ridge in three beats. The first stretch is unbroken grass-topped ground so the player learns the run and the jump. The second breaks into floating platforms two and three tiles wide with a beetle on the widest of them. The third narrows to single tiles over a drop, with the ember tree lit on the far right against the distant hills.",
      win: "Reach the ember tree at the right edge of the ridge.",
      lose: "Take three hits, or fall off the bottom of the screen.",
      cast: [
        {
          slot_id: "player",
          name: "Ember",
          descriptor:
            "A slim young fox, rust-orange with a cream chest and a black-tipped tail longer than her body, small rounded ears, a short grey scarf, standing about three heads tall."
        },
        {
          slot_id: "enemy.walker",
          name: "Husk beetle",
          descriptor:
            "A squat beetle the width of the fox and half her height, dark brown shell split down the middle, six stubby legs, two short antennae, a band of dry leaf-yellow across the back."
        }
      ],
      slot_prompts: [
        {
          slot_id: "player",
          prompt:
            "Ember the fox seen from the side facing right: standing and breathing, running at full stride, leaping with her tail streamed behind her, and recoiling from a hit."
        },
        {
          slot_id: "enemy.walker",
          prompt:
            "A husk beetle seen from the side facing left: crawling forward on its six legs, then flipped onto its back with its legs curling in."
        },
        {
          slot_id: "tiles.ground",
          prompt:
            "Autumn forest ground: grass-topped soil with fallen orange leaves on the surface, packed dirt with small stones underneath, left and right edge pieces, and inner and outer corners."
        },
        {
          slot_id: "bg.far",
          prompt:
            "The far ridge behind the level: rows of bare and half-turned trees fading into blue haze, a low sun behind them, an empty amber sky."
        },
        { slot_id: "sfx.jump", prompt: "A soft quick hop off leaf litter." },
        { slot_id: "sfx.hurt", prompt: "A short startled animal yelp." },
        {
          slot_id: "music.level",
          prompt:
            "A warm autumn woodland theme on plucked strings and a light hand drum, wistful but moving forward at a walking pace."
        },
        {
          slot_id: "title",
          prompt:
            "Ember the fox standing on the ridge at sunset looking east toward a single glowing tree, leaves in the air around her."
        }
      ]
    }
  },
  {
    id: "slime-dungeon",
    brief: "A top-down dungeon crawl with slimes and a locked door",
    template: "topdown",
    design: {
      title: "The Green Key",
      premise:
        "A cellar under an abandoned chapel has flooded with something that moves. A lamp-carrying scavenger goes down for the iron key her sister left behind, and finds the slimes have swallowed it. She has to get it out of one of them.",
      core_loop:
        "Walk room to room, pull slimes into open floor where they can be circled, and strike them one at a time; every hit taken is a step back toward the entrance, so the player is choosing between clearing a room and slipping past it.",
      player_verbs: ["walk", "strike", "dodge", "unlock"],
      enemies: [
        {
          slot_id: "enemy.chaser",
          name: "Cellar slime",
          behaviour:
            "Sits still until the player crosses its room, then follows in a straight line at slightly under walking speed, never turning back. Two of them in one corridor pin the player against a wall, which is what makes the open rooms worth fighting in."
        }
      ],
      level:
        "Four rooms around a central corridor. The first is empty and lit, teaching the walk. The two side rooms each hold two slimes on open floor, and the western one drops the key. The northern room is the locked door: a heavy iron door in a wall of dressed stone that opens only once the key is carried to it.",
      win: "Carry the iron key to the locked door in the north room.",
      lose: "Take four hits before the door is open.",
      cast: [
        {
          slot_id: "player",
          name: "Wren",
          descriptor:
            "A short wiry woman in a dark green hooded cloak over a grey tunic, a small lit oil lamp in her left hand and a short knife in her right, brown boots, pale face barely visible under the hood."
        },
        {
          slot_id: "enemy.chaser",
          name: "Cellar slime",
          descriptor:
            "A rounded blob two thirds of Wren's height, translucent moss green with a darker green core, a wet highlight on the upper left, no limbs and no face beyond two small dark eye dots."
        }
      ],
      slot_prompts: [
        {
          slot_id: "player",
          prompt:
            "Wren seen from a top-down three-quarter angle facing toward the viewer: standing with her lamp raised, walking forward, and flinching back with the lamp swinging."
        },
        {
          slot_id: "enemy.chaser",
          prompt:
            "A cellar slime seen from a top-down three-quarter angle: squashing and stretching as it hauls itself forward, then collapsing into a flat spreading puddle."
        },
        {
          slot_id: "tiles.floor",
          prompt:
            "A chapel cellar: four worn flagstone floor variants, one with a drain and one with moss, then dressed stone wall faces seen from above, wall edges, and inner and outer wall corners."
        },
        { slot_id: "sfx.hit", prompt: "A wet slap against cloth." },
        { slot_id: "sfx.step", prompt: "A single boot step on damp stone." },
        {
          slot_id: "music.level",
          prompt:
            "A slow, low dungeon theme on bowed strings and a distant dripping pulse, tense and patient, no melody in the foreground."
        },
        {
          slot_id: "title",
          prompt:
            "Wren at the bottom of a cellar stair, lamp held up, green shapes waiting at the edge of the light, an iron door behind them."
        }
      ]
    }
  },
  {
    id: "neon-shmup",
    brief: "A neon shoot-em-up over a rain-soaked city",
    template: "shmup",
    design: {
      title: "Downpour",
      premise:
        "The rain over the city has not stopped in nine years and the drone swarms use it for cover. One interceptor flies low over the towers, under the cloud deck, to cut a corridor through them before the night shift launches.",
      core_loop:
        "Fly up the scrolling city holding fire, weave between drone streams, and read each wave's opening before it closes; every drone destroyed thins the next wave, so hesitating costs more than shooting.",
      player_verbs: ["fly", "bank", "shoot", "dodge"],
      enemies: [
        {
          slot_id: "enemy.drone",
          name: "Wasp drone",
          behaviour:
            "Drops in from the top edge in a shallow arc, fires once as it crosses the player's column, and keeps going off the bottom. Waves overlap so their arcs cross, which is what closes the gap the player is aiming for."
        }
      ],
      level:
        "A single vertical run over the city, opening on low warehouse roofs with two thin drone waves. It builds through the tower district where the waves cross, and ends over the flooded canal at the north edge with a dense final wave lit from below by the water.",
      win: "Survive the run to the canal at the north edge of the city.",
      lose: "Take three hits from a drone or its shot.",
      cast: [
        {
          slot_id: "player",
          name: "Interceptor",
          descriptor:
            "A narrow single-seat craft with swept-back wings, gunmetal grey plating, a magenta glow strip down each wing edge and a cyan engine flare at the tail, canopy tinted dark, nose slightly longer than the body."
        },
        {
          slot_id: "enemy.drone",
          name: "Wasp drone",
          descriptor:
            "A small four-rotor drone half the interceptor's width, matte black frame with a single amber eye at the front, thin yellow warning stripes along the arms, no canopy."
        }
      ],
      slot_prompts: [
        {
          slot_id: "player",
          prompt:
            "The interceptor seen from directly above with its nose pointing up: flying level, tipped hard to the left, and tipped hard to the right."
        },
        {
          slot_id: "enemy.drone",
          prompt:
            "A wasp drone seen from directly above with its nose pointing down: rotors spinning as it descends, then breaking apart into fragments and sparks."
        },
        {
          slot_id: "bg.space",
          prompt:
            "The city from directly above at night in heavy rain: tower roofs and lit streets in a grid, wet reflections in magenta and cyan, low cloud drifting over it."
        },
        { slot_id: "sfx.shoot", prompt: "A tight electric pulse shot." },
        { slot_id: "sfx.explode", prompt: "A small hard burst with a metallic rattle." },
        {
          slot_id: "music.level",
          prompt:
            "A driving synthwave chase theme with an arpeggiated bass, a four-on-the-floor kick and a high lead over it, urgent throughout."
        },
        {
          slot_id: "title",
          prompt:
            "The interceptor climbing between two neon-lit towers in the rain, drone silhouettes above it against the cloud deck."
        }
      ]
    }
  }
];

/**
 * Inspiration chips for the built-in engine's `topdown` template, which the
 * guided Game flow builds into a native game.
 *
 * The chips above were written for the retired external-engine templates and
 * stay because the asset graph harness grades them. These cover the native
 * manifest and play the way the generated adventure plays: rooms joined by
 * corridors, gems to collect, enemies and hazards to avoid, and an exit that
 * opens once every gem is taken. The slot ids are written out for the same
 * reason as above; `game-design.test.ts` fails when a chip stops covering the
 * template in `native-game-templates.ts`. The briefs stay as they were, since
 * the idea step shows them translated.
 */
export const NATIVE_GAME_INSPIRATION_CHIPS: readonly GameInspirationChip[] = [
  {
    id: "acorn-clearing",
    brief: "A fox gathering the last acorn in an autumn clearing",
    template: "topdown",
    design: {
      title: "Last Acorn",
      premise:
        "Winter is a night away and the squirrels have buried the last acorns of the year deep in the bramble warren under the clearing. A young fox noses through the tunnels to dig them up before the frost seals the ground.",
      core_loop:
        "Trot from burrow to burrow, sniff out each glinting acorn, and slip past the crows that patrol the open dens; the thorn patches cost a scratch, so the fox weaves around them while a crow is on her tail.",
      player_verbs: ["trot", "sniff out", "dodge", "escape"],
      enemies: [
        {
          slot_id: "enemy",
          name: "Hollow crow",
          behaviour:
            "Some crows pace a den back and forth; others sit still until the fox comes close and then hop after her, giving up once she is far enough away."
        }
      ],
      level:
        "A warren of leafy dens under the clearing, joined by root-lined tunnels. The fox starts in a quiet corner den; the acorns are spread through the far dens, and the way out is a hollow log in the den farthest from home.",
      win: "Gather every acorn, then climb out through the hollow log.",
      lose: "Lose all four hearts to crow pecks and thorns.",
      cast: [
        {
          slot_id: "player",
          name: "Bramble",
          descriptor:
            "A small young fox, rust-orange back with a cream muzzle, black socks on all four paws and a white-tipped brush tail as long as her body."
        },
        {
          slot_id: "enemy",
          name: "Hollow crow",
          descriptor:
            "A glossy black crow with ragged wing tips, a grey hooked beak and small bright yellow eyes, wings half open."
        },
        {
          slot_id: "gem",
          name: "Acorn",
          descriptor:
            "A single plump acorn, glossy chestnut brown with a rough tan cap and a short stem, a soft highlight on one side."
        },
        {
          slot_id: "hazard",
          name: "Thorn patch",
          descriptor:
            "A low tangle of dark bramble stems covered in sharp pale thorns, a few dry red leaves caught in it."
        },
        {
          slot_id: "exit",
          name: "Hollow log",
          descriptor:
            "The round open end of a fallen hollow log, mossy bark around a dark opening."
        }
      ],
      slot_prompts: [
        {
          slot_id: "player",
          prompt:
            "Bramble the fox seen from a top-down three-quarter angle: standing still with her tail curled, then four steps of a trotting walk."
        },
        {
          slot_id: "enemy",
          prompt:
            "A hollow crow seen from a top-down three-quarter angle: two frames standing and bobbing its head, then two frames hopping forward with wings raised."
        },
        { slot_id: "gem", prompt: "One acorn lying on its side, seen from above." },
        { slot_id: "hazard", prompt: "A thorn patch on the ground, seen from directly above." },
        {
          slot_id: "exit",
          prompt:
            "A hollow log end seen from above: first blocked by a pile of dead leaves, then open with warm light glowing inside."
        },
        { slot_id: "floor", prompt: "Packed earth covered in fallen orange and brown leaves, seen from directly above." },
        {
          slot_id: "wall",
          prompt: "A dense hedge of bramble and dark holly leaves with a few red berries, seen from directly above."
        },
        { slot_id: "sfx.collect", prompt: "A soft crunch of leaves and a bright woody click." },
        { slot_id: "sfx.hurt", prompt: "A short startled fox yelp." },
        {
          slot_id: "music.level",
          prompt: "A gentle autumn woodland tune on plucked strings and soft woodwinds, curious and light-footed."
        }
      ],
      layout: { size: "small", difficulty: "relaxed" }
    }
  },
  {
    id: "sunken-pearl",
    brief: "A diver reaching a pearl in a sunken temple",
    template: "topdown",
    design: {
      title: "Pearl of the Drowned Hall",
      premise:
        "A temple sank into the bay a century ago and its pearls still lie scattered through the flooded halls. A diver swims in through the broken roof to recover them and reach the great pearl gate before her air runs out.",
      core_loop:
        "Glide hall to hall, scoop up every pearl, and keep clear of the eels patrolling the corridors and the jellyfish drifting over the floor; each sting costs air, so the diver picks the quiet path between them.",
      player_verbs: ["swim", "collect", "evade", "surface"],
      enemies: [
        {
          slot_id: "enemy",
          name: "Moray eel",
          behaviour:
            "Some eels sweep along one hall wall to wall; others lurk until the diver passes and then lunge after her, sliding back to their nook when she gets away."
        }
      ],
      level:
        "Drowned temple halls joined by narrow flooded passages, sand and broken tiles on the floor. The diver enters through the roof in one corner hall; the pearl gate waits in the deepest hall at the far side.",
      win: "Gather every pearl, then swim through the open pearl gate.",
      lose: "Lose all your air to eel bites and jellyfish stings.",
      cast: [
        {
          slot_id: "player",
          name: "Nia",
          descriptor:
            "A slim diver in a teal wetsuit with a yellow air tank on her back, long black hair streaming behind her, orange fins."
        },
        {
          slot_id: "enemy",
          name: "Moray eel",
          descriptor:
            "A long olive-green eel with dark mottled spots, a wide open jaw with small sharp teeth and pale staring eyes."
        },
        {
          slot_id: "gem",
          name: "Pearl",
          descriptor: "A large round pearl, milky white with a pink and blue sheen, resting in an open grey clam shell."
        },
        {
          slot_id: "hazard",
          name: "Jellyfish",
          descriptor: "A translucent violet jellyfish with a glowing bell and trailing stinging tendrils."
        },
        {
          slot_id: "exit",
          name: "Pearl gate",
          descriptor: "A round carved stone portal ringed with inlaid mother-of-pearl."
        }
      ],
      slot_prompts: [
        {
          slot_id: "player",
          prompt:
            "Nia the diver seen from a top-down three-quarter angle: floating still with her arms out, then four strokes of a kicking swim."
        },
        {
          slot_id: "enemy",
          prompt:
            "A moray eel seen from above: two frames coiled and swaying, then two frames stretched out and lunging."
        },
        { slot_id: "gem", prompt: "One pearl in its open clam shell, seen from above." },
        { slot_id: "hazard", prompt: "A jellyfish drifting just above the sandy floor, seen from directly above." },
        {
          slot_id: "exit",
          prompt: "The pearl gate seen from above: first sealed by a stone disc, then open with pale blue light pouring out."
        },
        { slot_id: "floor", prompt: "Pale sand over broken temple floor tiles, small shells, seen from directly above." },
        {
          slot_id: "wall",
          prompt: "A block of carved temple stone under water, green moss and small barnacles on it, seen from directly above."
        },
        { slot_id: "sfx.collect", prompt: "A soft underwater chime with a rising bubble." },
        { slot_id: "sfx.hurt", prompt: "A muffled underwater gasp with a burst of bubbles." },
        {
          slot_id: "music.level",
          prompt: "A slow, shimmering underwater theme on soft synth pads and a distant harp, calm with a hint of danger."
        }
      ],
      layout: { size: "medium", difficulty: "normal" }
    }
  },
  {
    id: "server-cell",
    brief: "A maintenance robot grabbing a power cell in a neon server room",
    template: "topdown",
    design: {
      title: "Power Cell",
      premise:
        "The night shift left the server farm's spare power cells scattered across the floor and the cooling fans are starting to whine. A boxy maintenance robot rolls out of its dock to plug them in before the racks overheat, and the security drones think it is an intruder.",
      core_loop:
        "Roll aisle to aisle, grab each glowing cell, and stay out of the security drones' sight lines; the sparking cable faults on the floor short-circuit the robot on contact, so every shortcut is a gamble.",
      player_verbs: ["roll", "grab", "dodge", "dock"],
      enemies: [
        {
          slot_id: "enemy",
          name: "Security drone",
          behaviour:
            "Some drones sweep one aisle on a fixed track; others hover until the robot enters their range and then chase it down, drifting home once it slips away."
        }
      ],
      level:
        "A maze of server rooms boxed in by rows of black racks, joined by narrow cable aisles, lit magenta and cyan. The robot starts at its dock in a corner room; the charging bay that ends the shift is in the room farthest from it.",
      win: "Collect every power cell, then roll into the open charging bay.",
      lose: "Take three hits from drones and cable faults.",
      cast: [
        {
          slot_id: "player",
          name: "Unit 7",
          descriptor:
            "A small square maintenance robot, scuffed white casing with an orange stripe, two treads at the sides and a single cyan eye light at the front."
        },
        {
          slot_id: "enemy",
          name: "Security drone",
          descriptor:
            "A round black quadcopter drone with four small rotors, a red scanning eye in the middle and yellow warning stripes on its arms."
        },
        {
          slot_id: "gem",
          name: "Power cell",
          descriptor: "A short cylindrical power cell with a bright green glowing core between two silver end caps."
        },
        {
          slot_id: "hazard",
          name: "Cable fault",
          descriptor: "A torn bundle of floor cables with exposed copper ends throwing blue-white sparks."
        },
        {
          slot_id: "exit",
          name: "Charging bay",
          descriptor: "A square floor hatch with a glowing ring of lights around a charging plate."
        }
      ],
      slot_prompts: [
        {
          slot_id: "player",
          prompt:
            "Unit 7 the robot seen from a top-down three-quarter angle: idle with its eye light on, then four frames of rolling forward on its treads."
        },
        {
          slot_id: "enemy",
          prompt:
            "A security drone seen from above: two frames hovering with rotors spinning, then two frames tilted forward in pursuit with its eye flaring."
        },
        { slot_id: "gem", prompt: "One glowing power cell lying on the floor, seen from above." },
        { slot_id: "hazard", prompt: "A sparking cable fault on the floor, seen from directly above." },
        {
          slot_id: "exit",
          prompt: "The charging bay hatch seen from above: first closed with red lights, then open with green lights and a glowing plate."
        },
        { slot_id: "floor", prompt: "Dark raised-floor panels with a faint magenta and cyan grid, seen from directly above." },
        {
          slot_id: "wall",
          prompt: "The top of a black server rack with rows of blinking green and blue status lights, seen from directly above."
        },
        { slot_id: "sfx.collect", prompt: "A short electric power-up blip." },
        { slot_id: "sfx.hurt", prompt: "A harsh electric zap and buzz." },
        {
          slot_id: "music.level",
          prompt: "A driving synthwave loop with a pulsing bass and bright arpeggios, tense and quick."
        }
      ],
      layout: { size: "large", difficulty: "hard" }
    }
  }
];

/**
 * The shipped chip whose brief this is, for a template — the design a keyless
 * install uses in place of a designer call. Briefs match case-insensitively
 * and ignore surrounding whitespace, as the Workflow flow's pinned plans do.
 */
export function pinnedGameInspirationChip(
  template: string,
  brief: string
): GameInspirationChip | null {
  const wanted = brief.trim().toLowerCase();
  return (
    [...NATIVE_GAME_INSPIRATION_CHIPS, ...GAME_INSPIRATION_CHIPS].find(
      (chip) =>
        chip.template === template && chip.brief.trim().toLowerCase() === wanted
    ) ?? null
  );
}
