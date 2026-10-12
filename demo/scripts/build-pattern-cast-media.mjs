// Builds the media the creative-pattern and docs workflow demo casts replay.
//
//   node scripts/build-pattern-cast-media.mjs
//
// Needs ImageMagick 6 (`convert`) and ffmpeg with libvpx, libopus, libmp3lame
// and libass on PATH.
//
// Every file is cut from media that already ships in the repository, so each
// generator run in a demo video shows new media that differs from its input:
//
// - the Voltra and Prism example timelines (stills, shot clips, posters, the
//   sketch and its styled renders)
// - the English presenter of the multilingual dubbing recipe (the voiced cut,
//   its line takes, the vertical derivative, and the clip a Code node names)
// - the coffee recipe input (the image-enhancement stages)
// - the T-minus 30 example timeline (the color-boost clip and its grades)
// - the Kite example ad (the timeline tutorial's opening shot and cutaway)
//
// Writes demo/public/casts/<cast id>/, where the Tutorial composition resolves
// a cast's `cast-asset://<key>` references.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(DEMO, "..");
const TIMELINES = path.join(REPO, "packages/base-nodes/nodetool/assets/nodetool-base/timelines");
const DUBBER = path.join(
  REPO,
  "marketing/recipe-assets/2026-09-10-marketing-recipes-01/multilingual-video-dubber"
);
const PRESENTER = path.join(DUBBER, "sources/source-en.mp4");
const PRESENTER_LINE_1 = path.join(DUBBER, "generation/source-en-line1.mp4");
const PRESENTER_SRT = path.join(DUBBER, "documents/source-en.srt");
/** Line boundaries of the presenter script, in seconds (documents/script-en.json). */
const RECIPE_INPUTS = path.join(REPO, "packages/base-nodes/nodetool/assets/nodetool-base/recipe-inputs");
const PRESENTER_LINES = [
  [0, 9],
  [9, 15.5],
  [15.5, 22.625],
];
const OUT = path.join(DEMO, "public/casts");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pattern-media-"));

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const ffmpeg = (args) => run("ffmpeg", ["-v", "error", "-y", ...args]);

const castDir = (castId) => {
  const dir = path.join(OUT, castId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** A 480×270 JPEG of a timeline frame, optionally through ImageMagick operators. */
const still = (out, source, ops = []) =>
  run("convert", [
    path.join(TIMELINES, source),
    "-resize", "640x360^", "-gravity", "center", "-extent", "640x360",
    ...ops,
    "-resize", "480x270", "-strip", "-quality", "70", out,
  ]);

/** A 2-second 384×216 VP8 clip that pushes in (and optionally pans) on a frame. */
const pushIn = (out, source, panPerFrame = 0) =>
  ffmpeg([
    "-loop", "1", "-i", path.join(TIMELINES, source),
    "-vf",
    `scale=1280:720,zoompan=z='1+0.0025*on':x='iw/2-(iw/zoom/2)+${panPerFrame}*on':y='ih/2-(ih/zoom/2)':d=60:s=384x216:fps=30,format=yuv420p`,
    "-frames:v", "60", "-c:v", "libvpx", "-b:v", "160k", "-an", out,
  ]);

/** Join clips that share one encoding, without re-encoding. */
const concat = (out, clips) => {
  const list = path.join(tmp, `${path.basename(out)}.txt`);
  fs.writeFileSync(list, clips.map((c) => `file '${c}'`).join("\n"));
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
};

/** Re-encode a talking clip as small VP8 + Opus WebM. */
const talking = (out, source, vf) =>
  ffmpeg([
    "-i", source, "-vf", `${vf},format=yuv420p`,
    "-c:v", "libvpx", "-b:v", "140k", "-c:a", "libopus", "-b:a", "32k", "-ac", "1", out,
  ]);

const mp3 = (out, source, from, to) =>
  ffmpeg([
    "-i", source, ...(from === undefined ? [] : ["-ss", String(from), "-to", String(to)]),
    "-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "48k", out,
  ]);

// Pattern 1: brief to cut. ShotChain films three shots, then the cut.
{
  const dir = castDir("cookbook-brief-to-cut");
  const shots = ["voltra/tunnel.jpg", "voltra/headlight.jpg", "voltra/tyre.jpg"];
  const clips = shots.map((s, i) => path.join(dir, `clip-${i + 1}.webm`));
  shots.forEach((s, i) => pushIn(clips[i], s, i === 2 ? 1.5 : 0));
  concat(path.join(dir, "cut.webm"), clips);
}

// Pattern 2: shot fan-out. A still per shot, a clip per still, then the cut.
{
  const dir = castDir("cookbook-shot-fan-out");
  const shots = [
    ["voltra/street.jpg", 0],
    ["voltra/rider.jpg", 0],
    ["voltra/ride.jpg", 1.5],
  ];
  const clips = shots.map((_, i) => path.join(dir, `clip-${i + 1}.webm`));
  shots.forEach(([source, pan], i) => {
    still(path.join(dir, `still-${i + 1}.jpg`), source);
    pushIn(clips[i], source, pan);
  });
  concat(path.join(dir, "cut.webm"), clips);
}

// Pattern 3: one cast across many assets. The Prism shoe is the entity.
{
  const dir = castDir("cookbook-entity-cast");
  still(path.join(dir, "entity.jpg"), "prism/shoe.jpg");
  ["prism/athlete.jpg", "prism/knit.jpg", "prism/sole.jpg", "prism/poster.jpg"].forEach(
    (source, i) => still(path.join(dir, `asset-${i + 1}.jpg`), source)
  );
}

// Pattern 4: script to voiced cut. A take per line, then the cut.
{
  const dir = castDir("cookbook-script-voice");
  PRESENTER_LINES.forEach(([from, to], i) =>
    mp3(path.join(dir, `take-${i + 1}.mp3`), PRESENTER, from, to)
  );
  talking(path.join(dir, "cut.webm"), PRESENTER, "scale=480:270");
}

// Pattern 5: sketch as the control input. The sketch and three styled renders.
{
  const dir = castDir("cookbook-sketch-variants");
  const hero = "voltra/hero.jpg";
  still(path.join(dir, "sketch.jpg"), hero, [
    "-colorspace", "gray", "-statistic", "median", "5x5", "-edge", "1",
    "-negate", "-normalize", "-level", "55%,100%",
  ]);
  still(path.join(dir, "noir.jpg"), hero, ["-colorspace", "gray", "-sigmoidal-contrast", "8x45%"]);
  still(path.join(dir, "retro.jpg"), hero, [
    "-modulate", "110,140,80", "-fill", "#ff8a2a", "-colorize", "22%",
    "-sigmoidal-contrast", "4x40%",
  ]);
  still(path.join(dir, "teal.jpg"), hero);
}

// Pattern 6: variant fan-out. Four posters of the same bike.
{
  const dir = castDir("cookbook-variant-fan-out");
  ["voltra/hero.jpg", "voltra/rooftop.jpg", "voltra/side.jpg", "voltra/rider.jpg"].forEach(
    (source, i) => still(path.join(dir, `poster-${i + 1}.jpg`), source)
  );
}

// Pattern 7: derivatives from a finished cut. The master, a 9:16 render, its
// audio, and the render with burned-in captions.
{
  const dir = castDir("cookbook-derivatives");
  talking(path.join(dir, "master.webm"), PRESENTER, "scale=480:270");
  const vertical = "crop=ih*9/16:ih,scale=270:480";
  talking(path.join(dir, "vertical.webm"), PRESENTER, vertical);
  mp3(path.join(dir, "audio.mp3"), PRESENTER);
  const srt = path.join(tmp, "captions.srt");
  fs.copyFileSync(PRESENTER_SRT, srt);
  talking(
    path.join(dir, "captioned.webm"),
    PRESENTER,
    `${vertical},subtitles=${srt}:force_style='FontSize=12,Alignment=2,MarginV=40,Outline=1'`
  );
}

// Pattern 8: a Code node names a clip from its narration.
{
  const dir = castDir("cookbook-code-glue");
  talking(path.join(dir, "clip.webm"), PRESENTER_LINE_1, "scale=480:270");
  mp3(path.join(dir, "audio.mp3"), PRESENTER_LINE_1);
}

// Workflow: image enhancement. A soft, flat photo, then sharpened, then
// contrast-stretched, so each filter's card shows its own change.
{
  const dir = castDir("cookbook-image-enhancement");
  const base = ["-resize", "640x360^", "-gravity", "center", "-extent", "640x360"];
  const flat = path.join(dir, "photo.jpg");
  const sharp = path.join(dir, "sharpened.jpg");
  const tail = ["-resize", "480x270", "-strip", "-quality", "75"];
  run("convert", [
    path.join(RECIPE_INPUTS, "coffee.jpg"), ...base,
    "-blur", "0x2.2", "+level", "22%,78%", "-modulate", "100,70", ...tail, flat,
  ]);
  run("convert", [flat, "-unsharp", "0x2+2.5+0", "-quality", "75", sharp]);
  run("convert", [sharp, "-normalize", "-modulate", "100,125", "-quality", "75", path.join(dir, "enhanced.jpg")]);
}

// Workflow: color boost video. A dim, washed-out clip, its graded frames, and
// the graded clip.
{
  const dir = castDir("workflow-color-boost-video");
  const source = path.join(TIMELINES, "t-minus-30/pad.mp4");
  const cut = ["-ss", "2", "-t", "4", "-i", source];
  const scale = "scale=480:270";
  const dim = "eq=brightness=-0.12:contrast=0.75:saturation=0.35";
  const exposed = "eq=brightness=0.04:contrast=1.05:saturation=0.35";
  const graded = "eq=brightness=0.06:contrast=1.15:saturation=1.9";
  const clip = (out, vf) =>
    ffmpeg([...cut, "-vf", `${scale},${vf},format=yuv420p`, "-an", "-c:v", "libvpx", "-b:v", "180k", out]);
  const frame = (out, vf) => ffmpeg([...cut, "-vf", `${scale},${vf}`, "-frames:v", "1", "-q:v", "4", out]);
  clip(path.join(dir, "clip.webm"), dim);
  frame(path.join(dir, "exposed.jpg"), exposed);
  frame(path.join(dir, "graded.jpg"), graded);
  clip(path.join(dir, "graded.webm"), graded);
}

// Tutorial: trim and arrange a timeline. The opening shot is the start of the
// Kite ad, and the cutaway is a later frame of the same ad.
{
  const dir = castDir("timeline-trim-arrange");
  const source = path.join(TIMELINES, "kite/ad.mp4");
  ffmpeg([
    "-ss", "0.6", "-t", "6", "-i", source, "-an", "-vf", "scale=960:540",
    "-c:v", "libvpx-vp9", "-b:v", "600k", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4",
    path.join(dir, "opening.webm"),
  ]);
  ffmpeg(["-ss", "12", "-i", source, "-frames:v", "1", "-vf", "scale=960:540", "-q:v", "3", path.join(dir, "cutaway.jpg")]);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
