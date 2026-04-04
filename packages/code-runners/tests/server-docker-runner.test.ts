import { describe, it, expect } from "vitest";
import { ServerDockerRunner } from "../src/server-docker-runner.js";

describe("ServerDockerRunner constructor", () => {
  it("stores the image", () => {
    const runner = new ServerDockerRunner({
      image: "myimage:latest",
      containerPort: 8080
    });
    expect(runner.image).toBe("myimage:latest");
  });

  it("stores containerPort", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    expect(runner.containerPort).toBe(8080);
  });

  it("stores containerPort 3000", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 3000
    });
    expect(runner.containerPort).toBe(3000);
  });

  it("defaults scheme to ws", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    expect(runner.scheme).toBe("ws");
  });

  it("accepts custom scheme", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 3000,
      scheme: "http"
    });
    expect(runner.scheme).toBe("http");
  });

  it("accepts wss scheme", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080,
      scheme: "wss"
    });
    expect(runner.scheme).toBe("wss");
  });

  it("defaults hostIp to 127.0.0.1", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    expect(runner.hostIp).toBe("127.0.0.1");
  });

  it("accepts custom hostIp", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080,
      hostIp: "0.0.0.0"
    });
    expect(runner.hostIp).toBe("0.0.0.0");
  });

  it("defaults readyTimeoutSeconds to 15", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    expect(runner.readyTimeoutSeconds).toBe(15);
  });

  it("accepts custom readyTimeoutSeconds", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080,
      readyTimeoutSeconds: 30
    });
    expect(runner.readyTimeoutSeconds).toBe(30);
  });

  it("defaults timeoutSeconds to 60", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    expect(runner.timeoutSeconds).toBe(60);
  });

  it("accepts custom timeoutSeconds", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080,
      timeoutSeconds: 120
    });
    expect(runner.timeoutSeconds).toBe(120);
  });

  it("defaults memLimit to 256m", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    expect(runner.memLimit).toBe("256m");
  });

  it("accepts custom memLimit", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080,
      memLimit: "512m"
    });
    expect(runner.memLimit).toBe("512m");
  });

  it("defaults nanoCpus to 1_000_000_000", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    expect(runner.nanoCpus).toBe(1_000_000_000);
  });

  it("normalizes endpointPath by adding leading slash", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080,
      endpointPath: "ws"
    });
    expect(runner.endpointPath).toBe("/ws");
  });

  it("preserves endpointPath that already has a leading slash", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080,
      endpointPath: "/api/v1"
    });
    expect(runner.endpointPath).toBe("/api/v1");
  });

  it("leaves endpointPath empty when not provided", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    expect(runner.endpointPath).toBe("");
  });

  it("networkDisabled is false (networking enabled for servers)", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    expect(runner.networkDisabled).toBe(false);
  });
});

// ============================================================================
// ServerDockerRunner.buildContainerCommand
// ============================================================================

describe("ServerDockerRunner.buildContainerCommand", () => {
  it("wraps user code in bash -lc", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    const cmd = runner.buildContainerCommand("python server.py", {});
    expect(cmd).toEqual(["bash", "-lc", "python server.py"]);
  });

  it("uses sleep infinity when user code is empty", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    const cmd = runner.buildContainerCommand("", {});
    expect(cmd).toEqual(["bash", "-lc", "sleep infinity"]);
  });

  it("uses sleep infinity when user code is only whitespace", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    const cmd = runner.buildContainerCommand("   \t  ", {});
    expect(cmd).toEqual(["bash", "-lc", "sleep infinity"]);
  });

  it("trims whitespace from user code", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    const cmd = runner.buildContainerCommand("  node server.js  ", {});
    expect(cmd).toEqual(["bash", "-lc", "node server.js"]);
  });

  it("ignores envLocals", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    const cmd = runner.buildContainerCommand("node app.js", {
      PORT: 3000,
      DEBUG: true
    });
    expect(cmd).toEqual(["bash", "-lc", "node app.js"]);
  });

  it("returns an array of length 3", () => {
    const runner = new ServerDockerRunner({
      image: "test:latest",
      containerPort: 8080
    });
    const cmd = runner.buildContainerCommand("echo hi", {});
    expect(cmd).toHaveLength(3);
    expect(cmd[0]).toBe("bash");
    expect(cmd[1]).toBe("-lc");
  });
});
