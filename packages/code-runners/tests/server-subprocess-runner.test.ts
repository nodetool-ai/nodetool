import { describe, it, expect } from "vitest";
import { ServerSubprocessRunner } from "../src/server-subprocess-runner.js";

describe("ServerSubprocessRunner constructor", () => {
  it("stores binaryUrl", () => {
    const runner = new ServerSubprocessRunner({ binaryUrl: "/usr/bin/server" });
    expect(runner.binaryUrl).toBe("/usr/bin/server");
  });

  it("stores http binaryUrl", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "https://example.com/server"
    });
    expect(runner.binaryUrl).toBe("https://example.com/server");
  });

  it("defaults scheme to ws", () => {
    const runner = new ServerSubprocessRunner({ binaryUrl: "/bin/server" });
    expect(runner.scheme).toBe("ws");
  });

  it("accepts custom scheme http", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      scheme: "http"
    });
    expect(runner.scheme).toBe("http");
  });

  it("accepts custom scheme wss", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      scheme: "wss"
    });
    expect(runner.scheme).toBe("wss");
  });

  it("defaults hostIp to 127.0.0.1", () => {
    const runner = new ServerSubprocessRunner({ binaryUrl: "/bin/server" });
    expect(runner.hostIp).toBe("127.0.0.1");
  });

  it("accepts custom hostIp", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      hostIp: "0.0.0.0"
    });
    expect(runner.hostIp).toBe("0.0.0.0");
  });

  it("defaults readyTimeoutSeconds to 15", () => {
    const runner = new ServerSubprocessRunner({ binaryUrl: "/bin/server" });
    expect(runner.readyTimeoutSeconds).toBe(15);
  });

  it("accepts custom readyTimeoutSeconds", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      readyTimeoutSeconds: 30
    });
    expect(runner.readyTimeoutSeconds).toBe(30);
  });

  it("defaults timeoutSeconds to 0 (unlimited)", () => {
    const runner = new ServerSubprocessRunner({ binaryUrl: "/bin/server" });
    expect(runner.timeoutSeconds).toBe(0);
  });

  it("accepts custom timeoutSeconds", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      timeoutSeconds: 120
    });
    expect(runner.timeoutSeconds).toBe(120);
  });

  it("defaults portEnvVar to PORT", () => {
    const runner = new ServerSubprocessRunner({ binaryUrl: "/bin/server" });
    expect(runner.portEnvVar).toBe("PORT");
  });

  it("accepts custom portEnvVar", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      portEnvVar: "SERVER_PORT"
    });
    expect(runner.portEnvVar).toBe("SERVER_PORT");
  });

  it("accepts null portEnvVar (disables env injection)", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      portEnvVar: null
    });
    expect(runner.portEnvVar).toBeNull();
  });

  it("defaults argsTemplate to empty array", () => {
    const runner = new ServerSubprocessRunner({ binaryUrl: "/bin/server" });
    expect(runner.argsTemplate).toEqual([]);
  });

  it("stores argsTemplate", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      argsTemplate: ["--port", "{port}", "--host", "0.0.0.0"]
    });
    expect(runner.argsTemplate).toEqual([
      "--port",
      "{port}",
      "--host",
      "0.0.0.0"
    ]);
  });

  it("argsTemplate is a copy (mutations do not affect stored value)", () => {
    const template = ["--port", "{port}"];
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      argsTemplate: template
    });
    template.push("--extra");
    expect(runner.argsTemplate).toEqual(["--port", "{port}"]);
  });

  it("normalizes endpointPath by adding leading slash", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      endpointPath: "ws"
    });
    expect(runner.endpointPath).toBe("/ws");
  });

  it("preserves endpointPath that already has leading slash", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "/bin/server",
      endpointPath: "/api/socket"
    });
    expect(runner.endpointPath).toBe("/api/socket");
  });

  it("leaves endpointPath empty when not provided", () => {
    const runner = new ServerSubprocessRunner({ binaryUrl: "/bin/server" });
    expect(runner.endpointPath).toBe("");
  });

  it("defaults archiveExecutablePath to null", () => {
    const runner = new ServerSubprocessRunner({ binaryUrl: "/bin/server" });
    expect(runner.archiveExecutablePath).toBeNull();
  });

  it("accepts archiveExecutablePath", () => {
    const runner = new ServerSubprocessRunner({
      binaryUrl: "https://example.com/server.zip",
      archiveExecutablePath: "bin/server"
    });
    expect(runner.archiveExecutablePath).toBe("bin/server");
  });
});
