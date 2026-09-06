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
 * The slot ids in the chips are written out rather than read from
 * `@nodetool-ai/godot-templates`: protocol sits below that package in the
 * dependency order. `game-design.test.ts` reads the shipped manifests off disk
 * and fails when a chip stops covering one.
 */

import { isRecord, isString } from "./predicates.js";
import {
  gameDesign,
  type GameDesign,
  type GameSetupStage
} from "./api-schemas/workflows.js";
import type { GameAssetManifest, GameSlotSpec } from "./game-assets.js";

// ── The designer's contract ─────────────────────────────────────────────────

export const GAME_DESIGN_TOOL_NAME = "game_design";

export const GAME_DESIGN_TOOL_DESCRIPTION =
  "The written design for one game: its premise, loop, cast, enemies and level, plus the subject of every asset the chosen template needs.";

export const GAME_DESIGNER_SYSTEM_PROMPT = [
  "You design small 2D games for a fixed Godot template. You write text; you",
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
  "- Win and lose are one line each."
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
      "slot_prompts"
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

  const parsed = gameDesign.safeParse({
    ...raw,
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
