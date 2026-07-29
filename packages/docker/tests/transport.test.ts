import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestSpies = vi.hoisted(() => ({
  http: vi.fn(),
  https: vi.fn()
}));

vi.mock("node:http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:http")>()),
  request: requestSpies.http
}));
vi.mock("node:https", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:https")>()),
  request: requestSpies.https
}));

import { DockerClient } from "../src/client.js";
import { DockerSshAgent } from "../src/ssh-agent.js";

function fakeRequest(options: RequestOptions): ClientRequest {
  const request = new EventEmitter() as ClientRequest;
  request.end = (): ClientRequest => {
    queueMicrotask(() => {
      if (options.headers && "Upgrade" in options.headers) {
        request.emit("upgrade", {}, new PassThrough(), Buffer.alloc(0));
        return;
      }
      const response = new PassThrough() as IncomingMessage;
      response.statusCode = 200;
      request.emit("response", response);
      response.end("OK");
    });
    return request;
  };
  return request;
}

beforeEach(() => {
  requestSpies.http.mockReset();
  requestSpies.https.mockReset();
  requestSpies.http.mockImplementation(fakeRequest);
  requestSpies.https.mockImplementation(fakeRequest);
});

describe("DockerClient transports", () => {
  it("uses HTTPS with Docker TLS credentials for API requests and attach", async () => {
    const client = new DockerClient({
      host: "docker.example.com",
      port: 2376,
      protocol: "https:",
      ca: Buffer.from("ca"),
      cert: Buffer.from("cert"),
      key: Buffer.from("key")
    });

    await client.ping();
    await client.attachContainer("abc", { stdin: true });

    expect(requestSpies.http).not.toHaveBeenCalled();
    expect(requestSpies.https).toHaveBeenCalledTimes(2);
    expect(requestSpies.https).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        host: "docker.example.com",
        port: 2376,
        ca: Buffer.from("ca"),
        cert: Buffer.from("cert"),
        key: Buffer.from("key")
      })
    );
  });

  it("uses an SSH dial-stdio agent for API requests and attach", async () => {
    const client = new DockerClient({
      host: "docker.example.com",
      port: 22,
      protocol: "ssh:",
      username: "docker-user",
      sshAgent: "/tmp/agent.sock"
    });

    await client.ping();
    await client.attachContainer("abc", { stdin: true });

    expect(requestSpies.https).not.toHaveBeenCalled();
    expect(requestSpies.http).toHaveBeenCalledTimes(2);
    for (const [options] of requestSpies.http.mock.calls) {
      expect(options.agent).toBeInstanceOf(DockerSshAgent);
    }
  });
});
