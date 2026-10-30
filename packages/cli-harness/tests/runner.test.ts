import { afterEach, expect, it, vi } from "vitest";
import { createProgram, descriptor, run } from "../src/index.js";

afterEach(() => { vi.restoreAllMocks(); });

it("registers only the harness command family", () => {
  expect(createProgram().commands.map(command => command.name())).toEqual(["harness", "affected", "eval", "jtbd", "reliability"]);
  expect(descriptor).toMatchObject({ id: "cli-harness", apiVersion: 1, requires: [] });
});

it("executes the actual registry list through the independent runner", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await run(["harness", "list", "--json"]);
  const entries: Array<{ id: string }> = JSON.parse(String(log.mock.calls[0]?.[0]));
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.some(entry => entry.id === "validate")).toBe(true);
});
