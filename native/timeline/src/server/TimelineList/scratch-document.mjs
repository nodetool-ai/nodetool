import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScratchSession } from "../../../scripts/scratch-server.mjs";

const timelineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const userSession = process.env.WAYLAND_DISPLAY || (process.env.XDG_SESSION_TYPE &&
  !["tty", "unspecified"].includes(process.env.XDG_SESSION_TYPE.toLowerCase()));
const override = process.env.NT_TIMELINE_DOCUMENT_PLATFORM;
const platform = override !== undefined ? override || "offscreen" :
  (process.env.DISPLAY && !userSession ? "xcb" : "offscreen");
console.log(`platform: ${platform}`);
const bin = path.resolve(process.argv[2]);
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nt-document-actions-")));
const session = createScratchSession({work, repo: path.resolve(timelineDir, "../.."), assertInWork(candidate) {
  assert.ok(path.resolve(candidate).startsWith(work + path.sep));
  return candidate;
}, log: console.error});
const realPreferences = path.join(os.homedir(), ".config/NodeTool/Timeline.conf");
const priorPreferences = fs.existsSync(realPreferences) ? fs.readFileSync(realPreferences, "utf8") : null;
let passed = false;
try {
  const server = await session.startServer("document", Number(process.env.NT_TIMELINE_DOCUMENT_PORT ?? 17863));
  const env = {...session.nativeEnv(server), NODETOOL_SERVER_URL: server.base, NODETOOL_API_TOKEN: "",
    QT_QPA_PLATFORM: platform, QT_QUICK_BACKEND: platform === "offscreen" ? "software" : undefined};
  const projects = await session.query(server.base, "projects.list", {});
  const projectId = projects.find(p => p.isPersonal).id;
  const create = () => session.mutate(server.base, "timeline.create", {id: randomUUID().replaceAll("-", ""), name: "Before switch", projectId});
  const failures = [];
  for (const mode of ["open-key", "open-menu", "open-button", "new-menu", "new-button", "new-key-return", "new-key-enter", "new-key-space", "dismiss-escape", "dismiss-outside", "keyboard", "flush-failure"]) {
    const current = await create();
    const chosen = await create();
    const dir = path.join(work, mode);
    fs.mkdirSync(dir);
    const capture = path.join(dir, "switch.json");
    const preferences = path.join(dir, "preferences.ini");
    const result = path.join(dir, "result.json");
    const runEnv = {...env, NODETOOL_TIMELINE_PREFERENCES: preferences, NODETOOL_TIMELINE_CACHE_DIR: path.join(dir, "cache"), XDG_CACHE_HOME: path.join(dir, "qt-cache"),
      NT_TIMELINE_DOCUMENT_CHECK: mode, NT_TIMELINE_DOCUMENT_RESULT: result, NT_TIMELINE_SWITCH_CAPTURE: capture,
      NT_TIMELINE_DOCUMENT_CHOOSE: chosen.id};
    await session.assertScratch(server.base);
    const run = (args, childEnv) => spawnSync(bin, [...args, "--audio", "none"], {env: childEnv, cwd: work, encoding: "utf8", timeout: 30000});
    const processResult = run(["--server", server.base, "--timeline", current.id], runEnv);
    try {
      assert.equal(processResult.status, 0, `${mode}: ${processResult.stderr}`);
      const switches = mode.startsWith("open-") || mode.startsWith("new-");
      assert.equal(fs.existsSync(capture), switches, `${mode}: switch capture`);
      if (switches) {
        const args = JSON.parse(fs.readFileSync(capture, "utf8"));
        assert.deepEqual(args.slice(0, 3), ["--server", server.base, "--timeline"]);
        const id = args[3];
        if (mode.startsWith("open-")) assert.equal(id, chosen.id);
        const saved = await session.query(server.base, "timeline.get", {id: current.id});
        assert.equal(saved.width, 1280, "pending edit must be saved before switching");
        assert.equal(saved.height, 720);
        assert.equal(saved.fps, 24);
        if (mode.startsWith("new-")) {
          const created = await session.query(server.base, "timeline.get", {id});
          assert.equal(created.name, "Untitled video");
          assert.equal(created.width, 1920);
          assert.equal(created.height, 1080);
          assert.equal(created.fps, 30);
          for (const key of ["tracks", "clips", "markers"]) assert.deepEqual(created[key], []);
          assert.equal(created.projectId, projectId);
        }
        // Launch the real switched-to editor, with its own cache, under our supervision.
        const opened = run(args, {...runEnv, NT_TIMELINE_DOCUMENT_CHECK: "opened", NODETOOL_TIMELINE_CACHE_DIR: path.join(dir, "child-cache"), XDG_CACHE_HOME: path.join(dir, "child-qt-cache")});
        assert.equal(opened.status, 0, opened.stderr);
        const loaded = JSON.parse(fs.readFileSync(result, "utf8"));
        assert.equal(loaded.id, id);
        assert.equal(loaded.recent[0].timelineId, id);
        assert.ok(loaded.recentMenuEntries > 1, "Open Recent menu must contain the opened document");
      } else if (mode === "flush-failure") {
        const kept = JSON.parse(fs.readFileSync(result, "utf8"));
        assert.equal(kept.id, current.id, "save failure must keep the current document");
        assert.ok(!kept.recent.some(entry => entry.timelineId === chosen.id), "failed switch must not add the destination to Open Recent");
      } else {
        const saved = await session.query(server.base, "timeline.get", {id: current.id});
        assert.equal(saved.width, 1920, "dismissal must not change the document");
      }
      assert.ok(fs.existsSync(preferences), "app must use isolated preferences");
      assert.equal(fs.existsSync(path.join(server.env.HOME, ".config/NodeTool/Timeline.conf")), false);
      assert.equal(fs.existsSync(realPreferences) ? fs.readFileSync(realPreferences, "utf8") : null, priorPreferences, "real preferences must not be created or changed");
      console.log(`PASS ${mode}`);
    } catch (error) {
      failures.push(error.message);
      console.error(error.message);
    }
  }
  assert.deepEqual(failures, []);
  passed = true;
} finally {
  await session.stopServers();
  if (passed) fs.rmSync(work, {recursive: true, force: true});
  else console.error(`Scratch logs retained at ${work}`);
}
