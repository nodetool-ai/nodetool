import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import type {
  WorkspaceTab,
  WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { tabId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import AudioViewer from "../asset_viewer/AudioViewer";
import AudioSampleEditor from "../audio_editor/AudioSampleEditor";
import {
  Box,
  FlexColumn,
  FlexRow,
  ResizableDock,
  ToolbarIconButton
} from "../ui_primitives";
import AssetAgentPanel from "./AssetAgentPanel";
import DocumentLoadStatus from "./DocumentLoadStatus";
import { WithDocumentBar, useDocumentBarHost } from "./documentBarParts";

const ASSISTANT_WIDTH = 340;

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
 * View/Edit. In edit mode the assistant docks beside the editor and edits the
 * same draft through the `ui_audio_*` tools.
 */
const AudioSurface = ({ refId, mode, active, tab }: AudioSurfaceProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { data: asset, isPending, refetch } = useAssetById(refId);
  const [editorOpened, setEditorOpened] = useState(mode === "edit");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const assistantToggle = isMobile ? undefined : (
    <ToolbarIconButton
      icon={<AutoAwesomeIcon />}
      tooltip={t("i18n-next51.audio.assistant")}
      active={assistantOpen}
      aria-pressed={assistantOpen}
      onClick={() => setAssistantOpen((open) => !open)}
    />
  );
  const { host: barHost, render: documentBar } = useDocumentBarHost(
    tab,
    assistantToggle
  );
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
        <FlexColumn
          sx={{
            width: "100%",
            height: "100%",
            minHeight: 0,
            display: mode === "edit" ? "flex" : "none"
          }}
        >
          {barHost}
          <FlexRow sx={{ flex: 1, minHeight: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <AudioSampleEditor
                asset={asset}
                active={active && mode === "edit"}
                documentBar={documentBar}
                serveAgentTools
              />
            </Box>
            {assistantOpen && !isMobile && (
              <ResizableDock
                storageKey="audio_assistant"
                defaultWidth={ASSISTANT_WIDTH}
                ariaLabel={t("i18n-next51.audio.resizeAssistant")}
              >
                <FlexColumn
                  fullWidth
                  sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
                >
                  <AssetAgentPanel
                    type="audio"
                    assetId={refId}
                    title={asset.name}
                  />
                </FlexColumn>
              </ResizableDock>
            )}
          </FlexRow>
        </FlexColumn>
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
