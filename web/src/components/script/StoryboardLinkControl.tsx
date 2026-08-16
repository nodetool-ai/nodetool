/**
 * StoryboardLinkControl — the script header's half of the script ↔ storyboard
 * link.
 *
 * Unlinked: *Create storyboard* derives one shot per line, linked, with the
 * words projected into it. Linked: *Open storyboard* navigates to the board.
 * Link problems on that board are shown here too, so the script side sees a
 * broken link without opening the board.
 *
 * The back-pointer is the persisted `scripts.storyboard_id`, so a reload still
 * shows *Open storyboard* — see {@link useScriptStoryboardLink}.
 */

import { memo, useCallback } from "react";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";

import {
  AlertBanner,
  EditorButton,
  FlexColumn,
  SPACING
} from "../ui_primitives";
import { useScriptStoryboardLink } from "../../stores/script/ScriptStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useDeriveStoryboard } from "../../hooks/script/useDeriveStoryboard";
import { useBoardScriptLinkIssues } from "../../hooks/storyboard/useBoardScriptLinkIssues";

interface StoryboardLinkControlProps {
  scriptId: string;
}

const StoryboardLinkControlInner = ({
  scriptId
}: StoryboardLinkControlProps) => {
  const storyboardId = useScriptStoryboardLink(scriptId);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { derive, deriving, error } = useDeriveStoryboard();
  const { messages } = useBoardScriptLinkIssues(storyboardId ?? "");

  const onDerive = useCallback(() => {
    void derive(scriptId).catch(() => {
      // Reported through `error`; swallow so the click handler stays quiet.
    });
  }, [derive, scriptId]);

  const onOpen = useCallback(() => {
    if (!storyboardId) {
      return;
    }
    openTab({
      type: "storyboard",
      ref: storyboardId,
      mode: "edit",
      title: "Storyboard"
    });
  }, [openTab, storyboardId]);

  return (
    <FlexColumn gap={SPACING.xs}>
      <EditorButton
        size="small"
        variant="text"
        startIcon={<DashboardOutlinedIcon fontSize="small" />}
        onClick={storyboardId ? onOpen : onDerive}
        disabled={deriving}
        title={
          storyboardId
            ? "Open the storyboard derived from this script"
            : "Derive a storyboard: one shot per line, linked to it"
        }
      >
        {storyboardId
          ? "Open storyboard"
          : deriving
            ? "Creating…"
            : "Create storyboard"}
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

export const StoryboardLinkControl = memo(StoryboardLinkControlInner);
StoryboardLinkControl.displayName = "StoryboardLinkControl";

export default StoryboardLinkControl;
