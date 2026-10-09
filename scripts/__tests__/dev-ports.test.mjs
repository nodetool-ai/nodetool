import { spawn } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { ensurePortsFree, findListenerPids } from "../dev-ports.mjs";

const children = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const child of children.splice(0)) {
    child.kill("SIGKILL");
  }
});

async function listen() {
  const child = spawn(process.execPath, [
    "-e",
    `const s = require("node:net").createServer().listen(0, "127.0.0.1", () => console.log(s.address().port));`
  ]);
  children.push(child);
  const port = await new Promise((resolve) => child.stdout.once("data", (d) => resolve(Number(d))));
  return { child, port };
}

it.skipIf(process.platform === "win32")("finds the listener on a busy port", async () => {
  const { child, port } = await listen();
  expect(findListenerPids(port)).toEqual([child.pid]);
});

it.skipIf(process.platform === "win32")("reuses a reusable port without a TTY", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const { port } = await listen();
  const target = { label: "backend", port, reusable: true };
  expect(await ensurePortsFree([target], { interactive: false })).toBe(true);
  expect(await ensurePortsFree([target], { interactive: false, strict: true })).toBe(false);
});

it.skipIf(process.platform === "win32")("kills the holder when the user confirms", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const { child, port } = await listen();
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const target = { label: "Vite dev server", port, reusable: false };
  expect(await ensurePortsFree([target], { interactive: true, confirm: async () => true })).toBe(true);
  await exited;
  expect(findListenerPids(port)).toEqual([]);
});

it.skipIf(process.platform === "win32")("aborts when the user declines a non-reusable port", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const { port } = await listen();
  const target = { label: "Vite dev server", port, reusable: false };
  expect(await ensurePortsFree([target], { interactive: true, confirm: async () => false })).toBe(false);
  expect(findListenerPids(port)).not.toEqual([]);
});
