import { useCallback, useState } from "react";

import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import { tabId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import AudioViewer from "../asset_viewer/AudioViewer";
import AudioSampleEditor from "../audio_editor/AudioSampleEditor";
import { Box } from "../ui_primitives";
import DocumentLoadStatus from "./DocumentLoadStatus";

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
 * Editor drafts stay mounted through tab and mode switches. Playback is
 * suspended while the editor is hidden.
 */
const AudioSurface = ({ refId, mode, active }: AudioSurfaceProps) => {
  const { data: asset, isPending, refetch } = useAssetById(refId);
  const [editorOpened, setEditorOpened] = useState(mode === "edit");
  if (mode === "edit" && !editorOpened) {
    setEditorOpened(true);
  }
  const setMode = useWorkspaceTabsStore((state) => state.setMode);

  const returnToView = useCallback(() => {
    setMode(tabId("audio", refId), "view");
  }, [setMode, refId]);

  if (!asset) {
    return (
      <DocumentLoadStatus
        state={isPending ? "loading" : "error"}
        label="audio asset"
        onRetry={() => void refetch()}
        onClose={() =>
          useWorkspaceTabsStore.getState().closeTab(tabId("audio", refId))
        }
      />
    );
  }

  return (
    <>
      {editorOpened && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            display: mode === "edit" ? "block" : "none"
          }}
        >
          <AudioSampleEditor
            asset={asset}
            onClose={returnToView}
            active={active && mode === "edit"}
          />
        </Box>
      )}
      {mode !== "edit" && <AudioViewer asset={asset} />}
    </>
  );
};

export default AudioSurface;
