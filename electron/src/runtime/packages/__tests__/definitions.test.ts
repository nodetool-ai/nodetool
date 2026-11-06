import * as path from "path";

jest.mock("../../../utils", () => ({ fileExists: jest.fn() }));

import { fileExists } from "../../../utils";
import { RUNTIME_PACKAGES } from "../definitions";
import type { RuntimeContext } from "../types";

describe("Python runtime detection", () => {
  const platforms = ["win32", "linux", "darwin"] as const;

  it.each(platforms)("detects and resolves the installed executables on %s", async (platform) => {
    const ctx: RuntimeContext = {
      userDataDir: "/user", condaEnvPath: "/env", optionalNodeRoot: "/node",
      platform, arch: "x64", log: jest.fn()
    };
    const python = path.join(ctx.condaEnvPath, ...(platform === "win32" ? ["python.exe"] : ["bin", "python"]));
    const uv = path.join(ctx.condaEnvPath, ...(platform === "win32" ? ["Library", "bin", "uv.exe"] : ["bin", "uv"]));
    const files = new Set([path.join(ctx.condaEnvPath, "conda-meta"), python, uv]);
    jest.mocked(fileExists).mockImplementation(async (file) => files.has(file));

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
