import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  WorkspaceTab,
  WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { tabId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import AudioViewer from "../asset_viewer/AudioViewer";
import AudioSampleEditor from "../audio_editor/AudioSampleEditor";
import { Box } from "../ui_primitives";
import DocumentLoadStatus from "./DocumentLoadStatus";
import { WithDocumentBar, workspaceDocumentBar } from "./documentBarParts";

interface AudioSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
}

/**
 * The document surface for an audio asset tab. View mode renders the waveform
 * AudioViewer; edit mode embeds the sample editor, which decodes the asset into
 * PCM, applies destructive edits, and saves the result back as WAV.
 *
 * Editor drafts stay mounted through tab and mode switches. Playback is
 * suspended while the editor is hidden. The editor draws the tab's document
 * bar; the viewer and the load states get the bar with the title and
 * View/Edit.
 */
const AudioSurface = ({ refId, mode, active, tab }: AudioSurfaceProps) => {
  const { t } = useTranslation();
  const { data: asset, isPending, refetch } = useAssetById(refId);
  const [editorOpened, setEditorOpened] = useState(mode === "edit");
  if (mode === "edit" && !editorOpened) {
    setEditorOpened(true);
  }
  if (!asset) {
    return (
      <WithDocumentBar tab={tab}>
        <DocumentLoadStatus
          state={isPending ? "loading" : "error"}
          label={t("i18n-next51.audio.asset")}
          onRetry={() => void refetch()}
          onClose={() =>
            useWorkspaceTabsStore.getState().closeTab(tabId("audio", refId))
          }
        />
      </WithDocumentBar>
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
            active={active && mode === "edit"}
            documentBar={workspaceDocumentBar(tab)}
          />
        </Box>
      )}
      {mode !== "edit" && (
        <WithDocumentBar tab={tab}>
          <AudioViewer asset={asset} />
        </WithDocumentBar>
      )}
    </>
  );
};

export default AudioSurface;
