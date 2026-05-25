import { Workflow } from "../workflow.js";
import {
  SEEDED_LAYER_TEMPLATES,
  IMAGE_EDITOR_TEMPLATE_TAG,
  LAYER_TEMPLATE_SEED_IDS
} from "@nodetool-ai/image-editor";

export { IMAGE_EDITOR_TEMPLATE_TAG, LAYER_TEMPLATE_SEED_IDS };

const SYSTEM_USER_ID = "1";

export async function seedImageEditorTemplates(): Promise<void> {
  const now = new Date().toISOString();
  for (const template of SEEDED_LAYER_TEMPLATES) {
    const wf = new Workflow({
      id: template.id,
      user_id: SYSTEM_USER_ID,
      name: template.name,
      description: template.description,
      tags: [IMAGE_EDITOR_TEMPLATE_TAG],
      access: "public",
      run_mode: "workflow",
      graph: template.graph,
      settings: null,
      tool_name: null,
      package_name: null,
      path: null,
      workspace_id: null,
      html_app: null,
      thumbnail: null,
      thumbnail_url: null,
      created_at: now,
      updated_at: now
    });
    await wf.save();
  }
}
