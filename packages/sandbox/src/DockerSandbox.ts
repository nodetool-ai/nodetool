/**
 * DockerSandbox — Dockerode-backed SandboxProvider.
 *
 * Each acquire() starts a long-running container from the sandbox image,
 * publishes the in-container tool server port (7788) to an ephemeral host
 * port, waits for readiness, and returns a Sandbox handle with a connected
 * ToolClient.
 *
 * Security posture (defaults):
 *   - no-new-privileges, all capabilities dropped
 *   - read-only rootfs disabled (agents need /tmp, /home/ubuntu writable);
 *     will revisit once agents settle on a workspace pattern
 *   - memory and CPU capped
 *   - network enabled (agents need internet to research)
 */

import { createConnection, type Socket as NetSocket } from "node:net";
import Dockerode from "dockerode";
import type {
  Sandbox,
  SandboxOptions,
  SandboxProvider,
  SandboxEndpoint
} from "./SandboxProvider.js";
import { ToolClient } from "./ToolClient.js";

export const DEFAULT_SANDBOX_IMAGE = "nodetool/sandbox-agent:latest";
export const TOOL_SERVER_PORT = 7788;
export const VNC_WS_PORT = 6080;
/** User-service ports pre-published at container create time. Each is
 *  bound to an ephemeral host port and reachable via `expose_port`.
 *  Covers the common dev-server defaults: Next.js (3000), Flask (5000),
 *  Django (8000), generic (8080). */
export const USER_SERVICE_PORTS = [3000, 5000, 8000, 8080] as const;

export interface DockerSandboxProviderOptions {
  /** Host IP bound for published ports. Default: 127.0.0.1. */
  hostIp?: string;
  /** Docker image name used when SandboxOptions.image is omitted. */
  defaultImage?: string;
  /** Max seconds to wait for the in-container tool server. Default: 30. */
  readyTimeoutSeconds?: number;
  /** Pull image if absent locally. Default: true. */
  autoPull?: boolean;
  /** Container ports to publish for user services (agent-hosted dev
   *  servers, generated sites). Defaults to USER_SERVICE_PORTS. */
  userServicePorts?: readonly number[];
}

export class DockerSandbox implements Sandbox {
  public readonly sessionId: string;
  public readonly endpoint: SandboxEndpoint;
  public readonly client: ToolClient;

  private readonly container: Dockerode.Container;
  private released = false;
  private readonly timeoutHandle: ReturnType<typeof setTimeout> | null;

  constructor(args: {
    sessionId: string;
    endpoint: SandboxEndpoint;
    client: ToolClient;
    container: Dockerode.Container;
    timeoutHandle: ReturnType<typeof setTimeout> | null;
  }) {
    this.sessionId = args.sessionId;
    this.endpoint = args.endpoint;
    this.client = args.client;
    this.container = args.container;
    this.timeoutHandle = args.timeoutHandle;
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    if (this.timeoutHandle !== null) clearTimeout(this.timeoutHandle);
    try {
      await this.container.remove({ force: true });
    } catch {
      // best-effort; container may already be gone
    }
  }

  async pause(): Promise<void> {
    await this.container.pause();
  }

  async resume(): Promise<void> {
    await this.container.unpause();
  }
}

export class DockerSandboxProvider implements SandboxProvider {
  private readonly docker: Dockerode;
  private readonly hostIp: string;
  private readonly defaultImage: string;
  private readonly readyTimeoutSeconds: number;
  private readonly autoPull: boolean;
  private readonly userServicePorts: readonly number[];

  constructor(options: DockerSandboxProviderOptions = {}) {
    this.docker = new Dockerode();
    this.hostIp = options.hostIp ?? "127.0.0.1";
    this.defaultImage = options.defaultImage ?? DEFAULT_SANDBOX_IMAGE;
    this.readyTimeoutSeconds = options.readyTimeoutSeconds ?? 30;
    this.autoPull = options.autoPull ?? true;
    this.userServicePorts = options.userServicePorts ?? USER_SERVICE_PORTS;
  }

  async acquire(options: SandboxOptions): Promise<Sandbox> {
    await this.pingDocker();
    const image = options.image ?? this.defaultImage;
    await this.ensureImage(image);

    const containerName = `nodetool-sandbox-${options.sessionId}`;
    const binds: string[] = [];
    if (options.workspaceDir) {
      binds.push(`${options.workspaceDir}:/workspace:rw`);
    }

    const env: string[] = [
      `NODETOOL_SESSION_ID=${options.sessionId}`,
      `NODETOOL_TOOL_PORT=${TOOL_SERVER_PORT}`,
      `NODETOOL_VNC_PORT=${VNC_WS_PORT}`,
      `NODETOOL_USER_SERVICE_PORTS=${this.userServicePorts.join(",")}`,
      ...Object.entries(options.env ?? {}).map(([k, v]) => `${k}=${v}`)
    ];

    const toolPortKey = `${TOOL_SERVER_PORT}/tcp`;
    const vncPortKey = `${VNC_WS_PORT}/tcp`;

    const exposedPorts: Record<string, Record<string, never>> = {
      [toolPortKey]: {},
      [vncPortKey]: {}
    };
    const portBindings: Record<
      string,
      Array<{ HostIp: string; HostPort: string }>
    > = {
      [toolPortKey]: [{ HostIp: this.hostIp, HostPort: "" }],
      [vncPortKey]: [{ HostIp: this.hostIp, HostPort: "" }]
    };
    for (const p of this.userServicePorts) {
      const key = `${p}/tcp`;
      exposedPorts[key] = {};
      portBindings[key] = [{ HostIp: this.hostIp, HostPort: "" }];
    }

    const container = await this.docker.createContainer({
      name: containerName,
      Image: image,
      Env: env,
      WorkingDir: "/home/ubuntu",
      OpenStdin: false,
      Tty: false,
      ExposedPorts: exposedPorts,
      HostConfig: {
        Binds: binds.length > 0 ? binds : undefined,
        Memory: parseMemLimit(options.memLimit ?? "2g"),
        NanoCpus: options.nanoCpus ?? 2_000_000_000,
        SecurityOpt: ["no-new-privileges"],
        CapDrop: ["ALL"],
        PortBindings: portBindings
      }
    });

    try {
      await container.start();
      const toolPort = await waitForHostPort(container, toolPortKey);
      const vncPort = await waitForHostPort(container, vncPortKey).catch(
        () => null
      );

      const toolUrl = `http://${this.hostIp}:${toolPort}`;
      const vncUrl =
        vncPort !== null ? `ws://${this.hostIp}:${vncPort}` : undefined;

      // Resolve user-service host ports so the in-container expose_port
      // tool can map container_port → public URL.
      const userServiceMap: Record<string, string> = {};
      for (const p of this.userServicePorts) {
        const host = await waitForHostPort(container, `${p}/tcp`).catch(
          () => null
        );
        if (host !== null) {
          userServiceMap[String(p)] = `http://${this.hostIp}:${host}`;
        }
      }

      const ready = await waitForTcp(
        this.hostIp,
        toolPort,
        this.readyTimeoutSeconds
      );
      if (!ready) {
        throw new Error(
          `sandbox tool server did not become ready on ${toolUrl}`
        );
      }

      const client = new ToolClient({ baseUrl: toolUrl });

      // Publish the resolved map to the in-container server so the
      // expose_port tool can answer with real public URLs.
      if (Object.keys(userServiceMap).length > 0) {
        await fetch(`${toolUrl}/internal/set-port-map`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ map: userServiceMap })
        }).catch(() => {
          // best-effort; expose_port will simply return an empty URL
        });
      }

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const limit = options.timeoutSeconds ?? 3600;
      if (limit > 0) {
        timeoutHandle = setTimeout(() => {
          container.remove({ force: true }).catch(() => {});
        }, limit * 1000);
      }

      return new DockerSandbox({
        sessionId: options.sessionId,
        endpoint: { toolUrl, vncUrl },
        client,
        container,
        timeoutHandle
      });
    } catch (err) {
      await container.remove({ force: true }).catch(() => {});
      throw err;
    }
  }

  private async pingDocker(): Promise<void> {
    try {
      await this.docker.ping();
    } catch (err) {
      throw new Error(
        `Docker daemon is not available. Start Docker and try again. (${String(err)})`
      );
    }
  }

  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch {
      if (!this.autoPull) {
        throw new Error(`sandbox image not found locally: ${image}`);
      }
    }
    const pullStream = await this.docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(pullStream, (err: Error | null) =>
        err ? reject(err) : resolve()
      );
    });
  }
}

// ---- helpers ---------------------------------------------------------------

export function parseMemLimit(mem: string): number {
  const match = mem.match(/^(\d+)([kmgt]?)b?$/i);
  if (!match) return 2 * 1024 * 1024 * 1024;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || "").toLowerCase();
  switch (unit) {
    case "k":
      return num * 1024;
    case "m":
      return num * 1024 * 1024;
    case "g":
      return num * 1024 * 1024 * 1024;
    case "t":
      return num * 1024 * 1024 * 1024 * 1024;
    default:
      return num;
  }
}

async function waitForHostPort(
  container: Dockerode.Container,
  portKey: string,
  timeoutMs = 20_000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await container.inspect();
    if (info.State?.Status === "exited") {
      throw new Error("container exited before ports were published");
    }
    const bindings = info.NetworkSettings?.Ports?.[portKey];
    if (Array.isArray(bindings) && bindings[0]?.HostPort) {
      return parseInt(bindings[0].HostPort, 10);
    }
    await sleep(150);
  }
  throw new Error(`timed out waiting for host port for ${portKey}`);
}

async function waitForTcp(
  host: string,
  port: number,
  timeoutSeconds: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (await tcpProbe(host, port, 1000)) return true;
    await sleep(200);
  }
  return false;
}

function tcpProbe(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const sock: NetSocket = createConnection({ host, port, timeout: timeoutMs });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
