/**
 * Deploy tools — `expose_port` returns the published host URL for one of
 * the pre-allocated user-service container ports.
 *
 * The host publishes ports at container-create time (see
 * DockerSandboxProvider.userServicePorts) and then POSTs the resolved
 * map to /internal/set-port-map. `expose_port` is a read-only lookup
 * against that registry; the agent's service has to actually be
 * listening on the requested container port.
 */

import type {
  ExposePortInput,
  ExposePortOutput
} from "@nodetool/sandbox/schemas";
import { getPublicUrl, knownContainerPorts } from "../port-map.js";

export async function exposePort(
  input: ExposePortInput
): Promise<ExposePortOutput> {
  const url = getPublicUrl(input.port);
  if (!url) {
    const known = knownContainerPorts().join(", ") || "(none)";
    throw new Error(
      `container port ${input.port} is not in the exposed pool. Available: ${known}`
    );
  }
  const scheme = input.scheme ?? "http";
  const rewritten = url.replace(/^https?:/, `${scheme}:`);
  return {
    container_port: input.port,
    public_url: rewritten,
    expires_at: null
  };
}
