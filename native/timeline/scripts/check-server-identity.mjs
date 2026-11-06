#!/usr/bin/env node
// Headless identity regression checks. All servers use isolated scratch data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScratchSession, USER_PORT } from "./scratch-server.mjs";
import { assertInWork, makeScratch, safeRm, verifiedBuildDir } from "./scratch-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let bin = path.join(root, "build", "nodetool-timeline");
for (let i = 2; i < process.argv.length; ++i) {
  if (process.argv[i] !== "--bin" || !process.argv[i + 1]) throw new Error("usage: check-server-identity.mjs --bin PATH");
  bin = path.resolve(process.argv[++i]);
}
const work = makeScratch(verifiedBuildDir(root, "build"), "identity-");
const session = createScratchSession({ work, repo: path.resolve(root, "../.."), assertInWork: (p) => assertInWork(work, p) });
const children = new Set();
const listeners = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function run(server, args) {
  assert.notEqual(server.port, USER_PORT);
  const child = spawn(bin, ["--server", server.base, ...args], {
    env: { ...session.nativeEnv(server), QT_QPA_PLATFORM: "offscreen", XDG_CACHE_HOME: path.join(work, "cache") },
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.add(child);
  const result = { child, out: "", err: "" };
  child.stdout.on("data", (d) => { result.out += d; });
  child.stderr.on("data", (d) => { result.err += d; });
  result.done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("native client timed out")); }, 150000);
    child.on("error", reject);
    child.on("close", (code) => { clearTimeout(timer); children.delete(child); resolve(code); });
  });
  return result;
}
async function listener(port = 0, answer = "") {
  assert.notEqual(port, USER_PORT, "refusing port 7777");
  const record = { bytes: "", connections: 0, sockets: new Set() };
  const server = net.createServer((socket) => {
    record.connections++;
    record.sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => record.sockets.delete(socket));
    socket.on("data", (data) => {
      record.bytes += data.toString();
      if (data.toString().startsWith("GET /ready ")) socket.write(answer);
      else socket.end("HTTP/1.1 500 Error\r\nContent-Length: 2\r\n\r\n{}");
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  assert.notEqual(server.address().port, USER_PORT);
  record.port = server.address().port;
  record.close = async () => {
    for (const socket of record.sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    listeners.delete(record);
  };
  listeners.add(record);
  return record;
}
let failures = 0;
async function check(name, action) {
  try { await action(); console.log(`PASS ${name}`); }
  catch (error) { ++failures; console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  const reserve = await listener();
  const port = reserve.port;
  await reserve.close();
  const server = await session.startServer("real", port);
  const doc = { fps: 30, width: 64, height: 64, durationMs: 1000,
    tracks: [{ id: "t", name: "Video", type: "video", index: 0, visible: true, locked: false }],
    clips: [{ id: "c", trackId: "t", name: "Title", mediaType: "text", sourceType: "generated", status: "generated", startMs: 0, durationMs: 1000, text: "identity", versions: [], locked: false }] };
  const id = await session.createTimeline(server.base, "Identity", doc);
  const fixture = path.join(work, "sample.wav");
  const wav = Buffer.alloc(46);
  wav.write("RIFF"); wav.writeUInt32LE(38, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40);
  fs.writeFileSync(fixture, wav);
  await check("save round trip", async () => {
    const client = run(server, ["--timeline", id, "--save", "--move-clip", "c:125"]);
    assert.equal(await client.done, 0, client.out + client.err);
    const saved = await session.query(server.base, "timeline.get", { id });
    assert.equal(saved.clips.find((c) => c.id === "c").startMs, 125);
  });
  await check("native upload stores and reads asset", async () => {
    const client = run(server, ["--upload-asset", "--file", fixture, "--content-type", "audio/wav"]);
    assert.equal(await client.done, 0, client.out + client.err);
    const result = JSON.parse(client.out.trim().split("\n").at(-1));
    assert.equal(result.uploaded.id, result.get.id);
    assert.ok(fs.existsSync(path.join(server.dir, "assets", result.get.user_id, `${result.get.id}.wav`)));
  });
  // Copy a real ready answer, including its original nonce's proof.
  const nonce = crypto.randomBytes(16).toString("hex");
  const ready = await fetch(`${server.base}/ready`, { redirect: "manual", headers: { "x-nodetool-instance-nonce": nonce } });
  const body = await ready.text();
  const copied = [...ready.headers].filter(([key]) => !["content-length", "transfer-encoding", "connection"].includes(key));
  const answer = `HTTP/1.1 200 OK\r\n${copied.map(([k, v]) => `${k}: ${v}\r\n`).join("")}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  await check("listener swap sends no POST and opens no replacement connection", async () => {
    const gate = path.join(work, "write.go");
    const client = run(server, ["--timeline", id, "--save", "--move-clip", "c:250", "--wait-before-write", gate]);
    const deadline = Date.now() + 30000;
    while (!client.out.includes('"beforeWrite"') && client.child.exitCode === null && Date.now() < deadline) await sleep(20);
    assert.ok(client.out.includes('"beforeWrite"'), client.out + client.err);
    await session.stopServers();
    const recorder = await listener(port);
    fs.writeFileSync(gate, "go");
    const code = await client.done;
    await sleep(100);
    assert.equal(code, 1, client.out + client.err);
    assert.doesNotMatch(recorder.bytes, /POST|PRIVATE|multipart/);
    assert.equal(recorder.bytes, "", "replacement received bytes");
    assert.equal(recorder.connections, 0, "client reconnected");
    assert.match(client.out + client.err, /WRONG_SERVER|NETWORK|connection|closed/i);
    await recorder.close();
  });
  await check("copied real ready headers authorize no upload", async () => {
    const recorder = await listener(0, answer);
    const client = run({ ...server, port: recorder.port, base: `http://127.0.0.1:${recorder.port}` },
      ["--upload-asset", "--file", fixture, "--content-type", "audio/wav"]);
    assert.equal(await client.done, 1, client.out + client.err);
    assert.doesNotMatch(recorder.bytes, /POST|RIFF|multipart/);
    assert.equal(recorder.connections, 1, "identity refusal must not retry");
    assert.match(client.err, /WRONG_SERVER/);
    await recorder.close();
  });
} catch (error) {
  ++failures;
  console.error(`FAIL setup: ${error.stack}`);
} finally {
  for (const child of children) child.kill("SIGKILL");
  for (const record of [...listeners]) await record.close();
  await session.stopServers();
  if (!failures) safeRm(path.dirname(work), work);
  else console.error(`Logs kept in ${work}`);
}
console.log(`${failures ? "FAIL" : "PASS"} server identity (${failures} failures), port 7777 refused`);
process.exitCode = failures ? 1 : 0;
