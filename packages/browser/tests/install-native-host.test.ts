/**
 * Registering the native host in a throwaway home directory: the manifest the
 * browser reads, and the check the app uses to show whether it is registered.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  EXTENSION_ID,
  installNativeHost,
  isNativeHostInstalled
} from "../src/extension/install-native-host.js";
import { NATIVE_HOST_NAME } from "../src/extension/bridge-paths.js";

/** A Chrome profile root on each platform the installer supports. */
const CHROME_ROOT: Record<string, string> = {
  darwin: "Library/Application Support/Google/Chrome",
  linux: ".config/google-chrome"
};

let home: string;
let hostScript: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "nt-native-host-"));
  hostScript = path.join(home, "native-host-bin.js");
  writeFileSync(hostScript, "export {};");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe.skipIf(!CHROME_ROOT[process.platform])("native host registration", () => {
  const chromeDir = (): string => path.join(home, CHROME_ROOT[process.platform]!);

  it("is not registered before install", () => {
    mkdirSync(chromeDir(), { recursive: true });
    expect(isNativeHostInstalled(home)).toBe(false);
  });

  it("writes a manifest that only the NodeTool extension may use", () => {
    mkdirSync(chromeDir(), { recursive: true });
    const result = installNativeHost({ home, hostScript, nodePath: "/usr/bin/node" });

    expect(result.manifests).toEqual([
      path.join(chromeDir(), "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`)
    ]);
    const manifest = JSON.parse(readFileSync(result.manifests[0]!, "utf8"));
    expect(manifest.path).toBe(result.wrapperPath);
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${EXTENSION_ID}/`]);
    expect(readFileSync(result.wrapperPath, "utf8")).toContain(`exec "/usr/bin/node" "${hostScript}"`);
    expect(isNativeHostInstalled(home)).toBe(true);
  });

  it("treats a manifest whose wrapper is gone as not registered", () => {
    mkdirSync(chromeDir(), { recursive: true });
    const { wrapperPath } = installNativeHost({ home, hostScript, nodePath: "/usr/bin/node" });
    rmSync(wrapperPath);
    expect(isNativeHostInstalled(home)).toBe(false);
  });

  it("fails when no supported browser is installed", () => {
    expect(() => installNativeHost({ home, hostScript })).toThrow(/No supported browser/);
    expect(isNativeHostInstalled(home)).toBe(false);
  });
});
