import { resolve } from "node:path";
import type { Command } from "commander";
import { printCommandError } from "../command-errors.js";

export function registerGameSmokeCommand(game: Command): void {
  game.command("smoke <directory>")
    .description("Render 300 scripted frames from an exported web player")
    .option("--json", "Print a machine-readable report")
    .action(async (directory: string, options: { json?: boolean }) => {
      try {
        const { smokeStandaloneGame } = await import("@nodetool-ai/game-renderer/smoke");
        const report = await smokeStandaloneGame(resolve(directory));
        process.stdout.write(options.json ? `${JSON.stringify(report)}\n`
          : `Rendered ${report.frames} frames, advanced ${report.ticks} ticks\n${report.errors.map(error => `${error}\n`).join("")}`);
        if (!report.ok) { process.exitCode = 1; }
      } catch (error) {
        printCommandError(error, options.json);
        process.exitCode = 1;
      }
    });
}
