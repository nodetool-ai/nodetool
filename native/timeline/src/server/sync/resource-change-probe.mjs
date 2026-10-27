// Proves that an agent's MCP timeline edit reaches a native-style /ws client
// as resource_change. A quiet control window rejects unrelated notifications,
// then the edit must produce a frame whose timestamp and clip match timeline.get.
// Uses an owned scratch server, never port 7777. No native build is needed.
// Usage: node native/timeline/src/server/sync/resource-change-probe.mjs
//   [--port N] [--token T] [--trigger mcp|trpc] [--out FILE]

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import WebSocket from "ws";

import { createScratchSession, USER_PORT } from "../../../scripts/scratch-server.mjs";
import { assertInWork, makeScratch, noRedirectFetch, NONCE_HEADER, PROOF_HEADER, verifiedBuildDir } from "../../../scripts/scratch-safety.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const repo = path.resolve(root, "../..");

export function parseArgs(argv) {
  const args = { port: 7811, token: "", trigger: "mcp", out: path.join(root, "build/sync-probe/resource-change.json") };
  for (let i = 0; i < argv.length; i += 2) {
    const option = argv[i];
    if (!["--port", "--token", "--trigger", "--out"].includes(option)) {
      throw new Error(`unknown argument ${option}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${option}`);
    }
    if (option === "--port") {
      args.port = Number(value);
    } else if (option === "--out") {
      args.out = path.resolve(value);
    } else {
      args[option.slice(2)] = value;
    }
  }
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535 || args.port === USER_PORT) {
    throw new Error("--port must be 1..65535 and must never be 7777");
  }
  if (!["mcp", "trpc"].includes(args.trigger)) {
    throw new Error("--trigger must be mcp or trpc");
  }
  return args;
}

export function matchesSequenceChange(frame, sequenceId) {
  return frame?.type === "resource_change"
    && frame.resource_type === "timelinesequence"
    && frame.resource?.id === sequenceId;
}

export function parseMcpResponse(body, id) {
  const text = body.trim();
  const messages = text.startsWith("{") || text.startsWith("[")
    ? [JSON.parse(text)]
    : text.split(/\r?\n\r?\n/).flatMap((event) => {
      const data = event.split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      return data ? [JSON.parse(data)] : [];
    });
  const reply = messages.find((message) => message?.jsonrpc === "2.0" && message.id === id);
  if (!reply) {
    throw new Error(`missing MCP reply for request ${id}`);
  }
  if (reply.error) {
    throw new Error(`MCP request ${id}: ${JSON.stringify(reply.error)}`);
  }
  if (!("result" in reply)) {
    throw new Error(`MCP reply ${id} has no result`);
  }
  return reply.result;
}

export function parseMcpEditResult(result, tool = "execute_code") {
  if (result?.isError) {
    throw new Error(`MCP tool failed: ${JSON.stringify(result.content)}`);
  }
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error(`missing ${tool} observation`);
  }
  const observation = JSON.parse(text);
  if (tool === "execute_code" && observation?.ok !== true) {
    throw new Error(`execute_code failed: ${observation?.error ?? text}`);
  }
  const edit = tool === "execute_code" ? observation.result : observation;
  if (edit?.error || edit?.applied !== 1 || edit?.failed !== 0) {
    throw new Error(`timeline edit failed: ${JSON.stringify(edit)}`);
  }
  return edit;
}

export function verifyTimelineChange(frame, timeline, beforeUpdatedAt, clipId, startMs) {
  if (!matchesSequenceChange(frame, timeline?.id)) {
    throw new Error("frame and timeline.get identify different sequences");
  }
  const updatedAt = frame.resource.updated_at ?? frame.resource.updatedAt;
  if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("resource_change is missing a valid updated_at/updatedAt timestamp");
  }
  if (!(Date.parse(updatedAt) > Date.parse(beforeUpdatedAt))) {
    throw new Error("resource_change timestamp is not newer than the seeded timeline");
  }
  if (timeline.updatedAt !== updatedAt) {
    throw new Error(`timeline.get timestamp ${timeline.updatedAt} differs from frame ${updatedAt}`);
  }
  const clip = timeline.clips?.find((item) => item.id === clipId);
  if (clip?.startMs !== startMs) {
    throw new Error(`timeline.get is missing moved clip ${clipId} at ${startMs} ms`);
  }
  return { updatedAt, event: frame.event, ops: frame.ops ?? null, clip };
}

// Like scratch-server.mjs provenWrite: prove /ready on the very socket that
// carries the POST. A port ownership check alone has a replacement race.
async function scratchPost(session, server, target, headers, input) {
  await session.assertScratch(server.base);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const connect = agent.createConnection;
  let socket;
  let opened = false;
  agent.createConnection = function (options, callback) {
    if (opened) {
      queueMicrotask(() => callback(new Error("proven connection closed, refusing to reconnect")));
      return undefined;
    }
    opened = true;
    socket = connect.call(this, options, callback);
    return socket;
  };
  const signal = AbortSignal.timeout(30_000);
  const exchange = (method, targetPath, requestHeaders, bytes) => new Promise((resolve, reject) => {
    const request = http.request(new URL(targetPath, server.base), {
      method, headers: requestHeaders, agent, signal
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve({
        status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("error", reject);
    request.end(bytes);
  });
  try {
    const nonce = crypto.randomBytes(32).toString("hex");
    const ready = await exchange("GET", "/ready", { [NONCE_HEADER]: nonce });
    const proof = ready.headers[PROOF_HEADER];
    const expected = crypto.createHmac("sha256", server.instance).update(nonce).digest();
    if (ready.status !== 200 || typeof proof !== "string" || !/^[0-9a-f]{64}$/.test(proof)
      || !crypto.timingSafeEqual(Buffer.from(proof, "hex"), expected)) {
      throw new Error("scratch /ready did not prove the server instance");
    }
    await session.assertScratch(server.base);
    if (!socket || socket.destroyed || !socket.writable || signal.aborted) {
      throw new Error("proven connection closed before POST");
    }
    const bytes = Buffer.from(JSON.stringify(input));
    const response = await exchange("POST", target, { ...headers, "content-length": bytes.length }, bytes);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${target}: HTTP ${response.status}: ${response.body}`);
    }
    return response;
  } finally {
    agent.destroy();
  }
}

export async function initializeMcp(post, authHeaders, log = console.error) {
  const headers = { ...authHeaders, "content-type": "application/json", accept: "application/json, text/event-stream" };
  const initialized = await post("/mcp", headers, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "timeline-resource-change-probe", version: "1.0.0" } }
  });
  const result = parseMcpResponse(initialized.body, 1);
  const sessionId = initialized.headers["mcp-session-id"];
  if (!sessionId || !result?.protocolVersion) {
    throw new Error("initialize is missing mcp-session-id or protocolVersion");
  }
  headers["mcp-session-id"] = sessionId;
  headers["mcp-protocol-version"] = result.protocolVersion;
  await post("/mcp", headers, { jsonrpc: "2.0", method: "notifications/initialized" });
  const names = [];
  let requestId = 1;
  let cursor;
  do {
    requestId += 1;
    const listed = await post("/mcp", headers, {
      jsonrpc: "2.0", id: requestId, method: "tools/list", ...(cursor ? { params: { cursor } } : {})
    });
    const page = parseMcpResponse(listed.body, requestId);
    names.push(...page.tools.map((entry) => entry.name));
    cursor = page.nextCursor;
  } while (cursor);
  const tool = names.includes("edit_timeline") ? "edit_timeline" : names.includes("execute_code") ? "execute_code" : null;
  log(JSON.stringify({ mcpTools: names, selectedTool: tool }));
  if (!tool) {
    throw new Error("tools/list offers neither edit_timeline nor execute_code");
  }
  return {
    tool,
    async edit(timelineId, clipId, startMs) {
      const args = { timeline_id: timelineId, ops: [{ op: "move_clip", target: clipId, startMs }] };
      const input = tool === "edit_timeline" ? args : {
        title: "Move scratch timeline clip", risk: "low", description: "",
        code: 'import { edit_timeline } from "@nodetool-ai/sandbox-nodetool/timelines";\n'
          + `return await edit_timeline(${JSON.stringify(args)});`
      };
      requestId += 1;
      const response = await post("/mcp", headers, {
        jsonrpc: "2.0", id: requestId, method: "tools/call",
        params: { name: tool, arguments: input }
      });
      return parseMcpEditResult(parseMcpResponse(response.body, requestId), tool);
    }
  };
}

function observeWebSocket(base, headers) {
  const socket = new WebSocket(`${base.replace("http:", "ws:")}/ws`, { headers, handshakeTimeout: 10_000 });
  const frames = [];
  let failure;
  let textMode = false;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("missing set_mode text reply")), 10_000);
    const fail = (error) => {
      failure = error;
      clearTimeout(timer);
      reject(error);
    };
    socket.on("error", fail);
    socket.on("close", (code) => fail(new Error(`WebSocket closed (${code})`)));
    socket.on("open", () => socket.send(JSON.stringify({ command: "set_mode", data: { mode: "text" } })));
    socket.on("message", (bytes, isBinary) => {
      if (isBinary) {
        if (textMode) {
          fail(new Error("binary frame received after text mode reply"));
        }
        return;
      }
      try {
        const raw = bytes.toString("utf8");
        const frame = JSON.parse(raw);
        if (frame.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
        }
        if (frame.type === "resource_change") {
          frames.push({ frame, raw, at: performance.now() });
        }
        if (frame.message === "Mode set to text") {
          textMode = true;
          clearTimeout(timer);
          resolve();
        }
        if (frame.error) {
          fail(new Error(`WebSocket error: ${JSON.stringify(frame)}`));
        }
      } catch (error) {
        fail(error);
      }
    });
  });
  return {
    frames, ready,
    check() {
      if (failure) {
        throw failure;
      }
    },
    close() { socket.terminate(); }
  };
}

function seedDocument() {
  return {
    fps: 30, width: 1280, height: 720, durationMs: 4000,
    tracks: [{ id: "video-1", name: "Video", type: "video", index: 0, visible: true, locked: false }],
    clips: [0, 1].map((index) => ({
      id: `clip-${index + 1}`, trackId: "video-1", name: `Clip ${index + 1}`,
      startMs: index * 2000, durationMs: 1000, inPointMs: 0,
      mediaType: "video", sourceType: "imported", status: "draft", locked: false, versions: []
    }))
  };
}

async function runProbe(args, summary) {
  const work = makeScratch(verifiedBuildDir(root, "build"), "sync-probe-");
  const session = createScratchSession({ work, repo, assertInWork: (target) => assertInWork(work, target), log: console.error });
  let observer;
  try {
    const server = await session.startServer("server", args.port);
    const authHeaders = args.token ? { authorization: `Bearer ${args.token}` } : {};
    const post = (target, headers, input) => scratchPost(session, server, target, headers, input);
    const getTimeline = async (id) => {
      const response = await noRedirectFetch(`${server.base}/trpc/timeline.get?input=${encodeURIComponent(JSON.stringify({ id }))}`, {
        headers: authHeaders, signal: AbortSignal.timeout(10_000)
      });
      const body = await response.json();
      if (!response.ok || body.error) {
        throw new Error(`timeline.get: ${JSON.stringify(body)}`);
      }
      return body.result.data;
    };
    const id = await session.createTimeline(server.base, "External sync resource_change probe", seedDocument());
    const before = await getTimeline(id);
    observer = observeWebSocket(server.base, authHeaders);
    await observer.ready;
    const editMcp = args.trigger === "mcp" ? await initializeMcp(post, authHeaders) : null;
    if (editMcp) {
      summary.mcp.tool = editMcp.tool;
    }
    await sleep(1500);
    observer.check();
    summary.control.frames = observer.frames.filter(({ frame }) => matchesSequenceChange(frame, id)).length;
    const editOffset = observer.frames.length;
    const started = performance.now();
    let editResult;
    try {
      if (editMcp) {
        editResult = await editMcp.edit(id, "clip-1", 500);
      } else {
        const response = await post("/trpc/timeline.update", { ...authHeaders, "content-type": "application/json" }, {
          id, baseUpdatedAt: before.updatedAt,
          document: { tracks: before.tracks, clips: before.clips.map((clip) => clip.id === "clip-1" ? { ...clip, startMs: 500 } : clip), markers: before.markers ?? [] }
        });
        const body = JSON.parse(response.body);
        if (body.error || !body.result?.data) {
          throw new Error(`timeline.update: ${JSON.stringify(body)}`);
        }
        editResult = body.result.data;
      }
      summary.mcp.ok = true;
      let change;
      for (;;) {
        observer.check();
        change = observer.frames.slice(editOffset).find(({ frame, at }) => matchesSequenceChange(frame, id) && at - started <= 2000);
        if (change || performance.now() - started >= 2000) {
          break;
        }
        await sleep(10);
      }
      if (!change) {
        throw new Error(`missing resource_change for timelinesequence ${id} within 2000 ms`);
      }
      summary.mcp.elapsedMs = Math.round(change.at - started);
      fs.mkdirSync(path.dirname(args.out), { recursive: true });
      fs.writeFileSync(args.out, change.raw);
      const timeline = await getTimeline(id);
      const verified = verifyTimelineChange(change.frame, timeline, before.updatedAt, "clip-1", 500);
      if ((editResult.updated_at ?? editResult.updatedAt) !== verified.updatedAt) {
        throw new Error("edit response timestamp differs from resource_change and timeline.get");
      }
      console.error(JSON.stringify({
        sequenceId: id, elapsedMs: summary.mcp.elapsedMs, event: verified.event,
        updatedAt: verified.updatedAt, ops: verified.ops,
        timelineGet: { updatedAt: timeline.updatedAt, clip: verified.clip }, fixture: args.out
      }));
      if (summary.control.frames !== 0) {
        throw new Error(`quiet control received ${summary.control.frames} resource_change frames for ${id}`);
      }
      summary.ok = true;
    } finally {
      summary.mcp.frames = observer.frames.slice(editOffset).map(({ frame }) => frame);
    }
  } finally {
    observer?.close();
    await session.stopServers();
  }
}

async function main() {
  const summary = { control: { frames: 0 }, mcp: { tool: "execute_code", ok: false, frames: [], elapsedMs: null }, ok: false };
  try {
    const args = parseArgs(process.argv.slice(2));
    summary.mcp.tool = args.trigger === "mcp" ? "execute_code" : "timeline.update";
    await runProbe(args, summary);
  } catch (error) {
    summary.ok = false;
    summary.error = error instanceof Error ? error.message : String(error);
    console.error(summary.error);
  }
  console.log(JSON.stringify(summary));
  process.exitCode = summary.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
