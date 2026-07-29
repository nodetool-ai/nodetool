import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { resolveDockerEndpoint } from "../src/endpoint.js";

describe("resolveDockerEndpoint", () => {
  it("defaults to the unix socket on linux", () => {
    expect(
      resolveDockerEndpoint(undefined, "linux", {}, "/nonexistent")
    ).toEqual({
      socketPath: "/var/run/docker.sock"
    });
  });

  it("defaults to the named pipe on windows", () => {
    expect(resolveDockerEndpoint(undefined, "win32")).toEqual({
      socketPath: "//./pipe/docker_engine"
    });
  });

  it("parses unix:// DOCKER_HOST", () => {
    expect(resolveDockerEndpoint("unix:///run/user/1000/docker.sock")).toEqual({
      socketPath: "/run/user/1000/docker.sock"
    });
  });

  it("parses single-slash unix:/ DOCKER_HOST", () => {
    expect(resolveDockerEndpoint("unix:/var/run/docker.sock")).toEqual({
      socketPath: "/var/run/docker.sock"
    });
  });

  it("parses npipe:// DOCKER_HOST", () => {
    expect(resolveDockerEndpoint("npipe:////./pipe/docker_engine")).toEqual({
      socketPath: "//./pipe/docker_engine"
    });
  });

  it("parses tcp:// DOCKER_HOST", () => {
    expect(resolveDockerEndpoint("tcp://192.168.1.5:2376")).toEqual({
      host: "192.168.1.5",
      port: 2376,
      protocol: "https:"
    });
  });

  it("defaults the tcp port to 2375", () => {
    expect(resolveDockerEndpoint("tcp://dockerhost")).toEqual({
      host: "dockerhost",
      port: 2375,
      protocol: "http:"
    });
  });

  it("parses bare host:port", () => {
    expect(resolveDockerEndpoint("localhost:2375")).toEqual({
      host: "localhost",
      port: 2375,
      protocol: "http:"
    });
  });

  it("parses ssh:// with user, port, and SSH agent", () => {
    expect(
      resolveDockerEndpoint("ssh://docker-user@example.com:2222", "linux", {
        SSH_AUTH_SOCK: "/tmp/agent.sock"
      })
    ).toEqual({
      host: "example.com",
      port: 2222,
      protocol: "ssh:",
      username: "docker-user",
      sshAgent: "/tmp/agent.sock"
    });
  });

  it("enables TLS and loads the Docker client certificates", () => {
    const certPath = mkdtempSync(join(tmpdir(), "nodetool-docker-certs-"));
    try {
      writeFileSync(join(certPath, "ca.pem"), "ca");
      writeFileSync(join(certPath, "cert.pem"), "cert");
      writeFileSync(join(certPath, "key.pem"), "key");
      expect(
        resolveDockerEndpoint("tcp://dockerhost:2375", "linux", {
          DOCKER_TLS_VERIFY: "1",
          DOCKER_CERT_PATH: certPath
        })
      ).toEqual({
        host: "dockerhost",
        port: 2375,
        protocol: "https:",
        ca: Buffer.from("ca"),
        cert: Buffer.from("cert"),
        key: Buffer.from("key")
      });
    } finally {
      rmSync(certPath, { recursive: true, force: true });
    }
  });

  it("prefers the per-user Docker Desktop socket when present", () => {
    const home = mkdtempSync(join(tmpdir(), "nodetool-docker-home-"));
    const socketPath = join(home, ".docker", "run", "docker.sock");
    try {
      mkdirSync(join(home, ".docker", "run"), { recursive: true });
      writeFileSync(socketPath, "");
      expect(resolveDockerEndpoint(undefined, "darwin", {}, home)).toEqual({
        socketPath
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
