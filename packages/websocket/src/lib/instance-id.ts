import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.websocket.instance-id");

const warnedAbout = new Set<string>();

/**
 * Which server instance this process is.
 *
 * On Fly every machine gets `FLY_MACHINE_ID`, and it is also the value the
 * proxy's `fly-replay: instance=<id>` header addresses — so the same string
 * both stamps a job row and routes a handshake back to its owner.
 * `NODETOOL_INSTANCE_ID` overrides it for tests and for other multi-instance
 * deployments.
 *
 * Null means single-machine: nothing to route to, and every feature keyed off
 * this is inert — which is also what a malformed value gets. The id is written
 * into a response header verbatim (`fly-replay: instance=<id>`), so anything
 * outside {@link INSTANCE_ID_PATTERN} is rejected here rather than trusted to
 * be caught downstream.
 */
export function getInstanceId(): string | null {
  const configured =
    process.env["NODETOOL_INSTANCE_ID"] ?? process.env["FLY_MACHINE_ID"];
  const trimmed = configured?.trim();
  if (!trimmed) return null;
  if (!isValidInstanceId(trimmed)) {
    // Called per run start and per upgrade, so say it once per bad value.
    if (!warnedAbout.has(trimmed)) {
      warnedAbout.add(trimmed);
      log.warn("Ignoring a malformed instance id", { value: trimmed });
    }
    return null;
  }
  return trimmed;
}

/**
 * What an instance id may contain. Fly machine ids are hex, but other
 * deployments name their instances; the bound that matters is that the value
 * cannot carry CRLF into a response header.
 */
export const INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** True for a value safe to interpolate into a header. */
export function isValidInstanceId(value: string): boolean {
  return INSTANCE_ID_PATTERN.test(value);
}
