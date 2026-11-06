/**
 * The desktop app's runtime install host. The install work lives in
 * `@nodetool-ai/runtime-install`; this adapter supplies the app's paths,
 * settings, bundled npm and micromamba, the folder prompt and the boot
 * screen and server log events.
 */
import * as path from "path";
import { app, dialog } from "electron";
import { runtimeRegistryFor, type RuntimeInstallHost } from "@nodetool-ai/runtime-install";

import { getCondaEnvPath, getProcessEnv, resolveNpmInvocation, setCondaEnvPath } from "./config";
import { emitBootMessage, emitServerLog, emitUpdateProgress } from "./events";
import { logMessage } from "./logger";
import { getDefaultInstallLocation } from "./python";
import { readSettings, updateSetting } from "./settings";

/** Ask where to create the conda environment. */
async function promptForCondaInstallFolder(): Promise<string> {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: "Select where to install the conda environment",
    buttonLabel: "Select Folder",
    defaultPath: getDefaultInstallLocation(),
  });
  if (canceled || !filePaths?.[0]) {
    throw new Error("Installation cancelled — no folder selected.");
  }
  return path.join(filePaths[0], "nodetool-env");
}

/** Where the packaged app and a dev checkout keep the bundled micromamba. */
function micromambaResourceDirs(): string[] {
  if (app.isPackaged) {
    return [process.resourcesPath];
  }
  return Array.from(new Set([
    path.join(app.getAppPath(), "resources"),
    path.resolve(__dirname, "..", "resources"),
  ]));
}

const desktopRuntimeHost: RuntimeInstallHost = {
  // Read on each access, so tests that switch process.platform see it.
  get platform(): NodeJS.Platform {
    return process.platform;
  },
  get arch(): string {
    return process.arch;
  },
  get dataDir(): string {
    return app.getPath("userData");
  },
  get npmCacheDir(): string {
    return path.join(app.getPath("userData"), "npm-cache");
  },
  get osVersion(): string | undefined {
    return process.platform === "darwin" ? process.getSystemVersion() : undefined;
  },
  condaEnvPath: () => getCondaEnvPath(),
  setCondaEnvPath(location) {
    setCondaEnvPath(location);
    logMessage(`Conda environment location set to: ${location}`);
  },
  async chooseNewCondaEnvPath() {
    // A recorded location is the user's earlier choice; ask only without one.
    return readSettings()["CONDA_ENV"] ? getCondaEnvPath() : promptForCondaInstallFolder();
  },
  processEnv: () => getProcessEnv(),
  npmInvocation: () => resolveNpmInvocation(),
  micromambaResourceDirs,
  settings: {
    read: (key) => readSettings()[key],
    write: (key, value) => {
      updateSetting(key, value);
    },
  },
  log(level, message) {
    logMessage(message, level);
  },
  output(line, level) {
    if (level === "info") {
      emitServerLog(line);
    } else {
      // emitServerLog logs at info; keep the level in the log file.
      logMessage(line, level);
      emitServerLog(line);
    }
  },
  status: (message) => emitBootMessage(message),
  progress: (component, percent, action, eta) => emitUpdateProgress(component, percent, action, eta),
};

export function getDesktopRuntimeHost(): RuntimeInstallHost {
  return desktopRuntimeHost;
}

/** The desktop app's runtime package registry. */
export function getDesktopRuntimeRegistry(): ReturnType<typeof runtimeRegistryFor> {
  return runtimeRegistryFor(desktopRuntimeHost);
}
