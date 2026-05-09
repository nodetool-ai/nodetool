import { seedTimelineTemplates } from "./timeline_templates.js";
import { seedImageEditorTemplates } from "./image_editor_templates.js";

export async function runSeeds(): Promise<void> {
  await seedTimelineTemplates();
  await seedImageEditorTemplates();
}

export { seedTimelineTemplates, SEED_IDS, SYSTEM_USER_ID, TIMELINE_TEMPLATE_TAG } from "./timeline_templates.js";
export {
  seedImageEditorTemplates,
  IMAGE_EDITOR_TEMPLATE_TAG,
  LAYER_TEMPLATE_SEED_IDS
} from "./image_editor_templates.js";
