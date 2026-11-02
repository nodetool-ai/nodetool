// End to end check of the audio role actions through the real binary, with no window and no sound:
//   --audio-roles duck   writes the ducking lane, and --render-audio plays it
//   --audio-roles match  sets clip volumes that land on the role targets
//   a document without roles is untouched
// Usage: node check-roles.mjs --bin path/to/nodetool-timeline
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = process.argv[process.argv.indexOf("--bin") + 1];
if (!bin) { console.error("usage: node check-roles.mjs --bin <nodetool-timeline>"); process.exit(2); }
const rate = 48000;
const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "roles-"));
let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.error("FAIL " + what); } else { console.log("ok   " + what); } };

function speech(secs, amp, active) {
  const out = new Float32Array(Math.floor(secs * rate));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    if (!active(t)) continue;
    const f0 = 135 + 25 * Math.sin(2 * Math.PI * 0.7 * t);
    phase += f0 / rate;
    let v = 0;
    for (let k = 1; k * f0 < 4000; k++) v += Math.sin(2 * Math.PI * phase * k) / k;
    out[i] = Math.fround(v * (0.6 - 0.4 * Math.cos(2 * Math.PI * 4.5 * t)) * 0.5 * amp);
  }
  return out;
}
function tone(secs, hz, amp) {
  const out = new Float32Array(Math.floor(secs * rate));
  for (let i = 0; i < out.length; i++) out[i] = Math.fround(amp * Math.sin(2 * Math.PI * hz * i / rate));
  return out;
}
function writeWav(path, mono) {
  const bytes = mono.length * 8;
  const buf = Buffer.alloc(44 + bytes);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + bytes, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
  buf.write("data", 36); buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < mono.length; i++) { buf.writeFloatLE(mono[i], 44 + 8 * i); buf.writeFloatLE(mono[i], 48 + 8 * i); }
  writeFileSync(path, buf);
}
const clip = (id, trackId, mediaPath, extra = {}) => ({
  id, trackId, name: id, startMs: 0, durationMs: 10000, inPointMs: 0, mediaType: "audio", sourceType: "imported",
  status: "generated", locked: false, versions: [], mediaPath, ...extra
});
const track = (id, index, extra = {}) => ({ id, name: id, type: "audio", index, visible: true, locked: false, muted: false, ...extra });
const doc = (tracks, clips) => ({ id: "roles", projectId: "t", name: "Roles", fps: 30, width: 640, height: 360, durationMs: 10000,
  master: { volumeDb: 0 }, tracks, clips, markers: [] });
const run = (...args) => {
  const r = spawnSync(bin, args, { encoding: "utf8", env: { ...process.env, QT_QPA_PLATFORM: "offscreen" } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const rmsDb = (f32, fromMs, toMs) => {
  let sum = 0, n = 0;
  for (let i = Math.floor(fromMs * rate / 1000) * 2; i < Math.min(f32.length, Math.floor(toMs * rate / 1000) * 2); i++) { sum += f32[i] * f32[i]; n++; }
  return 10 * Math.log10(sum / n + 1e-20);
};

try {
  const burst = (t) => (t >= 2 && t < 4) || (t >= 6 && t < 7.5);
  writeWav(join(dir, "voice.wav"), speech(10, 0.4, burst));
  const music = tone(10, 220, 0.2); const second = tone(10, 330, 0.1);
  for (let i = 0; i < music.length; i++) music[i] += second[i];
  writeWav(join(dir, "music.wav"), music);
  const base = doc([track("voice", 0), track("music", 1)], [
    clip("dlg", "voice", join(dir, "voice.wav"), { audioRole: "dialogue" }),
    clip("mus", "music", join(dir, "music.wav"), { audioRole: "music" })
  ]);
  writeFileSync(join(dir, "fixture.json"), JSON.stringify(base));

  // Ducking: the expected keyframes, then the render.
  let r = run(join(dir, "fixture.json"), "--audio-roles", "duck", "--out", join(dir, "ducked.json"));
  check(r.code === 0, "duck exits 0: " + r.err);
  const report = JSON.parse(r.out);
  const row = report.clips[0];
  // FilmCraft's eight keyframes, between a flat point at the start of the clip and one just before its end.
  const want = [[0, 0], [1200, 0], [2000, -15], [4000, -15], [4800, 0], [5200, 0], [6000, -15], [7500, -15], [8300, 0], [9999, 0]];
  check(row.points.length === want.length, `ten points, got ${row.points.length}`);
  check(want.every(([t, v], i) => row.points[i] && Math.abs(row.points[i].timeMs - t) <= 130 && row.points[i].value === v), "keyframes at the speech edges");
  check(row.triggers.length === 1 && row.triggers[0] === "dlg", "dialogue is the trigger");
  const ducked = JSON.parse(readFileSync(join(dir, "ducked.json"), "utf8"));
  const lane = ducked.tracks.find((t) => t.id === "music").automation?.[0];
  check(lane?.target.kind === "mixer" && lane.target.param === "volumeDb" && lane.points.length === 10, "a mixer volume lane on the music track");
  check(!ducked.tracks.find((t) => t.id === "voice").automation, "the dialogue track has no lane");
  // Render the music alone.
  ducked.tracks.find((t) => t.id === "voice").muted = true;
  writeFileSync(join(dir, "music-only.json"), JSON.stringify(ducked));
  r = run(join(dir, "music-only.json"), "--render-audio", join(dir, "music-only.f32"));
  check(r.code === 0, "render-audio exits 0: " + r.err);
  const f32 = new Float32Array(readFileSync(join(dir, "music-only.f32")).buffer.slice(0));
  const open = rmsDb(f32, 500, 1000);
  check(Math.abs(rmsDb(f32, 2500, 3500) - open + 15) < 0.4, "music is 15 dB down under the first passage");
  check(Math.abs(rmsDb(f32, 6300, 7200) - open + 15) < 0.4, "music is 15 dB down under the second passage");
  check(Math.abs(rmsDb(f32, 9000, 9800) - open) < 0.2, "music is back to full level afterwards");
  // Running it again on its own output changes nothing.
  r = run(join(dir, "ducked.json"), "--audio-roles", "duck", "--out", join(dir, "twice.json"));
  check(r.code === 0 && JSON.stringify(JSON.parse(readFileSync(join(dir, "twice.json"), "utf8")).tracks)
      === JSON.stringify(JSON.parse(readFileSync(join(dir, "ducked.json"), "utf8")).tracks),
    "ducking again replaces the lane instead of adding to it");

  // Match loudness: volumes that land on the role targets.
  r = run(join(dir, "fixture.json"), "--audio-roles", "match", "--out", join(dir, "matched.json"));
  check(r.code === 0, "match exits 0: " + r.err);
  const match = JSON.parse(r.out);
  const byId = Object.fromEntries(match.clips.map((c) => [c.clipId, c]));
  check(byId.dlg && Math.abs(byId.dlg.targetDb + 23) < 1e-9 && Math.abs(byId.dlg.integratedLufs + byId.dlg.volumeDb + 23) < 0.01, "dialogue is matched to -23 LUFS");
  check(byId.mus && Math.abs(byId.mus.targetDb + 25) < 1e-9 && Math.abs(byId.mus.integratedLufs + byId.mus.volumeDb + 25) < 0.01, "music is matched to -25 LUFS");
  const matched = JSON.parse(readFileSync(join(dir, "matched.json"), "utf8"));
  check(Math.abs(matched.clips.find((c) => c.id === "mus").volumeDb - byId.mus.volumeDb) < 1e-9, "the clip volume is written to the document");

  // A document with no roles is untouched.
  const plain = doc([track("music", 0)], [clip("mus", "music", join(dir, "music.wav"))]);
  writeFileSync(join(dir, "plain.json"), JSON.stringify(plain));
  r = run(join(dir, "plain.json"), "--audio-roles", "match", "--out", join(dir, "plain-out.json"));
  const out = JSON.parse(readFileSync(join(dir, "plain-out.json"), "utf8"));
  check(r.code === 0 && JSON.parse(r.out).clips.length === 0 && out.clips[0].volumeDb === undefined, "match leaves clips with no role alone");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("audio roles: all checks passed");
