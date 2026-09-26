/**
 * AssetRevisionStore — a per-asset counter bumped when an asset's bytes
 * change under the same id, such as a relink of a file referenced in place.
 *
 * Hooks that resolve an asset once per id (the timeline's `useAssetUrl` and
 * `useAssetOffline`) read their asset's revision and resolve again when it
 * moves, so a relinked clip picks up the new media URL and online state
 * without a reload. In-memory only.
 */
import { create } from "zustand";

type AssetRevisionStore = {
  revisions: Record<string, number>;
  /** Mark `assetId` as changed. */
  bump: (assetId: string) => void;
};

export const useAssetRevisionStore = create<AssetRevisionStore>((set) => ({
  revisions: {},
  bump: (assetId) =>
    set((state) => ({
      revisions: {
        ...state.revisions,
        [assetId]: (state.revisions[assetId] ?? 0) + 1
      }
    }))
}));

/** The revision of `assetId`, 0 until it is first bumped. */
export const useAssetRevision = (assetId: string | undefined): number =>
  useAssetRevisionStore((s) => (assetId ? (s.revisions[assetId] ?? 0) : 0));
