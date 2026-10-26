import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";

import { hasMoves, localCopies, parseArgs, renderedMove, seedDocument, settled } from "./sync-e2e.mjs";
import { scratchPost } from "./sync-e2e-transport.mjs";

// Invalid controls prove the phase predicates reject missing or stale data.
test("arguments reject the user server, malformed ports and incomplete options", () => {
  assert.equal(parseArgs([]).port, 7812);
  assert.equal(parseArgs(["--bin", ".", "--port", "7813"]).port, 7813);
  for (const args of [["--port", "7777"], ["--port", "0"], ["--port", "NaN"],
    ["--port", "65536"], ["--port", "1.2"], ["--bin"], ["--unknown", "x"]]) {
    assert.throws(() => parseArgs(args));
  }
});

test("move and rendered predicates require both clips and a changed finite x", () => {
  const document = seedDocument();
  assert.equal(document.clips.length, 2);
  assert.ok(hasMoves(document, 0, 2000));
  assert.equal(hasMoves(document, 500, 2000), false);
  assert.equal(hasMoves({ clips: [] }, 0, 2000), false);
  const before = { rendered: [{ id: "clip-1", x: 10 }] };
  assert.ok(renderedMove(before, { rendered: [{ id: "clip-1", x: 20 }] }, "clip-1"));
  assert.equal(renderedMove(before, before, "clip-1"), false);
  assert.equal(renderedMove(before, { rendered: [] }, "clip-1"), false);
  assert.equal(renderedMove(before, { rendered: [{ id: "clip-1", x: NaN }] }, "clip-1"), false);
});

test("settling waits through recovery and save before checking conflict", async () => {
  const states = [
    { dirty: true, saving: false, conflict: true, externalState: "recovering" },
    { dirty: true, saving: true, conflict: true, externalState: "merged" },
    { dirty: false, saving: false, conflict: false, externalState: "merged" }
  ];
  let reads = 0;
  assert.equal(await settled({ state: async () => states[reads++] }, 1000), states[2]);
  assert.equal(reads, 3);
  await assert.rejects(settled({ state: async () => ({ ...states[2], conflict: true }) }, 1000),
    { code: "ERR_ASSERTION" });
});

test("local-copy check finds only the current session filename recursively", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sync-e2e-copy-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, "nested"));
  const current = path.join(directory, "nested", "seq.local.json");
  fs.writeFileSync(current, "{}");
  fs.writeFileSync(path.join(directory, "seq.local.older.json"), "{}");
  assert.deepEqual(localCopies(directory, "seq"), [current]);
  fs.unlinkSync(current);
  assert.deepEqual(localCopies(directory, "seq"), []);
});

for (const validProof of [true, false]) {
  test(`MCP POST ${validProof ? "uses" : "rejects"} the scratch proof on its connection`, async (t) => {
    const secret = crypto.randomBytes(16).toString("hex");
    const sockets = new Set();
    let readySocket;
    let posts = 0;
    const server = http.createServer((request, response) => {
      if (request.url === "/ready") {
        readySocket = request.socket;
        response.setHeader("x-nodetool-instance-proof", validProof
          ? crypto.createHmac("sha256", secret).update(request.headers["x-nodetool-instance-nonce"]).digest("hex")
          : "0".repeat(64));
        response.end("{}");
      } else {
        assert.equal(request.socket, readySocket);
        ++posts;
        response.end('{"result":"ok"}');
      }
    });
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    t.after(async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    let checks = 0;
    const session = { async assertScratch(url) { assert.equal(url, base); ++checks; } };
    const result = scratchPost(session, { base, instance: secret }, "/mcp", { "content-type": "application/json" }, { id: 1 });
    if (validProof) {
      assert.equal((await result).status, 200);
      assert.equal(posts, 1);
      assert.equal(checks, 2);
    } else {
      await assert.rejects(result, /did not prove/);
      assert.equal(posts, 0);
    }
  });
}

// Optional local host smoke. It serves no media and shows only an offscreen
// software view. No scratch or product server is started by this test.
test("host opens the real QML and answers state, move, save and quit", {
  skip: !process.env.SYNC_E2E_HOST, timeout: 15000
}, async (t) => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "sync-e2e-host-"));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  let raw = { ...seedDocument(), id: "seq", name: "Fake sync", updatedAt: "u0" };
  const server = http.createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks));
      assert.equal(input.baseUpdatedAt, "u0");
      raw = { ...raw, ...input.document, updatedAt: "u1" };
      response.end(JSON.stringify({ result: { data: { updatedAt: "u1" } } }));
    } else {
      response.end(JSON.stringify({ result: { data: raw } }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const env = { ...process.env, QT_QPA_PLATFORM: "offscreen", QT_QUICK_BACKEND: "software" };
  delete env.NODETOOL_TIMELINE_EXPECT_INSTANCE;
  delete env.NODETOOL_API_TOKEN;
  const child = spawn(process.env.SYNC_E2E_HOST, ["--server", `http://127.0.0.1:${server.address().port}`,
    "--timeline", "seq", "--cache-dir", cache], { env });
  t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  const exited = once(child, "exit");
  let log = "";
  child.stderr.on("data", (bytes) => { log += bytes; });
  const lines = readline.createInterface({ input: child.stdout });
  const replies = lines[Symbol.asyncIterator]();
  const command = async (value) => {
    child.stdin.write(`${JSON.stringify(value)}\n`);
    const line = await replies.next();
    assert.equal(line.done, false, log);
    return JSON.parse(line.value);
  };
  await command({ cmd: "sync", on: false });
  await command({ cmd: "autosave", on: false });
  let state;
  for (let attempt = 0; attempt < 100; ++attempt) {
    state = await command({ cmd: "state" });
    if (state.rendered.length === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(hasMoves(state, 0, 2000), JSON.stringify(state));
  assert.equal(state.rendered.length, 2, log);
  assert.equal((await command({ cmd: "move", clip: "clip-2", startMs: 1500 })).ok, true);
  assert.equal((await command({ cmd: "state" })).canUndo, true);
  assert.equal((await command({ cmd: "saveNow" })).ok, true);
  assert.ok(hasMoves(raw, 0, 1500));
  state = await command({ cmd: "state" });
  assert.equal(state.base, "u1");
  assert.equal(state.dirty, false);
  assert.equal((await command({ cmd: "quit" })).exitCodeAfterQuit, 0);
  assert.equal((await exited)[0], 0, log);
});
