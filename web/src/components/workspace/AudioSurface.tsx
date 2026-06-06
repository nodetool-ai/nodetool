import { useCallback } from "react";

import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import { tabId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import AudioViewer from "../asset_viewer/AudioViewer";
import AudioSampleEditor from "../audio_editor/AudioSampleEditor";
import { FlexColumn, LoadingSpinner } from "../ui_primitives";

interface AudioSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * The document surface for an audio asset tab. View mode renders the waveform
 * AudioViewer; edit mode embeds the sample editor, which decodes the asset into
 * PCM, applies destructive edits, and saves the result back as WAV.
 *
 * The editor is mounted only while the tab is `active`: it owns an AudioContext
 * and playback, so keeping it alive in hidden background tabs (all tabs stay
 * mounted in the shell) would leak audio resources. Inactive edit tabs fall
 * back to the (hidden) viewer.
 */
const AudioSurface = ({ refId, mode, active }: AudioSurfaceProps) => {
  const { data: asset } = useAssetById(refId);
  const setMode = useWorkspaceTabsStore((state) => state.setMode);

  const returnToView = useCallback(() => {
    setMode(tabId("audio", refId), "view");
  }, [setMode, refId]);

  if (!asset) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (mode === "edit" && active) {
    return <AudioSampleEditor asset={asset} onClose={returnToView} />;
  }

  return <AudioViewer asset={asset} />;
};

export default AudioSurface;
