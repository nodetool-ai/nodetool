import { seedTimelineTemplates } from "./timeline_templates.js";

export async function runSeeds(): Promise<void> {
  await seedTimelineTemplates();
}

export { seedTimelineTemplates, SEED_IDS, SYSTEM_USER_ID, TIMELINE_TEMPLATE_TAG } from "./timeline_templates.js";
