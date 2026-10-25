// node --test native/timeline/scripts/scratch-safety.test.mjs
// Works only under native/timeline/build-m5/ and on loopback ports it opens.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  assertInWork,
  groupAlive,
  groupOwnsPort,
  makeScratch,
  noRedirectFetch,
  safeRm,
  serverIdentityMatches,
  stopGroups,
  verifiedBuildDir
} from "./scratch-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const area = fs.mkdtempSync(path.join(verifiedBuildDir(root, "build-m5"), "test-safety-"));
test.after(() => fs.rmSync(area, { recursive: true, force: true }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("a symlinked build folder is refused", () => {
  const parent = fs.mkdtempSync(path.join(area, "p-"));
  const elsewhere = fs.mkdtempSync(path.join(area, "real-data-"));
  fs.symlinkSync(elsewhere, path.join(parent, "build-m5"));
  assert.throws(() => verifiedBuildDir(parent, "build-m5"), /not a plain directory/);
});

test("a path through a symlink out of the scratch folder is refused", () => {
  const work = makeScratch(verifiedBuildDir(area, "b"));
  const outside = fs.mkdtempSync(path.join(area, "outside-"));
  fs.symlinkSync(outside, path.join(work, "link"));
  assert.throws(() => assertInWork(work, path.join(work, "link", "x")), /outside/);
  assert.throws(() => assertInWork(work, path.join(work, "..", "elsewhere")), /outside/);
  assert.equal(assertInWork(work, path.join(work, "a", "b")), path.join(work, "a", "b"));
});

test("safeRm unlinks a symlink and keeps what it points at", () => {
  const work = makeScratch(verifiedBuildDir(area, "c"));
  const outside = fs.mkdtempSync(path.join(area, "keep-"));
  fs.writeFileSync(path.join(outside, "precious.db"), "data");
  fs.symlinkSync(outside, path.join(work, "cache"));
  safeRm(work, path.join(work, "cache"));
  assert.equal(fs.existsSync(path.join(work, "cache")), false);
  assert.equal(fs.readFileSync(path.join(outside, "precious.db"), "utf8"), "data");
  // A path below the link is refused, not followed.
  fs.symlinkSync(outside, path.join(work, "cache2"));
  assert.throws(() => safeRm(work, path.join(work, "cache2", "precious.db")), /outside/);
  assert.equal(fs.existsSync(path.join(outside, "precious.db")), true);
});

function startDetachedServer(port) {
  const code = `require("http").createServer((q,s)=>s.end("ok")).listen(${port},"127.0.0.1")`;
  return spawn(process.execPath, ["-e", code], { detached: true, stdio: "ignore" });
}

async function freePort() {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

test("port ownership: only the launched process group owns the port", async () => {
  const port = await freePort();
  assert.equal(groupOwnsPort(process.pid, port), false, "no listener: not owned");
  // A listener in this test's own process group stands for a foreign server.
  const foreign = http.createServer((q, s) => s.end("health"));
  await new Promise((r) => foreign.listen(port, "127.0.0.1", r));
  const child = startDetachedServer(await freePort());
  try {
    assert.equal(groupOwnsPort(child.pid, port), false, "a foreign listener must not count as ours");
  } finally {
    await new Promise((r) => foreign.close(r));
    await stopGroups([child.pid], { termMs: 2000 });
  }
  const port2 = await freePort();
  const ours = startDetachedServer(port2);
  try {
    let owned = false;
    for (let i = 0; i < 50 && !owned; i++) {
      await sleep(100);
      owned = groupOwnsPort(ours.pid, port2);
    }
    assert.equal(owned, true);
  } finally {
    await stopGroups([ours.pid], { termMs: 2000 });
  }
});

test("redirects are refused, also to 7777", async () => {
  const server = http.createServer((q, s) => {
    s.writeHead(302, { Location: "http://127.0.0.1:7777/trpc/timeline.delete" });
    s.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    await assert.rejects(noRedirectFetch(`http://127.0.0.1:${server.address().port}/health`), /refusing a redirect/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("stopGroups ends descendants that outlive the leader and ignore SIGTERM", async () => {
  // The leader exits at once; a grandchild that ignores SIGTERM stays in the group.
  const child = spawn("/bin/sh", ["-c", "(trap '' TERM; sleep 60) & exit 0"], { detached: true, stdio: "ignore" });
  await new Promise((r) => child.on("exit", r));
  await sleep(200);
  assert.equal(groupAlive(child.pid), true, "the grandchild keeps the group alive");
  await stopGroups([child.pid], { termMs: 300, killMs: 2000 });
  assert.equal(groupAlive(child.pid), false);
});

test("only a server that echoes this run's identity counts", async () => {
  let value = "run-a";
  let redirect = false;
  const server = http.createServer((q, s) => {
    if (redirect) {
      s.writeHead(302, { Location: "http://127.0.0.1:7777/trpc/settings.list" });
      s.end();
      return;
    }
    s.setHeader("content-type", "application/json");
    s.end(JSON.stringify({ result: { data: { settings: [{ env_var: "MANIMGX_PATH", value }] } } }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await serverIdentityMatches(base, "run-a"), true);
    value = "another-run";
    assert.equal(await serverIdentityMatches(base, "run-a"), false, "another server's identity");
    redirect = true;
    assert.equal(await serverIdentityMatches(base, "another-run"), false, "a redirect is never followed");
  } finally {
    await new Promise((r) => server.close(r));
  }
  assert.equal(await serverIdentityMatches(base, "run-a"), false, "nothing listening");
});
