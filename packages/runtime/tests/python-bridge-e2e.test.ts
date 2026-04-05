import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PythonBridge } from "../src/python-bridge.js";

/**
 * E2E test: spawns the real Python worker process and verifies discovery.
 *
 * Prerequisites:
 *   - nodetool-worker installed: pip install -e /Users/mg/workspace/nodetool-worker
 *   - nodetool-core installed
 *
 * Skip with: RUN_PYTHON_E2E unset (default). Enable with: RUN_PYTHON_E2E=1
 */
describe.skipIf(process.env.RUN_PYTHON_E2E !== "1")("PythonBridge E2E", () => {
  let bridge: PythonBridge;

  beforeAll(async () => {
    bridge = new PythonBridge({
      pythonPath: process.env.NODETOOL_PYTHON ?? "python",
      workerArgs: ["--namespaces", "test"]
    });
    await bridge.connect();
  }, 30_000);

  afterAll(() => {
    bridge?.close();
  });

  it("discovers nodes from the Python worker", () => {
    const nodes = bridge.getNodeMetadata();
    expect(Array.isArray(nodes)).toBe(true);
  });

  it("is connected after startup", () => {
    expect(bridge.isConnected).toBe(true);
  });
});
