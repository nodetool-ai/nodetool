/**
 * BrowserLauncher — opens a URL in the user's default browser.
 *
 * Abstracted behind an interface so the provider can be tested without
 * spawning a real browser, and so non-desktop hosts can supply their own
 * strategy (e.g. printing the URL for the user to paste).
 */

import { spawn } from "node:child_process";
import type { Logger } from "@nodetool-ai/config";
import { BrowserLaunchError } from "./errors.js";

export interface BrowserLauncher {
  /** Open `url`. Reject with `BrowserLaunchError` if the browser won't start. */
  open(url: string): Promise<void>;
}

/** Per-platform command that opens a URL in the default browser. */
function openCommand(platform: NodeJS.Platform): { cmd: string; args: string[] } {
  switch (platform) {
    case "darwin":
      return { cmd: "open", args: [] };
    case "win32":
      // `start` is a cmd builtin; the empty "" is the (ignored) window title.
      return { cmd: "cmd", args: ["/c", "start", ""] };
    default:
      return { cmd: "xdg-open", args: [] };
  }
}

/** Opens URLs via the platform's native "open" command. */
export class DefaultBrowserLauncher implements BrowserLauncher {
  private readonly platform: NodeJS.Platform;
  private readonly logger?: Logger;

  constructor(options: { platform?: NodeJS.Platform; logger?: Logger } = {}) {
    this.platform = options.platform ?? process.platform;
    this.logger = options.logger;
  }

  async open(url: string): Promise<void> {
    const { cmd, args } = openCommand(this.platform);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, [...args, url], { stdio: "ignore", detached: true });
      child.once("error", (err) =>
        reject(new BrowserLaunchError("Could not launch the default browser", { cause: err }))
      );
      // The launcher process exits quickly; the browser keeps running. Treat a
      // clean spawn as success and unref so it never blocks process exit.
      child.once("spawn", () => {
        child.unref();
        this.logger?.debug("Opened authorization URL in default browser");
        resolve();
      });
    });
  }
}
