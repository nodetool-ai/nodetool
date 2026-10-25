#!/usr/bin/env node
// Writes the tracks UI bench fixture (PLAN.md M2 exit 1): 200 tracks and
// 2000 clips. The top 4 tracks are the media tracks of video-4tracks.json, so
// the preview plays 4 decoded 1080p tracks while the bench zooms and pans;
// 196 audio tracks carry the other 1994 clips over 60 s.
//
//   node native/timeline/scripts/make-ui-fixture.mjs [--out PATH]
//
// The default output is fixtures/generated/ui-200tracks.json (not checked in;
// the plan conformance check reads only the top-level fixtures).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "..", "fixtures");
const outIndex = process.argv.indexOf("--out");
const out = outIndex > 0 ? path.resolve(process.argv[outIndex + 1]) : path.join(fixtures, "generated", "ui-200tracks.json");

const TRACKS = 200;
const CLIPS = 2000;
const DURATION_MS = 60_000;

const base = JSON.parse(readFileSync(path.join(fixtures, "video-4tracks.json"), "utf8"));
const outDir = path.dirname(out);
const doc = { ...base, id: "seq-ui-200tracks", name: "200 tracks, 2000 clips", durationMs: DURATION_MS };
// Media paths are relative to the fixture file.
doc.clips = base.clips.map((clip) => ({
  ...clip,
  mediaPath: path.relative(outDir, path.join(fixtures, clip.mediaPath))
}));
doc.tracks = [...base.tracks];

const audioTracks = TRACKS - base.tracks.length;
const audioClips = CLIPS - base.clips.length;
for (let t = 0; t < audioTracks; t += 1) {
  const index = base.tracks.length + t;
  doc.tracks.push({
    id: `ui-track-${index}`,
    name: `Audio ${t + 1}`,
    type: "audio",
    index,
    visible: true,
    locked: false,
    muted: false
  });
}
// Spread the clips evenly: each track gets floor or ceil of the share, laid
// end to end with a gap, staggered per track so the edges do not line up.
for (let i = 0; i < audioClips; i += 1) {
  const t = i % audioTracks;
  const k = Math.floor(i / audioTracks);
  const perTrack = Math.ceil(audioClips / audioTracks);
  const slot = DURATION_MS / perTrack;
  doc.clips.push({
    id: `ui-clip-${t}-${k}`,
    trackId: `ui-track-${base.tracks.length + t}`,
    name: `Take ${k + 1}`,
    startMs: Math.round(k * slot + ((t * 137) % 900)),
    durationMs: Math.round(slot * 0.8),
    inPointMs: 0,
    mediaType: "audio",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    fadeInMs: t % 3 === 0 ? 400 : 0,
    fadeOutMs: t % 5 === 0 ? 600 : 0
  });
}

if (doc.tracks.length !== TRACKS || doc.clips.length !== CLIPS) {
  console.error(`wrong counts: ${doc.tracks.length} tracks, ${doc.clips.length} clips`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
console.log(`wrote ${path.relative(process.cwd(), out)}: ${doc.tracks.length} tracks, ${doc.clips.length} clips`);
