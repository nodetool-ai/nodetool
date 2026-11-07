// Exercises package A's actual list controller and the app loader on an isolated
// scratch server, including the source label returned by the startup list.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScratchSession } from "../../../scripts/scratch-server.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const timelineDir = path.resolve(moduleDir, "../../..");
const repo = path.resolve(timelineDir, "../..");
const bin = path.resolve(process.argv[2] ?? path.join(timelineDir, "build/nodetool-timeline"));
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nt-timeline-list-")));
const assertInWork = (candidate) => {
  const resolved = path.resolve(candidate);
  assert.ok(resolved.startsWith(work + path.sep), "scratch path escaped its folder");
  return resolved;
};
const session = createScratchSession({ work, repo, assertInWork, log: console.error });
let passed = false;
try {
  assert.ok(fs.existsSync(bin), "list controller executable must be built");
  const port = Number(process.env.NT_TIMELINE_LIST_TEST_PORT ?? 17861);
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536 && port !== 7777);
  const server = await session.startServer("list", port);
  const env = {
    ...session.nativeEnv(server),
    SECRETS_MASTER_KEY: server.env.SECRETS_MASTER_KEY,
    NODETOOL_SERVER_URL: server.base,
    NODETOOL_API_TOKEN: "",
    NODETOOL_TIMELINE_CACHE_DIR: path.join(work, "cache"),
    NODETOOL_TIMELINE_PREFERENCES: path.join(work, "preferences.ini"),
    QT_QPA_PLATFORM: "offscreen",
    QT_QUICK_BACKEND: "software"
  };
  const run = (args) => spawnSync(bin, args, { env, cwd: work, encoding: "utf8", timeout: 60000 });
  const command = async (action, args = []) => {
    await session.assertScratch(server.base);
    const result = run(["--timeline-list-command", action, ...args]);
    assert.equal(result.status, 0, `${action}: ${result.stderr}\n${result.stdout}`);
    const data = JSON.parse(result.stdout);
    assert.equal(data.error, "", action);
    return data;
  };
  const initial = await command("list");
  assert.equal(initial.documents.length, 0);
  assert.ok(initial.projects.some((project) => project.id === initial.projectId && project.isPersonal));
  // A named project stays isolated from Personal, and creation uses the selected project.
  const project = await session.mutate(server.base, "projects.create", { name: "List test" });
  const created = await command("create", ["--project", project.id]);
  assert.match(created.id, /^[0-9a-f]{32}$/);
  assert.equal(created.name, "Untitled video");
  const stored = await session.query(server.base, "timeline.get", { id: created.id });
  assert.equal(stored.projectId, project.id);
  assert.equal(stored.width, 1920);
  assert.equal(stored.height, 1080);
  assert.equal(stored.fps, 30);
  assert.deepEqual(stored.tracks, []);
  assert.deepEqual(stored.clips, []);
  assert.deepEqual(stored.markers, []);
  assert.equal((await command("list")).documents.length, 0);
  const projectArgs = ["--project", project.id, "--id", created.id];
  const renamed = await command("rename", [...projectArgs, "--name", "  Renamed cut  "]);
  assert.equal(renamed.documents[0].name, "Renamed cut");
  const opened = await command("open", projectArgs);
  assert.equal(opened.source, `${server.base}#timeline=${created.id}`);
  const listed = run(["--server", server.base, "--list-timelines"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.ok(JSON.parse(listed.stdout).some((timeline) => timeline.id === created.id));
  const loaded = run(["--server", server.base, "--timeline", created.id, "--dump-plan", "--times", "0"]);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.ok(loaded.stdout.trim().length > 0, "app loader must produce a plan");
  console.log("PASS scratch: list, create defaults, project scope, rename, open through app loader");
  const direct = run([opened.source, "--dump-plan", "--times", "0"]);
  assert.equal(direct.status, 0, `startup label must load through app: ${direct.stderr}`);
  assert.ok(direct.stdout.trim().length > 0, "startup label must produce a plan");
  console.log("PASS startup source label");
  if (process.argv.includes("--settings-reopen")) {
    const settings = { width: 1280, height: 720, fps: 24 };
    const edited = await command("settings", [...projectArgs, "--settings", JSON.stringify(settings)]);
    const reopened = await command("inspect", projectArgs);
    const row = await session.query(server.base, "timeline.get", { id: created.id });
    for (const [key, value] of Object.entries(settings)) {
      assert.equal(edited[key], value, `edited model ${key}`);
      assert.equal(reopened[key], value, `reopened model ${key}`);
      assert.equal(row[key], value, `server row ${key}`);
    }
    console.log("PASS scratch: project settings survive app restart and timeline.get");
  }
  const unconfirmed = run(["--timeline-list-command", "delete", ...projectArgs]);
  assert.notEqual(unconfirmed.status, 0, "delete must require confirmation");
  assert.equal((await session.query(server.base, "timeline.get", { id: created.id })).id, created.id);
  await command("delete", [...projectArgs, "--confirm"]);
  assert.equal((await command("list", ["--project", project.id])).documents.length, 0);
  console.log("PASS scratch: delete requires confirmation and removes the timeline");
  passed = true;
} finally {
  await session.stopServers();
  if (passed) {
    fs.rmSync(work, { recursive: true, force: true });
  } else {
    console.error(`Scratch logs retained at ${work}`);
  }
}
