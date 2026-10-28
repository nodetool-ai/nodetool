import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const userSession = process.env.WAYLAND_DISPLAY || (process.env.XDG_SESSION_TYPE &&
  !["tty", "unspecified"].includes(process.env.XDG_SESSION_TYPE.toLowerCase()));
const override = process.env.NT_TIMELINE_DOCUMENT_PLATFORM;
const platform = override !== undefined ? override || "offscreen" :
  (process.env.DISPLAY && !userSession ? "xcb" : "offscreen");
console.log(`platform: ${platform}`);
const bin = path.resolve(process.argv[2]);
// The sanitize build runs the app several times slower than a release build.
const slowdown = bin.includes("build-sanitize") ? 6 : 1;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "nt-document-controls-"));
const fixture = path.join(work, "fixture.json");
fs.writeFileSync(fixture, JSON.stringify({id: "fixture", name: "Before", width: 1920, height: 1080, fps: 30,
  durationMs: 6000, tracks: [], clips: [], markers: []}));
const realPreferences = path.join(os.homedir(), ".config/NodeTool/Timeline.conf");
const priorPreferences = fs.existsSync(realPreferences) ? fs.readFileSync(realPreferences, "utf8") : null;
const failures = [];
for (const mode of ["controls-key", "controls-menu", "controls-button", "controls-new-menu", "controls-new-button", "dismiss-escape", "dismiss-outside", "keyboard"]) {
  const dir = path.join(work, mode);
  fs.mkdirSync(dir);
  const result = spawnSync(bin, [fixture, "--audio", "none"], {encoding: "utf8", timeout: 30000 * slowdown,
    env: {...process.env, NT_TIMELINE_DOCUMENT_TIMEOUT_MS: String(20000 * slowdown), NODETOOL_SERVER_URL: "", NODETOOL_API_TOKEN: "", NODETOOL_TIMELINE_EXPECT_INSTANCE: "",
      NODETOOL_TIMELINE_PREFERENCES: path.join(dir, "preferences.ini"), XDG_CACHE_HOME: path.join(dir, "qt-cache"), XDG_CONFIG_HOME: path.join(dir, "config"), NT_TIMELINE_SWITCH_CAPTURE: "", NODETOOL_TIMELINE_CACHE_DIR: path.join(dir, "cache"),
      NT_TIMELINE_DOCUMENT_CHECK: mode, NT_TIMELINE_DOCUMENT_RESULT: path.join(dir, "result.json"),
      QT_QPA_PLATFORM: platform, QT_QUICK_BACKEND: platform === "offscreen" ? "software" : undefined}});
  if (result.status !== 0) failures.push(`${mode}: exit ${result.status}\n${result.stderr}`);
  else console.log(`PASS ${mode}`);
  assert.equal(fs.existsSync(path.join(dir, "config/NodeTool/Timeline.conf")), false);
  assert.equal(fs.existsSync(realPreferences) ? fs.readFileSync(realPreferences, "utf8") : null, priorPreferences);
}
if (failures.length) console.error(`Logs: ${work}\n${failures.join("\n")}`);
else fs.rmSync(work, {recursive: true, force: true});
assert.equal(failures.length, 0);
