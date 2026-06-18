import { useCallback, useState } from "react";

import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  arrayBufferToBase64,
  encodeWav,
  type AudioSample
} from "../../components/audio_editor/audioSample";
import type { Asset } from "../../stores/ApiTypes";

/**
 * Encode the edited sample to 16-bit PCM WAV and overwrite the asset's bytes.
 *
 * The sample editor is lossless and destructive, so it always writes WAV and
 * sets the asset's content type to `audio/wav` regardless of the original
 * format. Invalidates the asset query so the viewer reloads the new audio.
 */
export function useSaveAudioToAsset(asset: Asset | undefined): {
  save: (sample: AudioSample) => Promise<void>;
  saving: boolean;
} {
  const updateAsset = useAssetStore((state) => state.update);
  const invalidateQueries = useAssetStore((state) => state.invalidateQueries);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (sample: AudioSample) => {
      if (!asset) return;
      setSaving(true);
      try {
        const base64 = arrayBufferToBase64(encodeWav(sample));
        await updateAsset({
          id: asset.id,
          data: base64,
          data_encoding: "base64",
          content_type: "audio/wav"
        });
        invalidateQueries(["asset", asset.id]);
        if (asset.parent_id) {
          invalidateQueries(["assets", { parent_id: asset.parent_id }]);
        }
        useNotificationStore.getState().addNotification({
          type: "success",
          content: "Saved edits to audio."
        });
      } catch (error) {
        useNotificationStore.getState().addNotification({
          type: "error",
          alert: true,
          content: `Failed to save audio: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      } finally {
        setSaving(false);
      }
    },
    [asset, updateAsset, invalidateQueries]
  );

  return { save, saving };
}
