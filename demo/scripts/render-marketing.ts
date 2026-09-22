import { execFileSync } from "node:child_process";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition
} from "@remotion/renderer";
import sharp from "sharp";
import { MARKETING_EDITS } from "../src/marketing/catalog";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out/marketing");
const args = process.argv.slice(2);
const only = args.indexOf("--only");
if (only !== -1 && !args[only + 1]) {
  throw new Error("--only requires an edit slug");
}
const edits =
  only === -1
    ? MARKETING_EDITS
    : MARKETING_EDITS.filter((edit) => edit.slug === args[only + 1]);
if (edits.length === 0) {
  throw new Error("No matching marketing edit");
}
const browserExecutable = process.env.CHROMIUM_PATH || undefined;
await mkdir(out, { recursive: true });
const serveUrl = await bundle({
  entryPoint: path.join(root, "src/marketing/index.tsx"),
  publicDir: path.join(root, "public")
});

for (const edit of edits) {
  const composition = await selectComposition({
    serveUrl,
    id: `Marketing-${edit.slug}`,
    browserExecutable
  });
  const master = path.join(out, `${edit.slug}-master.mp4`);
  const still = path.join(out, `${edit.slug}-poster.png`);
  console.log(`Rendering ${edit.slug}`);
  if (!args.includes("--stills-only") && !args.includes("--encode-only")) {
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      crf: 16,
      outputLocation: master,
      browserExecutable,
      concurrency: 2
    });
  }
  await renderStill({
    composition,
    serveUrl,
    output: still,
    frame: edit.posterFrame,
    browserExecutable
  });

  if (args.includes("--publish") && !args.includes("--stills-only")) {
    for (const codec of ["mp4", "webm"]) {
      const encoded = path.join(out, `${edit.slug}.${codec}`);
      const options =
        codec === "mp4"
          ? [
              "-c:v",
              "libx264",
              "-crf",
              "24",
              "-preset",
              "slow",
              "-movflags",
              "+faststart"
            ]
          : [
              "-c:v",
              "libvpx-vp9",
              "-crf",
              "34",
              "-b:v",
              "0",
              "-row-mt",
              "1",
              "-cpu-used",
              "3"
            ];
      execFileSync(
        "npx",
        [
          "remotion",
          "ffmpeg",
          "-v",
          "error",
          "-y",
          "-i",
          master,
          "-vf",
          "scale=in_range=auto:out_range=tv",
          "-color_range",
          "tv",
          "-pix_fmt",
          "yuv420p",
          ...options,
          "-an",
          encoded
        ],
        { cwd: root, stdio: "inherit" }
      );
      // Decode the complete delivery file before replacing the page's asset.
      execFileSync(
        "npx",
        [
          "remotion",
          "ffmpeg",
          "-v",
          "error",
          "-xerror",
          "-i",
          encoded,
          "-c:v",
          "rawvideo",
          "-f",
          "null",
          "-"
        ],
        { cwd: root, stdio: "inherit" }
      );
    }
    for (const codec of ["mp4", "webm"]) {
      await copyFile(
        path.join(out, `${edit.slug}.${codec}`),
        path.resolve(root, `../marketing/public/${edit.slug}.${codec}`)
      );
    }
    const widths = edit.slug.endsWith("-project") ? [1920, 960] : [1920];
    for (const width of widths) {
      const suffix = width === 960 ? "-960" : "";
      await sharp(still)
        .resize({ width })
        .webp({ quality: 88 })
        .toFile(
          path.resolve(
            root,
            `../marketing/public/${edit.slug}-poster${suffix}.webp`
          )
        );
    }
  }
  console.log(`Finished ${edit.slug}`);
}
