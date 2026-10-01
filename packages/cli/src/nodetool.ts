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
 */
if (process.argv[2] === "harness") {
  const { program } = await import("commander");
  const { registerHarnessCommands } = await import("./commands/harness.js");
  program.name("nodetool").description("NodeTool CLI");
  registerHarnessCommands(program);
  await program.parseAsync();
} else {
  await import("./nodetool-main.js");
}
