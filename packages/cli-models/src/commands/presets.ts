import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { z } from "zod";
import { runtimePresetCatalog } from "@nodetool-ai/pack-core/preset-catalog";
import {
  compileMediaPresets,
  presetToWorkflow,
  catalogKindSchema,
  listCatalog,
  presetModeSchema,
  MODEL_FAMILIES
} from "@nodetool-ai/presets";
export function registerPresetCommands(program: Command): void {
  const presets = program
    .command("presets")
    .description("Browse presets and studios, compile and eject generation presets");
  const catalog = runtimePresetCatalog;
  const print = (value: unknown): void => {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  };
  presets
    .command("list")
    .option("--kind <kind>")
    .option("--mode <mode>")
    .option("--family <family>")
    .action((flags: { kind?: string; mode?: string; family?: string }) => {
      const filter = z
        .object({
          kind: catalogKindSchema.optional(),
          mode: presetModeSchema.optional(),
          family: z.enum(MODEL_FAMILIES).optional()
        })
        .parse(flags);
      print(listCatalog(catalog(), filter));
    });
  const get = (id: string) => {
    const loaded = catalog();
    const preset = loaded.getPreset(id);
    if (!preset) {
      throw new Error(
        loaded.getStudio(id)
          ? `${id} is a studio: it opens a surface and has no graph to eject`
          : `Unknown preset: ${id}`
      );
    }
    return preset;
  };
  presets.command("show <id>").action((id: string) => {
    const loaded = catalog();
    const entry = loaded.getPreset(id) ?? loaded.getStudio(id);
    if (!entry) {
      throw new Error(`Unknown preset: ${id}`);
    }
    print(entry);
  });
  presets
    .command("compile <ids...>")
    .requiredOption("--model <id>")
    .option("--provider <provider>", "Model provider", "")
    .option("--mode <mode>", "Generation mode", "video")
    .option("--prompt <text>", "Base prompt", "")
    .action(
      (
        ids: string[],
        flags: { model: string; provider: string; mode: string; prompt: string }
      ) => {
        print(
          compileMediaPresets(
            ids,
            flags.provider,
            flags.model,
            flags.mode,
            flags.prompt,
            catalog()
          )
        );
      }
    );
  presets
    .command("eject <id>")
    .requiredOption("--model <id>")
    .requiredOption("--provider <provider>")
    .option("--mode <mode>", "Generation mode", "video")
    .option("--out <file>")
    .action(
      async (
        id: string,
        flags: { model: string; provider: string; mode: string; out?: string }
      ) => {
        const graph = presetToWorkflow(get(id), {
          mode: presetModeSchema.parse(flags.mode),
          model: { provider: flags.provider, id: flags.model }
        });
        if (flags.out) {
          await writeFile(flags.out, JSON.stringify(graph, null, 2) + "\n");
        } else {
          print(graph);
        }
      }
    );
}
