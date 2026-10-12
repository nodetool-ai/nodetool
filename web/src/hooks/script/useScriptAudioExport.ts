/**
 * useScriptAudioExport — renders a whole voiced script to one WAV or MP3 file
 * and downloads it. The render and encode live in
 * {@link renderScriptAudio} and {@link encodeScriptAudio}.
 */

import { useCallback, useState } from "react";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import {
  SCRIPT_AUDIO_MIME,
  encodeScriptAudio,
  renderScriptAudio,
  type ScriptAudioFormat
} from "../../components/script/exportScriptAudio";

interface UseScriptAudioExportResult {
  exportAudio: (format: ScriptAudioFormat) => Promise<void>;
  /** The format being exported, or null when idle. */
  exporting: ScriptAudioFormat | null;
}

/** File-name stem for a script title, matching the SRT export. */
export function scriptFileBase(title: string): string {
  return (
    title
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^[._]+/, "") || "script"
  );
}

function downloadBytes(bytes: Uint8Array, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function resolveTakeUrl(assetId: string): Promise<string | undefined> {
  try {
    const asset = await useAssetStore.getState().get(assetId);
    return getAssetUrl(asset) ?? undefined;
  } catch {
    return undefined;
  }
}

export const useScriptAudioExport = (
  scriptId: string
): UseScriptAudioExportResult => {
  const [exporting, setExporting] = useState<ScriptAudioFormat | null>(null);

  const exportAudio = useCallback(
    async (format: ScriptAudioFormat): Promise<void> => {
      const script = useScriptStore.getState().getScript(scriptId);
      if (!script) return;
      const notify = useNotificationStore.getState().addNotification;
      setExporting(format);
      try {
        const buffer = await renderScriptAudio(script, {
          resolveUrl: resolveTakeUrl
        });
        if (!buffer) {
          notify({
            type: "warning",
            content: "No take audio could be loaded, so nothing was exported."
          });
          return;
        }
        const bytes = await encodeScriptAudio(buffer, format);
        downloadBytes(
          bytes,
          SCRIPT_AUDIO_MIME[format],
          `${scriptFileBase(script.title)}.${format}`
        );
      } catch (err) {
        notify({
          type: "error",
          content: `${format.toUpperCase()} export failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        });
      } finally {
        setExporting(null);
      }
    },
    [scriptId]
  );

  return { exportAudio, exporting };
};
