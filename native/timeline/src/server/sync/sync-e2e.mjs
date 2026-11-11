// Run with the caller's Qt platform, for example under Xvfb or offscreen.
// Owns a scratch server and native children. Never contacts port 7777.
// node src/server/sync/sync-e2e.mjs --bin build [--port 7812]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createScratchSession, USER_PORT } from "../../../scripts/scratch-server.mjs";
import { assertInWork, makeScratch, verifiedBuildDir } from "../../../scripts/scratch-safety.mjs";
import { initializeMcp } from "./resource-change-probe.mjs";
import { countingTimelineProxy, scratchPost } from "./sync-e2e-transport.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const repo = path.resolve(root, "../..");

export function parseArgs(argv) {
  const args = { bin: path.join(root, "build"), port: 7812 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!["--bin", "--port"].includes(key) || !value || value.startsWith("--")) {
      throw new Error(`expected --bin DIR or --port N, got ${key}`);
    }
    if (key === "--bin") { args.bin = path.resolve(value); }
    else { args.port = Number(value); }
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535 || args.port === USER_PORT) {
    throw new Error("--port must be 1..65535 and must never be 7777");
  }
  return args;
}

export function assertReconnectFetches(fetches, log) {
  assert.equal(fetches, 1, `expected exactly one native timeline.get request, got ${fetches}\n${log}`);
}

export function seedDocument() {
  return {
    fps: 30, width: 1280, height: 720, durationMs: 5000,
    tracks: [{ id: "video-1", name: "Video", type: "video", index: 0, visible: true, locked: false }],
    clips: [0, 1].map((index) => ({
      id: `clip-${index + 1}`, trackId: "video-1", name: `Clip ${index + 1}`,
      startMs: index * 2000, durationMs: 1000, inPointMs: 0,
      mediaType: "shape", sourceType: "imported", status: "draft", locked: false, versions: []
    }))
  };
}

export function hasMoves(timeline, a, b) {
  return timeline.clips?.find((clip) => clip.id === "clip-1")?.startMs === a
    && timeline.clips?.find((clip) => clip.id === "clip-2")?.startMs === b;
}

export function renderedMove(before, after, id) {
  const oldX = before.rendered?.find((clip) => clip.id === id)?.x;
  const newX = after.rendered?.find((clip) => clip.id === id)?.x;
  return Number.isFinite(oldX) && Number.isFinite(newX) && newX > oldX;
}

export function localCopies(directory, id) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { return localCopies(file, id); }
    return entry.name === `${id}.local.json` ? [file] : [];
  });
}

async function until(check, timeoutMs, label) {
  const deadline = performance.now() + timeoutMs;
  do {
    const value = await check();
    if (value && performance.now() <= deadline) { return value; }
    await sleep(20);
  } while (performance.now() < deadline);
  throw new Error(`timed out after ${timeoutMs} ms: ${label}`);
}

export async function settled(host, timeout = 5000) {
  return until(async () => {
    const state = await host.state();
    if (state.dirty || state.saving) { return false; }
    assert.equal(state.conflict, false, JSON.stringify(state));
    return state;
  }, timeout, "clean native state");
}

class NativeProcess {
  constructor(binary, args, env, children, logPath) {
    this.child = spawn(binary, args, { env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    this.stderr = "";
    this.waiters = [];
    this.failure = null;
    this.exited = new Promise((resolve) => { this.resolveExit = resolve; });
    children.add(this);
    this.child.stderr.on("data", (bytes) => {
      this.stderr += bytes.toString();
      fs.appendFileSync(logPath, bytes);
    });
    this.child.stdin.on("error", (error) => this.fail(error));
    readline.createInterface({ input: this.child.stdout }).on("line", (line) => {
      const waiter = this.waiters.shift();
      if (!waiter) { return; }
      try { waiter.resolve(JSON.parse(line)); }
      catch { waiter.reject(new Error(`non-JSON host output: ${line}`)); }
    });
    this.child.on("error", (error) => {
      this.fail(error);
      this.resolveExit({ error: error.message });
    });
    this.child.on("close", (code, signal) => {
      this.fail(new Error(`native exited (${code ?? signal}); ${this.stderr.slice(-3000)}`));
      this.resolveExit({ code, signal });
    });
  }
  fail(error) {
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) { waiter.reject(error); }
  }
  check() {
    if (this.failure) { throw this.failure; }
  }
  async command(command) {
    this.check();
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`host command timed out: ${command.cmd}`)), 10000);
        this.waiters.push({ resolve, reject });
        this.child.stdin.write(`${JSON.stringify(command)}\n`);
      });
    } finally { clearTimeout(timer); }
  }
  async listening(count = 1, timeoutMs = 15000) {
    return until(() => {
      this.check();
      return this.stderr.split("sync: listening for ").length - 1 >= count;
    }, timeoutMs, `WebSocket connect ${count}`);
  }
  async state() { return this.command({ cmd: "state" }); }
  async stop() {
    if (this.child.exitCode !== null || this.child.signalCode !== null || !this.child.pid) { return; }
    try { process.kill(-this.child.pid, "SIGTERM"); } catch { /* already gone */ }
    let timer;
    await Promise.race([this.exited, new Promise((resolve) => {
      timer = setTimeout(() => {
        try { process.kill(-this.child.pid, "SIGKILL"); } catch { /* already gone */ }
        resolve();
      }, 2000);
    })]);
    clearTimeout(timer);
  }
  async quit() {
    const reply = await this.command({ cmd: "quit" });
    assert.equal(reply.exitCodeAfterQuit, 0);
    let timer;
    try {
      const exit = await Promise.race([this.exited, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("host did not exit")), 10000);
      })]);
      assert.equal(exit.code, 0);
    } finally { clearTimeout(timer); }
  }
}

async function tcpProxy(targetPort) {
  const sockets = new Set();
  let accepting = true;
  const proxy = net.createServer((client) => {
    if (!accepting) { client.destroy(); return; }
    const upstream = net.connect(targetPort, "127.0.0.1");
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => { client.destroy(); upstream.destroy(); });
    }
    client.on("close", () => upstream.destroy());
    upstream.on("close", () => client.destroy());
    client.pipe(upstream).pipe(client);
  });
  await new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${proxy.address().port}`,
    pause() { accepting = false; for (const socket of sockets) { socket.destroy(); } },
    resume() { accepting = true; },
    async close() {
      accepting = false;
      for (const socket of sockets) { socket.destroy(); }
      await new Promise((resolve) => proxy.close(resolve));
    }
  };
}

async function run(args) {
  for (const binary of ["sync-e2e-host", "nodetool-timeline"]) {
    fs.accessSync(path.join(args.bin, binary), fs.constants.X_OK);
  }
  const work = makeScratch(verifiedBuildDir(root, "build"), "sync-e2e-");
  const children = new Set();
  const proxies = new Set();
  const session = createScratchSession({ work, repo, assertInWork: (file) => assertInWork(work, file), log: console.error });
  const killChildren = () => {
    for (const native of children) {
      if (native.child.exitCode === null && native.child.signalCode === null && native.child.pid) {
        try { process.kill(-native.child.pid, "SIGKILL"); } catch { /* already gone */ }
      }
    }
  };
  process.on("exit", killChildren);
  const cleanup = async () => {
    await Promise.all([...children].map((native) => native.stop()));
    await Promise.all([...proxies].map((proxy) => proxy.close()));
    proxies.clear();
    await session.stopServers();
  };
  const interrupted = () => { cleanup().finally(() => process.exit(130)); };
  process.on("SIGINT", interrupted);
  process.on("SIGTERM", interrupted);
  let failed = false;
  try {
    const server = await session.startServer("server", args.port);
    // Scratch timelines belong to loopback user 1, independent of a token
    // inherited from the caller's regular server environment.
    const auth = {};
    const nativeEnv = session.nativeEnv(server);
    delete nativeEnv.NODETOOL_API_TOKEN;
    const mcp = await initializeMcp((target, headers, input) => scratchPost(session, server, target, headers, input), auth);
    const get = (id) => session.query(server.base, "timeline.get", { id });
    const start = async (phase, binary = "sync-e2e-host", extra = [], origin = server.base) => {
      const id = await session.createTimeline(server.base, `Native sync e2e ${phase}`, seedDocument());
      const cache = assertInWork(work, path.join(work, phase));
      fs.mkdirSync(cache);
      const host = new NativeProcess(path.join(args.bin, binary), ["--server", origin, "--timeline", id,
        "--cache-dir", cache, ...extra], nativeEnv, children, path.join(work, `${phase}.stderr.log`));
      await host.listening();
      return { host, id, cache };
    };
    const edit = async (id, startMs) => {
      await mcp.edit(id, "clip-1", startMs);
      return performance.now();
    };
    const verifySaved = async (host, id, a, b) => {
      const state = await settled(host);
      const saved = await get(id);
      assert.ok(hasMoves(saved, a, b), JSON.stringify(saved));
      assert.equal(state.base, saved.updatedAt);
      assert.equal(state.lastError, "");
      assert.deepEqual(state.externalConflicts, []);
    };
    const phases = {
      async app() {
        const { host, id } = await start("app", "nodetool-timeline");
        const since = await edit(id, 500);
        const saved = await get(id);
        await until(() => {
          host.check();
          return host.stderr.includes(`sync: adopted ${saved.updatedAt} `);
        }, Math.max(0, 2000 - (performance.now() - since)), "app adopts MCP edit");
        const elapsedMs = Math.round(performance.now() - since);
        await host.stop();
        return { elapsedMs, updatedAt: saved.updatedAt };
      },
      async "red-no-sync"() {
        const { host, id } = await start("red-no-sync");
        await host.command({ cmd: "sync", on: false });
        const since = await edit(id, 500);
        do {
          assert.equal((await host.state()).clips.find((clip) => clip.id === "clip-1").startMs, 0);
          await sleep(25);
        } while (performance.now() - since < 2000);
        await host.quit();
        return { expectedRed: true, observed: false, observationMs: 2000 };
      },
      async clean() {
        const { host, id } = await start("clean");
        const before = await until(async () => {
          const state = await host.state();
          return state.rendered.length === 2 && state;
        }, 2000, "clip delegates");
        const since = await edit(id, 500);
        const state = await until(async () => {
          const next = await host.state();
          return hasMoves(next, 500, 2000) && renderedMove(before, next, "clip-1") && next;
        }, Math.max(0, 2000 - (performance.now() - since)), "clean model and rendered x");
        const elapsedMs = Math.round(performance.now() - since);
        assert.equal(state.canUndo, false);
        await host.command({ cmd: "undo" });
        assert.ok(hasMoves(await host.state(), 500, 2000));
        assert.equal((await host.command({ cmd: "move", clip: "clip-2", startMs: 1500 })).ok, true);
        await verifySaved(host, id, 500, 1500);
        await host.quit();
        return { elapsedMs, rendered: true, savedBoth: true };
      },
      async dirty() {
        const { host, id } = await start("dirty");
        await host.command({ cmd: "autosave", on: false });
        assert.equal((await host.command({ cmd: "move", clip: "clip-2", startMs: 1500 })).ok, true);
        const since = await edit(id, 500);
        const state = await until(async () => {
          const next = await host.state();
          assert.equal(next.conflict, false);
          return hasMoves(next, 500, 1500) && next.externalState === "merged" && next;
        }, Math.max(0, 2000 - (performance.now() - since)), "dirty merge");
        const elapsedMs = Math.round(performance.now() - since);
        assert.equal(state.dirty, true);
        await host.command({ cmd: "autosave", on: true });
        await verifySaved(host, id, 500, 1500);
        assert.ok(!host.stderr.includes("conflict:"), host.stderr);
        await host.quit();
        return { elapsedMs, savedBoth: true };
      },
      async conflict() {
        const { host, id, cache } = await start("conflict");
        await host.command({ cmd: "sync", on: false });
        await host.command({ cmd: "autosave", on: false });
        assert.equal((await host.command({ cmd: "move", clip: "clip-2", startMs: 1500 })).ok, true);
        const before = await get(id);
        await session.mutate(server.base, "timeline.update", {
          id, baseUpdatedAt: before.updatedAt,
          document: { tracks: before.tracks, clips: before.clips.map((clip) => clip.id === "clip-1" ? { ...clip, startMs: 500 } : clip), markers: before.markers ?? [] }
        });
        const since = performance.now();
        assert.equal((await host.command({ cmd: "saveNow" })).conflict, true);
        await host.command({ cmd: "autosave", on: true });
        await verifySaved(host, id, 500, 1500);
        assert.ok(performance.now() - since <= 5000, "CAS recovery exceeded 5 seconds");
        assert.deepEqual(localCopies(cache, id), []);
        await host.quit();
        return { savedBoth: true, localCopyRemoved: true };
      },
      async reconnect() {
        const proxy = await tcpProxy(args.port);
        proxies.add(proxy);
        const httpProxy = await countingTimelineProxy(server.base);
        proxies.add(httpProxy);
        const { host, id } = await start("reconnect", "sync-e2e-host", ["--sync-url", proxy.url], httpProxy.url);
        // Settle the initial subscription refresh before measuring reconnect.
        await until(async () => httpProxy.timelineGets() === 2
          && (await host.state()).externalState === "idle", 5000, "initial subscription refresh");
        const initialGets = httpProxy.timelineGets();
        const offset = host.stderr.length;
        proxy.pause();
        await edit(id, 500);
        assert.ok(hasMoves(await host.state(), 0, 2000));
        const since = performance.now();
        proxy.resume();
        // ResourceChangeClient caps the web's backoff at 30 s. Account for
        // that pending retry and its additional refresh delay of up to 3 s.
        await host.listening(2, 30000);
        await until(async () => hasMoves(await host.state(), 500, 2000),
          Math.max(0, 33000 - (performance.now() - since)), "reconnect refresh (backoff plus 3 s)");
        const elapsedMs = Math.round(performance.now() - since);
        // Leave time for a duplicate reconnect refresh to become visible.
        await sleep(3200);
        const log = host.stderr.slice(offset);
        const fetches = httpProxy.timelineGets() - initialGets;
        assertReconnectFetches(fetches, log);
        assert.ok(hasMoves(await get(id), 500, 2000));
        await host.quit();
        return { elapsedMs, fetches };
      }
    };
    for (const [phase, execute] of Object.entries(phases)) {
      const previous = new Set(children);
      try {
        const result = await execute();
        console.log(JSON.stringify({ phase, ok: true, ...result }));
      } catch (error) {
        failed = true;
        console.log(JSON.stringify({ phase, ok: false, error: error.message, work }));
      } finally {
        await Promise.all([...children].filter((native) => !previous.has(native)).map((native) => native.stop()));
      }
    }
  } finally {
    await cleanup();
    process.off("exit", killChildren);
    process.off("SIGINT", interrupted);
    process.off("SIGTERM", interrupted);
  }
  return !failed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await run(parseArgs(process.argv.slice(2))) ? 0 : 1; }
  catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}
