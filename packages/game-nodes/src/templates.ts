import {
  NATIVE_GAME_TEMPLATES,
  findNativeGameTemplate,
  type GameSlotSpec,
  type NativeGameTemplate
} from "@nodetool-ai/protocol";

export type { NativeGameTemplate };

export function listNativeTemplates(): readonly NativeGameTemplate[] {
  return NATIVE_GAME_TEMPLATES;
}

export function getNativeTemplate(id: string): NativeGameTemplate {
  const template = findNativeGameTemplate(id);
  if (template) return template;
  throw new Error(
    `Unknown native game template ${id}. Available: ${NATIVE_GAME_TEMPLATES.map((entry) => entry.id).join(", ")}`
  );
}

/** The first template slot with this id, for seeding a document slot's generation request. */
export function gameTemplateSlot(slotId: string): GameSlotSpec | undefined {
  for (const template of listNativeTemplates()) {
    const slot = template.manifest.slots.find((entry) => entry.id === slotId);
    if (slot) return slot;
  }
  return undefined;
}
