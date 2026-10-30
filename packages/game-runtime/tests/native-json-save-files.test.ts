import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createNativeAtomicFileSaveStorage } from "../src/native-json-save-files.js";
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function setup(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "native-json-saves-")); directories.push(root); return root; }
describe("native atomic JSON saves", () => {
  it("persists script-defined data across adapters with separate full-ID namespaces and scopes", async () => {
    const root = await setup(), options = { root, gameId: "0123456789abcdef0123456789abcdef", engineContract: "native-cpp-1" };
    const first = createNativeAtomicFileSaveStorage(options);
    await first.write("progress", "slot", { formatVersion: 1, data: { version: 4, level: 2 } });
    await first.write("settings", "slot", { formatVersion: 1, data: { version: 1, sound: false } });
    const second = createNativeAtomicFileSaveStorage(options);
    expect(second.persistence).toBe("durable");
    expect(await second.read("progress", "slot")).toEqual({ formatVersion: 1, data: { version: 4, level: 2 } });
    expect(await second.read("settings", "slot")).toEqual({ formatVersion: 1, data: { version: 1, sound: false } });
    expect(await createNativeAtomicFileSaveStorage({ ...options, gameId: options.gameId + "1" }).read("progress", "slot")).toBeNull();
    expect(await createNativeAtomicFileSaveStorage({ ...options, engineContract: "another" }).read("progress", "slot")).toBeNull();
  });
  it("enforces slots atomically and rejects malformed data before touching an existing save", async () => {
    const storage = createNativeAtomicFileSaveStorage({ root: await setup(), gameId: "game", engineContract: "native-cpp-1" });
    for (let index = 0; index < 16; index++) { await storage.write("progress", `s${index}`, { formatVersion: 1, data: { index } }); }
    await expect(storage.write("progress", "extra", { formatVersion: 1, data: {} })).rejects.toThrow("slot limit");
    await storage.write("progress", "s0", { formatVersion: 1, data: { replaced: true } });
    await expect(storage.write("progress", "s0", { formatVersion: 1, data: { oversized: "x".repeat(16384) } })).rejects.toThrow();
    expect(await storage.read("progress", "s0")).toEqual({ formatVersion: 1, data: { replaced: true } });
    await expect(storage.write("progress", "../escape", { formatVersion: 1, data: {} })).rejects.toThrow();
  });
});

async function writer(root: string, slot: string, hold = false): Promise<ChildProcess> {
  const script = join(root, `writer-${slot}.mjs`);
  await writeFile(script, `
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    if (${hold}) { fs.readdir = async () => { process.send('locked'); return new Promise(() => {}); }; syncBuiltinESMExports(); }
    const { createNativeAtomicFileSaveStorage } = await import(${JSON.stringify(fileURLToPath(new URL("../src/native-json-save-files.ts", import.meta.url)))});
    const storage = createNativeAtomicFileSaveStorage({root:${JSON.stringify(root)},gameId:'game',engineContract:'native-cpp-1'});
    process.send('ready');
    process.once('message', async () => {
      try { await storage.write('progress', ${JSON.stringify(slot)}, {formatVersion:1,data:{slot:${JSON.stringify(slot)}}}); process.send('written'); }
      catch(error) { process.send({error:String(error)}); }
      process.disconnect();
    });
  `);
  const child = fork(script, [], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"] });
  expect((await once(child, "message"))[0]).toBe("ready");
  return child;
}

it.each([false, true])("releases a killed writer lock (existing saves: %s)", async (existing) => {
  const root = await setup();
  const storage = createNativeAtomicFileSaveStorage({ root, gameId: "game", engineContract: "native-cpp-1" });
  if (existing) { await storage.write("progress", "existing", { formatVersion: 1, data: { intact: true } }); }
  const child = await writer(root, "crashed", true);
  const locked = once(child, "message"); child.send("go");
  expect((await locked)[0]).toBe("locked");
  await expect(storage.write("progress", "contender", { formatVersion: 1, data: {} })).rejects.toThrow("database is locked");
  const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
  await storage.write("progress", "reopened", { formatVersion: 1, data: { recovered: true } });
  expect(await storage.read("progress", "existing")).toEqual(existing ? { formatVersion: 1, data: { intact: true } } : null);
  expect(await storage.read("progress", "reopened")).toEqual({ formatVersion: 1, data: { recovered: true } });
});

it("keeps the slot limit across concurrent processes", async () => {
  const root = await setup();
  const storage = createNativeAtomicFileSaveStorage({ root, gameId: "game", engineContract: "native-cpp-1" });
  for (let index = 0; index < 15; index++) { await storage.write("progress", `s${index}`, { formatVersion: 1, data: {} }); }
  const children = await Promise.all(["one", "two", "three", "four"].map((slot) => writer(root, slot)));
  const results = children.map(async (child) => { const result = once(child, "message"), exited = once(child, "exit"); child.send("go"); const [message] = await result; await exited; return message; });
  const messages = await Promise.all(results);
  expect(messages.filter((message) => message === "written")).toHaveLength(1);
  for (const message of messages.filter((value) => value !== "written")) {
    expect(message).toEqual({ error: expect.stringMatching(/database is locked|slot limit/) });
  }
  const [namespace] = (await readdir(root)).filter((name) => /^[a-f0-9]{64}$/.test(name));
  expect((await readdir(join(root, namespace!, "progress"))).filter((name) => name.endsWith(".json"))).toHaveLength(16);
});
