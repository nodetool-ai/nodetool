import { describe, expect, it } from "vitest";
import {
  appRunSnapshot,
  createInstanceInput,
  updateInstanceInput,
  appRunOrigin
} from "../src/api-schemas/app-runs.js";

describe("app run protocol", () => {
  it("accepts immutable unsaved snapshots without publication identifiers", () => {
    const input = createInstanceInput.parse({
      source_id: "example:test",
      snapshot: {
        document: { schemaVersion: 5, ui: { root: { props: {} }, content: [] } }
      }
    });
    expect(input.application_id).toBeUndefined();
    expect(input.snapshot.workflow_graphs).toEqual({});
    expect(input.snapshot.script_documents).toEqual({});
  });
  it("requires revision checks and validates execution snapshots", () => {
    expect(
      updateInstanceInput.safeParse({ id: "instance", variables: { x: 1 } })
        .success
    ).toBe(false);
    expect(
      updateInstanceInput.safeParse({ id: "instance", expected_revision: -1 })
        .success
    ).toBe(false);
    expect(
      appRunSnapshot.safeParse({ document: { schemaVersion: 999, ui: {} } })
        .success
    ).toBe(false);
    expect(appRunOrigin.safeParse("visitor-owned").success).toBe(false);
  });
});
