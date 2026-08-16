/**
 * ScriptLinkControl — the board header's half of the script ↔ storyboard link.
 *
 * Unlinked: *Extract script* projects the board's dialogue and narration into a
 * new script. Linked: *Open script* navigates to it. Link problems the design's
 * invariants catch (a line two shots claim, a line the script no longer has, a
 * script that was deleted) are shown here rather than left for the save to fail
 * on.
 */

import { memo, useCallback } from "react";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";

import {
  AlertBanner,
  EditorButton,
  FlexColumn,
  SPACING
} from "../ui_primitives";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useExtractScriptFromBoard } from "../../hooks/storyboard/useExtractScriptFromBoard";
import { useBoardScriptLinkIssues } from "../../hooks/storyboard/useBoardScriptLinkIssues";

interface ScriptLinkControlProps {
  boardId: string;
  /** Disables the extract action while another board-wide run is in flight. */
  disabled?: boolean;
}

const ScriptLinkControlInner = ({
  boardId,
  disabled
}: ScriptLinkControlProps) => {
  const scriptId = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.script_id ?? null
  );
  const hasShots = useStoryboardStore(
    (state) => (state.boards[boardId]?.shots.length ?? 0) > 0
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { extract, extracting, error } = useExtractScriptFromBoard();
  const { messages } = useBoardScriptLinkIssues(boardId);

  const onExtract = useCallback(() => {
    void extract(boardId).catch(() => {
      // Reported through `error`; swallow so the click handler stays quiet.
    });
  }, [extract, boardId]);

  const onOpen = useCallback(() => {
    if (!scriptId) {
      return;
    }
    openTab({ type: "script", ref: scriptId, mode: "edit", title: "Script" });
  }, [openTab, scriptId]);

  return (
    <FlexColumn gap={SPACING.xs}>
      <EditorButton
        variant="outlined"
        startIcon={<DescriptionOutlinedIcon fontSize="small" />}
        onClick={scriptId ? onOpen : onExtract}
        disabled={disabled || extracting || (!scriptId && !hasShots)}
        title={
          scriptId
            ? "Open the script this board's words come from"
            : "Project this board's dialogue and narration into a script"
        }
      >
        {scriptId ? "Open script" : extracting ? "Extracting…" : "Extract script"}
      </EditorButton>
      {error && (
        <AlertBanner severity="error" compact>
          {error}
        </AlertBanner>
      )}
      {messages.map((message) => (
        <AlertBanner key={message} severity="warning" compact>
          {message}
        </AlertBanner>
      ))}
    </FlexColumn>
  );
};

export const ScriptLinkControl = memo(ScriptLinkControlInner);
ScriptLinkControl.displayName = "ScriptLinkControl";

export default ScriptLinkControl;
