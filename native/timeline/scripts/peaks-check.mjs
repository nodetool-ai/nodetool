#!/usr/bin/env node
// Compares the native waveform peaks (`nodetool-timeline --peaks FILE`,
// src/ui/MediaPreviews.cpp) with the server's (`GET /api/assets/:id/peaks`,
// packages/websocket/src/lib/audio-peaks.ts) for every audio asset of a
// server timeline the native editor has loaded once. It only reads.
//
//   node native/timeline/scripts/peaks-check.mjs SERVER TIMELINE_ID [BIN]
//
// The pairs come from the loader report the native open wrote
// (`<cache>/<server>/<user>/timelines/<id>.report.json`). A peak may differ by
// one rounding step (1/10000) and the length by one sample, as the two decode
// through different FFmpeg front ends (the command line's pan filter, and
// libswresample here).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The assets to compare and the failures found before any comparison. An
 * asset needs audio when a clip of the raw document that uses it is audio
 * or video (ServerTimeline.cpp needsAudio). One that needs audio and has no
 * downloaded audio file fails, with the loader's error. Without the raw
 * document every asset the loader reports an error for fails.
 */
export function planPeaksCheck(report, rawDocument) {
  const compare = [];
  const failures = [];
  const assets = report.assets ?? [];
  if (assets.length === 0) failures.push("the loader report lists no asset");
  const typeOf = new Map((rawDocument?.clips ?? []).map((c) => [c.id, c.mediaType]));
  for (const asset of assets) {
    if (asset.audio?.path) {
      compare.push({ assetId: asset.assetId, path: asset.audio.path });
      continue;
    }
    const needsAudio = rawDocument
      ? (asset.clips ?? []).some((id) => typeOf.get(id) === "audio" || typeOf.get(id) === "video")
      : Boolean(asset.error);
    if (needsAudio) failures.push(`${asset.assetId}: no audio file (${asset.error ?? "the loader downloaded none"})`);
  }
  return { compare, failures };
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [server, timelineId, binArg] = process.argv.slice(2);
  if (!server || !timelineId) {
    console.error("usage: peaks-check.mjs SERVER TIMELINE_ID [BIN]");
    process.exit(2);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bin = binArg ?? path.join(here, "..", "build-m2", "nodetool-timeline");
  const cache = process.env.NODETOOL_TIMELINE_CACHE_DIR ?? path.join(os.homedir(), "Library/Caches/nodetool-timeline/assets");

  let report = null;
  for (const dir of readdirSync(cache)) {
    for (const user of existsSync(path.join(cache, dir)) ? readdirSync(path.join(cache, dir)) : []) {
      const file = path.join(cache, dir, user, "timelines", `${timelineId}.report.json`);
      if (existsSync(file)) report = JSON.parse(readFileSync(file, "utf8"));
    }
  }
  if (!report) {
    console.error(`no loader report for ${timelineId} under ${cache}: open it once with --server`);
    process.exit(2);
  }
  let rawDocument = null;
  try {
    rawDocument = report.rawDocument ? JSON.parse(readFileSync(report.rawDocument, "utf8")) : null;
  } catch {
    /* stays null */
  }

  const { compare, failures } = planPeaksCheck(report, rawDocument);
  for (const f of failures) console.error(`FAIL ${f}`);
  let compared = 0;
  let failed = failures.length;
  for (const asset of compare) {
    const response = await fetch(`${server}/api/assets/${asset.assetId}/peaks?count=2000`);
    if (!response.ok) {
      console.error(`FAIL ${asset.assetId}: server answered ${response.status}`);
      failed += 1;
      continue;
    }
    const remote = await response.json();
    const local = JSON.parse(execFileSync(bin, ["--peaks", asset.path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    let maxDiff = 0;
    for (let i = 0; i < Math.max(remote.peaks.length, local.peaks.length); i += 1) {
      maxDiff = Math.max(maxDiff, Math.abs((remote.peaks[i] ?? -1) - (local.peaks[i] ?? -1)));
    }
    const durationDiff = Math.abs(remote.duration_ms - local.duration_ms);
    const ok = remote.peaks.length === local.peaks.length && maxDiff <= 1e-4 + 1e-9 && durationDiff <= 1000 / 8000;
    compared += 1;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${asset.assetId}: ${local.peaks.length} peaks, max diff ${maxDiff.toFixed(5)}, duration ${local.duration_ms.toFixed(3)} vs ${remote.duration_ms.toFixed(3)} ms`);
  }
  if (compared === 0) {
    console.error("no audio asset compared");
    process.exit(1);
  }
  console.log(`${failed === 0 ? "PASS" : "FAIL"}: ${compared} assets compared, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
