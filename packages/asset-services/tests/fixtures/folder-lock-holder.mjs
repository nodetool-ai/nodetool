// A second process for folder-lock-file.test.ts. It loads the lock module
// from source and works on a counter file under the lock.
//
//   node folder-lock-holder.mjs <module> <lock> count <counter> <times>
//   node folder-lock-holder.mjs <module> <lock> hold <ms>
//   node folder-lock-holder.mjs <module> <lock> die
//
// It prints "held" once it holds the lock for the first time.
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const [modulePath, lockPath, mode, ...rest] = process.argv.slice(2);
const { acquireFolderLockFile } = await import(pathToFileURL(modulePath).href);

if (mode === "count") {
  const [counter, times] = rest;
  for (let i = 0; i < Number(times); i++) {
    const held = await acquireFolderLockFile(lockPath);
    if (i === 0) process.stdout.write("held\n");
    const value = Number(await readFile(counter, "utf8"));
    await delay(2);
    await writeFile(counter, String(value + 1));
    await held.release();
  }
} else if (mode === "hold") {
  const held = await acquireFolderLockFile(lockPath);
  process.stdout.write("held\n");
  await delay(Number(rest[0]));
  process.stdout.write("releasing\n");
  await held.release();
} else if (mode === "die") {
  await acquireFolderLockFile(lockPath);
  process.stdout.write("held\n");
  // Exit without a release, as a killed process does.
  process.exit(0);
}
