import { describe, expect, it } from "vitest";
import { findPythonNodePack, isPythonPackSupported } from "../src/python-packs.js";

describe("isPythonPackSupported", () => {
  const hf = findPythonNodePack("nodetool-ai/nodetool-huggingface")!;
  const mlx = findPythonNodePack("nodetool-ai/nodetool-mlx")!;
  const core = findPythonNodePack("nodetool-ai/nodetool-core")!;

  it("rejects the torch and MLX packs below macOS 14", () => {
    for (const pack of [hf, mlx]) {
      expect(isPythonPackSupported(pack, "darwin", "arm64", "12.7.4")).toBe(false);
      expect(isPythonPackSupported(pack, "darwin", "arm64", "13.6.1")).toBe(false);
      expect(isPythonPackSupported(pack, "darwin", "arm64", "14.0")).toBe(true);
      expect(isPythonPackSupported(pack, "darwin", "arm64", "26.1")).toBe(true);
    }
  });

  it("passes the macOS check when the version is unknown or off macOS", () => {
    expect(isPythonPackSupported(hf, "darwin", "arm64")).toBe(true);
    expect(isPythonPackSupported(hf, "linux", "x64", "6.8.0")).toBe(true);
  });

  it("keeps packs without a macOS floor on older macOS", () => {
    expect(isPythonPackSupported(core, "darwin", "x64", "12.0")).toBe(true);
  });

  it("still applies the platform list", () => {
    expect(isPythonPackSupported(hf, "darwin", "x64", "15.0")).toBe(false);
    expect(isPythonPackSupported(mlx, "linux", "x64")).toBe(false);
  });
});
