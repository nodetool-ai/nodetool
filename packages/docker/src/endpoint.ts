/**
 * Resolve where the Docker daemon listens, mirroring dockerode's default
 * constructor: honor DOCKER_HOST (unix://, npipe://, tcp://, http(s)://, ssh://),
 * otherwise fall back to the platform's default socket.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type DockerProtocol = "http:" | "https:" | "ssh:";

export interface DockerEnvironment {
  DOCKER_TLS_VERIFY?: string;
  DOCKER_CERT_PATH?: string;
  SSH_AUTH_SOCK?: string;
}

export interface DockerEndpoint {
  /** Unix socket / Windows named pipe path. Mutually exclusive with host. */
  socketPath?: string;
  host?: string;
  port?: number;
  protocol?: DockerProtocol;
  username?: string;
  sshAgent?: string;
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
}

export function resolveDockerEndpoint(
  dockerHost: string | undefined = process.env.DOCKER_HOST,
  platform: NodeJS.Platform = process.platform,
  environment: DockerEnvironment = process.env,
  homeDirectory: string = homedir()
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
    if (
      dockerHost.startsWith("tcp://") ||
      dockerHost.startsWith("http://") ||
      dockerHost.startsWith("https://") ||
      dockerHost.startsWith("ssh://")
    ) {
      const url = new URL(dockerHost.replace(/^tcp:\/\//, "http://"));
      if (url.protocol === "ssh:") {
        return {
          host: url.hostname,
          port: url.port ? Number(url.port) : 22,
          protocol: "ssh:",
          username: url.username ? decodeURIComponent(url.username) : undefined,
          sshAgent: environment.SSH_AUTH_SOCK
        };
      }

      const port = url.port
        ? Number(url.port)
        : url.protocol === "https:"
          ? 2376
          : 2375;
      const protocol =
        url.protocol === "https:" ||
        environment.DOCKER_TLS_VERIFY === "1" ||
        port === 2376
          ? "https:"
          : "http:";
      const endpoint: DockerEndpoint = { host: url.hostname, port, protocol };
      addTlsCredentials(endpoint, environment);
      return endpoint;
    }
    // Bare host:port (dockerode accepts this too)
    const match = dockerHost.match(/^([^:/]+):(\d+)$/);
    if (match) {
      const port = Number(match[2]);
      const endpoint: DockerEndpoint = {
        host: match[1],
        port,
        protocol:
          environment.DOCKER_TLS_VERIFY === "1" || port === 2376
            ? "https:"
            : "http:"
      };
      addTlsCredentials(endpoint, environment);
      return endpoint;
    }
    throw new Error(`Unsupported DOCKER_HOST value: ${dockerHost}`);
  }
  if (platform === "win32") {
    return { socketPath: "//./pipe/docker_engine" };
  }
  const userSocket = join(homeDirectory, ".docker", "run", "docker.sock");
  if (existsSync(userSocket)) {
    return { socketPath: userSocket };
  }
  return { socketPath: "/var/run/docker.sock" };
}

function addTlsCredentials(
  endpoint: DockerEndpoint,
  environment: DockerEnvironment
): void {
  if (!environment.DOCKER_CERT_PATH) {
    return;
  }
  endpoint.protocol = "https:";
  endpoint.ca = readFileSync(join(environment.DOCKER_CERT_PATH, "ca.pem"));
  endpoint.cert = readFileSync(join(environment.DOCKER_CERT_PATH, "cert.pem"));
  endpoint.key = readFileSync(join(environment.DOCKER_CERT_PATH, "key.pem"));
}
