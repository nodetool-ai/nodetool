/**
 * Tests for createPythonBridge — the transport selector that picks the local
 * stdio bridge or the remote WebSocket bridge based on options.wsUrl and the
 * NODETOOL_WORKER_URL environment variable.
 *
 * These tests only assert which concrete bridge is constructed; they never call
 * connect() (there is no real worker behind the URLs used here).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createPythonBridge } from "../src/python-bridge-factory.js";
import { PythonStdioBridge } from "../src/python-stdio-bridge.js";
import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";

const ENV_KEY = "NODETOOL_WORKER_URL";
const TOKEN_ENV_KEY = "NODETOOL_WORKER_TOKEN";

describe("createPythonBridge", () => {
  let savedWorkerUrl: string | undefined;
  let savedWorkerToken: string | undefined;

  beforeEach(() => {
    savedWorkerUrl = process.env[ENV_KEY];
    savedWorkerToken = process.env[TOKEN_ENV_KEY];
    delete process.env[ENV_KEY];
    delete process.env[TOKEN_ENV_KEY];
  });

  afterEach(() => {
    if (savedWorkerUrl === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = savedWorkerUrl;
    }
    if (savedWorkerToken === undefined) {
      delete process.env[TOKEN_ENV_KEY];
    } else {
      process.env[TOKEN_ENV_KEY] = savedWorkerToken;
    }
  });

  it("returns a stdio bridge with no env var and no options", () => {
    const bridge = createPythonBridge();
    expect(bridge).toBeInstanceOf(PythonStdioBridge);
  });

  it("returns a WebSocket bridge when options.wsUrl is set", () => {
    const bridge = createPythonBridge({ wsUrl: "ws://127.0.0.1:7777" });
    expect(bridge).toBeInstanceOf(WebsocketPythonBridge);
    expect(bridge.isAvailable()).toBe(true);
  });

  it("trims the wsUrl passed to the WebSocket bridge", () => {
    const bridge = createPythonBridge({ wsUrl: "  ws://127.0.0.1:7777  " });
    expect((bridge as WebsocketPythonBridge).wsUrl).toBe("ws://127.0.0.1:7777");
  });

  it("returns a WebSocket bridge when NODETOOL_WORKER_URL is set", () => {
    process.env[ENV_KEY] = "ws://127.0.0.1:7777";
    const bridge = createPythonBridge();
    expect(bridge).toBeInstanceOf(WebsocketPythonBridge);
    expect(bridge.isAvailable()).toBe(true);
    expect((bridge as WebsocketPythonBridge).wsUrl).toBe("ws://127.0.0.1:7777");
  });

  it("lets options.wsUrl override the env var", () => {
    process.env[ENV_KEY] = "ws://from-env:7777";
    const bridge = createPythonBridge({ wsUrl: "ws://from-option:7777" });
    expect(bridge).toBeInstanceOf(WebsocketPythonBridge);
    // Assert the chosen URL, not just the type — guards against a reversed
    // coalesce (process.env ?? options.wsUrl) that a type-only check misses.
    expect((bridge as WebsocketPythonBridge).wsUrl).toBe("ws://from-option:7777");
  });

  it("falls back to stdio when the env var is whitespace-only", () => {
    process.env[ENV_KEY] = "   ";
    const bridge = createPythonBridge();
    expect(bridge).toBeInstanceOf(PythonStdioBridge);
  });

  it("falls back to stdio when the env var is empty", () => {
    process.env[ENV_KEY] = "";
    const bridge = createPythonBridge();
    expect(bridge).toBeInstanceOf(PythonStdioBridge);
  });
});
