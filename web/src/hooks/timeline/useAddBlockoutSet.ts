/**
 * Add a new Blockout set to the open timeline: an empty set asset (a ground
 * plane) in the active project, and the free-camera `model3d` clip that films
 * it. The add-clip menu and the track lane's context menu both call this.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useAssetStore } from "../../stores/AssetStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import {
  blockoutSetClip,
  blockoutSetFile
} from "../../components/timeline/model3dSet";

/** Uploads the set, places its clip as one undo entry and selects it. */
export function useAddBlockoutSet(): (
  trackId: string,
  startMs: number
) => Promise<void> {
  const { t } = useTranslation();
  const createAsset = useAssetStore((s) => s.createAsset);
  const addClip = useTimelineStore((s) => s.addClip);
  const selectClip = useTimelineUIStore((s) => s.selectClip);

  return useCallback(
    async (trackId: string, startMs: number) => {
      const name = t("i18n-next6.addClip.blockoutSet");
      const asset = await createAsset(
        blockoutSetFile(name),
        undefined,
        undefined,
        undefined,
        "file",
        useWorkspaceTabsStore.getState().activeProjectId ?? undefined
      );
      const clip = blockoutSetClip(asset, trackId, startMs, name);
      addClip(clip);
      selectClip(clip.id);
    },
    [addClip, createAsset, selectClip, t]
  );
}
