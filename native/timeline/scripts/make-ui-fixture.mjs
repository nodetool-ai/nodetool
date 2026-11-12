#!/usr/bin/env node
// Writes the tracks UI bench fixture (PLAN.md M2 exit 1): 200 tracks and
// 2000 clips. The top 4 tracks are the media tracks of video-4tracks.json, so
// the preview plays 4 decoded 1080p tracks while the bench zooms and pans;
// 196 audio tracks carry the other 1994 clips over 60 s.
//
//   node native/timeline/scripts/make-ui-fixture.mjs [--out PATH] [--audio-media] [--music]
//
// The default output is fixtures/generated/ui-200tracks.json (not checked in;
// the plan conformance check reads only the top-level fixtures).
// `--audio-media` gives every audio clip a real file (clicks-48k.wav), so the
// bench draws 1994 waveforms (M2b); its default output is
// fixtures/generated/ui-200tracks-media.json.
// `--music` writes the music mode bench (docs/MUSIC-MODE.md PF-2): the 4 media
// tracks, 32 audio tracks with music roles and 500 audio clips, each with a
// real file, three takes and the clips' fades. Default output:
// fixtures/generated/ui-music-32tracks.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "..", "fixtures");
const outIndex = process.argv.indexOf("--out");
const music = process.argv.includes("--music");
const audioMedia = process.argv.includes("--audio-media") || music;
const out = outIndex > 0
  ? path.resolve(process.argv[outIndex + 1])
  : path.join(fixtures, "generated", music ? "ui-music-32tracks.json" : audioMedia ? "ui-200tracks-media.json" : "ui-200tracks.json");

const MEDIA_TRACKS = 4;
const MEDIA_CLIPS = 4;
const TRACKS = music ? MEDIA_TRACKS + 32 : 200;
const CLIPS = music ? MEDIA_CLIPS + 500 : 2000;
const ROLES = ["drums", "bass", "keyboard", "guitar", "vocals", "strings", "synth", "percussion"];
const DURATION_MS = 60_000;

const base = JSON.parse(readFileSync(path.join(fixtures, "video-4tracks.json"), "utf8"));
const outDir = path.dirname(out);
const doc = music
  ? { ...base, id: "seq-ui-music", name: "Music: 32 audio tracks, 500 audio clips", durationMs: DURATION_MS }
  : { ...base, id: "seq-ui-200tracks", name: "200 tracks, 2000 clips", durationMs: DURATION_MS };
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
    muted: false,
    ...(music ? { musicRole: ROLES[t % ROLES.length] } : {})
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
    fadeOutMs: t % 5 === 0 ? 600 : 0,
    ...(music ? { audioRole: "music", versions: [1, 2, 3].map((n) => ({
      id: `ui-take-${t}-${k}-${n}`, createdAt: "2026-11-12T10:00:00.000Z", jobId: `job-${t}-${k}-${n}`,
      assetId: `asset-${t}-${k}-${n}`, workflowUpdatedAt: "2026-11-12T10:00:00.000Z", dependencyHash: "",
      paramOverridesSnapshot: {}, durationMs: Math.round(slot * 0.8), status: "success", label: `Take ${n}`
    })), activeTakeId: `ui-take-${t}-${k}-2` } : {}),
    ...(audioMedia ? { mediaPath: path.relative(outDir, path.join(fixtures, "media", "clicks-48k.wav")) } : {})
  });
}

if (doc.tracks.length !== TRACKS || doc.clips.length !== CLIPS) {
  console.error(`wrong counts: ${doc.tracks.length} tracks, ${doc.clips.length} clips`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
console.log(`wrote ${path.relative(process.cwd(), out)}: ${doc.tracks.length} tracks, ${doc.clips.length} clips`);
