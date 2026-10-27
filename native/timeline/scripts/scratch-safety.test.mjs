// node --test native/timeline/scripts/scratch-safety.test.mjs
// Works only under native/timeline/build-m5/ (or SCRATCH_SAFETY_BUILD_DIR, a
// folder name next to it) and on loopback ports it opens.

import { spawn } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import { createScratchSession } from "./scratch-server.mjs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  assertInWork,
  groupAlive,
  groupOwnsPort,
  INSTANCE_ENV,
  INSTANCE_HEADER,
  instancePreloadOption,
  makeScratch,
  noRedirectFetch,
  safeRm,
  stopGroups,
  verifiedBuildDir
} from "./scratch-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const area = fs.mkdtempSync(path.join(verifiedBuildDir(root, process.env.SCRATCH_SAFETY_BUILD_DIR ?? "build-m5"), "test-safety-"));
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

/** Starts `code` (CommonJS) with the instance preload; resolves with the port it prints. */
async function startWithPreload(code, instance) {
  const env = { ...process.env, NODE_OPTIONS: instancePreloadOption() };
  if (instance) env[INSTANCE_ENV] = instance;
  else delete env[INSTANCE_ENV];
  const child = spawn(process.execPath, ["-e", code], { detached: true, stdio: ["ignore", "pipe", "inherit"], env });
  const port = await new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/port (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    child.on("exit", (c) => reject(new Error(`exited ${c}`)));
  });
  return { child, port };
}

const listen = `.listen(0,"127.0.0.1",function(){console.log("port "+this.address().port)})`;

test("the instance preload proves fresh nonces without disclosing its secret", async () => {
  // writeHead with headers (Fastify), an implicit head, and an error status.
  const code = `require("http").createServer((q,s)=>{
    if (q.url==="/a") { s.writeHead(200,{"content-type":"application/json"}); s.end("{}"); }
    else if (q.url==="/b") s.end("plain");
    else { s.statusCode=404; s.end(); }
  })${listen}`;
  const { child, port } = await startWithPreload(code, "token-1");
  try {
    for (const p of ["/a", "/b", "/missing"]) {
      const nonce = crypto.randomBytes(16).toString("hex");
      const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { "x-nodetool-instance-nonce": nonce } });
      assert.equal(r.headers.get(INSTANCE_HEADER), null, "secret must not be sent");
      assert.equal(r.headers.get("x-nodetool-instance-proof"), crypto.createHmac("sha256", "token-1").update(nonce).digest("hex"), p);
    }
    const post = await fetch(`http://127.0.0.1:${port}/a`, { method: "POST", body: "x" });
    assert.equal(post.headers.get(INSTANCE_HEADER), null);
    assert.equal(post.headers.get("x-nodetool-instance-proof"), null);
  } finally {
    await stopGroups([child.pid], { termMs: 2000 });
  }
});

test("the instance preload reaches a server started by a launcher (tsx)", async () => {
  // The launcher spawns the server, as tsx's CLI does; NODE_OPTIONS is inherited.
  const server = `require("http").createServer((q,s)=>s.end("ok"))${listen}`;
  const code = `require("child_process").spawn(process.execPath,["-e",${JSON.stringify(server)}],{stdio:"inherit"})`;
  const { child, port } = await startWithPreload(code, "token-2");
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { headers: { "x-nodetool-instance-nonce": "0123456789abcdef0123456789abcdef" } });
    assert.equal(r.headers.get("x-nodetool-instance-proof"), crypto.createHmac("sha256", "token-2").update("0123456789abcdef0123456789abcdef").digest("hex"));
    assert.equal(r.headers.get(INSTANCE_HEADER), null);
  } finally {
    await stopGroups([child.pid], { termMs: 2000 });
  }
});

test("without a token the preload adds no instance header", async () => {
  const { child, port } = await startWithPreload(`require("http").createServer((q,s)=>s.end("ok"))${listen}`, null);
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).headers.get(INSTANCE_HEADER), null);
  } finally {
    await stopGroups([child.pid], { termMs: 2000 });
  }
});

async function identityListener(replay = "") {
  const code = `
    const net = require("node:net"), crypto = require("node:crypto");
    const sockets = new Set();
    let replacement = false;
    const replay = ${JSON.stringify(replay)};
    const server = net.createServer(socket => {
      sockets.add(socket);
      socket.on("error", () => {});
      socket.on("close", () => sockets.delete(socket));
      socket.on("data", bytes => {
        process.send({ bytes: bytes.toString(), replacement });
        if (bytes.toString().startsWith("GET /ready ")) {
          const nonce = bytes.toString().match(/x-nodetool-instance-nonce: ([^\\r]+)/i)?.[1] ?? "";
          const proof = crypto.createHmac("sha256", "mine").update(nonce).digest("hex");
          const headers = replay || "x-nodetool-instance: mine\\r\\nx-nodetool-instance-proof: " + proof + "\\r\\n";
          socket.write("HTTP/1.1 200 OK\\r\\n" + headers + "Content-Length: 2\\r\\n\\r\\n{}");
        } else socket.end('HTTP/1.1 200 OK\\r\\nx-nodetool-instance: mine\\r\\nContent-Length: 22\\r\\n\\r\\n{"result":{"data":{}}}');
      });
    });
    server.listen(0, "127.0.0.1", () => process.send({ port: server.address().port }));
    process.on("message", m => {
      if (m !== "swap") return;
      const port = server.address().port;
      for (const s of sockets) s.destroy();
      server.close(() => { replacement = true; server.listen(port, "127.0.0.1", () => process.send({ swapped: true })); });
    });
  `;
  const child = spawn(process.execPath, ["-e", code], { detached: true, stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const messages = [];
  child.on("message", (m) => messages.push(m));
  async function until(predicate) {
    for (let i = 0; i < 500; ++i) {
      if (predicate()) return;
      if (child.exitCode !== null) throw new Error("identity listener exited");
      await sleep(10);
    }
    throw new Error("identity listener timed out");
  }
  await until(() => messages.some((m) => m.port));
  const port = messages.find((m) => m.port).port;
  assert.notEqual(port, 7777);
  return { child, port, messages, until };
}

for (const operation of ["mutate", "upload"]) {
  for (const attack of ["replacement", "copied headers"]) {
    test(`${operation}: ${attack} receives no write bytes`, async () => {
      let copied = "";
      if (attack === "copied headers") {
        const real = await identityListener();
        try {
          const r = await fetch(`http://127.0.0.1:${real.port}/ready`, { headers: { "x-nodetool-instance-nonce": crypto.randomBytes(16).toString("hex") } });
          copied = `x-nodetool-instance: mine\r\nx-nodetool-instance-proof: ${r.headers.get("x-nodetool-instance-proof")}\r\n`;
          await r.text();
        } finally { await stopGroups([real.child.pid], { termMs: 2000 }); }
      }
      const fake = await identityListener(copied);
      const server = { child: fake.child, port: fake.port, base: `http://127.0.0.1:${fake.port}`, owned: true, instance: "mine", dir: area };
      let paused = false;
      const session = createScratchSession({ work: area, repo: path.resolve(root, "../.."), assertInWork: (p) => assertInWork(area, p),
        beforeWrite: async () => {
          paused = true;
          if (attack === "replacement") {
            fake.child.send("swap");
            await fake.until(() => fake.messages.some((m) => m.swapped));
          }
        } });
      session.servers.push(server);
      const file = path.join(area, `private-${operation}.wav`);
      fs.writeFileSync(file, "PRIVATE-MULTIPART-BODY");
      let error;
      try {
        try {
          if (operation === "mutate") await session.mutate(server.base, "timeline.update", { private: "PRIVATE-JSON-BODY" });
          else await session.upload(server, file, "audio/wav");
        } catch (e) { error = e; }
        await sleep(50);
        const received = fake.messages.filter((m) => m.bytes && (attack !== "replacement" || m.replacement)).map((m) => m.bytes).join("");
        assert.doesNotMatch(received, /POST|PRIVATE|multipart/, received);
        assert.ok(error, "identity failure must reject");
        if (attack === "replacement") assert.equal(paused, true);
        else assert.match(String(error), /WRONG_SERVER/);
      } finally { await session.stopServers(); }
    });
  }
}

test("port 7777 is refused before preparing or contacting a server", async () => {
  const session = createScratchSession({ work: area, repo: path.resolve(root, "../.."),
    assertInWork: () => { throw new Error("port guard bypassed"); } });
  await assert.rejects(session.startServer("forbidden", 7777), /refusing to start on 7777/);
  await assert.rejects(session.mutate("http://127.0.0.1:7777", "timeline.delete", {}), /refusing a write/);
  await assert.rejects(session.upload({ base: "http://127.0.0.1:7777" }, "unused"), /refusing a write/);
});
