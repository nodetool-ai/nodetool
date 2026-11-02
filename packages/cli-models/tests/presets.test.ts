import { expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerPresetCommands } from "../src/commands/presets.js";
it("prints a compiled bullet-time prompt and params for Kling", async () => {
  const write = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  try {
    const program = new Command();
    registerPresetCommands(program);
    await program.parseAsync(
      [
        "presets",
        "compile",
        "camera.bullet-time",
        "--model",
        "fal-ai/kling-video/v3/pro/text-to-video"
      ],
      { from: "user" }
    );
    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(result.prompt).toMatch(/bullet|frozen/i);
    expect(result.params).toBeDefined();
    expect(result.applied).toEqual(["camera.bullet-time"]);
  } finally {
    write.mockRestore();
  }
});
it("lists studios by kind and names a studio when asked to eject one", async () => {
  const write = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  try {
    const program = new Command();
    program.exitOverride();
    registerPresetCommands(program);
    await program.parseAsync(["presets", "list", "--kind", "studio"], {
      from: "user"
    });
    const rows = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row: { kind: string }) => row.kind === "studio")).toBe(true);
    await expect(
      program.parseAsync(
        ["presets", "eject", "studio.cinematic-shot", "--model", "m", "--provider", "p"],
        { from: "user" }
      )
    ).rejects.toThrow("studio.cinematic-shot is a studio");
  } finally {
    write.mockRestore();
  }
});
