/**
 * Tests for src/index.ts barrel exports
 *
 * Verifies all public exports are accessible from the package entry point.
 */
import { describe, it, expect } from "vitest";

import {
  StreamRunnerBase,
  ContainerFailureError,
  DockerHijackMultiplexDemuxer,
  PythonDockerRunner,
  BashDockerRunner,
  JavaScriptDockerRunner,
  RubyDockerRunner,
  LuaRunner,
  LuaSubprocessRunner,
  CommandDockerRunner,
  ServerDockerRunner,
  ServerSubprocessRunner
} from "../src/index.js";

describe("index.ts barrel exports", () => {
  it("exports StreamRunnerBase", () => {
    expect(StreamRunnerBase).toBeDefined();
    expect(typeof StreamRunnerBase).toBe("function");
  });

  it("exports ContainerFailureError", () => {
    expect(ContainerFailureError).toBeDefined();
    const err = new ContainerFailureError("test", 1);
    expect(err).toBeInstanceOf(Error);
    expect(err.exitCode).toBe(1);
    expect(err.name).toBe("ContainerFailureError");
  });

  it("exports DockerHijackMultiplexDemuxer", () => {
    expect(DockerHijackMultiplexDemuxer).toBeDefined();
    expect(typeof DockerHijackMultiplexDemuxer).toBe("function");
  });

  it("exports PythonDockerRunner", () => {
    expect(PythonDockerRunner).toBeDefined();
    expect(PythonDockerRunner.prototype).toBeInstanceOf(StreamRunnerBase);
  });

  it("exports BashDockerRunner", () => {
    expect(BashDockerRunner).toBeDefined();
    expect(BashDockerRunner.prototype).toBeInstanceOf(StreamRunnerBase);
  });

  it("exports JavaScriptDockerRunner", () => {
    expect(JavaScriptDockerRunner).toBeDefined();
    expect(JavaScriptDockerRunner.prototype).toBeInstanceOf(StreamRunnerBase);
  });

  it("exports RubyDockerRunner", () => {
    expect(RubyDockerRunner).toBeDefined();
    expect(RubyDockerRunner.prototype).toBeInstanceOf(StreamRunnerBase);
  });

  it("exports LuaRunner", () => {
    expect(LuaRunner).toBeDefined();
    expect(LuaRunner.prototype).toBeInstanceOf(StreamRunnerBase);
  });

  it("exports LuaSubprocessRunner", () => {
    expect(LuaSubprocessRunner).toBeDefined();
    expect(LuaSubprocessRunner.prototype).toBeInstanceOf(LuaRunner);
  });

  it("exports CommandDockerRunner", () => {
    expect(CommandDockerRunner).toBeDefined();
    expect(CommandDockerRunner.prototype).toBeInstanceOf(StreamRunnerBase);
  });

  it("exports ServerDockerRunner", () => {
    expect(ServerDockerRunner).toBeDefined();
    expect(typeof ServerDockerRunner).toBe("function");
  });

  it("exports ServerSubprocessRunner", () => {
    expect(ServerSubprocessRunner).toBeDefined();
    expect(typeof ServerSubprocessRunner).toBe("function");
  });
});
