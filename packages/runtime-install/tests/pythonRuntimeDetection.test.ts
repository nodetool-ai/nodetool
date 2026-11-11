import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { fakeHost } from "./fake-host.js";
import * as path from "path";

vi.mock("../src/fs.js", () => ({ fileExists: vi.fn() }));

import { fileExists } from "../src/fs.js";
import { RUNTIME_PACKAGES } from "../src/packages/definitions.js";
import type { RuntimeContext } from "../src/packages/types.js";

describe("Python runtime detection", () => {
  const platforms = ["win32", "linux", "darwin"] as const;

  it.each(platforms)("detects and resolves the installed executables on %s", async (platform) => {
    const ctx: RuntimeContext = {
  host: fakeHost(),
      userDataDir: "/user", condaEnvPath: "/env", optionalNodeRoot: "/node",
      platform, arch: "x64", log: vi.fn()
    };
    const python = path.join(ctx.condaEnvPath, ...(platform === "win32" ? ["python.exe"] : ["bin", "python"]));
    const uv = path.join(ctx.condaEnvPath, ...(platform === "win32" ? ["Library", "bin", "uv.exe"] : ["bin", "uv"]));
    const files = new Set([path.join(ctx.condaEnvPath, "conda-meta"), python, uv]);
    vi.mocked(fileExists).mockImplementation(async (file) => files.has(file));

    expect(await RUNTIME_PACKAGES.python.status(ctx)).toEqual({ installed: true });
    expect(await RUNTIME_PACKAGES.python.resolve(ctx)).toEqual({
      binaries: { python, uv },
      binPaths: [...new Set([path.dirname(python), path.dirname(uv)])]
    });

    files.delete(uv);
    expect(await RUNTIME_PACKAGES.python.status(ctx)).toEqual({
      installed: true, brokenReason: "Missing binary: uv (uv)"
    });
    files.delete(python);
    expect(await RUNTIME_PACKAGES.python.status(ctx)).toEqual({ installed: false });
  });
});
