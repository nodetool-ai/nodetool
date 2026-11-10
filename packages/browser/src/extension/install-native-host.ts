/**
 * Registers the NodeTool native messaging host with the user's browsers.
 *
 * Chrome finds a native host through a JSON manifest, registered in HKCU on
 * Windows or a browser profile on macOS/Linux. The manifest pins the Node
 * binary and the host entry so Chrome does not depend on PATH.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { NATIVE_HOST_NAME } from "./bridge-paths.js";

/** The extension's ID, fixed by the `key` field in `chrome-extension/manifest.json`. */
export const EXTENSION_ID = "acnankgjnlmpbjcpebmelmognbnnhigb";

const BROWSER_DATA_DIRS = {
  darwin: [
    "Library/Application Support/Google/Chrome",
    "Library/Application Support/Chromium",
    "Library/Application Support/BraveSoftware/Brave-Browser",
    "Library/Application Support/Microsoft Edge",
    "Library/Application Support/Arc/User Data"
  ],
  linux: [
    ".config/google-chrome",
    ".config/chromium",
    ".config/BraveSoftware/Brave-Browser",
    ".config/microsoft-edge"
  ]
} satisfies Record<"darwin" | "linux", string[]>;

const WINDOWS_BROWSERS = [
  { profile: "Google/Chrome/User Data", key: "Google\\Chrome" },
  { profile: "Chromium/User Data", key: "Chromium" },
  { profile: "BraveSoftware/Brave-Browser/User Data", key: "BraveSoftware\\Brave-Browser" },
  { profile: "Microsoft/Edge/User Data", key: "Microsoft\\Edge" }
];
const REGISTRY_VIEWS = ["/reg:32", "/reg:64"];

function windowsBrowsers(home: string) {
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  return WINDOWS_BROWSERS
    .map(({ profile, key }) => ({
      directory: path.join(localAppData, profile, "NativeMessagingHosts"),
      key: `HKCU\\Software\\${key}\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`
    }))
    .filter(({ directory }) => fs.existsSync(path.dirname(directory)));
}

function runRegistry(args: string[]): string {
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe");
  return execFileSync(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function windowsBatchPath(value: string): string {
  if (!path.isAbsolute(value) || /["\r\n\0]/.test(value)) {
    throw new Error("The native host requires absolute executable and script paths without quotes or line breaks");
  }
  return `"${value.replaceAll("%", "%%")}"`;
}

export interface InstallNativeHostOptions {
  /** Node binary the wrapper runs. Defaults to the current one. */
  nodePath?: string;
  /** Host entry script. Defaults to the built `native-host-bin.js` beside this module. */
  hostScript?: string;
  /** Home directory. Defaults to `os.homedir()`. */
  home?: string;
}

export interface InstallNativeHostResult {
  wrapperPath: string;
  manifests: string[];
}

/** Directories (one per installed browser) that hold native host manifests. */
export function nativeHostManifestDirs(home = os.homedir()): string[] {
  if (process.platform === "win32") {
    return windowsBrowsers(home).map(({ directory }) => directory);
  }
  const roots =
    process.platform === "darwin" || process.platform === "linux"
      ? BROWSER_DATA_DIRS[process.platform]
      : [];
  return roots
    .map((root) => path.join(home, root))
    .filter((dir) => fs.existsSync(dir))
    .map((dir) => path.join(dir, "NativeMessagingHosts"));
}

/**
 * The built host entry. Next to this module when running from `dist`; under a
 * source run (tsx) it lives in the package's `dist` folder instead.
 */
function resolveHostScript(): string {
  const sibling = fileURLToPath(new URL("./native-host-bin.js", import.meta.url));
  if (fs.existsSync(sibling)) return sibling;
  return fileURLToPath(new URL("../../dist/extension/native-host-bin.js", import.meta.url));
}

/**
 * Whether a browser on this machine has the host registered: a manifest under
 * one of its profile directories whose wrapper script still exists. A
 * manifest left by a moved or removed install points at a missing wrapper.
 */
export function isNativeHostInstalled(home = os.homedir()): boolean {
  return nativeHostManifestDirs(home).some((dir) => {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, `${NATIVE_HOST_NAME}.json`), "utf8")
      ) as { path?: unknown };
      if (typeof manifest.path !== "string" || !fs.existsSync(manifest.path)) {
        return false;
      }
      if (process.platform === "win32") {
        const launch = JSON.parse(fs.readFileSync(
          path.join(path.dirname(manifest.path), "launch.json"), "utf8"
        )) as { nodePath?: unknown; hostScript?: unknown };
        if (typeof launch.nodePath !== "string" || !fs.existsSync(launch.nodePath) ||
            typeof launch.hostScript !== "string" || !fs.existsSync(launch.hostScript)) {
          return false;
        }
        const browser = windowsBrowsers(home).find(({ directory }) => directory === dir);
        if (!browser) {
          return false;
        }
        // Match in reg.exe, not in its localized output, so Unicode paths survive.
        return REGISTRY_VIEWS.every((view) =>
          /\bREG_SZ\b/.test(runRegistry([
            "query", browser.key, "/ve", "/f", path.join(dir, `${NATIVE_HOST_NAME}.json`),
            "/d", "/e", "/t", "REG_SZ", view
          ]))
        );
      }
      return true;
    } catch {
      // No manifest here, or one that is not JSON: not registered.
      return false;
    }
  });
}

export function installNativeHost(options: InstallNativeHostOptions = {}): InstallNativeHostResult {
  const home = options.home ?? os.homedir();
  const hostScript = options.hostScript ?? resolveHostScript();
  if (!fs.existsSync(hostScript)) {
    throw new Error(`Native host entry not found at ${hostScript}. Run npm run build:packages first`);
  }
  const nodePath = options.nodePath ?? process.execPath;
  if (process.platform === "win32" && !fs.existsSync(nodePath)) {
    throw new Error(`Node executable not found at ${nodePath}`);
  }

  const wrapperDir = path.join(home, ".nodetool", "browser-bridge");
  fs.mkdirSync(wrapperDir, { recursive: true });
  const windows = process.platform === "win32";
  const wrapperPath = path.join(wrapperDir, windows ? "native-host.cmd" : "native-host");
  const wrapper = windows
    ? `@echo off\r\nsetlocal DisableDelayedExpansion\r\nchcp 65001 >nul\r\n${windowsBatchPath(nodePath)} ${windowsBatchPath(hostScript)}\r\n`
    : `#!/bin/sh\n# Generated by \`nodetool extension install\`. Do not edit.\nexec "${nodePath}" "${hostScript}"\n`;
  fs.writeFileSync(
    wrapperPath,
    wrapper,
    { mode: 0o755 }
  );
  if (windows) {
    fs.writeFileSync(path.join(wrapperDir, "launch.json"), JSON.stringify({ nodePath, hostScript }));
  }

  const manifest = JSON.stringify(
    {
      name: NATIVE_HOST_NAME,
      description: "NodeTool browser bridge",
      path: wrapperPath,
      type: "stdio",
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`]
    },
    null,
    2
  );
  const manifests: string[] = [];
  for (const dir of nativeHostManifestDirs(home)) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${NATIVE_HOST_NAME}.json`);
    fs.writeFileSync(file, manifest);
    if (windows) {
      const browser = windowsBrowsers(home).find(({ directory }) => directory === dir);
      if (!browser) {
        throw new Error(`Browser profile disappeared during registration: ${dir}`);
      }
      for (const view of REGISTRY_VIEWS) {
        runRegistry(["add", browser.key, "/ve", "/t", "REG_SZ", "/d", file, "/f", view]);
      }
    }
    manifests.push(file);
  }
  if (manifests.length === 0) {
    throw new Error("No supported browser profile directory found (Chrome, Chromium, Brave, Edge or Arc)");
  }
  return { wrapperPath, manifests };
}
