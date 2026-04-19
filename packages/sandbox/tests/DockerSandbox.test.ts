import { describe, it, expect } from "vitest";
import {
  parseMemLimit,
  DEFAULT_SANDBOX_IMAGE,
  TOOL_SERVER_PORT,
  VNC_WS_PORT
} from "../src/DockerSandbox.js";

describe("parseMemLimit", () => {
  it("parses megabytes", () => {
    expect(parseMemLimit("512m")).toBe(512 * 1024 * 1024);
  });

  it("parses gigabytes", () => {
    expect(parseMemLimit("2g")).toBe(2 * 1024 * 1024 * 1024);
  });

  it("parses kilobytes", () => {
    expect(parseMemLimit("1024k")).toBe(1024 * 1024);
  });

  it("falls back to 2GiB for garbage input", () => {
    expect(parseMemLimit("oops")).toBe(2 * 1024 * 1024 * 1024);
  });

  it("accepts an uppercase M", () => {
    expect(parseMemLimit("256M")).toBe(256 * 1024 * 1024);
  });

  it("accepts a bare byte count", () => {
    expect(parseMemLimit("1024")).toBe(1024);
  });
});

describe("DockerSandbox constants", () => {
  it("exposes the expected default image tag", () => {
    expect(DEFAULT_SANDBOX_IMAGE).toBe("nodetool/sandbox-agent:latest");
  });

  it("uses port 7788 for the tool server", () => {
    expect(TOOL_SERVER_PORT).toBe(7788);
  });

  it("uses port 6080 for the VNC websocket", () => {
    expect(VNC_WS_PORT).toBe(6080);
  });
});
