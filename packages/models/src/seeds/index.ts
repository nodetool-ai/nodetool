import { seedTimelineTemplates } from "./timeline_templates.js";
import { seedImageTemplates } from "./image_templates.js";

export async function runSeeds(): Promise<void> {
  await seedTimelineTemplates();
  await seedImageTemplates();
}

export { seedTimelineTemplates, SEED_IDS, SYSTEM_USER_ID, TIMELINE_TEMPLATE_TAG } from "./timeline_templates.js";
export { seedImageTemplates, IMAGE_SEED_IDS, IMAGE_TEMPLATE_TAG } from "./image_templates.js";
