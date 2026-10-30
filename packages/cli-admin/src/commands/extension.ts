/**
 * `nodetool extension` — set up and check the browser bridge.
 *
 *   nodetool extension install   register the native host with your browsers
 *   nodetool extension status    say whether the extension is connected
 *
 * The bridge needs no server: Chrome starts the native host when the NodeTool
 * extension connects, and local clients reach it over a unix socket.
 */
import type { Command } from "commander";

export function registerExtensionCommands(program: Command): void {
  const extension = program
    .command("extension")
    .description("Set up the NodeTool Chrome extension bridge (no server needed)");

  extension
    .command("install")
    .description("Register the native messaging host with Chrome, Chromium, Brave, Edge and Arc")
    .action(async () => {
      const { installNativeHost, EXTENSION_ID } = await import("@nodetool-ai/browser");
      const result = installNativeHost();
      console.log(`Wrapper: ${result.wrapperPath}`);
      for (const manifest of result.manifests) console.log(`Registered: ${manifest}`);
      console.log(`\nExtension ID: ${EXTENSION_ID}`);
      console.log("Next: open chrome://extensions, enable Developer mode, load the unpacked `chrome-extension/dist` folder (or reload it), then run `nodetool extension status`.");
    });

  extension
    .command("status")
    .description("Check whether the extension is connected to the bridge")
    .action(async () => {
      const { isBridgeAvailable, listBridgeSockets } = await import("@nodetool-ai/browser");
      const connected = await isBridgeAvailable();
      console.log(connected ? "connected" : "not connected");
      for (const socket of listBridgeSockets()) console.log(`socket: ${socket}`);
      if (!connected) process.exitCode = 1;
    });
}
