import { gameEntity } from "@nodetool-ai/protocol";

const SPATIAL_FIELDS = ["spatial", "minDistance", "maxDistance", "rolloff", "distanceModel", "cone", "doppler"] as const;

const source = gameEntity.shape.audioSource.unwrap();

/** The `update_entity` patch for `audioSource`. A null spatial field returns it to its default. */
export const gameAudioSourcePatch = source.partial().extend({
  spatial: source.shape.spatial.unwrap().nullable().optional(),
  minDistance: source.shape.minDistance.unwrap().nullable().optional(),
  maxDistance: source.shape.maxDistance.unwrap().nullable().optional(),
  rolloff: source.shape.rolloff.unwrap().nullable().optional(),
  distanceModel: source.shape.distanceModel.unwrap().nullable().optional(),
  cone: source.shape.cone.unwrap().nullable().optional(),
  doppler: source.shape.doppler.unwrap().nullable().optional()
}).nullable().optional();

/** Removes the spatial fields that a patch set to null from a merged entity's audio source. */
export function clearAudioSourceNulls(entity: Record<string, unknown>): void {
  const audio = entity.audioSource;
  if (typeof audio !== "object" || audio === null || Array.isArray(audio)) { return; }
  const record = audio as Record<string, unknown>;
  for (const field of SPATIAL_FIELDS) {
    if (record[field] === null) { delete record[field]; }
  }
}
