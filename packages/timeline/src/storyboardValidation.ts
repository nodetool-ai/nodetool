import type { Screenplay, Shot } from "@nodetool-ai/protocol";

/** Disabled graphics remain editable intent but never participate in composition. */
export function activeStoryboardGraphics(shot: Shot): NonNullable<NonNullable<Shot["graphics"]>["elements"]> {
  return shot.graphics?.mode === "none" ? [] : shot.graphics?.elements ?? [];
}

export interface StoryboardSemanticContext {
  assetIds: ReadonlySet<string>;
  entityIds: ReadonlySet<string>;
}

/** Finish-time diagnostics over references, without changing draft documents. */
export function validateStoryboardSemantics(
  shots: readonly Shot[],
  screenplay: Screenplay | null | undefined,
  context: StoryboardSemanticContext
): string[] {
  const errors: string[] = [];
  const shotIds = new Set(shots.map((shot) => shot.id));
  if (shotIds.size !== shots.length) {
    errors.push("Shot ids must be unique.");
  }
  for (const shot of shots) {
    const ids = new Set<string>();
    const protectedIds = new Set(shot.production?.protected_inputs?.map((input) => input.id) ?? []);
    if (shot.graphics?.mode === "none" && shot.production?.protected_inputs?.some((input) => input.kind !== "source_asset")) {
      errors.push(`${shot.id}: graphics mode none disables required protected content.`);
    }
    for (const element of activeStoryboardGraphics(shot)) {
      const label = `${shot.id}/${element.id}`;
      if (!element.id.trim() || ids.has(element.id)) {
        errors.push(`${label}: graphics element ids must be non-empty and unique within the shot.`);
      }
      ids.add(element.id);
      if (element.asset_id && !context.assetIds.has(element.asset_id)) {
        errors.push(`${label}: asset ${element.asset_id} is unavailable.`);
      }
      if (element.entity_id && !context.entityIds.has(element.entity_id)) {
        errors.push(`${label}: entity ${element.entity_id} is unavailable.`);
      }
      if (element.protected_input_id && !protectedIds.has(element.protected_input_id)) {
        errors.push(`${label}: protected input ${element.protected_input_id} is missing.`);
      }
    }
  }
  for (const transition of screenplay?.motion_design?.transitions ?? []) {
    if (!shotIds.has(transition.from_shot_id) || !shotIds.has(transition.to_shot_id)) {
      errors.push("Motion transition references a missing shot.");
    }
  }
  for (const continuity of screenplay?.motion_design?.continuities ?? []) {
    if (!continuity.id.trim() || !continuity.shot_ids.length || continuity.shot_ids.some((id) => !shotIds.has(id))) {
      errors.push(`Continuity ${continuity.id}: expected a non-empty id and existing shot references.`);
    }
  }
  return errors;
}
