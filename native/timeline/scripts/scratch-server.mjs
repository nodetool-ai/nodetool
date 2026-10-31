// Scratch NodeTool servers for the native checks (server-check.mjs,
// web-baseline.mjs): started from this checkout with their own HOME, data,
// database, assets and SECRETS_MASTER_KEY, never on port 7777, written to
// only after the ownership checks of scratch-safety.mjs: the child is alive
// and every listener on the port is in its process group (lsof or ss), checked
// right before each write. Nonce HMAC proofs authenticate the connection
// carrying each write. nativeEnv supplies the secret to native clients.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import {
  groupAlive,
  groupOwnsPort,
  INSTANCE_ENV,
  NONCE_HEADER,
  PROOF_HEADER,
  instancePreloadOption,
  listenerPids,
  NATIVE_EXPECT_ENV,
  noRedirectFetch,
  stopGroups
} from "./scratch-safety.mjs";

export const USER_PORT = 7777;

/**
 * One session: `work` is the run's verified scratch folder, `repo` the
 * checkout root, `assertInWork` the folder guard, `log` a logger.
 */
export function createScratchSession({ work, repo, assertInWork, log = () => {}, beforeWrite = async () => {} }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ── scratch servers ───────────────────────────────────────────────────────
  
  const servers = [];
  
  function scratchEnv(dir, port, instance, extra) {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^(DATABASE_URL|DIRECT_URL|SUPABASE_|NODETOOL_|DB_PATH|ASSET_|STORAGE_|S3_|VECTORSTORE_)/.test(key)) delete env[key];
    }
    const home = path.join(dir, "home");
    return {
      ...env,
      HOME: home,
      XDG_DATA_HOME: path.join(home, ".local", "share"),
      XDG_CONFIG_HOME: path.join(home, ".config"),
      XDG_CACHE_HOME: path.join(home, ".cache"),
      DB_PATH: path.join(dir, "data", "nodetool.sqlite3"),
      VECTORSTORE_DB_PATH: path.join(dir, "data", "vectorstore.db"),
      ASSET_FOLDER: path.join(dir, "assets"),
      STORAGE_PATH: path.join(dir, "assets"),
      // A scratch key: the secret store never asks the keychain.
      SECRETS_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
      NODETOOL_ENV: "development",
      // Proxies only on request (assets.ensureProxy), so each state is set by the script.
      NODETOOL_VIDEO_PROXY_MIN_SIZE_PX: "-1",
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_OPTIONS: `--conditions=nodetool-dev ${instancePreloadOption()}`,
      [INSTANCE_ENV]: instance,
      PATH: `${path.join(work, "fake-bin")}:${env.PATH}`,
      ...extra
    };
  }
  
  
  
  
  
  const ownsPort = (server) => groupOwnsPort(server.child.pid, server.port);
  const scratchFetch = noRedirectFetch;
  
  async function startServer(name, port, extra = {}) {
    if (port === USER_PORT) throw new Error("refusing to start on 7777");
    if (listenerPids(port).length > 0) throw new Error(`port ${port} is already in use; refusing to start ${name}`);
    const dir = assertInWork(path.join(work, name));
    if (fs.existsSync(dir)) throw new Error(`${dir} exists already`);
    for (const sub of ["home", "data", "assets"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    const instance = crypto.randomBytes(16).toString("hex");
    const env = scratchEnv(dir, port, instance, extra);
    const logPath = path.join(dir, "server.log");
    const out = fs.openSync(logPath, "w");
    const child = spawn(process.execPath, [path.join(repo, "node_modules", "tsx", "dist", "cli.mjs"), "packages/websocket/src/server.ts"], {
      cwd: repo,
      env,
      detached: true, // its own process group, so cleanup also ends ffmpeg children
      stdio: ["ignore", out, out]
    });
    const server = { name, dir, port, base: `http://127.0.0.1:${port}`, child, logPath, env, instance, owned: false };
    child.on("exit", () => {
      server.owned = false;  // a later write can never reach a replacement on the port
    });
    servers.push(server);
    const deadline = Date.now() + 180_000;
    let healthy = false;
    let identityValid = false;
    while (Date.now() < deadline && !healthy) {
      if (child.exitCode !== null) throw new Error(`${name} exited early, see ${logPath}`);
      try {
        const nonce = crypto.randomBytes(32).toString("hex");
        const r = await scratchFetch(`${server.base}/health`, { headers: { [NONCE_HEADER]: nonce } });
        healthy = r.ok;
        identityValid = validProof(r.headers.get(PROOF_HEADER), nonce, instance);
        await r.arrayBuffer();
      } catch (err) {
        if (/redirect/.test(String(err))) throw err;
      }
      if (!healthy) await sleep(1000);
    }
    if (!healthy) throw new Error(`${name}: no /health answer, see ${logPath}`);
    // Ownership: the answer must come from the process group started here,
    // never from another server that holds the port.
    if (!ownsPort(server)) throw new Error(`${name}: the listener on ${port} is not the scratch server's process group`);
    if (!identityValid) throw new Error(`${name}: /health did not prove this server instance`);
    server.owned = true;
    const text = fs.readFileSync(logPath, "utf8");
    const db = text.match(/Initializing SQLite database at: (\S+)/)?.[1];
    if (!db || !db.startsWith(dir + path.sep)) throw new Error(`${name}: database ${db} is not under ${dir}`);
    log(`server ${name}: ${server.base}, pgid ${child.pid}, database ${db}`);
    return server;
  }
  
  
  /** Stops every running server's whole process group (scratch-safety.mjs stopGroups). */
  async function stopServers() {
    const groups = servers.map((s) => s.child.pid);
    servers.length = 0;
    await stopGroups(groups);
  }
  
  // The last resort when the process exits some other way: no waiting allowed.
  process.on("exit", () => {
    for (const s of servers) {
      try {
        process.kill(-s.child.pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
  });
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      stopServers()
        .catch((err) => console.error(String(err)))
        .finally(() => process.exit(130));
    });
  }
  
  // ── tRPC (reads anywhere, writes only to a scratch server) ────────────────
  
  /**
   * Checked right before every write, never cached: the child is alive and
   * every listener on the port is in its process group.
   */
  async function assertScratch(base) {
    const server = servers.find((s) => s.base === base);
    if (!server || !server.owned) throw new Error(`refusing a write to ${base}: not a scratch server`);
    if (server.child.exitCode !== null || server.child.signalCode !== null || !groupAlive(server.child.pid)) {
      throw new Error(`refusing a write to ${base}: the scratch server exited`);
    }
    if (!ownsPort(server)) throw new Error(`refusing a write to ${base}: the port is not the scratch server's`);
    if (!server.owned) throw new Error(`refusing a write to ${base}: the scratch server exited`);
  }
  
  async function query(base, proc, input = {}) {
    const r = await scratchFetch(`${base}/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`);
    const body = await r.json();
    if (body.error) throw new Error(`${proc}: ${body.error.message}`);
    return body.result.data;
  }
  
  function validProof(proof, nonce, secret) {
    if (typeof proof !== "string" || !/^[0-9a-f]{64}$/.test(proof)) return false;
    const expected = crypto.createHmac("sha256", secret).update(nonce).digest();
    return crypto.timingSafeEqual(Buffer.from(proof, "hex"), expected);
  }

  // The agent can open exactly one socket. A closed proven peer cannot be
  // replaced by the agent opening another connection for the POST.
  async function provenWrite(server, target, headers, body) {
    if (server.port === USER_PORT || new URL(server.base).port === String(USER_PORT)) throw new Error("refusing port 7777");
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const connect = agent.createConnection;
    let socket;
    let opened = false;
    agent.createConnection = function (options, callback) {
      if (opened) {
        queueMicrotask(() => callback(new Error("proven connection closed; refusing to reconnect")));
        return undefined;
      }
      opened = true;
      socket = connect.call(this, options, callback);
      return socket;
    };
    const signal = AbortSignal.timeout(120000);
    function exchange(method, path, requestHeaders, bytes) {
      return new Promise((resolve, reject) => {
        const request = http.request(new URL(path, server.base), { method, headers: requestHeaders, agent, signal }, (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("error", reject);
          response.on("end", () => {
            const status = response.statusCode;
            const r = new Response([204, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: response.headers });
            resolve(r);
          });
        });
        request.setTimeout(30000, () => request.destroy(new Error("server write timed out")));
        request.on("error", reject);
        request.end(bytes);
      });
    }
    try {
      const nonce = crypto.randomBytes(32).toString("hex");
      const ready = await exchange("GET", "/ready", { [NONCE_HEADER]: nonce });
      if (ready.status >= 300 && ready.status < 400) throw new Error("refusing an identity redirect");
      if (!validProof(ready.headers.get(PROOF_HEADER), nonce, server.instance) || !ready.ok) throw new Error("WRONG_SERVER: not the expected server instance");
      await beforeWrite();
      if (!socket || socket.destroyed || !socket.writable || signal.aborted) throw new Error("proven connection closed before write");
      const r = await exchange("POST", target, { ...headers, "content-length": body.length }, body);
      if (r.status >= 300 && r.status < 400) throw new Error("refusing a write redirect");
      return r;
    } finally {
      agent.destroy();
    }
  }

  /** The environment for a native client that may write to `server`, and only to it. */
  function nativeEnv(server) {
    return { ...process.env, [NATIVE_EXPECT_ENV]: server.instance };
  }

  async function mutate(base, proc, input) {
    await assertScratch(base);
    const server = servers.find((s) => s.base === base);
    const r = await provenWrite(server, `/trpc/${proc}`, { "content-type": "application/json" }, Buffer.from(JSON.stringify(input)));
    const body = await r.json();
    if (body.error) throw new Error(`${proc}: ${body.error.message}`);
    return body.result.data;
  }
  
  async function upload(server, file, contentType = "video/mp4") {
    await assertScratch(server.base);
    const form = new FormData();
    form.append("json", JSON.stringify({ name: path.basename(file), content_type: contentType }));
    form.append("file", new Blob([fs.readFileSync(file)], { type: contentType }), path.basename(file));
    const encoded = new Request(`${server.base}/api/assets`, { method: "POST", body: form });
    const r = await provenWrite(server, "/api/assets", { "content-type": encoded.headers.get("content-type") }, Buffer.from(await encoded.arrayBuffer()));
    if (!r.ok) throw new Error(`upload ${file}: HTTP ${r.status} ${await r.text()}`);
    const asset = await r.json();
    const stored = path.join(server.dir, "assets", asset.user_id, `${asset.id}${path.extname(file)}`);
    if (!fs.existsSync(stored)) throw new Error(`upload ${file}: not stored under the scratch folder (${stored})`);
    return asset;
  }
  
  async function waitProxy(base, id, want, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    let a;
    while (Date.now() < deadline) {
      a = await query(base, "assets.get", { id });
      if (a.proxy_status === want) return a;
      await sleep(500);
    }
    throw new Error(`asset ${id}: proxy_status ${a?.proxy_status}, wanted ${want}`);
  }
  
  /** Create a timeline from a document (tracks, clips) on a scratch server. */
  async function createTimeline(base, name, doc) {
    const seq = await mutate(base, "timeline.create", {
      name,
      projectId: "default",
      fps: doc.fps,
      width: doc.width,
      height: doc.height
    });
    await mutate(base, "timeline.update", {
      id: seq.id,
      durationMs: Math.round(doc.durationMs),
      document: { tracks: doc.tracks, clips: doc.clips, markers: [] }
    });
    return seq.id;
  }
  
  
  return { servers, startServer, stopServers, assertScratch, nativeEnv, query, mutate, upload, waitProxy, createTimeline };
}
