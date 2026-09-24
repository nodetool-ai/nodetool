import { describe, expect, it } from "vitest";

import { turboArgs } from "../run-turbo.mjs";
import { vitestArgs } from "../run-vitest.mjs";

describe("local runner limits", () => {
  it("runs one Turbo task and two Vitest workers locally", () => {
    expect(turboArgs(["run", "test"], {})).toEqual(["run", "test", "--concurrency=1"]);
    expect(vitestArgs(["run"], {})).toEqual(["run", "--maxWorkers", "2"]);
  });

  it("preserves the runners' CI defaults", () => {
    expect(turboArgs(["run", "test"], { CI: "true" })).toEqual(["run", "test"]);
    expect(vitestArgs(["run"], { CI: "true" })).toEqual(["run"]);
  });

  it("accepts explicit worker limits in either environment", () => {
    expect(turboArgs(["run", "test"], { CI: "true", NODETOOL_TURBO_CONCURRENCY: "4" }))
      .toEqual(["run", "test", "--concurrency=4"]);
    expect(vitestArgs(["run"], { NODETOOL_TEST_WORKERS: "3" }))
      .toEqual(["run", "--maxWorkers", "3"]);
  });

  it("rejects invalid limits before starting a runner", () => {
    expect(() => turboArgs([], { NODETOOL_TURBO_CONCURRENCY: "0" })).toThrow();
    expect(() => vitestArgs([], { NODETOOL_TEST_WORKERS: "many" })).toThrow();
  });
});
