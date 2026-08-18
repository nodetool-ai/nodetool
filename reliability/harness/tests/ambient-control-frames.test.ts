/**
 * Reproduction for Ring 1 run 31619279663, which failed `linear-text-pipeline`
 * on the packaged surface and blocked the Fly deploy of 2868cffe.
 *
 * `UnifiedWebSocketRunner` starts two wall-clock timers on every connection —
 * a stats broadcast (first sample ~1s after connect, then every 5s) and a 25s
 * heartbeat ping. Neither has anything to do with the run, but a relay driver
 * that records them puts them in the stream at whatever position the run's own
 * duration happens to put them, which shifts every later entry in the channel
 * and mismatches the golden. Whether
 * a run is long enough for that is a coin flip, which is why it took until
 * 2868cffe to fail.
 *
 * This asserts the hazard is real (the server does emit an unsolicited
 * `system_stats` on an idle socket) and that the relay drivers' shared policy
 * classifies it as connection control, which is what makes them drop it
 * before recording.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createTestUiServer, unpackWebSocketMessage } from "@nodetool-ai/websocket";
import { isConnectionControlMessage } from "../src/drivers/relay-fields.js";

/** The first stats sample lands ~1s after connect; allow slack for a loaded CI box. */
const STATS_WAIT_MS = 8000;

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  const fn = cleanup;
  cleanup = null;
  if (fn) await fn();
});

describe("ambient control frames on an idle connection", () => {
  it(
    "arrive unsolicited, and the relay drivers' policy drops them",
    { timeout: 30000 },
    async () => {
      const srv = createTestUiServer({ host: "127.0.0.1", port: 0 });
      await srv.listen();
      const address = srv.server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 7777;

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      cleanup = async () => {
        ws.close();
        await srv.close();
      };

      const statsFrame = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("no system_stats frame within the wait window")),
            STATS_WAIT_MS
          );
          ws.on("error", reject);
          ws.on("message", (data: Buffer, isBinary: boolean) => {
            const message = (
              isBinary
                ? unpackWebSocketMessage(data)
                : JSON.parse(data.toString("utf8"))
            ) as Record<string, unknown>;
            // Nothing was ever submitted on this socket, so any frame here is
            // ambient by construction.
            if (message["type"] !== "system_stats") return;
            clearTimeout(timer);
            resolve(message);
          });
        }
      );

      expect(statsFrame["stats"]).toBeTypeOf("object");
      expect(isConnectionControlMessage(statsFrame)).toBe(true);
    }
  );
});
