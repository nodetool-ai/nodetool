import { describe, it, expect } from "vitest";
import { resolveDockerEndpoint } from "../src/endpoint.js";

describe("resolveDockerEndpoint", () => {
  it("defaults to the unix socket on linux", () => {
    expect(resolveDockerEndpoint(undefined, "linux")).toEqual({
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

  it("parses npipe:// DOCKER_HOST", () => {
    expect(resolveDockerEndpoint("npipe:////./pipe/docker_engine")).toEqual({
      socketPath: "//./pipe/docker_engine"
    });
  });

  it("parses tcp:// DOCKER_HOST", () => {
    expect(resolveDockerEndpoint("tcp://192.168.1.5:2376")).toEqual({
      host: "192.168.1.5",
      port: 2376
    });
  });

  it("defaults the tcp port to 2375", () => {
    expect(resolveDockerEndpoint("tcp://dockerhost")).toEqual({
      host: "dockerhost",
      port: 2375
    });
  });

  it("parses bare host:port", () => {
    expect(resolveDockerEndpoint("localhost:2375")).toEqual({
      host: "localhost",
      port: 2375
    });
  });

  it("rejects unsupported schemes", () => {
    expect(() => resolveDockerEndpoint("ssh://host")).toThrow(
      /Unsupported DOCKER_HOST/
    );
  });
});
