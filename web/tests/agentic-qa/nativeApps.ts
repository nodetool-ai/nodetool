/**
 * The native NodeTool apps a desktop participant can be given, and how each
 * starts against a study backend. Paths are the build directories each
 * app's README configures, relative to the repository root.
 */

import { access } from "node:fs/promises";
import { join } from "node:path";
import type { AppLaunch } from "./desktopSession";

export interface NativeAppTarget {
  /** Build output, relative to the repository root. */
  binary: string;
  /** How to build it, printed when the binary is missing. */
  build: string;
  launch(opts: { server: string; document?: string }): Omit<AppLaunch, "command">;
}

export const NATIVE_APPS = {
  chat: {
    binary: "native/chat/build/nodetool-chat",
    build:
      'cmake -S native/chat -B native/chat/build -G Ninja -DCMAKE_PREFIX_PATH="$QT_PREFIX" && cmake --build native/chat/build --target nodetool-chat',
    launch: ({ server }) => ({ args: ["--server", server], env: {} })
  },
  "node-editor": {
    binary: "native/node-editor/build/nodetool-node-editor",
    build:
      'cmake -S native/node-editor -B native/node-editor/build -G Ninja -DCMAKE_PREFIX_PATH="$QT_PREFIX" -DBUILD_TESTING=OFF && cmake --build native/node-editor/build --target nodetool-node-editor',
    launch: ({ server, document }) => ({
      args: ["--server", server, ...(document ? ["--workflow", document] : [])],
      // The study backend is the server; never start a bundled one.
      env: { NODETOOL_SERVER_URL: server }
    })
  },
  timeline: {
    binary: "native/timeline/build/nodetool-timeline",
    build:
      'cmake -S native/timeline -B native/timeline/build -G Ninja -DCMAKE_PREFIX_PATH="$QT_PREFIX" -DBUILD_TESTING=OFF && cmake --build native/timeline/build --target nodetool-timeline',
    launch: ({ server, document }) => ({
      // A study host has no sound card, and the participant hears nothing.
      // The null output keeps playback timed as a real device would.
      args: ["--audio", "null", ...(document ? ["--server", server, "--timeline", document] : [])],
      // The Assistant panel connects to the same server.
      env: { NODETOOL_CHAT_SERVER: server }
    })
  }
} satisfies Record<string, NativeAppTarget>;

export type NativeAppId = keyof typeof NATIVE_APPS;
export const NATIVE_APP_IDS = Object.keys(NATIVE_APPS) as [NativeAppId, ...NativeAppId[]];

/** Resolve a preset to a launch, failing with the build command when it is not built. */
export async function resolveNativeApp(
  repoRoot: string,
  id: NativeAppId,
  opts: { server: string; document?: string; binary?: string }
): Promise<AppLaunch> {
  const target: NativeAppTarget = NATIVE_APPS[id];
  const command = opts.binary ?? join(repoRoot, target.binary);
  try {
    await access(command);
  } catch {
    throw new Error(`${command} is not built. From the repository root:\n  ${target.build}`);
  }
  return { command, ...target.launch(opts) };
}
