import { describe, expect, it } from "vitest";
import {
  UNIFIED_COMMAND_TYPES,
  aceStepDownloadModelsDataSchema,
  aceStepSetupProgressMessageOutSchema,
  aceStepSetupResultSchema,
  commandDataSchemas,
  outboundControlMessageSchemas
} from "../src/index.js";

const operation = {
  id: "a".repeat(32), kind: "models", set: "first_run", state: "running", stage: "Downloading x.gguf",
  percent: null, downloaded_bytes: 0, total_bytes: 0, file: null, file_index: 0, file_count: 0,
  error: null, error_code: null
};
const set = { present: [], missing: ["ditBase"], approx_bytes: 1, missing_bytes: 1 };
const status = {
  remote: false,
  binary: { installed: false, version: null, blocked: "digest-unset", message: "m" },
  models: { first_run: set, add_instrument: set, available: true },
  operation
};

describe("ACE-Step setup commands", () => {
  it("registers the four commands with a data schema each", () => {
    for (const command of ["acestep_setup_status", "acestep_install", "acestep_download_models", "acestep_setup_cancel"] as const) {
      expect(UNIFIED_COMMAND_TYPES).toContain(command);
      expect(commandDataSchemas[command]).toBeDefined();
    }
  });

  it("accepts only the named model sets", () => {
    expect(aceStepDownloadModelsDataSchema.safeParse({ set: "first_run" }).success).toBe(true);
    expect(aceStepDownloadModelsDataSchema.safeParse({ set: "add_instrument" }).success).toBe(true);
    expect(aceStepDownloadModelsDataSchema.safeParse({ set: "all" }).success).toBe(false);
    expect(aceStepDownloadModelsDataSchema.safeParse({}).success).toBe(false);
  });

  it("validates the result and the pushed progress frame", () => {
    expect(aceStepSetupResultSchema.safeParse({ accepted: true, reason: null, status }).success).toBe(true);
    expect(aceStepSetupResultSchema.safeParse({ accepted: false, reason: "bogus", status }).success).toBe(false);
    expect(aceStepSetupProgressMessageOutSchema.safeParse({ type: "acestep_setup_progress", operation }).success).toBe(true);
    expect(outboundControlMessageSchemas.acestep_setup_progress).toBe(aceStepSetupProgressMessageOutSchema);
  });
});
