#!/usr/bin/env node
/**
 * nodetool — CLI entry.
 *
 * The full command tree lives in ./nodetool-main.ts and statically imports
 * every workspace package, so it fails with ERR_MODULE_NOT_FOUND on a tree
 * whose `dist/` has not been built. `harness` (list, audit, gate planning)
 * is the tool that tells you what to build and check, so it must work first:
 * it is routed to a program holding only that command, and its commands import
 * built packages lazily (capabilities) or not at all. Every other command goes
 * to the full tree unchanged.
 *
 * Before either, the optional-node root that `nodetool runtime add` fills is
 * put on NODETOOL_OPTIONAL_NODE_MODULES, so every optional import and every
 * child process can find what was installed there.
 */
// First: libuv sizes its thread pool on the first job it queues.
import "@nodetool-ai/config/threadpool";
import { initializeCliRuntime } from "./runtime-env.js";

initializeCliRuntime(import.meta.url);

if (process.argv[2] === "harness") {
  const { program } = await import("commander");
  const { registerHarnessCommands } = await import("./commands/harness.js");
  program.name("nodetool").description("NodeTool CLI");
  registerHarnessCommands(program);
  await program.parseAsync();
} else {
  const { configureCliPackHost } = await import("./packs/host.js");
  configureCliPackHost(import.meta.url);
  await import("./nodetool-main.js");
}
