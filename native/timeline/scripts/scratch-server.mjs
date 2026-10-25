// Scratch NodeTool servers for the native checks (server-check.mjs,
// web-baseline.mjs): started from this checkout with their own HOME, data,
// database, assets and SECRETS_MASTER_KEY, never on port 7777, written to
// only after the ownership checks of scratch-safety.mjs: the child is alive
// and every listener on the port is in its process group (lsof), checked
// right before each write. No check reads anything the server could set.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  groupAlive,
  groupOwnsPort,
  listenerPids,
  noRedirectFetch,
  stopGroups
} from "./scratch-safety.mjs";

export const USER_PORT = 7777;

/**
 * One session: `work` is the run's verified scratch folder, `repo` the
 * checkout root, `assertInWork` the folder guard, `log` a logger.
 */
export function createScratchSession({ work, repo, assertInWork, log = () => {} }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ── scratch servers ───────────────────────────────────────────────────────
  
  const servers = [];
  
  function scratchEnv(dir, port, extra) {
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
      NODE_OPTIONS: "--conditions=nodetool-dev",
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
    const env = scratchEnv(dir, port, extra);
    const logPath = path.join(dir, "server.log");
    const out = fs.openSync(logPath, "w");
    const child = spawn(process.execPath, [path.join(repo, "node_modules", "tsx", "dist", "cli.mjs"), "packages/websocket/src/server.ts"], {
      cwd: repo,
      env,
      detached: true, // its own process group, so cleanup also ends ffmpeg children
      stdio: ["ignore", out, out]
    });
    const server = { name, dir, port, base: `http://127.0.0.1:${port}`, child, logPath, env, owned: false };
    child.on("exit", () => {
      server.owned = false;  // a later write can never reach a replacement on the port
    });
    servers.push(server);
    const deadline = Date.now() + 180_000;
    let healthy = false;
    while (Date.now() < deadline && !healthy) {
      if (child.exitCode !== null) throw new Error(`${name} exited early, see ${logPath}`);
      try {
        healthy = (await scratchFetch(`${server.base}/health`)).ok;
      } catch (err) {
        if (/redirect/.test(String(err))) throw err;
      }
      if (!healthy) await sleep(1000);
    }
    if (!healthy) throw new Error(`${name}: no /health answer, see ${logPath}`);
    // Ownership: the answer must come from the process group started here,
    // never from another server that holds the port.
    if (!ownsPort(server)) throw new Error(`${name}: the listener on ${port} is not the scratch server's process group`);
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
  
  async function mutate(base, proc, input) {
    await assertScratch(base);
    const r = await scratchFetch(`${base}/trpc/${proc}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    const body = await r.json();
    if (body.error) throw new Error(`${proc}: ${body.error.message}`);
    return body.result.data;
  }
  
  async function upload(server, file, contentType = "video/mp4") {
    await assertScratch(server.base);
    const form = new FormData();
    form.append("json", JSON.stringify({ name: path.basename(file), content_type: contentType }));
    form.append("file", new Blob([fs.readFileSync(file)], { type: contentType }), path.basename(file));
    const r = await scratchFetch(`${server.base}/api/assets`, { method: "POST", body: form });
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
  
  
  return { servers, startServer, stopServers, assertScratch, query, mutate, upload, waitProxy, createTimeline };
}
