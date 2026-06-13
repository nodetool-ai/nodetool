import { seedCostData } from "./cost_data.js";

export async function runSeeds(): Promise<void> {
  if (process.env.NODETOOL_SEED_DEMO_COSTS === "1") {
    await seedCostData();
  }
}

export { seedCostData, COST_SEED_USER_ID } from "./cost_data.js";
