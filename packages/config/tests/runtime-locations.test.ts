import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyRuntimeEnv, runtimeBinPath, runtimeLocations, type NodetoolHost } from "../src/runtime-locations.js";

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) { rmSync(dir, { recursive: true, force: true }); } });

describe("runtime locations", () => {
  it.each(["darwin", "linux", "win32"] as const)("resolves every host on %s without moving existing installs", (platform) => {
    const home = platform === "win32" ? "C:\\Users\\test" : "/home/test";
    const paths = platform === "win32" ? win32 : posix;
    const appdata = paths.join(home, "appdata");
    const data = platform === "win32" ? paths.join(appdata, "nodetool") : "/xdg/nodetool";
    for (const host of ["cli", "npx", "source", "desktop", "docker"] satisfies NodetoolHost[]) {
      const env = { NODETOOL_HOST: host, HOME: home, APPDATA: appdata, XDG_DATA_HOME: "/xdg" };
      const locations = runtimeLocations(env, { platform, desktopUserData: paths.join(home, "desktop"), settings: {} });
      expect(locations.host).toBe(host);
      if (host === "docker") {
        expect(locations).toEqual({ host, optionalNodeRoot: null, uvTools: null, sdCpp: null, micromambaRoot: null, condaEnv: null });
        continue;
      }
      const owned = host === "desktop" ? paths.join(home, "desktop") : data;
      expect(locations.optionalNodeRoot).toBe(paths.join(owned, "optional-node"));
      expect(locations.condaEnv).toBe(paths.join(data, "conda_env"));
      expect(locations.uvTools?.bin).toBe(paths.join(owned, "uv-tools", "bin"));
      expect(locations.sdCpp).toBe(paths.join(owned, "sd-cpp"));
      expect(runtimeBinPath(locations, platform)).toContain(paths.join(data, "conda_env", platform === "win32" ? "Scripts" : "bin"));
      expect(runtimeLocations(env, { platform, desktopUserData: owned, settings: { CONDA_ENV: paths.join(home, "existing") } }).condaEnv)
        .toBe(paths.join(home, "existing"));
      expect(runtimeLocations({ ...env, NODETOOL_CONDA_ENV: paths.join(home, "override") }, { platform, desktopUserData: owned, settings: { CONDA_ENV: "ignored" } }).condaEnv)
        .toBe(paths.join(home, "override"));
    }
  });

  it("reads the recorded desktop conda environment on CLI hosts", () => {
    const home = mkdtempSync(join(tmpdir(), "runtime-settings-"));
    directories.push(home);
    const dir = join(home, ".config", "nodetool");
    mkdirSync(dir, { recursive: true });
    const recorded = join(home, "custom environment");
    writeFileSync(join(dir, "settings.yaml"), `CONDA_ENV: '${recorded}'\nOTHER_SETTING: true\n`);
    expect(runtimeLocations({ HOME: home, NODETOOL_HOST: "cli" }, { platform: "darwin" }).condaEnv).toBe(recorded);
  });

  it.each(["null", "true", "- CONDA_ENV", "CONDA_ENV: 123", "CONDA_ENV: '   '"])("ignores settings without a usable conda path: %s", (settings) => {
    const home = mkdtempSync(join(tmpdir(), "runtime-settings-"));
    directories.push(home);
    const dir = join(home, ".config", "nodetool");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "settings.yaml"), settings);
    expect(runtimeLocations({ HOME: home, NODETOOL_HOST: "cli" }, { platform: "linux" }).condaEnv)
      .toBe(join(home, ".local", "share", "nodetool", "conda_env"));
  });

  it("keeps desktop Windows and sudo Linux defaults separate from per-user CLI defaults", () => {
    const env = { HOME: "C:\\Users\\test", APPDATA: "C:\\Users\\test\\AppData", ALLUSERSPROFILE: "C:\\ProgramData" };
    expect(runtimeLocations({ ...env, NODETOOL_HOST: "desktop" }, { platform: "win32", desktopUserData: "C:\\desktop", settings: {} }).condaEnv)
      .toBe("C:\\ProgramData\\nodetool\\conda_env");
    expect(runtimeLocations({ ...env, NODETOOL_HOST: "cli" }, { platform: "win32", settings: {} }).condaEnv)
      .toBe("C:\\Users\\test\\AppData\\nodetool\\conda_env");
    expect(runtimeLocations({ HOME: "/home/test", NODETOOL_HOST: "desktop", SUDO_USER: "test" }, { platform: "linux", desktopUserData: "/desktop", settings: {} }).condaEnv)
      .toBe("/opt/nodetool/conda_env");
  });

  it("requires Electron to supply its userData directory", () => {
    expect(() => runtimeLocations({ NODETOOL_HOST: "desktop" })).toThrow("must supply its userData");
    expect(() => runtimeLocations({ NODETOOL_HOST: "unknown" })).toThrow("Unknown NODETOOL_HOST");
  });

  it("sets absent paths before installation and preserves explicit overrides idempotently", () => {
    const env: NodeJS.ProcessEnv = { HOME: "/home/test", PATH: "/usr/bin", NODETOOL_HOST: "cli", NODETOOL_OPTIONAL_NODE_MODULES: "/custom/modules", UV_TOOL_DIR: "/custom/tools" };
    applyRuntimeEnv(env, { platform: "linux", settings: {} });
    expect(env["NODETOOL_OPTIONAL_NODE_MODULES"]).toBe("/custom/modules");
    expect(env["UV_TOOL_DIR"]).toBe("/custom/tools");
    expect(env["PATH"]).toContain("/home/test/.local/share/nodetool/conda_env/bin");
    expect(env["PATH"]?.endsWith(":/usr/bin")).toBe(true);
    const once = { ...env };
    applyRuntimeEnv(env, { platform: "linux", settings: {} });
    expect(env).toEqual(once);
    const fresh: NodeJS.ProcessEnv = { HOME: "/home/test" };
    applyRuntimeEnv(fresh, { platform: "linux", settings: {} });
    expect(fresh["NODETOOL_OPTIONAL_NODE_MODULES"]).toBe("/home/test/.local/share/nodetool/optional-node/node_modules");
  });

  it("leaves an image-provided Docker environment unchanged", () => {
    const env = { NODETOOL_HOST: "docker", NODETOOL_OPTIONAL_NODE_MODULES: "/image/node_modules", PATH: "/image/bin" };
    applyRuntimeEnv(env);
    expect(env).toEqual({ NODETOOL_HOST: "docker", NODETOOL_OPTIONAL_NODE_MODULES: "/image/node_modules", PATH: "/image/bin" });
  });

  it("uses Docker host locations for the production image's declared host", () => {
    const dockerfile = readFileSync(new URL("../../../Dockerfile", import.meta.url), "utf8");
    const runtimeStage = dockerfile.split(/FROM[^\n]+ AS runtime\n/)[1];
    expect(runtimeStage).toBeDefined();
    const declarations = [...(runtimeStage ?? "").replace(/\\\r?\n/g, " ").matchAll(/^ENV[^\n]*/gm)];
    expect(declarations.length).toBeGreaterThan(0);
    const declaredHost = declarations.map(([entry]) => entry).join(" ").match(/\bNODETOOL_HOST=([^\s\\]+)/)?.[1];
    const env = { NODETOOL_HOST: declaredHost, PATH: "/image/bin", NODETOOL_OPTIONAL_NODE_MODULES: "/image/node_modules" };
    expect(runtimeLocations(env)).toEqual({ host: "docker", optionalNodeRoot: null, uvTools: null, sdCpp: null, micromambaRoot: null, condaEnv: null });
    const original = { ...env };
    applyRuntimeEnv(env);
    expect(env).toEqual(original);
  });
});
