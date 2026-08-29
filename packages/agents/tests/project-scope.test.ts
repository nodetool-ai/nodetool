/**
 * A document created without a `project_id` belongs to the project the run is
 * bound to — that is what puts an agent-created board on the project overview
 * instead of in the loose bucket.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROJECT_ID,
  resolveProjectId
} from "../src/capabilities/project-scope.js";
import type { CapabilityRun } from "../src/capabilities/types.js";

const runWith = (projectId?: string): CapabilityRun =>
  ({ projectId }) as unknown as CapabilityRun;

describe("resolveProjectId", () => {
  it("takes the run's project when the call names none", () => {
    expect(resolveProjectId(runWith("p1"), {})).toBe("p1");
  });

  it("lets an explicit project_id win over the run's", () => {
    expect(resolveProjectId(runWith("p1"), { project_id: "p2" })).toBe("p2");
  });

  it("falls back to the loose bucket when neither names one", () => {
    expect(resolveProjectId(runWith(), {})).toBe(DEFAULT_PROJECT_ID);
    expect(resolveProjectId(runWith(""), { project_id: "  " })).toBe(
      DEFAULT_PROJECT_ID
    );
  });
});
