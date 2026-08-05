/**
 * `nodetool sketch` — the image-editor commands.
 *
 * Only the snapshot history lives here so far (sketch-versions.ts): a sketch's
 * manual saves, the autosaves the server writes, and the pre-restore snapshot
 * that makes a restore undoable.
 */
import type { Command } from "commander";
import { registerSketchVersionsCommands } from "./sketch-versions.js";

export function registerSketchCommands(program: Command): void {
  const sketch = program
    .command("sketch")
    .description("Work with sketches (image documents)");

  registerSketchVersionsCommands(sketch);
}
