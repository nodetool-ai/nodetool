import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Prediction } from "../src/prediction.js";
import { Workflow } from "../src/workflow.js";
import { seedCostData, COST_SEED_USER_ID } from "../src/seeds/cost_data.js";

describe("seedCostData", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("seeds predictions and demo workflows with node types", async () => {
    const created = await seedCostData();
    expect(created).toBeGreaterThan(0);

    const [rows] = await Prediction.paginate(COST_SEED_USER_ID, {
      limit: 1000
    });
    expect(rows).toHaveLength(created);
    expect(rows.every((r) => r.node_type.length > 0)).toBe(true);
    expect(rows.some((r) => r.status === "failed")).toBe(true);

    const wf = await Workflow.get<Workflow>("seed-wf-product-0001");
    expect(wf?.name).toBe("Product shots batch");
  });

  it("is idempotent", async () => {
    const first = await seedCostData();
    const second = await seedCostData();
    expect(second).toBe(0);

    const [rows] = await Prediction.paginate(COST_SEED_USER_ID, {
      limit: 1000
    });
    expect(rows).toHaveLength(first);
  });

  it("feeds the dashboard aggregation with resolvable workflow names", async () => {
    await seedCostData();
    const dash = await Prediction.aggregateDashboard(COST_SEED_USER_ID, {
      days: 14,
      tzOffsetMinutes: 0
    });
    expect(dash.providers.length).toBeGreaterThan(0);
    expect(dash.executions.length).toBeGreaterThan(0);
    expect(dash.stats.total_cost).toBeGreaterThan(0);
    expect(dash.executions.every((e) => e.node_type.length > 0)).toBe(true);
    expect(dash.executions.some((e) => e.workflow_name)).toBe(true);
  });
});
