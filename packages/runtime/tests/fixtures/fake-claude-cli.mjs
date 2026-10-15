#!/usr/bin/env node
/**
 * A stand-in for `claude -p --input-format stream-json --output-format
 * stream-json`. It speaks the same control protocol so the real transport can
 * be driven without the CLI or credentials.
 *
 * FAKE_CLAUDE_LOG   File that receives one JSON line: { argv, frames }, where
 *                   frames are the stdin lines read before exit.
 * FAKE_CLAUDE_MODE  text (default) | tool | fail | hang | reject_init | no_result
 */
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const mode = process.env.FAKE_CLAUDE_MODE ?? "text";
const argv = process.argv.slice(2);
const frames = [];
const pending = new Map();
let nextId = 0;

const send = (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`);
const flushLog = () => {
  if (process.env.FAKE_CLAUDE_LOG) {
    appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ argv, frames })}\n`);
  }
};
process.on("exit", flushLog);

/** Send an mcp_message control request and wait for the host's answer. */
function mcp(server, message) {
  const requestId = `req_${nextId++}`;
  send({
    type: "control_request",
    request_id: requestId,
    request: { subtype: "mcp_message", server_name: server, message }
  });
  return new Promise((resolve) => pending.set(requestId, resolve));
}

const init = { type: "system", subtype: "init", session_id: "fake-session", model: "claude-fake-1" };
const result = (extra = {}) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "",
  usage: { input_tokens: 3, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  session_id: "fake-session",
  uuid: "fake-result",
  ...extra
});
const textDelta = (text) => ({
  type: "stream_event",
  event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }
});

async function runTool(serverName) {
  const initialized = await mcp(serverName, {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "fake" } }
  });
  await mcp(serverName, { jsonrpc: "2.0", method: "notifications/initialized" });
  const listed = await mcp(serverName, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  const tool = listed.mcp_response.result.tools[0];
  send(init);
  send({
    type: "assistant",
    message: {
      model: "claude-fake-1",
      content: [{ type: "tool_use", id: "toolu_1", name: `mcp__${serverName}__${tool.name}`, input: { a: 2, b: 40 } }]
    }
  });
  const called = await mcp(serverName, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: tool.name, arguments: { a: 2, b: 40 } }
  });
  const unknown = await mcp(serverName, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "nope" } });
  send({
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: called.mcp_response.result.content }] }
  });
  const answer = `protocol=${initialized.mcp_response.result.protocolVersion}; tools=${listed.mcp_response.result.tools.map((t) => t.name).join(",")}; schema=${JSON.stringify(tool.inputSchema)}; result=${called.mcp_response.result.content[0].text}; unknown=${unknown.mcp_response.error.code}`;
  send(textDelta(answer));
  send({ type: "assistant", message: { model: "claude-fake-1", content: [{ type: "text", text: answer }] } });
  send(result());
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const frame = JSON.parse(line);
  frames.push(frame);
  if (frame.type === "control_response") {
    pending.get(frame.response.request_id)?.(frame.response.response ?? frame.response);
    return;
  }
  if (frame.type === "control_request" && frame.request.subtype === "initialize") {
    if (mode === "reject_init") {
      send({ type: "control_response", response: { subtype: "error", request_id: frame.request_id, error: "bad initialize" } });
      return;
    }
    send({ type: "control_response", response: { subtype: "success", request_id: frame.request_id, response: {} } });
    return;
  }
  if (frame.type !== "user") return;
  switch (mode) {
    case "text":
      send(init);
      send(textDelta("hello "));
      send(textDelta("from fake"));
      send({ type: "assistant", message: { model: "claude-fake-1", content: [{ type: "text", text: "hello from fake" }] } });
      send(result());
      break;
    case "tool":
      void runTool(frames[0].request.sdkMcpServers[0]);
      break;
    case "fail":
      process.stderr.write("fake failure: not logged in\n");
      process.exit(3);
      break;
    case "hang":
      send(init);
      send(textDelta("partial"));
      break;
    case "no_result":
      send(init);
      process.exit(0);
      break;
  }
});
lines.on("close", () => {
  if (mode !== "hang") process.exit(0);
});
