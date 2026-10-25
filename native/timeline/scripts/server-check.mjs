#!/usr/bin/env node
// Server read and asset cache check (PLAN.md M5a). It starts its own scratch
// NodeTool servers from this checkout, seeds them, and opens every seeded
// timeline with `nodetool-timeline --server URL --timeline ID`.
//
// Isolation: each run makes a fresh folder (mkdtemp) under build-m5, after it
// checks that build-m5 is a plain directory at its canonical path. Each
// scratch server gets <run>/<name>/ and its own HOME, XDG_*, DB_PATH,
// VECTORSTORE_DB_PATH, ASSET_FOLDER, STORAGE_PATH and SECRETS_MASTER_KEY (no
// keychain), on a port that is never 7777 and must be free before launch.
// Before any write the script proves that every listener on the port is in
// the process group it started (lsof, ps), and it re-checks that before each
// write. It refuses every redirect. It checks that the server logged its
// database under the scratch folder and stored an upload there. It stops each
// server's whole process group (SIGTERM, then SIGKILL after a deadline), also
// on Ctrl-C.
//
// Exit criteria (one result each):
//   open      - every shipped example timeline and every seeded fixture opens;
//               `--stills` renders it (exit 0); the loader report lists the
//               unsupported fields, missing assets and rejected media.
//   identical - a fixture opened from the server draws the same pixels as the
//               local fixture file (the same media through the cache).
//   warm      - a second open with a warm cache resolves in under 500 ms and
//               downloads nothing.
//   plan      - plan-conformance.mjs passes on every opened timeline for the
//               clips with no plan-level unsupported field.
//   proxy     - ready H.264, ready VP9, pending, failed and no proxy: the
//               picture reads the proxy only when ready; audio always reads
//               the original (which has an audio stream; the proxy has none).
//   version   - an asset whose bytes change on the server gets a new cache
//               file, and the old file is removed.
//   roundTrip - (M5b) for every example and fixture: a save with no edit
//               leaves the server content as it was, a save of one edit
//               reloads as exactly that edit (all but updatedAt/createdAt),
//               no field is stripped, and the stack is clean after the save.
//   strip     - an invented clip field: the save warns with the stripped
//               path, keeps the sent document and the load backup on disk.
//   conflict  - two clients: B saves between A's load and save; A gets the
//               conflict, keeps its document, and the server keeps B's edit.
//   autosave  - one edit saves itself 750 ms later (D34).
//
// Usage: node native/timeline/scripts/server-check.mjs [--bin PATH] [--port N] [--json] [--keep]
// --keep keeps the scratch folder (build-m5/scratch-XXXXXX) after a passing run.
// Needs `scripts/make-fixtures.sh` media and a built native/timeline/build-m5.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { USER_PORT, createScratchSession } from "./scratch-server.mjs";
import {
  assertInWork as assertInWorkIn,
  makeScratch,
  safeRm as safeRmIn,
  verifiedBuildDir
} from "./scratch-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "..", "..");

function parseArgs(argv) {
  const args = { bin: path.join(root, "build-m5", "nodetool-timeline"), port: 7799, json: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--bin") args.bin = path.resolve(argv[++i]);
    else if (argv[i] === "--port") args.port = Number(argv[++i]);
    else if (argv[i] === "--json") args.json = true;
    else if (argv[i] === "--keep") args.keep = true;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (args.port === USER_PORT || args.port + 1 === USER_PORT) throw new Error("port 7777 belongs to the user's server");
  return args;
}

const args = parseArgs(process.argv.slice(2));
const log = (...m) => {
  if (!args.json) console.error(...m);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the scratch folder ────────────────────────────────────────────────────
// Fresh per run under a canonical build-m5 (scratch-safety.mjs).

const work = makeScratch(verifiedBuildDir(root, "build-m5"));
const assertInWork = (p) => assertInWorkIn(work, p);
const safeRm = (p) => safeRmIn(work, p);

// ── scratch servers (scratch-server.mjs) ─────────────────────────────────

const { servers, startServer, stopServers, assertScratch, nativeEnv, query, mutate, upload, waitProxy, createTimeline } = createScratchSession({
  work,
  repo,
  assertInWork,
  log
});

// ── media ─────────────────────────────────────────────────────────────────

function md5(file) {
  return crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
}

/** A 2 s 1280x720 clip with a sine tone, distinct per `hue`. */
function makeAvClip(file, hue, freq) {
  if (fs.existsSync(file)) return;
  execFileSync("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=1280x720:rate=30:duration=2,hue=h=${hue}`,
    "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=2`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "30", "-c:a", "aac", "-shortest", file
  ]);
}

function streams(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", file], {
    encoding: "utf8"
  });
  return JSON.parse(out).streams ?? [];
}

function rgbaMd5(png) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], {
    maxBuffer: 256 * 1024 * 1024
  });
  return crypto.createHash("md5").update(raw).digest("hex");
}

// ── the native client ─────────────────────────────────────────────────────

const cacheDir = path.join(work, "cache");

// ── saving (M5b) ──────────────────────────────────────────────────────────

/**
 * `nodetool-timeline --server ... --timeline ID --save [args]`. The native
 * client writes to the server, so the ownership check runs right before it
 * starts and again when it ends (a lost port fails the run). The client gets
 * the server's instance token (`nativeEnv`) and refuses to write to any
 * listener that does not answer with it.
 */
async function saveNative(server, id, extra = []) {
  await assertScratch(server.base);
  const r = spawnSync(args.bin, ["--server", server.base, "--timeline", id, "--cache-dir", cacheDir, "--save", ...extra], {
    env: nativeEnv(server),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 120_000
  });
  const lines = (r.stdout ?? "").trim().split("\n").filter(Boolean);
  let out = null;
  try {
    out = JSON.parse(lines.at(-1));
  } catch {
    /* no JSON */
  }
  await assertScratch(server.base);
  return { status: r.status, out, stderr: r.stderr ?? "" };
}

/**
 * A copy without the timestamps and the top-level `durationMs`, keys sorted,
 * for content comparison. `durationMs` is the server's cache of the last clip
 * end: every document save recomputes it (`timelineDocumentDurationMs`), for
 * the web editor's saves too, so it is checked against that rule instead.
 */
function canonical(value, top = true) {
  if (Array.isArray(value)) return value.map((v) => canonical(v, false));
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === "updatedAt" || key === "createdAt" || (top && key === "durationMs")) continue;
      out[key] = canonical(value[key], false);
    }
    return out;
  }
  return value;
}

/** The first difference between two documents, or null. */
function firstDiff(a, b, at = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[key], b[key], `${at}.${key}`);
      if (d) return d;
    }
  }
  return `${at || "."}: ${JSON.stringify(a)?.slice(0, 80)} vs ${JSON.stringify(b)?.slice(0, 80)}`;
}

function openNative(server, id, mode, extra = []) {
  const reportPath = path.join(work, "reports", `${server.name}-${id}-${mode}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  safeRm(reportPath);
  const argv = ["--server", server.base, "--timeline", id, "--cache-dir", cacheDir, "--loader-report", reportPath, ...extra];
  const started = Date.now();
  const r = spawnSync(args.bin, argv, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 300_000,
    // --stills renders through QQuickRenderControl with no window; it needs
    // the native platform plugin for its QRhi, so QT_QPA_PLATFORM stays unset.
    env: nativeEnv(server)
  });
  const wallMs = Date.now() - started;
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : null;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, report, wallMs, argv };
}

function stillsFor(server, id, frames, tag) {
  const dir = path.join(work, "stills", `${server.name}-${id}-${tag}`);
  safeRm(dir);
  const r = openNative(server, id, `stills-${tag}`, ["--stills", dir, "--still-frames", frames.join(",")]);
  const pngs = frames.map((f) => path.join(dir, `frame_${String(f).padStart(6, "0")}.png`));
  return { ...r, dir, pngs, ok: r.status === 0 && pngs.every((p) => fs.existsSync(p) && fs.statSync(p).size > 0) };
}

function localStills(fixture, frames, tag) {
  const dir = path.join(work, "stills", `local-${tag}`);
  safeRm(dir);
  const r = spawnSync(args.bin, [fixture, "--stills", dir, "--still-frames", frames.join(",")], {
    encoding: "utf8",
    timeout: 300_000,
    // --stills renders through QQuickRenderControl with no window; it needs
    // the native platform plugin for its QRhi, so QT_QPA_PLATFORM stays unset.
    env: process.env
  });
  return { status: r.status, stderr: r.stderr, pngs: frames.map((f) => path.join(dir, `frame_${String(f).padStart(6, "0")}.png`)) };
}

function planCheck(server, id) {
  const r = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "plan-conformance.mjs"), "--json", "--bin", args.bin, "--server", server.base, "--cache-dir", cacheDir, "--timeline", id],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 600_000 }
  );
  try {
    return { status: r.status, result: JSON.parse(r.stdout) };
  } catch {
    return { status: r.status, result: null, stderr: `${r.error ?? ""} ${(r.stderr ?? "").slice(-1500)}` };
  }
}

// ── the run ───────────────────────────────────────────────────────────────

const results = { open: [], identical: [], warm: [], plan: [], proxy: [], version: [], roundTrip: [], strip: [], conflict: [], autosave: [] };
const failures = [];
const fail = (criterion, msg) => failures.push(`${criterion}: ${msg}`);

function frameAt(doc, ms) {
  return Math.max(0, Math.floor((ms * doc.fps) / 1000));
}

async function main() {
  if (!fs.existsSync(args.bin)) throw new Error(`no binary at ${args.bin}; build native/timeline/build-m5 first`);
  fs.mkdirSync(path.join(work, "fake-bin"), { recursive: true });
  const fakeFfmpeg = path.join(work, "fake-bin", "ffmpeg");
  fs.symlinkSync(path.join(root, "scripts", "fake-ffmpeg.sh"), fakeFfmpeg);
  // The server finds `ffmpeg` on PATH; a file without the execute bit is skipped there.
  fs.chmodSync(path.join(root, "scripts", "fake-ffmpeg.sh"), 0o755);
  const probe = spawnSync(fakeFfmpeg, ["-hide_banner", "-encoders"], { env: { ...process.env, NT_FAKE_NO_X264: "1" }, encoding: "utf8" });
  if (probe.status !== 0 || /libx264/.test(probe.stdout) || !/libvpx-vp9/.test(probe.stdout)) {
    throw new Error("scripts/fake-ffmpeg.sh does not run or does not hide libx264");
  }

  // The user's data folder must not change (read with stat only).
  const userDb = path.join(process.env.HOME, ".local", "share", "nodetool", "nodetool.sqlite3");
  const userDbBefore = fs.existsSync(userDb) ? fs.statSync(userDb).mtimeMs : null;

  const mediaDir = path.join(work, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  const av = {};
  for (const [name, hue, freq] of [["ready", 0, 440], ["pending", 90, 550], ["failed", 180, 660], ["none", 270, 770], ["vp9", 45, 880], ["changed", 135, 990]]) {
    av[name] = path.join(mediaDir, `av-${name}.mp4`);
    makeAvClip(av[name], hue, freq);
  }

  const a = await startServer("a", args.port, {
    NT_FAKE_FAIL_MD5: md5(av.failed),
    NT_FAKE_HOLD_MD5: md5(av.pending)
  });

  // Seed 1: every shipped example timeline. The server's list must equal the
  // shipped files, so an empty or partial list fails the run.
  const seeded = [];
  const shipped = fs
    .readdirSync(path.join(repo, "packages", "base-nodes", "nodetool", "examples", "timelines"))
    .filter((f) => f.endsWith(".timeline.json"))
    .map((f) => f.slice(0, -".timeline.json".length))
    .sort();
  const listed = await query(a.base, "timeline.examples");
  const listedSlugs = listed.map((ex) => ex.slug).sort();
  if (shipped.length === 0 || JSON.stringify(listedSlugs) !== JSON.stringify(shipped)) {
    throw new Error(`timeline.examples lists [${listedSlugs}], the shipped files are [${shipped}]`);
  }
  results.examples = { shipped, listed: listedSlugs };
  for (const ex of listed) {
    const seq = await mutate(a.base, "timeline.installExample", { slug: ex.slug });
    seeded.push({ server: a, id: seq.id, label: `example ${ex.slug}`, doc: await query(a.base, "timeline.get", { id: seq.id }) });
  }

  // Seed 2: media fixtures, their files uploaded as assets.
  const fixtureSeeds = [];
  for (const name of ["video-cuts.json", "video-4tracks.json"]) {
    const fixture = path.join(root, "fixtures", name);
    const doc = JSON.parse(fs.readFileSync(fixture, "utf8"));
    const byPath = new Map();
    for (const clip of doc.clips) {
      if (!clip.mediaPath) continue;
      const file = path.resolve(path.dirname(fixture), clip.mediaPath);
      if (!byPath.has(file)) byPath.set(file, (await upload(a, file)).id);
      clip.currentAssetId = byPath.get(file);
      delete clip.mediaPath;
    }
    const id = await createTimeline(a.base, `fixture ${name}`, doc);
    const entry = { server: a, id, label: `fixture ${name}`, doc: await query(a.base, "timeline.get", { id }), fixture };
    seeded.push(entry);
    fixtureSeeds.push(entry);
  }

  // Seed 3: proxy states, a missing asset, a rejected file.
  const assets = {};
  for (const name of ["ready", "pending", "failed", "none", "changed"]) assets[name] = await upload(a, av[name]);
  assets.reject = await upload(a, path.join(root, "fixtures", "media", "reject-rotation.mp4"));
  await mutate(a.base, "assets.ensureProxy", { id: assets.ready.id });
  await waitProxy(a.base, assets.ready.id, "ready");
  await mutate(a.base, "assets.ensureProxy", { id: assets.failed.id });
  await waitProxy(a.base, assets.failed.id, "failed");
  await mutate(a.base, "assets.ensureProxy", { id: assets.pending.id });
  await waitProxy(a.base, assets.pending.id, "running");
  const statesDoc = proxyStatesDoc([
    ["ready", assets.ready.id],
    ["pending", assets.pending.id],
    ["failed", assets.failed.id],
    ["none", assets.none.id],
    ["changed", assets.changed.id],
    ["reject", assets.reject.id],
    ["missing", "0123456789abcdef0123456789abcdef"]
  ]);
  const statesId = await createTimeline(a.base, "proxy states", statesDoc);
  const states = { server: a, id: statesId, label: "proxy states", doc: await query(a.base, "timeline.get", { id: statesId }) };
  seeded.push(states);

  // Criterion open (+ warm, plan) on every seeded timeline.
  for (const s of seeded) {
    const frames = [frameAt(s.doc, s.doc.durationMs * 0.25), frameAt(s.doc, s.doc.durationMs * 0.5)];
    const cold = stillsFor(s.server, s.id, frames, "cold");
    const rep = cold.report;
    const summary = rep?.summary ?? {};
    const entry = {
      timeline: s.label,
      id: s.id,
      exit: cold.status,
      stills: cold.ok,
      clips: summary.clips,
      unsupportedFields: rep ? Object.keys(rep.fields?.fields ?? {}) : null,
      missingAssets: rep?.missingAssets?.map((m) => `${m.clipId}: ${m.reason}`) ?? null,
      rejectedMedia: rep?.rejectedMedia?.map((m) => `${m.clipId}: ${m.reason}`) ?? null,
      downloads: summary.downloads
    };
    results.open.push(entry);
    if (!cold.ok) fail("open", `${s.label}: exit ${cold.status}, stills ${cold.ok}: ${cold.stderr.split("\n").filter((l) => /error|loader/.test(l)).slice(-3).join(" | ")}`);
    if (!rep) fail("open", `${s.label}: no loader report`);

    const warm = openNative(s.server, s.id, "warm", ["--dump-plan", "--times", "0"]);
    const w = warm.report;
    const warmEntry = { timeline: s.label, exit: warm.status, resolveMs: w?.timings?.totalMs, wallMs: warm.wallMs, downloads: w?.summary?.downloads };
    results.warm.push(warmEntry);
    if (warm.status !== 0 || !w) fail("warm", `${s.label}: exit ${warm.status}`);
    else if (!(w.timings.totalMs < 500)) fail("warm", `${s.label}: warm open took ${w.timings.totalMs} ms`);
    else if (w.summary.downloads !== 0) fail("warm", `${s.label}: warm open downloaded ${w.summary.downloads} files`);

    const plan = planCheck(s.server, s.id);
    const pr = plan.result?.fixtures?.[0];
    results.plan.push({ timeline: s.label, verdict: pr?.verdict ?? "error", layersCompared: pr?.layersCompared, excludedClips: pr?.excludedClips, mismatches: pr?.mismatches?.slice(0, 5) ?? [plan.stderr] });
    // Every timeline must compare at least one layer (M1e): "empty" fails too.
    if (pr?.verdict !== "pass") fail("plan", `${s.label}: ${pr?.verdict} ${pr?.mismatches?.slice(0, 3).join(" | ") ?? plan.stderr}`);
  }

  for (const slug of shipped) {
    if (!results.open.some((o) => o.timeline === `example ${slug}`)) fail("open", `example ${slug} was not opened`);
  }

  // Criteria round trip, strip, conflict and autosave (M5b), on fresh copies
  // so the timelines the other criteria read stay as seeded.
  const saveSeeds = [];
  for (const ex of listed) {
    const seq = await mutate(a.base, "timeline.installExample", { slug: ex.slug, name: `save ${ex.slug}` });
    saveSeeds.push({ id: seq.id, label: `example ${ex.slug}` });
  }
  for (const f of fixtureSeeds) {
    const doc = await query(a.base, "timeline.get", { id: f.id });
    saveSeeds.push({ id: await createTimeline(a.base, `save ${f.label}`, doc), label: f.label });
  }
  for (const seed of saveSeeds) {
    const before = await query(a.base, "timeline.get", { id: seed.id });
    // No edit: the server copy keeps its content and strips nothing.
    const plain = await saveNative(a, seed.id);
    const afterPlain = await query(a.base, "timeline.get", { id: seed.id });
    const plainDiff = firstDiff(canonical(before), canonical(afterPlain));
    // One edit: the reloaded document is the edited one.
    const clip = before.clips.find((c) => c.mediaType !== "group") ?? before.clips[0];
    const moved = Math.round(clip.startMs + 250);
    const edited = await saveNative(a, seed.id, ["--move-clip", `${clip.id}:${moved}`]);
    const afterEdit = await query(a.base, "timeline.get", { id: seed.id });
    const expected = structuredClone(before);
    expected.clips.find((c) => c.id === clip.id).startMs = moved;
    const editDiff = firstDiff(canonical(expected), canonical(afterEdit));
    const entry = {
      timeline: seed.label,
      plainSave: plain.status,
      plainStripped: plain.out?.stripped,
      plainDiff,
      editSave: edited.status,
      editStripped: edited.out?.stripped,
      editDirty: [edited.out?.dirtyBefore, edited.out?.dirtyAfter],
      editDiff
    };
    results.roundTrip.push(entry);
    if (plain.status !== 0 || plain.out?.stripped?.length) fail("roundTrip", `${seed.label}: plain save ${plain.status} stripped ${JSON.stringify(plain.out?.stripped)} ${plain.out?.error ?? ""}`);
    if (plainDiff) fail("roundTrip", `${seed.label}: a save with no edit changed ${plainDiff}`);
    if (edited.status !== 0 || edited.out?.stripped?.length) fail("roundTrip", `${seed.label}: edit save ${edited.status} ${edited.out?.error ?? ""}`);
    if (editDiff) fail("roundTrip", `${seed.label}: the reloaded document differs from the edit at ${editDiff}`);
    const lastEnd = (doc) => doc.clips.reduce((end, c) => Math.max(end, (Number(c.startMs) || 0) + (Number(c.durationMs) || 0)), 0);
    entry.durationMs = [afterPlain.durationMs, lastEnd(afterPlain), afterEdit.durationMs, lastEnd(afterEdit)];
    if (afterPlain.durationMs !== lastEnd(afterPlain) || afterEdit.durationMs !== lastEnd(afterEdit)) {
      fail("roundTrip", `${seed.label}: durationMs is not the last clip end ${JSON.stringify(entry.durationMs)}`);
    }
    if (!(edited.out?.dirtyBefore === true && edited.out?.dirtyAfter === false)) fail("roundTrip", `${seed.label}: dirty ${JSON.stringify(entry.editDirty)}`);
  }

  // Strip: an invented clip field is reported and kept on disk; the raw backup of the last load stays.
  {
    const seed = saveSeeds[0];
    const doc = await query(a.base, "timeline.get", { id: seed.id });
    const clip = doc.clips[0];
    const r = await saveNative(a, seed.id, ["--set-clip-field", `${clip.id}:inventedField={"kept":true}`]);
    const after = await query(a.base, "timeline.get", { id: seed.id });
    const kept = r.out?.keptCopy && fs.existsSync(r.out.keptCopy) ? JSON.parse(fs.readFileSync(r.out.keptCopy, "utf8")) : null;
    const backup = path.join(path.dirname(r.out?.keptCopy ?? ""), `${seed.id}.json`);
    const entry = {
      status: r.status,
      stripped: r.out?.stripped,
      warned: /dropped/.test(r.stderr),
      keptHasField: kept?.clips?.find((c) => c.id === clip.id)?.inventedField?.kept === true,
      backupExists: fs.existsSync(backup),
      serverHasField: after.clips.find((c) => c.id === clip.id)?.inventedField !== undefined
    };
    results.strip.push(entry);
    if (!(r.status === 0 && entry.stripped?.some((p) => p.includes("inventedField")) && entry.warned && entry.keptHasField && entry.backupExists && !entry.serverHasField)) {
      fail("strip", JSON.stringify(entry));
    }
  }

  // Conflict: client A loads, client B saves, then A saves on its old base.
  {
    const seed = saveSeeds[1];
    const doc = await query(a.base, "timeline.get", { id: seed.id });
    const clips = doc.clips.filter((c) => c.mediaType !== "group");
    const [ca, cb] = [clips[0], clips[1] ?? clips[0]];
    const go = assertInWork(path.join(work, "conflict-go"));
    const aEdit = Math.round(ca.startMs + 111);
    const bEdit = Math.round(cb.startMs + 222);
    await assertScratch(a.base);
    const child = spawn(args.bin, ["--server", a.base, "--timeline", seed.id, "--cache-dir", cacheDir, "--save",
      "--move-clip", `${ca.id}:${aEdit}`, "--wait-before-save", go], { env: nativeEnv(a), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const deadline = Date.now() + 60_000;
    while (!/"loaded"/.test(stdout) && Date.now() < deadline && child.exitCode === null) await sleep(50);
    const b = await saveNative(a, seed.id, ["--move-clip", `${cb.id}:${bEdit}`]);
    await assertScratch(a.base);  // right before A's save goes out
    fs.writeFileSync(go, "go");
    const aStatus = await new Promise((resolve) => (child.exitCode !== null ? resolve(child.exitCode) : child.on("exit", resolve)));
    await assertScratch(a.base);
    const aOut = JSON.parse(stdout.trim().split("\n").at(-1));
    const after = await query(a.base, "timeline.get", { id: seed.id });
    const kept = aOut.keptCopy && fs.existsSync(aOut.keptCopy) ? JSON.parse(fs.readFileSync(aOut.keptCopy, "utf8")) : null;
    const entry = {
      bStatus: b.status,
      aStatus,
      aConflict: aOut.conflict,
      aDirtyAfter: aOut.dirtyAfter,
      serverHasB: after.clips.find((c) => c.id === cb.id)?.startMs === bEdit,
      serverHasA: ca.id !== cb.id && after.clips.find((c) => c.id === ca.id)?.startMs === aEdit,
      keptHasA: kept?.clips?.find((c) => c.id === ca.id)?.startMs === aEdit,
      warned: /conflict/.test(stderr)
    };
    results.conflict.push(entry);
    if (!(entry.bStatus === 0 && entry.aStatus === 3 && entry.aConflict && entry.aDirtyAfter && entry.serverHasB && !entry.serverHasA && entry.keptHasA && entry.warned)) {
      fail("conflict", JSON.stringify(entry));
    }
  }

  // Autosave: one edit saves itself 750 ms later (D34).
  {
    const seed = saveSeeds[2];
    const doc = await query(a.base, "timeline.get", { id: seed.id });
    const clip = doc.clips.find((c) => c.mediaType !== "group") ?? doc.clips[0];
    const moved = Math.round(clip.startMs + 333);
    const r = await saveNative(a, seed.id, ["--autosave", "--move-clip", `${clip.id}:${moved}`]);
    const after = await query(a.base, "timeline.get", { id: seed.id });
    const entry = { status: r.status, afterMs: r.out?.autosaveAfterMs, saved: after.clips.find((c) => c.id === clip.id)?.startMs === moved };
    results.autosave.push(entry);
    if (!(r.status === 0 && entry.saved && entry.afterMs >= 700)) fail("autosave", JSON.stringify(entry));
  }

  // Criterion identical: server stills equal local fixture stills.
  for (const s of fixtureSeeds) {
    const frames = [0, frameAt(s.doc, s.doc.durationMs / 2), frameAt(s.doc, s.doc.durationMs - 100)];
    const tag = path.basename(s.fixture, ".json");
    const local = localStills(s.fixture, frames, tag);
    const remote = stillsFor(s.server, s.id, frames, "identical");
    let same = local.status === 0 && remote.ok;
    const frameResults = frames.map((f, i) => {
      const eq = fs.existsSync(local.pngs[i]) && fs.existsSync(remote.pngs[i]) && rgbaMd5(local.pngs[i]) === rgbaMd5(remote.pngs[i]);
      same = same && eq;
      return { frame: f, identical: eq };
    });
    results.identical.push({ timeline: s.label, frames: frameResults });
    if (!same) fail("identical", `${s.label}: server and local stills differ (${JSON.stringify(frameResults)})`);
  }

  // Criterion proxy, server A: ready H.264, pending, failed, none.
  const stateReport = openNative(a, states.id, "proxy", ["--dump-plan", "--times", "0"]).report;
  const byAsset = new Map((stateReport?.assets ?? []).map((x) => [x.assetId, x]));
  const expect = [
    ["ready h264", assets.ready.id, "proxy", "h264"],
    ["pending", assets.pending.id, "original", null],
    ["failed", assets.failed.id, "original", null],
    ["none", assets.none.id, "original", null]
  ];
  for (const [label, id, variant, codec] of expect) results.proxy.push(checkProxyState(label, byAsset.get(id), variant, codec));
  // Every state plays: a still 1 s into each state's clip shows that clip's
  // own source frame (testsrc2 in a hue of its own), not another clip's.
  const sources = { "ready h264": av.ready, pending: av.pending, failed: av.failed, none: av.none };
  const stateStills = stillsFor(a, states.id, [30, 90, 150, 210], "states");
  if (!stateStills.ok) fail("proxy", `state stills: exit ${stateStills.status}`);
  ["ready h264", "pending", "failed", "none"].forEach((label, i) => {
    const decoded = decodedMatch(stateStills.pngs[i], sources[label], Object.values(sources), 1.0, `state-${i}`);
    const entry = results.proxy.find((r) => r.state === label);
    if (entry) entry.decoded = decoded;
    if (!decoded.ok) fail("proxy", `${label}: the still does not show its source (${JSON.stringify(decoded)})`);
  });
  const missingListed = stateReport?.missingAssets?.some((m) => m.clipId === "missing");
  const rejectListed = stateReport?.rejectedMedia?.some((m) => m.clipId === "reject" && /rotation/.test(m.reason));
  if (!missingListed) fail("open", "proxy states: the missing asset is not in the loader report");
  if (!rejectListed) fail("open", "proxy states: the rotated file is not in rejectedMedia");

  // Criterion version: the asset's bytes change on the server.
  const before = byAsset.get(assets.changed.id)?.picture?.path;
  const newBytes = fs.readFileSync(av.vp9);
  await mutate(a.base, "assets.update", { id: assets.changed.id, data: newBytes.toString("base64"), data_encoding: "base64" });
  const after = openNative(a, states.id, "version", ["--dump-plan", "--times", "0"]).report;
  const changedAfter = after?.assets?.find((x) => x.assetId === assets.changed.id);
  const afterPath = changedAfter?.picture?.path;
  const versionOk =
    !!before && !!afterPath && before !== afterPath && changedAfter.picture.cacheHit === false && !fs.existsSync(before) && md5(afterPath) === md5(av.vp9);
  results.version.push({ before, after: afterPath, oldRemoved: before ? !fs.existsSync(before) : null, bytesMatch: afterPath ? md5(afterPath) === md5(av.vp9) : false });
  if (!versionOk) fail("version", JSON.stringify(results.version.at(-1)));

  await stopServers();
  servers.length = 0;

  // Criterion proxy, server B: an ffmpeg without libx264 makes a VP9 proxy.
  const b = await startServer("b", args.port, { NT_FAKE_NO_X264: "1" });
  const vp9Asset = await upload(b, av.vp9);
  await mutate(b.base, "assets.ensureProxy", { id: vp9Asset.id });
  const vp9Meta = await waitProxy(b.base, vp9Asset.id, "ready");
  const vp9Id = await createTimeline(b.base, "vp9 proxy", proxyStatesDoc([["vp9", vp9Asset.id]]));
  const vp9Stills = stillsFor(b, vp9Id, [15], "vp9");
  const vp9Entry = vp9Stills.report?.assets?.find((x) => x.assetId === vp9Asset.id);
  const vp9Decoded = vp9Stills.ok
    ? decodedMatch(vp9Stills.pngs[0], av.vp9, [av.vp9, av.ready, av.pending, av.failed, av.none], 0.5, "vp9")
    : { ok: false };
  results.proxy.push({ ...checkProxyState("ready vp9", vp9Entry, "proxy", "vp9"), proxyUrl: vp9Meta.proxy_url, stills: vp9Stills.ok, decoded: vp9Decoded });
  if (!vp9Stills.ok) fail("proxy", `ready vp9: stills exit ${vp9Stills.status}`);
  else if (!vp9Decoded.ok) fail("proxy", `ready vp9: the still does not show its source (${JSON.stringify(vp9Decoded)})`);
  await stopServers();

  const userDbAfter = fs.existsSync(userDb) ? fs.statSync(userDb).mtimeMs : null;
  const isolation = { scratch: work, userDataDbUnchanged: userDbBefore === userDbAfter, userServerContacted: false };
  if (userDbBefore !== userDbAfter) fail("isolation", `${userDb} changed during the run`);

  return isolation;
}

function proxyStatesDoc(entries) {
  const clips = [];
  entries.forEach(([name, assetId], i) => {
    clips.push({
      id: name,
      trackId: "v1",
      name,
      startMs: i * 2000,
      durationMs: 2000,
      inPointMs: 0,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      locked: false,
      versions: [],
      width: name === "reject" ? 720 : 1280,
      height: name === "reject" ? 1280 : 720,
      currentAssetId: assetId
    });
  });
  return {
    fps: 30,
    width: 1280,
    height: 720,
    durationMs: entries.length * 2000,
    tracks: [{ id: "v1", name: "V1", type: "video", index: 0, visible: true, locked: false }],
    clips
  };
}

/** PSNR in dB between two images of one size (ffmpeg psnr filter). */
function psnr(a, b) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", a, "-i", b, "-lavfi", "psnr", "-f", "null", "-"], { encoding: "utf8" });
  const m = r.stderr.match(/average:(inf|[\d.]+)/);
  return m ? (m[1] === "inf" ? 99 : Number(m[1])) : null;
}

/**
 * Whether `still` shows `source` at `atSec`: its PSNR against that frame is
 * at least 18 dB and 3 dB above its best PSNR against the other sources.
 */
function decodedMatch(still, source, all, atSec, tag) {
  const refFor = (file) => {
    const ref = assertInWork(path.join(work, "refs", `${tag}-${path.basename(file, ".mp4")}.png`));
    fs.mkdirSync(path.dirname(ref), { recursive: true });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(atSec), "-i", file, "-frames:v", "1", "-vf", "scale=1280:720", ref]);
    return ref;
  };
  const own = psnr(still, refFor(source));
  const others = all.filter((f) => f !== source).map((f) => psnr(still, refFor(f)));
  const best = Math.max(...others.map((v) => v ?? 0));
  return { ok: own !== null && own >= 18 && own > best + 3, ownPsnr: own, bestOtherPsnr: best };
}

/** Mean volume of a file's audio in dB, or null when it has none (ffmpeg volumedetect). */
function meanVolume(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = r.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  return m ? Number(m[1]) : null;
}

function checkProxyState(label, entry, wantVariant, wantCodec) {
  const out = { state: label, picture: entry?.picture?.variant ?? null, reason: entry?.picture?.reason ?? null, audio: entry?.audio?.variant ?? null };
  if (!entry?.picture || !entry?.audio) {
    fail("proxy", `${label}: no picture or audio file in the report`);
    return out;
  }
  const pic = streams(entry.picture.path);
  const aud = streams(entry.audio.path);
  out.pictureCodec = pic.find((s) => s.codec_type === "video")?.codec_name;
  out.pictureHasAudio = pic.some((s) => s.codec_type === "audio");
  out.audioFileHasAudio = aud.some((s) => s.codec_type === "audio");
  if (entry.picture.variant !== wantVariant) fail("proxy", `${label}: picture reads ${entry.picture.variant}, wanted ${wantVariant}`);
  if (wantCodec && out.pictureCodec !== wantCodec) fail("proxy", `${label}: picture codec ${out.pictureCodec}, wanted ${wantCodec}`);
  if (entry.audio.variant !== "original") fail("proxy", `${label}: audio reads ${entry.audio.variant}`);
  if (!out.audioFileHasAudio) fail("proxy", `${label}: the audio file has no audio stream`);
  // The original-audio path on its own: the audio file decodes to sound.
  out.audioMeanVolumeDb = meanVolume(entry.audio.path);
  if (!(out.audioMeanVolumeDb !== null && out.audioMeanVolumeDb > -40)) {
    fail("proxy", `${label}: the audio file decodes to silence (${out.audioMeanVolumeDb} dB)`);
  }
  if (wantVariant === "proxy" && out.pictureHasAudio) fail("proxy", `${label}: the proxy has an audio stream`);
  return out;
}

let isolation = null;
try {
  isolation = await main();
} catch (err) {
  failures.push(`run: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  try {
    await stopServers();
  } catch (err) {
    failures.push(`cleanup: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (results.plan.length > 0 && !results.plan.some((p) => p.verdict === "pass")) failures.push("plan: no timeline compared a layer");
const counts = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.length]));
for (const [k, n] of Object.entries(counts)) {
  if (n === 0) failures.push(`${k}: checked nothing`);
}
const verdict = failures.length === 0 ? "pass" : "fail";
// The scratch folder stays for a failed run (logs) or with --keep.
if (verdict === "pass" && !args.keep) {
  try {
    if (fs.lstatSync(work).isSymbolicLink() || fs.realpathSync(work) !== work) throw new Error(`${work} moved`);
    fs.rmSync(work, { recursive: true, force: true });
  } catch (err) {
    failures.push(`cleanup: ${String(err)}`);
  }
}
const summary = { verdict, failures, isolation, scratch: work, kept: verdict !== "pass" || args.keep, results };
if (args.json) {
  console.log(JSON.stringify(summary));
} else {
  console.log(JSON.stringify(summary, null, 2));
}
process.exit(verdict === "pass" ? 0 : 1);
