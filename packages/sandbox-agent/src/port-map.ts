/**
 * In-container registry of container_port → public URL.
 *
 * Populated by the host immediately after container startup via
 * POST /internal/set-port-map. The `expose_port` tool reads from this
 * registry to answer the agent's URL lookup.
 */

let portMap: Record<string, string> = {};

export function setPortMap(next: Record<string, string>): void {
  portMap = { ...next };
}

export function getPublicUrl(containerPort: number): string | null {
  return portMap[String(containerPort)] ?? null;
}

export function knownContainerPorts(): number[] {
  return Object.keys(portMap).map((s) => parseInt(s, 10));
}

export function _resetForTests(): void {
  portMap = {};
}
