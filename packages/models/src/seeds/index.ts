import { seedTimelineTemplates } from "./timeline_templates.js";
import { seedImageTemplates } from "./image_templates.js";
import { seedImageEditorTemplates } from "./image_editor_templates.js";
import { seedCostData } from "./cost_data.js";

export async function runSeeds(): Promise<void> {
  await seedTimelineTemplates();
  await seedImageTemplates();
  await seedImageEditorTemplates();
  // Demo cost data is opt-in (screenshots / local dev) so it never pollutes a
  // real install.
  if (process.env.NODETOOL_SEED_DEMO_COSTS === "1") {
    await seedCostData();
  }
}

export { seedCostData, COST_SEED_USER_ID } from "./cost_data.js";

export {
  seedTimelineTemplates,
  SEED_IDS,
  SYSTEM_USER_ID,
  TIMELINE_TEMPLATE_TAG
} from "./timeline_templates.js";
export {
  seedImageTemplates,
  IMAGE_SEED_IDS,
  IMAGE_TEMPLATE_TAG
} from "./image_templates.js";
export {
  seedImageEditorTemplates,
  IMAGE_EDITOR_TEMPLATE_TAG,
  LAYER_TEMPLATE_SEED_IDS
} from "./image_editor_templates.js";
