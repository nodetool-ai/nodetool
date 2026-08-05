/**
 * Route a resuming WebSocket handshake to the machine running the job.
 *
 * A workflow run lives in one process: its `JobRunSession` — replay buffer,
 * cancel/stream hooks — is process-wide, not shared. With more than one
 * instance behind the Fly proxy a reconnecting client is balanced onto an
 * arbitrary machine, where `reconnect_job` finds no session and degrades to the
 * persisted row: the run continues, but the client sees no frames and its Stop
 * reaches nothing.
 *
 * Fly's proxy answers this with `fly-replay`. A response carrying
 * `fly-replay: instance=<machine>` makes the proxy re-issue the *whole*
 * request — an upgrade included, before any WebSocket frame exists — at the
 * named machine. So the client hints which run it wants to resume
 * (`?resume_job=<jobId>`), and the handshake is replayed at the instance the
 * job row says owns it. Everything else upgrades normally.
 *
 * Bounded to one hop: the proxy stamps `fly-replay-src` on a request it
 * replayed, and a request carrying that header is never replayed again. A
 * machine that is gone fails the replay and the client's own reconnect retries
 * — the run's row is still the fallback either way.
 */

import type { FastifyReply, FastifyRequest } from "fastify";

import { createLogger } from "@nodetool-ai/config";
import { Job } from "@nodetool-ai/models";

import { getInstanceId, isValidInstanceId } from "./instance-id.js";
import { isWebSocketUpgrade } from "./ws-upgrade.js";

const log = createLogger("nodetool.websocket.fly-replay");

/** A run in one of these states has no session left to route to. */
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

/**
 * Grace for the proxy to read the replay response before the socket is torn
 * down. `end()` alone waits for the peer's FIN, which a hostile or wedged
 * client never sends — the CLOSE_WAIT fd leak `ws-upgrade.ts` documents.
 */
const REPLAY_SOCKET_LINGER_MS = 5000;

/**
 * Answer the handshake with a replay instruction, if it belongs elsewhere.
 * Returns true when the request has been answered and must not be upgraded.
 *
 * Every failure — no hint, unknown job, another user's job, a DB that cannot
 * be reached — falls through to a normal upgrade. Routing is an optimization;
 * refusing connections when it cannot be computed would be strictly worse than
 * the single-machine behavior it replaces.
 */
export async function replayUpgradeToOwner(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  if (!isWebSocketUpgrade(req)) return false;
  // Already replayed once — accept it here rather than bounce it again.
  if (req.headers["fly-replay-src"]) return false;

  const instanceId = getInstanceId();
  if (!instanceId) return false;

  const jobId = new URLSearchParams(req.url.split("?")[1] ?? "").get(
    "resume_job"
  );
  if (!jobId) return false;

  const userId = req.userId;
  if (!userId) return false;

  let owner: string | null = null;
  try {
    const job = await Job.find(userId, jobId);
    if (!job || TERMINAL_STATUSES.has(job.status)) return false;
    owner = job.runner_instance;
  } catch (err) {
    log.warn("Could not resolve the owner of a resuming job", {
      jobId,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
  if (!owner || owner === instanceId) return false;
  // The owner goes into a response header verbatim. A stored value that is not
  // header-safe means someone's `NODETOOL_INSTANCE_ID` was malformed when the
  // row was stamped; refuse to echo it rather than let a CRLF split the
  // response we hand the proxy.
  if (!isValidInstanceId(owner)) {
    log.warn("Refusing to replay to a malformed instance id", { jobId, owner });
    return false;
  }

  log.info("Replaying a resuming WebSocket upgrade to its owner", {
    jobId,
    owner
  });

  // An upgrade cannot be answered through `reply.send()` — see the doc comment
  // on `denyUnauthorized`. Unlike a refusal this socket is *ended*, not
  // destroyed: the proxy has to read the response to act on the header, and a
  // destroyed socket may drop it.
  reply.hijack();
  const socket = req.raw.socket;
  if (!socket || socket.destroyed) return true;
  socket.write(
    "HTTP/1.1 409 Conflict\r\n" +
      `fly-replay: instance=${owner}\r\n` +
      "Connection: close\r\n" +
      "Content-Length: 0\r\n" +
      "\r\n"
  );
  socket.end();
  // …but do not wait forever for the other side to finish closing.
  const linger = setTimeout(() => {
    if (!socket.destroyed) socket.destroy();
  }, REPLAY_SOCKET_LINGER_MS);
  linger.unref?.();
  socket.once("close", () => clearTimeout(linger));
  return true;
}
