/**
 * The one project the hero follows from a sentence to a cut: the shipped
 * "Under the Bed" storyboard (packages/base-nodes/nodetool/examples/
 * storyboards/under-the-bed.storyboard.json), five three-second shots.
 *
 * Every later step reads from these lists, so the beat sheet, the cast, the
 * board and the timeline always agree on names, order and length.
 */
import { C } from "./theme";

export const BRIEF =
  "Make a 15-second short: a kid shines a flashlight under the bed and finds a monster more scared than she is.";

export const TITLE = "Under the Bed";
export const MODEL = "Claude Sonnet 5";
export const STILL_MODEL = "Seedream 4";
export const CLIP_MODEL = "Seedance Pro";
export const SCORE = "Music box";

export type EntityKind = "character" | "location" | "prop" | "style";

export const KIND_COLOR: Record<EntityKind, string> = {
  character: C.primary,
  location: C.info,
  prop: C.success,
  style: C.fuchsia
};

export type Entity = {
  id: string;
  name: string;
  kind: EntityKind;
  descriptor: string;
  image: string;
  /** Extra reference images: a character's reference sheet. */
  refs?: string[];
};

export const ENTITIES: Entity[] = [
  {
    id: "mia",
    name: "Mia",
    kind: "character",
    descriptor: "Girl about 7, curly black hair, yellow star-print pyjamas",
    image: "bed/entity-mia.jpg",
    refs: ["bed/entity-mia-2.jpg", "bed/entity-mia-3.jpg"]
  },
  {
    id: "monster",
    name: "The monster",
    kind: "character",
    descriptor: "Small fuzzy purple monster, huge green eyes, stubby horns",
    image: "bed/entity-monster.jpg",
    refs: ["bed/entity-monster-2.jpg", "bed/entity-monster-3.jpg"]
  },
  {
    id: "teddy",
    name: "Teddy",
    kind: "prop",
    descriptor: "Worn honey-brown bear with a red bow tie",
    image: "bed/entity-teddy.jpg"
  },
  {
    id: "flashlight",
    name: "Flashlight",
    kind: "prop",
    descriptor: "Black kid's torch. The beam is always warm yellow",
    image: "bed/entity-flashlight.jpg"
  },
  {
    id: "bedroom",
    name: "Mia's room",
    kind: "location",
    descriptor: "Moonlight through the window, toys on a rug, star bedding",
    image: "bed/entity-bedroom.jpg"
  },
  {
    id: "style",
    name: "Moonlit 3D",
    kind: "style",
    descriptor: "Stylised family animation. Blue moonlight, soft shading",
    image: "bed/entity-style.jpg"
  }
];

export const entity = (id: string): Entity => {
  const found = ENTITIES.find((e) => e.id === id);
  if (!found) {
    throw new Error(`Unknown entity ${id}`);
  }
  return found;
};

/** A beat line is text with `{id}` placeholders for entity mentions. */
export type Beat = {
  label: string;
  slug: string;
  line: string;
  framing: string;
  movement: string;
  /** The storyboard still, under `casts/heroflow/`. */
  still: string;
  /** A frame from the shot's clip, for surfaces that show it playing. */
  clipFrame: string;
  /** The shot's clip, cut from the finished film at its real cut points. */
  clip: string;
  entities: string[];
};

export const BEATS: Beat[] = [
  {
    label: "Setup",
    slug: "Moonlit bedroom",
    line: "{mia} sits up in {bedroom}, {flashlight} in hand.",
    framing: "Wide",
    movement: "Static",
    still: "bed/still-moonlit-bedroom.jpg",
    clipFrame: "bed/clip-moonlit-bedroom.jpg",
    clip: "bed/clip-moonlit-bedroom.mp4",
    entities: ["mia", "bedroom", "flashlight", "style"]
  },
  {
    label: "Search",
    slug: "Flashlight on",
    line: "{mia} leans over the edge of the bed. The beam finds the dark.",
    framing: "Medium",
    movement: "Slow push in",
    still: "bed/still-flashlight-on.jpg",
    clipFrame: "bed/clip-flashlight-on.jpg",
    clip: "bed/clip-flashlight-on.mp4",
    entities: ["mia", "flashlight", "style"]
  },
  {
    label: "Reveal",
    slug: "Eyes under the bed",
    line: "Two green eyes open in the beam.",
    framing: "POV",
    movement: "Handheld",
    still: "bed/still-eyes-under-the-bed.jpg",
    clipFrame: "bed/clip-eyes-under-the-bed.jpg",
    clip: "bed/clip-eyes-under-the-bed.mp4",
    entities: ["monster", "flashlight", "style"]
  },
  {
    label: "Twist",
    slug: "Scared monster",
    line: "{monster} hides its face in its paws, trembling.",
    framing: "Close-up",
    movement: "Static",
    still: "bed/still-scared-monster.jpg",
    clipFrame: "bed/clip-scared-monster.jpg",
    clip: "bed/clip-scared-monster.mp4",
    entities: ["monster", "style"]
  },
  {
    label: "Friends",
    slug: "The teddy",
    line: "{mia} holds out {teddy}. {monster} reaches for it.",
    framing: "Medium",
    movement: "Static",
    still: "bed/still-the-teddy.jpg",
    clipFrame: "bed/clip-the-teddy.jpg",
    clip: "bed/clip-the-teddy.mp4",
    entities: ["mia", "monster", "teddy", "style"]
  }
];

/** The finished film, and the times its shots cut in (scene detection). */
export const FILM = "bed/film.mp4";
export const TOTAL_SECONDS = 15;
const CUTS = [0, 2.667, 5.833, 8.833, 12.25, TOTAL_SECONDS];

export const shotStart = (i: number): number => CUTS[i];
export const shotLength = (i: number): number => CUTS[i + 1] - CUTS[i];
/** The shot playing at film time `t`. */
export const shotAt = (t: number): number => {
  const next = CUTS.findIndex((c) => c > t);
  return next === -1 ? BEATS.length - 1 : Math.max(0, next - 1);
};

export const timecode = (seconds: number): string =>
  `0:${String(Math.floor(seconds)).padStart(2, "0")}`;

/** The dialogue, as the script editor and the timeline's voice track show it. */
export type Line = {
  speaker: string;
  text: string;
  direction: string;
  /** Where the take sits: the shot it plays over, and its offset into it. */
  shot: number;
  offset: number;
  seconds: number;
};

export const LINES: Line[] = [
  {
    speaker: "mia",
    text: "Hello? Is somebody under there?",
    direction: "whispering",
    shot: 1,
    offset: 0.4,
    seconds: 1.8
  },
  {
    speaker: "monster",
    text: "Please don't turn on the light.",
    direction: "trembling",
    shot: 2,
    offset: 0.6,
    seconds: 1.9
  },
  {
    speaker: "mia",
    text: "It's okay. Teddy is scared of the dark too.",
    direction: "softly",
    shot: 3,
    offset: 0.5,
    seconds: 2.4
  },
  {
    speaker: "monster",
    text: "Can I hold him?",
    direction: "hopeful",
    shot: 4,
    offset: 0.6,
    seconds: 1.3
  }
];
