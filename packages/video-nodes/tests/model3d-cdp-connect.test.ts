/**
 * The CDP attach used by `nodetool.model3d.RenderToImage` must survive a Chrome
 * that is listening but not yet serving `/json/list`. A single attempt lost
 * that race on CI (`ECONNREFUSED`) while other Chrome-driving suites competed
 * for the machine.
 */
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { connectCdp } from "../src/nodes/model3d/render3d-headless.js";

/** A port with nothing on it, found by opening and immediately closing one. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}

describe("connectCdp", () => {
  it("keeps retrying while the port refuses instead of failing on the first try", async () => {
    const port = await closedPort();
    const started = Date.now();

    await expect(
      connectCdp(port, { timeoutMs: 600, retryMs: 50 })
    ).rejects.toThrow(/could not attach to headless Chrome/);

    // A single attempt would reject in well under the budget; only a retry
    // loop keeps trying until the deadline.
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
  });

  it("stays within its timeout budget rather than looping forever", async () => {
    const port = await closedPort();
    const started = Date.now();

    await expect(
      connectCdp(port, { timeoutMs: 400, retryMs: 50 })
    ).rejects.toThrow();

    // Generous upper bound: the point is that it terminates near the deadline.
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("reports the port and the underlying cause", async () => {
    const port = await closedPort();

    const err = await connectCdp(port, {
      timeoutMs: 200,
      retryMs: 50
    }).catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(String(port));
    expect((err as Error).cause).toBeDefined();
  });
});
