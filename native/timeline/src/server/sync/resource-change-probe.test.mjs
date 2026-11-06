import assert from "node:assert/strict";
import { test } from "node:test";

const sequenceId = "0123456789abcdef0123456789abcdef";
const probe = () => import("./resource-change-probe.mjs");

test("matches only resource_change frames for the full sequence id", async () => {
  const { matchesSequenceChange } = await probe();
  const frame = {
    type: "resource_change",
    resource_type: "timelinesequence",
    resource: { id: sequenceId }
  };
  assert.equal(matchesSequenceChange(frame, sequenceId), true);
  for (const other of [
    null, [], {},
    { ...frame, type: "ping" },
    { ...frame, resource_type: "timelineversion" },
    { ...frame, resource: null },
    { ...frame, resource: { id: "another-sequence" } },
    { ...frame, resource: { id: sequenceId.slice(0, 12) } }
  ]) {
    assert.equal(matchesSequenceChange(other, sequenceId), false);
  }
});

test("reads matching MCP JSON-RPC replies from JSON and SSE data bodies", async () => {
  const { parseMcpResponse } = await probe();
  const result = { protocolVersion: "2025-03-26", capabilities: {} };
  const reply = { jsonrpc: "2.0", id: 1, result };
  assert.deepEqual(parseMcpResponse(JSON.stringify(reply), 1), result);
  const sse = ': heartbeat\r\nevent: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\n'
    + 'id: reply\r\nevent: message\r\ndata: {"jsonrpc":"2.0","id":1,\r\ndata: "result":{"protocolVersion":"2025-03-26","capabilities":{}}}\r\n\r\n';
  assert.deepEqual(parseMcpResponse(sse, 1), result);
  assert.throws(() => parseMcpResponse(JSON.stringify(reply), 2), /reply.*2/);
  assert.throws(() => parseMcpResponse('', 1), /reply/);
  assert.throws(() => parseMcpResponse('data: invalid\n\n', 1), /JSON/);
  assert.throws(() => parseMcpResponse('{"jsonrpc":"2.0","id":1,"error":{"message":"denied"}}', 1), /denied/);
  assert.throws(() => parseMcpResponse('{"jsonrpc":"2.0","id":1}', 1), /result/);
});

test("rejects MCP tool, sandbox and edit failures even inside a successful HTTP reply", async () => {
  const { parseMcpEditResult } = await probe();
  const edit = { applied: 1, failed: 0, updated_at: "2026-01-01T00:00:01.000Z" };
  const wrap = (observation) => ({ content: [{ type: "text", text: JSON.stringify(observation) }] });
  assert.deepEqual(parseMcpEditResult(wrap({ ok: true, result: edit })), edit);
  assert.throws(() => parseMcpEditResult({ isError: true, content: [] }), /tool/);
  assert.throws(() => parseMcpEditResult(wrap({ ok: false, error: "permission denied" })), /permission denied/);
  assert.throws(() => parseMcpEditResult(wrap({ ok: true, result: { error: "conflict" } })), /conflict/);
  assert.throws(() => parseMcpEditResult(wrap({ ok: true, result: { applied: 0, failed: 1 } })), /edit/);
  assert.throws(() => parseMcpEditResult({ content: [] }), /observation/);
});

test("requires a newer frame timestamp matching timeline.get and the moved clip", async () => {
  const { verifyTimelineChange } = await probe();
  const before = "2026-01-01T00:00:00.000Z";
  const after = "2026-01-01T00:00:01.000Z";
  const frame = {
    type: "resource_change", resource_type: "timelinesequence", event: "updated",
    resource: { id: sequenceId, updated_at: after }, ops: [{ tool: "ui_timeline_move_clip" }]
  };
  const timeline = { id: sequenceId, updatedAt: after, clips: [{ id: "clip-a", startMs: 500 }] };
  const verify = (change, row = timeline) => verifyTimelineChange(change, row, before, "clip-a", 500);
  assert.deepEqual(verify(frame), { updatedAt: after, event: "updated", ops: frame.ops, clip: timeline.clips[0] });
  assert.equal(verify({ ...frame, resource: { id: sequenceId, updatedAt: after } }).updatedAt, after);
  assert.throws(() => verify({ ...frame, resource: { id: sequenceId } }), /timestamp/);
  assert.throws(() => verify({ ...frame, resource: { id: sequenceId, updated_at: before } }), /newer/);
  assert.throws(() => verify(frame, { ...timeline, updatedAt: before }), /timestamp/);
  assert.throws(() => verify(frame, { ...timeline, clips: [{ id: "clip-a", startMs: 0 }] }), /clip/);
  assert.throws(() => verify(frame, { ...timeline, id: "another-sequence" }), /sequence/);
});

test("validates CLI options before any scratch server can start", async () => {
  const { parseArgs } = await probe();
  assert.equal(parseArgs([]).port, 7811);
  assert.equal(parseArgs([]).trigger, "mcp");
  assert.match(parseArgs([]).out, /build\/sync-probe\/resource-change\.json$/);
  const options = parseArgs(["--port", "7812", "--token", "test-token", "--trigger", "trpc", "--out", "/tmp/probe.json"]);
  assert.deepEqual(options, { port: 7812, token: "test-token", trigger: "trpc", out: "/tmp/probe.json" });
  for (const args of [
    ["--port", "7777"], ["--port", "0"], ["--port", "65536"], ["--port", "1.5"],
    ["--port", "no"], ["--port"], ["--token"], ["--out"], ["--trigger", "other"], ["--unknown"]
  ]) {
    assert.throws(() => parseArgs(args));
  }
});

test("discovers MCP tools and sends a static timeline import to execute_code", async () => {
  const { initializeMcp } = await probe();
  const methods = [];
  const logs = [];
  const edit = { applied: 1, failed: 0, updated_at: "2026-01-01T00:00:01.000Z" };
  const post = async (target, headers, request) => {
    assert.equal(target, "/mcp");
    assert.equal(headers.authorization, "Bearer probe-token");
    methods.push(request.method);
    if (request.method === "initialize") {
      return {
        headers: { "mcp-session-id": "probe-session" },
        body: JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-03-26" } })
      };
    }
    assert.equal(headers["mcp-session-id"], "probe-session");
    assert.equal(headers["mcp-protocol-version"], "2025-03-26");
    if (request.method === "notifications/initialized") {
      return { body: "" };
    }
    if (request.method === "tools/list") {
      return { body: JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: [{
        name: "execute_code", description: 'Static import from "@nodetool-ai/sandbox-nodetool/<namespace>". Return a small summary.'
      }] } }) };
    }
    assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    assert.equal(request.params.name, "execute_code");
    assert.equal(request.params.arguments.code,
      'import { edit_timeline } from "@nodetool-ai/sandbox-nodetool/timelines";\n'
      + 'return await edit_timeline({"timeline_id":"0123456789abcdef0123456789abcdef","ops":[{"op":"move_clip","target":"clip-1","startMs":500}]});');
    return { body: JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {
      content: [{ type: "text", text: JSON.stringify({ ok: true, result: edit }) }]
    } }) };
  };
  const mcp = await initializeMcp(post, { authorization: "Bearer probe-token" }, (line) => logs.push(line));
  const result = await mcp.edit(sequenceId, "clip-1", 500);
  assert.deepEqual(result, edit);
  assert.equal(mcp.tool, "execute_code");
  assert.deepEqual(logs.map((line) => JSON.parse(line)), [{ mcpTools: ["execute_code"], selectedTool: "execute_code" }]);
});

test("prefers an exposed edit_timeline across list pages and reads its direct MCP result", async () => {
  const { initializeMcp } = await probe();
  const logs = [];
  const edit = { applied: 1, failed: 0, updated_at: "2026-01-01T00:00:01.000Z" };
  const calls = [];
  const cursors = [];
  const post = async (_target, _headers, request) => {
    let result;
    if (request.method === "initialize") {
      result = { protocolVersion: "2025-03-26" };
    } else if (request.method === "tools/list") {
      cursors.push(request.params?.cursor);
      result = request.params?.cursor === "timeline-page"
        ? { tools: [{ name: "edit_timeline" }] }
        : { tools: [{ name: "execute_code" }], nextCursor: "timeline-page" };
    } else if (request.method === "tools/call") {
      calls.push(request.params);
      result = { content: [{ type: "text", text: JSON.stringify(edit) }], structuredContent: edit };
    }
    return { headers: { "mcp-session-id": "probe-session" }, body: JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) };
  };
  const mcp = await initializeMcp(post, {}, (line) => logs.push(line));
  assert.deepEqual(await mcp.edit(sequenceId, "clip-1", 500), edit);
  assert.equal(mcp.tool, "edit_timeline");
  assert.deepEqual(cursors, [undefined, "timeline-page"]);
  assert.deepEqual(calls, [{ name: "edit_timeline", arguments: {
    timeline_id: sequenceId, ops: [{ op: "move_clip", target: "clip-1", startMs: 500 }]
  } }]);
  assert.deepEqual(logs.map((line) => JSON.parse(line)), [{ mcpTools: ["execute_code", "edit_timeline"], selectedTool: "edit_timeline" }]);
});
