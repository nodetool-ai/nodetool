import { describe, expect, it } from "vitest";
import { appRouter } from "../src/trpc/router.js";

interface ProcedureDefinition {
  _def: {
    output?: unknown;
  };
}

describe("tRPC output validation policy", () => {
  it("declares a runtime output parser for every procedure", () => {
    const procedures = (
      appRouter as unknown as {
        _def: { procedures: Record<string, ProcedureDefinition> };
      }
    )._def.procedures;

    const missingOutputParsers = Object.entries(procedures)
      .filter(([, procedure]) => procedure._def.output === undefined)
      .map(([path]) => path)
      .sort();

    expect(missingOutputParsers).toEqual([]);
  });
});
