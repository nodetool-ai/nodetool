// The Voltra stills: every prompt, model and seed behind the example's images.
//
// `node scripts/example-timelines/voltra.mjs --stills [name…]` regenerates them
// through NodeTool's single-node harness and writes 1920×1080 JPEGs to the
// package asset folder. Bike shots pass the hero still as a reference image so
// the same machine appears in every frame. Needs a Replicate token and ffmpeg.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const STILLS_DIR = join(ROOT, "packages/base-nodes/nodetool/assets/nodetool-base/timelines/voltra");
export const stillUri = (name) => `package://nodetool-base/timelines/voltra/${name}.jpg`;

export const MODEL = { node: "replicate.image.generate.Flux_2_Pro", provider: "replicate", model: "black-forest-labs/flux-2-pro" };

const BIKE =
  "the Voltra R1, a fictional electric street motorcycle: matte graphite-black angular bodywork, " +
  "a single thin horizontal LED light bar as the headlight, an exposed copper axial-flux motor disc at the swingarm, " +
  "thin teal accent lines, carbon tank cover, no exhaust, no brand logos, no text";
const LOOK = "cinematic night photography, anamorphic 35mm, deep blacks, teal and orange neon, high contrast, no text, no logos, no watermark";
const PLATE = "isolated element on a pure black background, nothing else in frame, no text";

/**
 * One entry per shipped still. `ref` names a still passed as a reference image
 * so the bike stays the same machine; it is generated first.
 */
export const STILLS = [
  { name: "street", seed: 1101, prompt: `An empty narrow city street at night in heavy rain, wet black asphalt mirroring pink and teal neon signs without readable text, steam rising from a grate, deep shadows, low camera at road level, ${LOOK}` },
  { name: "hero", seed: 1201, prompt: `Three-quarter front view of ${BIKE}, parked on a wet street at night, rain falling, neon reflections on the tank, the LED headlight bar glowing white, low camera, centred with space around it, ${LOOK}` },
  { name: "side", seed: 1301, ref: "hero", prompt: `Exact side profile of the motorcycle in the reference image, ${BIKE}, standing on a black studio floor, crisp rim light tracing its silhouette, pure black background, ${LOOK}` },
  { name: "headlight", seed: 1401, ref: "hero", prompt: `Extreme macro close-up of the thin horizontal LED light bar headlight of the motorcycle in the reference image, switched on and glowing white-blue, rain droplets on the graphite bodywork, shallow depth of field, ${LOOK}` },
  { name: "motor", seed: 1501, ref: "hero", prompt: `Extreme macro close-up of the exposed copper axial-flux electric motor disc of the motorcycle in the reference image, copper windings and machined aluminium, wet with rain, orange rim light, shallow depth of field, ${LOOK}` },
  { name: "dash", seed: 1601, ref: "hero", prompt: `Macro close-up of the motorcycle's small round TFT dash display glowing teal with an abstract speed arc and bars, no numbers, no letters, rain drops on the glass, dark cockpit, shallow depth of field, ${LOOK}` },
  { name: "tyre", seed: 1701, prompt: `Macro close-up at ground level of a sport motorcycle tyre rolling fast on wet black asphalt, water spray fanning off the tread, neon reflections in the puddles, motion, ${LOOK}` },
  { name: "rider", seed: 1801, prompt: `Portrait of a motorcycle rider in a matte black full-face helmet with a dark mirrored visor reflecting pink and teal neon, face fully hidden, black leather jacket, rain drops on the visor, dark alley background, ${LOOK}` },
  { name: "ride", seed: 1901, ref: "hero", prompt: `Panning shot of the motorcycle in the reference image being ridden fast through a neon city street at night in the rain, rider in a black full-face helmet, the background streaked with motion blur, the bike sharp, ${LOOK}` },
  { name: "tunnel", seed: 2001, prompt: `Inside a long concrete road tunnel at night, symmetrical one-point perspective, rows of orange sodium lights receding to a vanishing point, wet road surface reflecting the lights, empty, ${LOOK}` },
  { name: "rooftop", seed: 2101, ref: "hero", prompt: `The motorcycle in the reference image parked on an empty concrete rooftop at dusk, city skyline behind under a deep orange and violet sky, the LED headlight bar on, rim light on the bodywork, low camera, the bike in the centre third, ${LOOK}` },
  { name: "plate-rain", seed: 2201, prompt: `Heavy rain streaks falling diagonally, thin bright white motion-blurred lines of rain, ${PLATE}` },
  { name: "plate-road", seed: 2301, prompt: `Wet black asphalt road surface seen from very low, long smeared reflections of pink, teal and orange neon lights streaking toward the camera, the top half of the frame fading to black, no vehicles` },
  { name: "plate-bokeh", seed: 2401, prompt: `Large soft out-of-focus bokeh circles of city lights in teal, pink and amber, ${PLATE}` },
  { name: "plate-smoke", seed: 2501, prompt: `Soft drifting white smoke and fog wisps lit from the side, ${PLATE}` }
];

function runNode(props) {
  const out = execFileSync("npm", ["run", "dev:nodetool", "--silent", "--", "node", "run", MODEL.node, "--json", "--props", JSON.stringify(props)], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"]
  });
  const result = JSON.parse(out);
  const uri = result.chunks?.find((c) => c.output?.uri)?.output.uri;
  if (!result.ok || !uri) throw new Error(`${MODEL.node} failed: ${result.error ?? "no image"}`);
  return uri;
}

/** Generate the named stills (all when `names` is empty), in dependency order. */
export async function generateStills(names = []) {
  mkdirSync(STILLS_DIR, { recursive: true });
  const wanted = STILLS.filter((s) => names.length === 0 || names.includes(s.name));
  for (const still of wanted) {
    const props = { prompt: still.prompt, seed: still.seed, aspect_ratio: "custom", width: 1920, height: 1088, output_format: "png", safety_tolerance: 2 };
    if (still.ref) {
      const ref = join(STILLS_DIR, `${still.ref}.jpg`);
      if (!existsSync(ref)) throw new Error(`${still.name} needs ${still.ref}.jpg first`);
      props.input_images = [{ type: "image", data: readFileSync(ref).toString("base64") }];
    }
    const uri = runNode(props);
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`download ${uri}: ${res.status}`);
    const tmp = join(STILLS_DIR, `${still.name}.src.png`);
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    // Centre-crop 1920×1088 to the frame; q 4 keeps the folder small.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-vf", "scale=1920:-2,crop=1920:1080", "-q:v", "4", join(STILLS_DIR, `${still.name}.jpg`)]);
    rmSync(tmp);
    console.log(`${still.name}.jpg`);
  }
}
