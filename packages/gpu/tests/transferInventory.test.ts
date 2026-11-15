import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IOContract } from "../src/types.js";

const shaderRoot = new URL("../src/shaders/", import.meta.url);
const inventory = readFileSync(new URL("../../../docs/plans/color-precision/results/a97-transfer-inventory.md", import.meta.url), "utf8");
const recorded = inventory.split("\n").filter((line) => /^\| [^|]+\/module\.ts \|/.test(line))
  .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

function hasIO(value: unknown): value is { id: string; version: number; io: IOContract } {
  return typeof value === "object" && value !== null && "io" in value && "id" in value && "version" in value;
}

describe("A97 transfer inventory", () => {
  it("classifies every module slot and matches its transfer and alpha declarations", async () => {
    const files = readdirSync(shaderRoot, { recursive: true, encoding: "utf8" }).map(file => file.replaceAll("\\", "/"))
      .filter((file) => file.endsWith("/module.ts")).sort();
    expect(files.length).toBeGreaterThan(0);
    expect([...new Set(recorded.map((row) => row[0]))].sort()).toEqual(files);
    const actual: string[][] = [];
    for (const file of files) {
      const exports: Record<string, unknown> = await import(fileURLToPath(new URL(file, shaderRoot)));
      for (const module of Object.values(exports).filter(hasIO)) {
        for (const [slot, contract] of Object.entries({ ...module.io.inputs, output: module.io.output })) {
          actual.push([file, `${module.id}@${module.version}`, slot, contract.colorSpace, contract.alpha]);
        }
      }
    }
    const expected = recorded.map(([file, module, slot, role, transfer, alpha]) => {
      expect(["colour", "colour/mask", "mask", "data"]).toContain(role);
      return [file, module, slot, transfer, alpha];
    });
    expect(actual.sort()).toEqual(expected.sort());
  });
});
