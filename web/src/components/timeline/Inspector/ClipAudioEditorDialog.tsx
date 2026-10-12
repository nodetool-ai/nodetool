/**
 * The audio editor opened on a timeline clip's audio. Saving stores the edit
 * as a new WAV asset and points the clip at it (one undoable step), so the
 * source asset and any other clip that plays it keep their audio.
 */

import { useCallback } from "react";

import { useAssetStore } from "../../../stores/AssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useAssetById } from "../../../serverState/useAssetById";
import AudioSampleEditor from "../../audio_editor/AudioSampleEditor";
import DocumentLoadStatus from "../../workspace/DocumentLoadStatus";
import { Box, Dialog } from "../../ui_primitives";
import { encodeWav, type AudioSample } from "../../audio_editor/audioSample";
import type { Selection } from "../../audio_editor/WaveformView";

interface ClipAudioEditorDialogProps {
  clipId: string;
  clipName: string;
  assetId: string;
  /** The clip's window into its source, selected when the editor opens. */
  sourceWindow?: Selection;
  onClose: () => void;
}

const stripExtension = (name: string): string => name.replace(/\.[^./]+$/, "");

const ClipAudioEditorDialog = ({
  clipId,
  clipName,
  assetId,
  sourceWindow,
  onClose
}: ClipAudioEditorDialogProps) => {
  const { data: asset, isPending, refetch } = useAssetById(assetId);
  const createAsset = useAssetStore((state) => state.createAsset);
  const replaceClipOutput = useTimelineStore((state) => state.replaceClipOutput);

  const saveAsNewAsset = useCallback(
    async (sample: AudioSample): Promise<boolean> => {
      const base = stripExtension(asset?.name || clipName || "audio");
      const file = new File([encodeWav(sample)], `${base} (edited).wav`, {
        type: "audio/wav"
      });
      try {
        const stored = await createAsset(
          file,
          undefined,
          asset?.parent_id ?? undefined,
          undefined,
          "file"
        );
        replaceClipOutput(clipId, stored.id);
        useNotificationStore.getState().addNotification({
          type: "success",
          content: "Saved the edit as a new audio asset and put it on the clip."
        });
        return true;
      } catch (error) {
        useNotificationStore.getState().addNotification({
          type: "error",
          alert: true,
          content: `Failed to save audio: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
        return false;
      }
    },
    [asset, clipName, clipId, createAsset, replaceClipOutput]
  );

  const title = `Edit audio: ${clipName || asset?.name || "clip"}`;

  return (
    <Dialog open onClose={onClose} title={title} variant="fullscreen">
      <Box sx={{ width: "100%", height: "100%", minHeight: 0 }}>
        {asset ? (
          <AudioSampleEditor
            asset={asset}
            onClose={onClose}
            onSaveSample={saveAsNewAsset}
            initialSelection={sourceWindow}
          />
        ) : (
          <DocumentLoadStatus
            state={isPending ? "loading" : "error"}
            label="audio asset"
            onRetry={() => void refetch()}
            onClose={onClose}
            closeLabel="Close"
          />
        )}
      </Box>
    </Dialog>
  );
};

export default ClipAudioEditorDialog;
