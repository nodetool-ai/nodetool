#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { WebSocketServer } from "ws";
import { makeScratch, verifiedBuildDir } from "./scratch-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const makeId = () => randomUUID().replaceAll("-", "");
const rippleTarget = "PiP A";
const rippleFollower = "PiP B";

// Exercises the production WebSocket -> ChatSession -> TimelineChatHost ->
// TimelineModel -> local autosave path. The server is an isolated wire mock.
export async function runChatIntegration(binary) {
  assert.equal(process.platform, "linux", "The integration capture requires Linux and Xvfb");
  const build = verifiedBuildDir(root, "build-chat");
  const work = makeScratch(build, "chat-integration-");
  const fixturePath = path.join(work, "timeline.json");
  const screenshot = path.join(work, "editor.png");
  const fixture = JSON.parse(await fs.readFile(path.join(root, "fixtures/three-tracks.json"), "utf8"));
  fixture.id = makeId();
  fixture.nativeChatCheck = { preserve: true };
  await fs.writeFile(fixturePath, JSON.stringify(fixture));
  for (const directory of ["config", "cache", "data", "tmp"]) {
    await fs.mkdir(path.join(work, directory));
  }

  const token = makeId();
  const threadId = makeId();
  const callId = makeId();
  const expectedMarker = { timeMs: 1234, label: "Native chat integration" };
  const event = {
    type: "tool_call", tool_call_id: callId, thread_id: threadId,
    name: "ui_timeline_add_marker", args: { timeline_id: fixture.id, ...expectedMarker }
  };
  const failures = [];
  const results = [];
  let manifests = 0;
  // After the marker round trip, a second session drives the command tools in this order.
  const commandCalls = [
    ["ui_timeline_list_commands", { filter: "ripple" }],
    ["ui_timeline_get_state", {}],
    ["ui_timeline_run_command", { command: "liftRange" }],
    // Filled in from the state, in the id form the state tool returned.
    ["ui_timeline_run_command", { command: "rippleDeleteSelected", params: { clip_ids: [] } }],
    ["ui_timeline_read_scopes", { atMs: 0, scopes: ["histogram"] }],
    ["ui_timeline_capture_frame", { atMs: 0, width: 160 }]
  ];
  const commandResults = [];
  let commandPhase = false;
  let stderr = "";
  let child;
  const sockets = new WebSocketServer({ noServer: true });
  const server = http.createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      failures.push("HTTP authentication did not match the isolated account");
      response.writeHead(401).end();
      return;
    }
    const procedure = new URL(request.url, "http://127.0.0.1").pathname;
    const data = procedure === "/trpc/threads.list"
      ? { threads: [{ id: threadId, title: "Native integration" }] }
      : procedure === "/trpc/messages.list" ? { messages: [], next: null } : null;
    if (request.method !== "GET" || data === null) {
      failures.push(`Unexpected request ${request.method} ${procedure}`);
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ result: { data } }));
  });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws" || request.headers.authorization !== `Bearer ${token}`) {
      failures.push("WebSocket authentication or endpoint did not match");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client));
  });
  const sendCommandCall = (client) => {
    const [name, args] = commandCalls[commandResults.length];
    client.send(JSON.stringify({
      type: "tool_call", tool_call_id: `command-${commandResults.length}`, thread_id: threadId,
      name, args: { timeline_id: fixture.id, ...args }
    }));
  };
  sockets.on("connection", (client) => {
    client.on("error", (error) => failures.push(error.message));
    client.on("message", (bytes) => {
      try {
        const message = JSON.parse(bytes.toString());
        if (message.command === "set_mode") {
          assert.equal(message.data.mode, "text");
          client.send(JSON.stringify({ message: "Mode set to text" }));
        } else if (message.type === "client_tools_manifest") {
          manifests += 1;
          const names = message.tools.map((tool) => tool.name);
          assert.equal(new Set(names).size, names.length, "Host tools must have unique names");
          for (const name of ["ui_timeline_add_marker", "ui_timeline_delete_marker",
            "ui_timeline_get_state", "ui_timeline_seek", "ui_timeline_move_clip",
            "ui_timeline_generate_clip", "ui_timeline_plan_beats", "ui_timeline_list_commands",
            "ui_timeline_run_command", "ui_timeline_read_scopes", "ui_timeline_capture_frame"]) {
            assert.ok(names.includes(name), `Missing native host capability ${name}`);
          }
          if (commandPhase) {
            sendCommandCall(client);
          } else {
            client.send(JSON.stringify(event));
          }
        } else if (message.type === "tool_result" && commandPhase) {
          assert.equal(message.tool_call_id, `command-${commandResults.length}`);
          commandResults.push(message);
          if (commandResults.length === 2) {
            const clip = message.result.clips.find((row) => row.name === rippleTarget);
            assert.ok(clip, `The state tool must list ${rippleTarget}`);
            commandCalls[3][1].params.clip_ids = [clip.id];
          }
          if (commandResults.length < commandCalls.length) { sendCommandCall(client); }
        } else if (message.type === "tool_result") {
          assert.equal(message.tool_call_id, callId);
          assert.equal(message.thread_id, threadId);
          assert.equal(message.ok, true, message.error);
          assert.equal(message.result.ok, true);
          results.push(message.result);
          // A replay of the same authoritative action id must not edit twice.
          if (results.length === 1) {
            client.send(JSON.stringify(event));
          }
        } else {
          assert.equal(message.command, "list_chat_turns");
        }
      } catch (error) {
        failures.push(error.message);
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const stop = () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, "SIGTERM"); }
      catch (error) { if (error.code !== "ESRCH") { failures.push(error.message); } }
    }
  };
  const launch = (extraArgs, connect) => {
    child = spawn("xvfb-run", ["-a", "-s", "-screen 0 1280x720x24", path.resolve(binary), fixturePath,
      "--chat", "--size", "1280x720", "--decode", "sw", "--audio", "none", ...extraArgs], {
      detached: true, stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, XDG_CONFIG_HOME: path.join(work, "config"),
        XDG_CACHE_HOME: path.join(work, "cache"), XDG_DATA_HOME: path.join(work, "data"),
        TMPDIR: path.join(work, "tmp"), QT_QPA_PLATFORM: "xcb",
        QSG_RHI_BACKEND: process.env.QSG_RHI_BACKEND ?? "vulkan",
        NODETOOL_CHAT_SERVER: connect ? `http://127.0.0.1:${address.port}` : "",
        NODETOOL_TOKEN: connect ? token : "" }
    });
    child.stderr.on("data", (bytes) => { stderr = (stderr + bytes.toString()).slice(-2 * 1024 * 1024); });
    const state = { result: null, exited: null };
    state.exited = new Promise((resolve) => {
      child.once("error", (error) => { state.result = { error }; resolve(state.result); });
      child.once("exit", (code, signal) => { state.result = { code, signal }; resolve(state.result); });
    });
    return state;
  };
  process.once("SIGINT", stop);
  try {
    const interactive = launch(["--background"], true);
    const deadline = Date.now() + 15000;
    let saved;
    while (Date.now() < deadline) {
      assert.equal(interactive.result, null, "The native editor exited before persisting the chat edit");
      assert.deepEqual(failures, []);
      if (results.length === 2) {
        const candidate = JSON.parse(await fs.readFile(fixturePath, "utf8"));
        if (candidate.markers?.some((marker) => marker.id === results[0].marker.id)) {
          saved = candidate;
          break;
        }
      }
      await delay(25);
    }
    assert.ok(saved, `Native edit was not acknowledged and persisted (manifests=${manifests}, results=${results.length})`);
    stop();
    await interactive.exited;
    assert.deepEqual(failures, []);
    assert.equal(manifests, 1, "The native host must advertise capabilities");
    assert.equal(results.length, 2, "The action and its replay must both receive a result");
    assert.deepEqual(results[1], results[0]);
    const previousMarkers = fixture.markers ?? [];
    assert.equal(saved.markers.length, previousMarkers.length + 1, "A replay must not add another marker");
    const marker = saved.markers.at(-1);
    assert.equal(marker.id, results[0].marker.id);
    assert.match(marker.id, /^[a-f0-9]{32}$/);
    assert.equal(marker.timeMs, expectedMarker.timeMs);
    assert.equal(marker.label, expectedMarker.label);
    const before = { ...fixture };
    const after = { ...saved };
    delete before.markers;
    delete after.markers;
    assert.deepEqual(after, before, "Host edits must preserve unrelated document fields");
    // Capture the reloaded persisted document with no server connection. The
    // first process exits only after persistence, so capture timing cannot
    // decide whether the wire/edit assertions pass.
    const capture = launch(["--screenshot", screenshot], false);
    const captured = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { stop(); reject(new Error("Native capture timed out")); }, 15000);
      capture.exited.then((result) => { clearTimeout(timer); resolve(result); });
    });
    assert.equal(captured.error, undefined);
    assert.equal(captured.code, 0, stderr);
    const png = await fs.readFile(screenshot);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");

    // The command tools in the running editor: a ripple delete, one undo entry, and the checks.
    commandPhase = true;
    // The fixture's picture-in-picture clips overlap, so nothing would follow the delete.
    const beforeCommands = JSON.parse(await fs.readFile(fixturePath, "utf8"));
    const rippled = beforeCommands.clips.find((clip) => clip.name === rippleTarget);
    const follower = beforeCommands.clips.find((clip) => clip.name === rippleFollower);
    rippled.durationMs = follower.startMs - rippled.startMs;
    delete rippled.outPointMs;
    await fs.writeFile(fixturePath, JSON.stringify(beforeCommands));
    const commandRun = launch(["--background"], true);
    const commandDeadline = Date.now() + 60000;
    let afterRipple;
    while (Date.now() < commandDeadline) {
      assert.equal(commandRun.result, null, "The native editor exited during the command tools");
      assert.deepEqual(failures, []);
      if (commandResults.length === commandCalls.length) {
        const candidate = JSON.parse(await fs.readFile(fixturePath, "utf8"));
        if (!candidate.clips.some((clip) => clip.name === rippleTarget)) {
          afterRipple = candidate;
          break;
        }
      }
      await delay(25);
    }
    assert.ok(afterRipple, `The ripple delete was not answered and persisted (results=${commandResults.length})`);
    stop();
    await commandRun.exited;
    assert.deepEqual(failures, []);
    const [listed, state, disabled, ripple, scopes, frame] = commandResults;
    assert.equal(listed.ok, true, listed.error);
    const entry = listed.result.commands.find((command) => command.id === "rippleDeleteSelected");
    assert.ok(entry, "The command list must include ripple delete");
    assert.equal(entry.enabled, false, "Nothing is selected yet");
    assert.ok(entry.parameters.properties.clip_ids, "Ripple delete must describe clip_ids");
    assert.equal(state.ok, true, state.error);
    assert.equal(disabled.ok, false, "A disabled command must fail");
    assert.equal(disabled.error, "Set In and Out points first.");
    assert.equal(ripple.ok, true, ripple.error);
    assert.equal(ripple.result.changed, true);
    assert.equal(ripple.result.undo.added, true, "The call must add an undo entry");
    assert.equal(ripple.result.undo.entry, "Ripple delete");
    assert.equal(ripple.result.undo.undoCount, 1, "The call must be one undo entry");
    assert.ok(!ripple.result.state.clips.some((clip) => clip.name === rippleTarget));
    const moved = afterRipple.clips.find((clip) => clip.id === follower.id);
    assert.equal(moved.startMs, rippled.startMs, "The next clip must move up to close the gap");
    assert.equal(ripple.result.state.clips.find((clip) => clip.id === follower.id).startMs, moved.startMs);
    assert.equal(scopes.ok, true, scopes.error);
    assert.ok(scopes.result.stats.y, "Scope numbers must include luma");
    assert.ok(scopes.result.histogram, "The histogram was asked for");
    assert.equal(frame.ok, true, frame.error);
    assert.match(frame.result.frames[0].dataUrl, /^data:image\/jpeg;base64,/);
    assert.equal(frame.result.frames[0].width, 160);
    return { ok: true, markerId: marker.id, results: results.length, commands: commandResults.length, fixture: fixturePath, screenshot };
  } catch (error) {
    throw new Error(`${error.message}\n${stderr.slice(-10000)}`, { cause: error });
  } finally {
    process.removeListener("SIGINT", stop);
    stop();
    for (const client of sockets.clients) { client.terminate(); }
    await new Promise((resolve) => sockets.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { bin: { type: "string", default: path.join(root, "build-chat/nodetool-timeline") },
    json: { type: "boolean", default: false } } });
  try { console.log(JSON.stringify(await runChatIntegration(values.bin))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
