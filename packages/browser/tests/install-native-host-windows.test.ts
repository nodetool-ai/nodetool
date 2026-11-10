import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EXTENSION_ID, installNativeHost, isNativeHostInstalled } from "../src/extension/install-native-host.js";
import { NATIVE_HOST_NAME } from "../src/extension/bridge-paths.js";

// Never write to the machine's real browser registrations in this suite.
vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(),
  execFileSync: vi.fn()
}));

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const registry = new Map<string, string>();
let home: string;
let localAppData: string;
let hostScript: string;
let nodePath: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "nt-windows-host-"));
  localAppData = path.join(home, "Local AppData");
  hostScript = path.join(home, "host %TEMP% ! & ü.js");
  nodePath = path.join(home, "Node tools", "node.exe");
  mkdirSync(path.dirname(nodePath), { recursive: true });
  writeFileSync(nodePath, "fixture");
  writeFileSync(hostScript, "export {};");
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  vi.stubEnv("LOCALAPPDATA", localAppData);
  registry.clear();
  vi.mocked(execFileSync).mockImplementation((_file, args) => {
    const argv = args as string[];
    const key = `${argv[1]}:${argv.at(-1)}`;
    if (argv[0] === "add") {
      registry.set(key, argv[argv.indexOf("/d") + 1]);
      return "The operation completed successfully.";
    }
    const expected = argv[argv.indexOf("/f") + 1];
    return registry.get(key) === expected ? "(Default) REG_SZ matching path" : "0 matches";
  });
});

afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  rmSync(home, { recursive: true, force: true });
});

describe("Windows native host registration", () => {
  const profile = (name: string) => mkdirSync(path.join(localAppData, name, "User Data"), { recursive: true });
  const install = () => installNativeHost({ home, hostScript, nodePath });

  it("registers installed browsers for the current user in both registry views", () => {
    for (const name of ["Google/Chrome", "Chromium", "BraveSoftware/Brave-Browser", "Microsoft/Edge"]) {
      profile(name);
    }
    expect(isNativeHostInstalled(home)).toBe(false);
    const result = install();
    expect(result.manifests).toHaveLength(4);
    expect(registry.size).toBe(8);
    for (const [key, manifestPath] of registry) {
      expect(key).toMatch(/^HKCU\\Software\\/);
      expect(key).toContain(`NativeMessagingHosts\\${NATIVE_HOST_NAME}`);
      expect(key).toMatch(/\/reg:(32|64)$/);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(manifest.path).toBe(result.wrapperPath);
      expect(manifest.allowed_origins).toEqual([`chrome-extension://${EXTENSION_ID}/`]);
    }
    expect(isNativeHostInstalled(home)).toBe(true);
    install();
    expect(registry.size).toBe(8);
    expect(execFileSync).toHaveBeenCalledWith(expect.stringMatching(/reg\.exe$/), expect.any(Array), expect.objectContaining({ windowsHide: true }));
  });

  it("writes a quiet launcher with quoted paths and disabled variable expansion", () => {
    profile("Google/Chrome");
    const { wrapperPath } = install();
    expect(wrapperPath).toMatch(/native-host\.cmd$/);
    const launcher = readFileSync(wrapperPath, "utf8");
    expect(launcher).toContain("@echo off\r\nsetlocal DisableDelayedExpansion\r\nchcp 65001 >nul\r\n");
    expect(launcher).toContain(`"${nodePath}" "${hostScript.replaceAll("%", "%%")}"`);
    expect(launcher).not.toContain("%*");
  });

  it.skipIf(platform.value !== "win32")("preserves binary stdio through the Windows launcher", () => {
    profile("Google/Chrome");
    writeFileSync(hostScript, "process.stdin.pipe(process.stdout);");
    const { wrapperPath } = installNativeHost({ home, hostScript, nodePath: process.execPath });
    const input = Buffer.from([0x04, 0, 0, 0, 0x0a, 0x0d, 0, 0xff]);
    const result = spawnSync(process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe", [
      "/d", "/s", "/c", `""${wrapperPath}""`
    ], { input, windowsHide: true, windowsVerbatimArguments: true, timeout: 10000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr?.toString()).toBe(0);
    expect(result.stdout).toEqual(input);
  });

  it.each(["registry", "wrapper", "node", "script"])("reports a broken %s as not installed", (missing) => {
    profile("Google/Chrome");
    const { wrapperPath } = install();
    if (missing === "registry") {
      registry.clear();
    } else {
      rmSync(missing === "wrapper" ? wrapperPath : missing === "node" ? nodePath : hostScript);
    }
    expect(isNativeHostInstalled(home)).toBe(false);
  });

  it("rejects a stale 32-bit registration even if the 64-bit entry is current", () => {
    profile("Google/Chrome");
    install();
    for (const key of registry.keys()) {
      if (key.endsWith("/reg:32")) {
        registry.set(key, path.join(home, "old-manifest.json"));
      }
    }
    expect(isNativeHostInstalled(home)).toBe(false);
  });

  it("surfaces registry write failures instead of claiming installation succeeded", () => {
    profile("Google/Chrome");
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error("Registry write denied"); });
    expect(install).toThrow("Registry write denied");
    expect(isNativeHostInstalled(home)).toBe(false);
  });

  it("does not register a host when no supported browser profile exists", () => {
    expect(install).toThrow(/No supported browser/);
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
