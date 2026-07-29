/**
 * Open a video asset for editing in the timeline editor.
 *
 * A video carries a `timeline_id` when it was rendered from a timeline — in
 * that case "edit" reopens the underlying sequence. Otherwise there is no
 * sequence to edit, so we wrap the video as a single imported clip in a fresh
 * timeline and open that instead ("Create timeline from video").
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { makeTrack } from "@nodetool-ai/timeline";
import type { Asset } from "../stores/ApiTypes";
import { trpcClient } from "../trpc/client";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";
import { useNotificationStore } from "../stores/NotificationStore";
import { assetToClip } from "../components/timeline/dnd/assetToClipAdapter";
import { newDocumentId } from "../lib/newDocumentId";

export const useEditVideoAsset = (): ((asset: Asset) => Promise<void>) => {
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore((state) => state.addNotification);

  return useCallback(
    async (asset: Asset) => {
      try {
        if (asset.timeline_id) {
          openTab({
            type: "timeline",
            ref: asset.timeline_id,
            mode: "edit",
            title: asset.name || "Timeline"
          });
          navigate("/workspace");
          return;
        }

        const sequence = await trpcClient.timeline.create.mutate({
          id: newDocumentId(),
          name: asset.name || "Untitled video",
          projectId: "default"
        });
        const track = makeTrack({ type: "video", index: 0, name: "Video" });
        const clip = assetToClip(asset, track.id, 0);
        await trpcClient.timeline.update.mutate({
          id: sequence.id,
          document: { tracks: [track], clips: [clip], markers: [] }
        });
        openTab({
          type: "timeline",
          ref: sequence.id,
          mode: "edit",
          title: sequence.name || asset.name || "Timeline"
        });
        navigate("/workspace");
      } catch (error) {
        console.error("Failed to open video in timeline editor", error);
        addNotification({
          type: "error",
          content: "Failed to open video in the timeline editor",
          alert: true
        });
      }
    },
    [navigate, openTab, addNotification]
  );
};
