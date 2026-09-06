/**
 * Seeding the twelve shipped style presets into a user's library
 * (PRD § 7.3, § 7.7.9).
 *
 * A style preset is an entity, and an entity is an asset carrying a
 * `nodetool_entity` marker — so a preset is one asset row. Unlike the example
 * boards, which stay files on disk until someone installs one, presets have to
 * be rows: the style step picks one by entity id and `setStylePreset` writes
 * that id onto the board, so the id must exist before the board references it.
 *
 * The row ids are derived from `(user, preset slug)`, which is what makes
 * seeding idempotent — a second call finds the rows the first one wrote instead
 * of adding twelve more. The marker carries `system: true`, which
 * `Asset.systemEntityRefusal` reads to keep the row read-only.
 *
 * No bytes are stored. The tile art is a `package://` path on the marker,
 * served from the package asset root the same way an example board's stills
 * are.
 */

import { Asset, createStableUuid } from "@nodetool-ai/models";
import {
  ENTITY_METADATA_KEY,
  STYLE_PRESETS,
  stylePresetMarker,
  type StylePreset
} from "@nodetool-ai/protocol";

/** Namespace for the derived row ids. Changing it re-seeds every library. */
const ID_NAMESPACE = "style_preset";

/** The asset row id a preset takes in one user's library. */
export function stylePresetAssetId(userId: string, presetId: string): string {
  return createStableUuid(ID_NAMESPACE, `${userId}:${presetId}`);
}

function buildAsset(userId: string, preset: StylePreset): Asset {
  return new Asset({
    id: stylePresetAssetId(userId, preset.id),
    user_id: userId,
    // Entities are image assets; the library refuses to read a marker off
    // anything else.
    content_type: "image/jpeg",
    name: preset.name,
    metadata: { [ENTITY_METADATA_KEY]: stylePresetMarker(preset) }
  });
}

/**
 * Write any missing preset into the user's library and return every preset row,
 * in shipped order. Safe to call on every visit to the style step.
 */
export async function seedStylePresets(userId: string): Promise<Asset[]> {
  const seeded: Asset[] = [];
  for (const preset of STYLE_PRESETS) {
    const existing = await Asset.find(
      userId,
      stylePresetAssetId(userId, preset.id)
    );
    if (existing) {
      seeded.push(existing);
      continue;
    }
    const asset = buildAsset(userId, preset);
    await asset.save();
    seeded.push(asset);
  }
  return seeded;
}
