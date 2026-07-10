/**
 * DockerClient tests against a fake daemon served over a real unix socket —
 * the same transport the production client uses, no Docker required.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DockerClient,
  DockerError,
  buildPath,
  parseDaemonErrorMessage,
  splitImageReference
} from "../src/client.js";

interface RecordedRequest {
  method: string;
  url: string;
  body: string;
}

let server: Server;
let socketDir: string;
let socketPath: string;
let client: DockerClient;
const requests: RecordedRequest[] = [];

beforeAll(async () => {
  socketDir = mkdtempSync(join(tmpdir(), "nodetool-docker-test-"));
  socketPath = join(socketDir, "docker.sock");

  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({ method: req.method ?? "", url: req.url ?? "", body });
      route(req.method ?? "", req.url ?? "", res);
    });
  });

  server.on("upgrade", (req, socket) => {
    requests.push({ method: req.method ?? "", url: req.url ?? "", body: "" });
    socket.write(
      "HTTP/1.1 101 UPGRADED\r\n" +
        "Content-Type: application/vnd.docker.raw-stream\r\n" +
        "Connection: Upgrade\r\nUpgrade: tcp\r\n\r\n"
    );
    // One stdout frame, then wait for stdin and echo it back on stderr.
    const header = Buffer.alloc(8);
    header[0] = 1;
    header.writeUInt32BE(6, 4);
    socket.write(Buffer.concat([header, Buffer.from("hello\n")]));
    socket.on("data", (data: Buffer) => {
      const echoHeader = Buffer.alloc(8);
      echoHeader[0] = 2;
      echoHeader.writeUInt32BE(data.length, 4);
      socket.write(Buffer.concat([echoHeader, data]));
      socket.end();
    });
  });

  function route(
    method: string,
    url: string,
    res: import("node:http").ServerResponse
  ): void {
    if (method === "GET" && url === "/_ping") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }
    if (method === "GET" && url.startsWith("/images/present%2Fimage/json")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ Id: "sha256:abc" }));
      return;
    }
    if (method === "GET" && url.startsWith("/images/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "No such image: missing:latest" }));
      return;
    }
    if (method === "POST" && url.startsWith("/images/create")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (url.includes("fromImage=broken")) {
        res.write('{"status":"Pulling"}\n');
        res.end('{"error":"manifest unknown"}\n');
      } else {
        res.write('{"status":"Pulling from library/bash"}\n');
        res.write('{"status":"Downloading","progressDetail":{"current":1}}\n');
        res.end('{"status":"Pull complete"}\n');
      }
      return;
    }
    if (method === "POST" && url.startsWith("/containers/create")) {
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ Id: "abc123", Warnings: [] }));
      return;
    }
    if (method === "POST" && url === "/containers/abc123/start") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (method === "POST" && url === "/containers/abc123/wait") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ StatusCode: 137 }));
      return;
    }
    if (method === "DELETE" && url.startsWith("/containers/abc123")) {
      res.writeHead(204);
      res.end();
      return;
    }
    if (method === "GET" && url === "/containers/abc123/json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          Id: "abc123",
          State: { Status: "running", Running: true },
          NetworkSettings: {
            Ports: { "7788/tcp": [{ HostIp: "127.0.0.1", HostPort: "32771" }] }
          }
        })
      );
      return;
    }
    if (method === "POST" && url === "/containers/abc123/pause") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (method === "POST" && url === "/containers/abc123/unpause") {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: `No such container: ${url}` }));
  }

  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  client = new DockerClient({ socketPath });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(socketDir, { recursive: true, force: true });
});

describe("DockerClient over a unix socket", () => {
  it("pings the daemon", async () => {
    await expect(client.ping()).resolves.toBeUndefined();
  });

  it("inspects an image (URL-encodes the reference)", async () => {
    const info = await client.inspectImage("present/image");
    expect(info).toEqual({ Id: "sha256:abc" });
    expect(requests.at(-1)?.url).toBe("/images/present%2Fimage/json");
  });

  it("maps a 404 to a DockerError carrying the daemon message", async () => {
    const err = await client.inspectImage("missing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DockerError);
    expect((err as DockerError).statusCode).toBe(404);
    expect((err as DockerError).message).toBe(
      "No such image: missing:latest"
    );
  });

  it("consumes a pull progress stream to completion", async () => {
    await expect(client.pullImage("bash:5.2")).resolves.toBeUndefined();
    expect(requests.at(-1)?.url).toBe(
      "/images/create?fromImage=bash&tag=5.2"
    );
  });

  it("rejects a pull whose progress stream reports an error", async () => {
    const err = await client.pullImage("broken").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DockerError);
    expect((err as DockerError).message).toBe("manifest unknown");
  });

  it("creates a container with a name query and JSON body", async () => {
    const id = await client.createContainer(
      { Image: "bash:5.2", Cmd: ["true"] },
      "my sandbox"
    );
    expect(id).toBe("abc123");
    const last = requests.at(-1);
    expect(last?.url).toBe("/containers/create?name=my+sandbox");
    expect(JSON.parse(last?.body ?? "{}")).toEqual({
      Image: "bash:5.2",
      Cmd: ["true"]
    });
  });

  it("starts, waits, inspects, pauses, unpauses, removes", async () => {
    await client.startContainer("abc123");
    expect((await client.waitContainer("abc123")).StatusCode).toBe(137);

    const info = await client.inspectContainer("abc123");
    expect(info.State?.Status).toBe("running");
    expect(info.NetworkSettings?.Ports?.["7788/tcp"]?.[0]?.HostPort).toBe(
      "32771"
    );

    await client.pauseContainer("abc123");
    await client.unpauseContainer("abc123");

    await client.removeContainer("abc123", { force: true });
    expect(requests.at(-1)?.url).toBe("/containers/abc123?force=1");
  });

  it("attaches via connection hijack and round-trips stdio", async () => {
    const socket = await client.attachContainer("abc123", {
      stdout: true,
      stderr: true,
      stdin: true
    });
    expect(requests.at(-1)?.url).toBe(
      "/containers/abc123/attach?stream=1&stdout=1&stderr=1&stdin=1"
    );

    const received: Buffer[] = [];
    const done = new Promise<void>((resolve) => {
      socket.on("data", (chunk: Buffer) => received.push(chunk));
      socket.on("end", resolve);
      socket.on("close", resolve);
    });
    socket.write("stdin!");
    await done;

    const all = Buffer.concat(received);
    // First frame: stdout "hello\n"; second frame: stderr echo of "stdin!".
    expect(all[0]).toBe(1);
    expect(all.subarray(8, 14).toString()).toBe("hello\n");
    const second = all.subarray(14);
    expect(second[0]).toBe(2);
    expect(second.subarray(8).toString()).toBe("stdin!");
  });
});

describe("buildPath", () => {
  it("returns the bare path without query values", () => {
    expect(buildPath("/containers/create")).toBe("/containers/create");
    expect(buildPath("/containers/create", { name: undefined })).toBe(
      "/containers/create"
    );
  });

  it("encodes string, number, and boolean values", () => {
    expect(
      buildPath("/containers/x/attach", {
        stream: true,
        stdin: false,
        n: 5,
        name: "a b/c"
      })
    ).toBe("/containers/x/attach?stream=1&stdin=0&n=5&name=a+b%2Fc");
  });
});

describe("splitImageReference", () => {
  it("splits repo:tag", () => {
    expect(splitImageReference("bash:5.2")).toEqual({
      fromImage: "bash",
      tag: "5.2"
    });
  });

  it("defaults the tag to latest", () => {
    expect(splitImageReference("nodetool/sandbox-agent")).toEqual({
      fromImage: "nodetool/sandbox-agent",
      tag: "latest"
    });
  });

  it("does not treat a registry port as a tag", () => {
    expect(splitImageReference("localhost:5000/repo")).toEqual({
      fromImage: "localhost:5000/repo",
      tag: "latest"
    });
    expect(splitImageReference("localhost:5000/repo:v1")).toEqual({
      fromImage: "localhost:5000/repo",
      tag: "v1"
    });
  });
});

describe("parseDaemonErrorMessage", () => {
  it("extracts the JSON message field", () => {
    expect(parseDaemonErrorMessage('{"message":"conflict"}', 409)).toBe(
      "conflict"
    );
  });

  it("falls back to the raw body for non-JSON responses", () => {
    expect(parseDaemonErrorMessage("plain text error", 500)).toBe(
      "plain text error"
    );
  });

  it("falls back to the status code for empty bodies", () => {
    expect(parseDaemonErrorMessage("", 502)).toBe(
      "Docker daemon returned HTTP 502"
    );
  });
});
