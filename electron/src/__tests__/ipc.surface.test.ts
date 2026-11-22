/**
 * IPC surface contract: both ends of every channel exist.
 *
 * The renderer reaches the main process only through the preload scripts, and
 * a channel with one end missing fails at runtime, not at build time: an
 * `invoke` with no `ipcMain.handle` rejects with "No handler registered", a
 * `send` with no `ipcMain.on` is dropped, and a subscription nobody emits on
 * never fires. Unit tests mock `electron`, so none of them can see this. The
 * suite reads the sources instead and checks:
 *
 *  1. Every `ipcRenderer.invoke` channel has a main-process handler, and every
 *     handler is invoked by a preload.
 *  2. Every `ipcRenderer.send`/`sendSync` channel has an `ipcMain.on`
 *     listener, and every listener has a sender.
 *  3. Every preload subscription has a main-process emitter, and every
 *     emitted channel has a subscription.
 *  4. Every `IpcChannels` member is used by exactly one of those directions.
 *
 * A reference the scanner cannot classify fails the suite, so a new call
 * shape is added here rather than silently skipped.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");

function readSources(filter: (name: string) => boolean): Map<string, string> {
  const sources = new Map<string, string>();
  for (const name of readdirSync(SRC)) {
    if (!name.endsWith(".ts") || name.endsWith(".d.ts") || !filter(name)) {
      continue;
    }
    sources.set(name, readFileSync(join(SRC, name), "utf8"));
  }
  return sources;
}

const isPreload = (name: string): boolean => name.startsWith("preload");
const preloads = readSources(isPreload);
const mains = readSources((name) => !isPreload(name));

function channelsMatching(pattern: RegExp, sources: Map<string, string>): Set<string> {
  const found = new Set<string>();
  for (const text of sources.values()) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return found;
}

function countMatches(pattern: RegExp, sources: Map<string, string>): number {
  let count = 0;
  for (const text of sources.values()) {
    count += [...text.matchAll(pattern)].length;
  }
  return count;
}

const minus = (a: Set<string>, b: Set<string>): string[] =>
  [...a].filter((name) => !b.has(name)).sort();

const enumBody = /export enum IpcChannels \{([\s\S]*?)\n\}/.exec(
  readFileSync(join(SRC, "types.d.ts"), "utf8")
)?.[1];
const declared = new Set(
  [...(enumBody ?? "").matchAll(/^\s*([A-Z0-9_]+)\s*=/gm)].map((m) => m[1])
);

// Renderer → main.
const INVOKE = /ipcRenderer\.invoke\(\s*IpcChannels\.(\w+)/g;
const SEND = /ipcRenderer\.send(?:Sync)?\(\s*IpcChannels\.(\w+)/g;
// Main → renderer, as the preload subscribes to it.
const SUBSCRIBE = /createEventSubscription\(\s*IpcChannels\.(\w+)/g;

const HANDLE = /(?:createIpcMainHandler|ipcMain\.handle)\(\s*IpcChannels\.(\w+)/g;
const LISTEN = /ipcMain\.on\(\s*IpcChannels\.(\w+)/g;
const EMIT = /(?:webContents\.send|broadcastToWindows)\(\s*IpcChannels\.(\w+)/g;

const invoked = channelsMatching(INVOKE, preloads);
const sent = channelsMatching(SEND, preloads);
const subscribed = channelsMatching(SUBSCRIBE, preloads);
const handled = channelsMatching(HANDLE, mains);
const listened = channelsMatching(LISTEN, mains);
const emitted = channelsMatching(EMIT, mains);

describe("electron IPC surface", () => {
  it("reads the channel enum and both preloads", () => {
    expect(declared.size).toBeGreaterThan(50);
    expect([...preloads.keys()].sort()).toEqual(["preload-workflow.ts", "preload.ts"]);
    expect(invoked.size).toBeGreaterThan(50);
    expect(handled.size).toBeGreaterThan(50);
  });

  it("classifies every channel reference in the preloads", () => {
    const references = countMatches(/IpcChannels\.\w+/g, preloads);
    const classified =
      countMatches(INVOKE, preloads) +
      countMatches(SEND, preloads) +
      countMatches(SUBSCRIBE, preloads);
    expect(classified).toBe(references);
  });

  it("registers every ipcMain listener on a named channel", () => {
    // The one exception is the generic registration inside createIpcMainHandler.
    const generic = [...mains.values()].join("\n").match(/ipcMain\.(?:handle|on|once|handleOnce)\(\s*(?!IpcChannels\.)\w+/g) ?? [];
    expect(generic).toEqual(["ipcMain.handle(channel"]);
  });

  it("gives every invoked channel a handler, and every handler a caller", () => {
    expect(minus(invoked, handled)).toEqual([]);
    expect(minus(handled, invoked)).toEqual([]);
  });

  it("gives every sent channel a listener, and every listener a sender", () => {
    expect(minus(sent, listened)).toEqual([]);
    expect(minus(listened, sent)).toEqual([]);
  });

  it("gives every subscription an emitter, and every emitted channel a subscription", () => {
    expect(minus(subscribed, emitted)).toEqual([]);
    expect(minus(emitted, subscribed)).toEqual([]);
  });

  it("uses every declared channel in exactly one direction", () => {
    const directions = [invoked, sent, subscribed];
    const used = new Set(directions.flatMap((set) => [...set]));
    expect(minus(declared, used)).toEqual([]);
    expect(minus(used, declared)).toEqual([]);
    const shared = [...used].filter(
      (name) => directions.filter((set) => set.has(name)).length > 1
    );
    expect(shared).toEqual([]);
  });
});
