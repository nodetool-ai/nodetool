// Still generation shared by the example-timeline builders (voltra-stills.mjs,
// prism-stills.mjs).
//
// Each still runs through NodeTool's single-node harness and lands as a
// 1920×1080 JPEG in the example's package asset folder. A still with a `ref`
// passes that earlier still as a reference image, so one subject stays the
// same across shots. Needs a Replicate token and ffmpeg.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export const MODEL = { node: "replicate.image.generate.Flux_2_Pro", provider: "replicate", model: "black-forest-labs/flux-2-pro" };

function runNode(props) {
  const out = execFileSync("npm", ["run", "dev:nodetool", "--silent", "--", "node", "run", MODEL.node, "--json", "--props", JSON.stringify(props)], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"]
  });
  const result = JSON.parse(out);
  const uri = result.chunks?.find((c) => c.output?.uri)?.output.uri;
  if (!result.ok || !uri) throw new Error(`${MODEL.node} failed: ${result.error ?? "no image"}`);
  return uri;
}

/**
 * Generate the named stills of `stills` into `dir` (all when `names` is
 * empty), in list order, so a still named as a `ref` must come before the
 * stills that use it.
 */
export async function generateStills(dir, stills, names = []) {
  mkdirSync(dir, { recursive: true });
  const wanted = stills.filter((s) => names.length === 0 || names.includes(s.name));
  for (const still of wanted) {
    const props = { prompt: still.prompt, seed: still.seed, aspect_ratio: "custom", width: 1920, height: 1088, output_format: "png", safety_tolerance: 2 };
    if (still.ref) {
      const ref = join(dir, `${still.ref}.jpg`);
      if (!existsSync(ref)) throw new Error(`${still.name} needs ${still.ref}.jpg first`);
      props.input_images = [{ type: "image", data: readFileSync(ref).toString("base64") }];
    }
    const uri = runNode(props);
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`download ${uri}: ${res.status}`);
    const tmp = join(dir, `${still.name}.src.png`);
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    // Centre-crop 1920×1088 to the frame; q 4 keeps the folder small.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-vf", "scale=1920:-2,crop=1920:1080", "-q:v", "4", join(dir, `${still.name}.jpg`)]);
    rmSync(tmp);
    console.log(`${still.name}.jpg`);
  }
}
