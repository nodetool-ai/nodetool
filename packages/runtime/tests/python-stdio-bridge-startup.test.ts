import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

const { PythonStdioBridge } = await import("../src/python-stdio-bridge.js");

function createMockProcess(): {
  proc: EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  kill: ReturnType<typeof vi.fn>;
} {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  const kill = vi.fn();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.kill = kill;
  return { proc, kill };
}

describe("PythonStdioBridge startup", () => {
  const originalTimeout = process.env.NODETOOL_PYTHON_BRIDGE_STARTUP_TIMEOUT_MS;
  const originalPaddle = process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK;

  afterEach(() => {
    vi.useRealTimers();
    spawnMock.mockReset();
    if (originalTimeout === undefined) {
      delete process.env.NODETOOL_PYTHON_BRIDGE_STARTUP_TIMEOUT_MS;
    } else {
      process.env.NODETOOL_PYTHON_BRIDGE_STARTUP_TIMEOUT_MS = originalTimeout;
    }
    if (originalPaddle === undefined) {
      delete process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK;
    } else {
      process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = originalPaddle;
    }
  });

  it("disables Paddle host checks and kills the worker on startup timeout", async () => {
    vi.useFakeTimers();
    process.env.NODETOOL_PYTHON_BRIDGE_STARTUP_TIMEOUT_MS = "5";
    delete process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK;
    const { proc, kill } = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const bridge = new PythonStdioBridge({ pythonPath: "python-test" });
    const connectPromise = bridge.connect();
    const rejection = expect(connectPromise).rejects.toThrow(
      "Python worker did not become ready within 5ms"
    );

    expect(spawnMock).toHaveBeenCalledWith(
      "python-test",
      ["-m", "nodetool.worker", "--stdio"],
      expect.objectContaining({
        env: expect.objectContaining({
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True"
        })
      })
    );

    await vi.advanceTimersByTimeAsync(5);

    await rejection;
    expect(kill).toHaveBeenCalledTimes(1);
  });
});
