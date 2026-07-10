/**
 * Minimal Docker Engine API client.
 *
 * The Engine API is plain HTTP over a unix socket (or TCP when DOCKER_HOST
 * says so). This client covers exactly the surface NodeTool's code runners
 * and sandbox provider need: ping, image inspect/pull, container
 * create/start/wait/remove/inspect/pause/unpause, and attach with connection
 * hijacking for stdio streaming.
 */

import { request as httpRequest } from "node:http";
import type {
  ClientRequest,
  IncomingMessage,
  RequestOptions as HttpRequestOptions
} from "node:http";
import { request as httpsRequest } from "node:https";
import type { Duplex } from "node:stream";
import { createInterface } from "node:readline";
import { resolveDockerEndpoint, type DockerEndpoint } from "./endpoint.js";
import { DockerSshAgent } from "./ssh-agent.js";
import type {
  AttachOptions,
  ContainerCreateOptions,
  ContainerInspectInfo,
  ContainerWaitResult
} from "./types.js";

/** Error raised for non-2xx daemon responses, carrying the HTTP status. */
export class DockerError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "DockerError";
    this.statusCode = statusCode;
  }
}

/** Extract the daemon's error message from a response body. */
export function parseDaemonErrorMessage(
  body: string,
  statusCode: number
): string {
  const fallback = `Docker daemon returned HTTP ${statusCode}`;
  const text = body.trim();
  if (!text) return fallback;
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string"
    ) {
      return (parsed as { message: string }).message;
    }
  } catch {
    // Not JSON — use the raw body.
  }
  return text;
}

/** Build a request path with URL-encoded query parameters. */
export function buildPath(
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    if (typeof value === "boolean") {
      params.set(key, value ? "1" : "0");
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Split an image reference into the repository and tag for
 * `POST /images/create`. Without an explicit tag the daemon would pull
 * every tag of the repository, so default to `latest`.
 */
export function splitImageReference(image: string): {
  fromImage: string;
  tag: string;
} {
  const digestSeparator = image.indexOf("@");
  if (digestSeparator !== -1) {
    return {
      fromImage: image.slice(0, digestSeparator),
      tag: image.slice(digestSeparator + 1)
    };
  }
  const lastSlash = image.lastIndexOf("/");
  const lastColon = image.lastIndexOf(":");
  if (lastColon > lastSlash) {
    return {
      fromImage: image.slice(0, lastColon),
      tag: image.slice(lastColon + 1)
    };
  }
  return { fromImage: image, tag: "latest" };
}

interface JsonRequestOptions {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
}

export interface DockerClientOptions extends DockerEndpoint {
  /** Override DOCKER_HOST resolution entirely by passing socketPath/host. */
  dockerHost?: string;
}

export class DockerClient {
  private readonly endpoint: DockerEndpoint;

  constructor(options: DockerClientOptions = {}) {
    if (options.socketPath !== undefined || options.host !== undefined) {
      this.endpoint = {
        socketPath: options.socketPath,
        host: options.host,
        port: options.port,
        protocol: options.protocol,
        username: options.username,
        sshAgent: options.sshAgent,
        ca: options.ca,
        cert: options.cert,
        key: options.key
      };
    } else {
      this.endpoint = resolveDockerEndpoint(options.dockerHost);
    }
  }

  // ---- Daemon --------------------------------------------------------------

  async ping(): Promise<void> {
    await this.requestJson({ method: "GET", path: "/_ping" });
  }

  // ---- Images ---------------------------------------------------------------

  async inspectImage(image: string): Promise<unknown> {
    const body = await this.requestJson({
      method: "GET",
      path: `/images/${encodeURIComponent(image)}/json`
    });
    return body;
  }

  /**
   * Pull an image and consume the JSON-lines progress stream to completion.
   * Rejects when the daemon reports an error either as the HTTP status or as
   * an `{"error": ...}` progress record.
   */
  async pullImage(image: string): Promise<void> {
    const { fromImage, tag } = splitImageReference(image);
    const res = await this.openResponse({
      method: "POST",
      path: buildPath("/images/create", { fromImage, tag })
    });
    const status = res.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      const body = await readBody(res);
      throw new DockerError(parseDaemonErrorMessage(body, status), status);
    }
    const lines = createInterface({ input: res, crlfDelay: Infinity });
    for await (const line of lines) {
      const text = line.trim();
      if (!text) continue;
      let record: unknown;
      try {
        record = JSON.parse(text);
      } catch {
        continue; // tolerate partial/garbled progress lines
      }
      if (
        typeof record === "object" &&
        record !== null &&
        "error" in record &&
        typeof (record as { error: unknown }).error === "string"
      ) {
        throw new DockerError((record as { error: string }).error, status);
      }
    }
  }

  // ---- Containers ------------------------------------------------------------

  /** Create a container; returns its id. */
  async createContainer(
    config: ContainerCreateOptions,
    name?: string
  ): Promise<string> {
    const body = await this.requestJson({
      method: "POST",
      path: buildPath("/containers/create", { name }),
      body: config
    });
    const id = (body as { Id?: unknown } | null)?.Id;
    if (typeof id !== "string") {
      throw new Error("Docker daemon returned no container id");
    }
    return id;
  }

  async startContainer(id: string): Promise<void> {
    await this.requestJson({
      method: "POST",
      path: `/containers/${encodeURIComponent(id)}/start`
    });
  }

  /** Wait for a container to exit; resolves with its exit status. */
  async waitContainer(id: string): Promise<ContainerWaitResult> {
    const body = await this.requestJson({
      method: "POST",
      path: `/containers/${encodeURIComponent(id)}/wait`
    });
    const statusCode = (body as { StatusCode?: unknown } | null)?.StatusCode;
    return { StatusCode: typeof statusCode === "number" ? statusCode : 0 };
  }

  async removeContainer(
    id: string,
    options?: { force?: boolean }
  ): Promise<void> {
    await this.requestJson({
      method: "DELETE",
      path: buildPath(`/containers/${encodeURIComponent(id)}`, {
        force: options?.force
      })
    });
  }

  async inspectContainer(idOrName: string): Promise<ContainerInspectInfo> {
    const body = await this.requestJson({
      method: "GET",
      path: `/containers/${encodeURIComponent(idOrName)}/json`
    });
    return body as ContainerInspectInfo;
  }

  async pauseContainer(id: string): Promise<void> {
    await this.requestJson({
      method: "POST",
      path: `/containers/${encodeURIComponent(id)}/pause`
    });
  }

  async unpauseContainer(id: string): Promise<void> {
    await this.requestJson({
      method: "POST",
      path: `/containers/${encodeURIComponent(id)}/unpause`
    });
  }

  /**
   * Attach to a container's stdio with connection hijacking.
   *
   * Sends `Upgrade: tcp`; after the daemon's 101 response the raw socket is
   * returned as a Duplex. Reads carry the container's output — multiplexed
   * with 8-byte frame headers for non-TTY containers (see demuxDockerStream);
   * writes go to the container's stdin, and `end()` closes stdin.
   */
  attachContainer(id: string, options: AttachOptions): Promise<Duplex> {
    const path = buildPath(`/containers/${encodeURIComponent(id)}/attach`, {
      stream: true,
      stdout: options.stdout ?? false,
      stderr: options.stderr ?? false,
      stdin: options.stdin ?? false
    });
    return new Promise<Duplex>((resolve, reject) => {
      const req = this.createRequest({
        method: "POST",
        path,
        headers: {
          "Content-Type": "application/vnd.docker.raw-stream",
          Connection: "Upgrade",
          Upgrade: "tcp"
        }
      });
      req.on("upgrade", (_res, socket, head) => {
        if (head.length > 0) {
          socket.unshift(head);
        }
        resolve(socket);
      });
      req.on("response", (res) => {
        // The daemon refused to hijack — surface its error message.
        const status = res.statusCode ?? 0;
        void readBody(res).then((body) => {
          reject(
            new DockerError(parseDaemonErrorMessage(body, status), status)
          );
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  // ---- Internals --------------------------------------------------------------

  private openResponse(options: JsonRequestOptions): Promise<IncomingMessage> {
    return new Promise<IncomingMessage>((resolve, reject) => {
      const payload =
        options.body === undefined ? undefined : JSON.stringify(options.body);
      const req = this.createRequest({
        method: options.method,
        path: options.path,
        headers:
          payload === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
              }
      });
      req.on("response", resolve);
      req.on("error", reject);
      req.end(payload);
    });
  }

  private createRequest(options: HttpRequestOptions): ClientRequest {
    const requestOptions: HttpRequestOptions = {
      socketPath: this.endpoint.socketPath,
      host: this.endpoint.host,
      port: this.endpoint.port,
      ...options
    };

    if (this.endpoint.protocol === "https:") {
      return httpsRequest({
        ...requestOptions,
        ca: this.endpoint.ca,
        cert: this.endpoint.cert,
        key: this.endpoint.key
      });
    }
    if (this.endpoint.protocol === "ssh:") {
      requestOptions.agent = new DockerSshAgent({
        host: this.endpoint.host,
        port: this.endpoint.port,
        username: this.endpoint.username,
        agent: this.endpoint.sshAgent
      });
    }
    return httpRequest(requestOptions);
  }

  private async requestJson(options: JsonRequestOptions): Promise<unknown> {
    const res = await this.openResponse(options);
    const status = res.statusCode ?? 0;
    const body = await readBody(res);
    if (status < 200 || status >= 300) {
      throw new DockerError(parseDaemonErrorMessage(body, status), status);
    }
    const text = body.trim();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text; // e.g. /_ping returns "OK"
    }
  }
}

async function readBody(res: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of res) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
