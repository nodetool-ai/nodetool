/**
 * Resolve where the Docker daemon listens, mirroring dockerode's default
 * constructor: honor DOCKER_HOST (unix://, npipe://, tcp:// / http://),
 * otherwise fall back to the platform's default socket. TLS (DOCKER_TLS_VERIFY)
 * is not supported — NodeTool only ever talks to a local daemon.
 */

export interface DockerEndpoint {
  /** Unix socket / Windows named pipe path. Mutually exclusive with host. */
  socketPath?: string;
  host?: string;
  port?: number;
}

export function resolveDockerEndpoint(
  dockerHost: string | undefined = process.env.DOCKER_HOST,
  platform: NodeJS.Platform = process.platform
): DockerEndpoint {
  if (dockerHost) {
    if (dockerHost.startsWith("unix:/")) {
      // Accept unix:///var/run/docker.sock, unix://var/run/… and unix:/var/run/docker.sock
      const path = dockerHost.startsWith("unix://")
        ? dockerHost.slice("unix://".length)
        : dockerHost.slice("unix:".length);
      return { socketPath: path || "/var/run/docker.sock" };
    }
    if (dockerHost.startsWith("npipe://")) {
      return { socketPath: dockerHost.slice("npipe://".length) };
    }
    if (dockerHost.startsWith("tcp://") || dockerHost.startsWith("http://")) {
      const url = new URL(dockerHost.replace(/^tcp:\/\//, "http://"));
      return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 2375
      };
    }
    // Bare host:port (dockerode accepts this too)
    const match = dockerHost.match(/^([^:/]+):(\d+)$/);
    if (match) {
      return { host: match[1], port: Number(match[2]) };
    }
    throw new Error(`Unsupported DOCKER_HOST value: ${dockerHost}`);
  }
  if (platform === "win32") {
    return { socketPath: "//./pipe/docker_engine" };
  }
  return { socketPath: "/var/run/docker.sock" };
}
