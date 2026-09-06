/**
 * Reading a graph's `fills` input into the filled manifest the Godot writer
 * takes.
 *
 * A `nodetool.game.*` checker emits two handles: `fill`, the {@link SlotFill}
 * it validated, and `output`, the stored image or audio ref carrying that same
 * fill under `metadata.nodetool_slot`. Only the second one knows where the
 * bytes are, so that is the handle `ExportGodotProject` wants — and a bare fill
 * is rejected with the wiring that fixes it rather than exported as a project
 * with no art in it.
 */

import {
  SLOT_METADATA_KEY,
  filledManifest,
  filledSlot,
  slotFill,
  type FilledManifest,
  type FilledSlot,
  type SlotFill
} from "@nodetool-ai/protocol";
import { slotFileStem } from "@nodetool-ai/godot";
import type { MediaRefValue } from "@nodetool-ai/runtime";

/** The default extension per fill kind, when a ref's uri carries none. */
const DEFAULT_EXTENSION: Record<SlotFill["kind"], string> = {
  spritesheet: "png",
  tileset: "png",
  image: "png",
  sfx: "wav",
  music: "wav"
};

const isAudio = (kind: SlotFill["kind"]): boolean =>
  kind === "sfx" || kind === "music";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** `asset://player.png` → `player`; anything else → "". */
function idFromUri(uri: string): string {
  if (!uri.startsWith("asset://")) return "";
  return uri.slice("asset://".length).split(".")[0] ?? "";
}

function extensionFromUri(uri: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(uri);
  return match ? match[1].toLowerCase() : "";
}

export interface ResolvedFills {
  manifest: FilledManifest;
  /** The ref to read bytes from, per asset id the writer will copy. */
  refs: Map<string, MediaRefValue>;
}

/**
 * The filled manifest `fills` describes, plus the ref each asset's bytes come
 * from.
 *
 * An entry is either a checker's stamped `output` ref or a whole
 * `{slot_id, asset, fill}` record. An asset id is taken from the ref when it
 * has one and derived from the slot id when it does not, so a hermetic run —
 * one whose context cannot create assets, where every checker returns its ref
 * inline — still exports a project with deterministic resource ids.
 */
export function resolveFills(
  template: string,
  fills: readonly unknown[]
): ResolvedFills {
  if (fills.length === 0) {
    throw new Error(
      "fills is empty: wire the output handle of one nodetool.game checker per slot."
    );
  }
  const slots: FilledSlot[] = [];
  const refs = new Map<string, MediaRefValue>();

  for (const [index, entry] of fills.entries()) {
    const at = `fills[${index}]`;
    if (!isRecord(entry)) {
      throw new Error(`${at} is not a slot fill.`);
    }

    const whole = filledSlot.safeParse(entry);
    if (whole.success) {
      slots.push(whole.data);
      refs.set(whole.data.asset.asset_id, {
        uri: whole.data.asset.uri,
        asset_id: whole.data.asset.asset_id
      });
      continue;
    }

    const stamped = slotFill.safeParse(
      isRecord(entry.metadata) ? entry.metadata[SLOT_METADATA_KEY] : undefined
    );
    if (!stamped.success) {
      const bare = slotFill.safeParse(entry);
      throw new Error(
        bare.success
          ? `${at} is a bare ${bare.data.kind} fill for slot ${bare.data.slot_id}, ` +
            `which says nothing about where the bytes are. Wire the checker's ` +
            `output handle instead of its fill handle.`
          : `${at} carries no slot fill. Run the asset through the nodetool.game ` +
            `node for its kind first (SpriteSheet, Tileset, SeamlessImage, ` +
            `SoundEffect, MusicLoop).`
      );
    }

    const fill = stamped.data;
    const uri = text(entry.uri);
    const assetId =
      text(entry.asset_id) || idFromUri(uri) || slotFileStem(fill.slot_id);
    const extension =
      extensionFromUri(uri) || DEFAULT_EXTENSION[fill.kind];
    slots.push({
      slot_id: fill.slot_id,
      asset: {
        type: isAudio(fill.kind) ? "audio" : "image",
        uri: `asset://${assetId}.${extension}`,
        asset_id: assetId
      },
      fill
    });
    refs.set(assetId, entry as MediaRefValue);
  }

  const parsed = filledManifest.safeParse({
    manifest_version: 1,
    template,
    slots
  });
  if (!parsed.success) {
    throw new Error(
      `the filled slots do not form a manifest: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`
    );
  }
  return { manifest: parsed.data, refs };
}
