// The Prism stills: every prompt and seed behind the example's images.
//
// `node scripts/example-timelines/prism.mjs --stills [name…]` regenerates them
// through stills.mjs. The subjects stand on a flat chroma green so the ad keys
// them out; the shoe still is the reference for the others, so the same shoe
// appears in every frame.
import { join } from "node:path";

import { generateStills as generate, ROOT } from "./stills.mjs";

export const STILLS_DIR = join(ROOT, "packages/base-nodes/nodetool/assets/nodetool-base/timelines/prism");
export const stillUri = (name) => `package://nodetool-base/timelines/prism/${name}.jpg`;

const SHOE =
  "the Prism, a fictional running shoe: a seamless knit upper in iridescent holographic chrome that shifts from cyan to magenta to lime, " +
  "a thick translucent foam midsole glowing faintly from inside, a sharp carbon heel fin, flat white laces, no brand logos, no text";
const KEY = "on a perfectly flat, evenly lit, pure chroma-key green background (#00b140), no shadow on the background, no floor, crisp edges, nothing else in frame";
const LOOK = "high-end sneaker campaign photography, sharp focus, studio strobe lighting, glossy reflections, no text, no logos, no watermark";

/** One entry per shipped still. `ref` names a still passed as a reference image. */
export const STILLS = [
  { name: "shoe", seed: 3101, prompt: `Exact side profile of ${SHOE}, floating in the centre of the frame with generous space around it, ${KEY}, ${LOOK}` },
  { name: "sole", seed: 3201, ref: "shoe", prompt: `The shoe in the reference image seen from below at a steep three-quarter angle, showing the translucent glowing foam sole with a hexagon tread, floating, ${KEY}, ${LOOK}` },
  { name: "athlete", seed: 3301, ref: "shoe", prompt: `A sprinter in a black running singlet and black tights frozen mid-leap, full body inside the frame with space around, both feet off the ground, wearing the iridescent shoes from the reference image, ${KEY}, ${LOOK}` },
  { name: "knit", seed: 3401, ref: "shoe", prompt: `Extreme macro close-up filling the whole frame of the iridescent holographic knit upper of the shoe in the reference image, woven chrome fibres shifting cyan, magenta and lime, shallow depth of field, ${LOOK}` }
];

/** Generate the named stills (all when `names` is empty), in dependency order. */
export async function generateStills(names = []) {
  await generate(STILLS_DIR, STILLS, names);
}
