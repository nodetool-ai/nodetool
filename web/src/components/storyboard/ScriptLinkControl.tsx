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
import { useTranslation } from "react-i18next";
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

export interface ScriptLinkNotice {
  severity: "error" | "warning";
  message: string;
}

/**
 * The link action alone: what the button says and does, and the notices to
 * show near it. The document bar puts the action in its ⋮ menu and the
 * notices over the board.
 */
export const useScriptLinkAction = (boardId: string, disabled?: boolean) => {
  const scriptId = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.script_id ?? null
  );
  const { t } = useTranslation();
  const hasShots = useStoryboardStore(
    (state) => (state.boards[boardId]?.shots.length ?? 0) > 0
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { extract, extracting, error } = useExtractScriptFromBoard();
  const { errors: linkErrors, warnings: linkWarnings } =
    useBoardScriptLinkIssues(boardId);

  const onExtract = useCallback(() => {
    void extract(boardId).catch(() => {
      // Reported through `error`; swallow so the click handler stays quiet.
    });
  }, [extract, boardId]);

  const onOpen = useCallback(() => {
    if (!scriptId) {
      return;
    }
    openTab({
      type: "script",
      ref: scriptId,
      mode: "edit",
      title: t("screens4_15.storyboard.scriptLink.script")
    });
  }, [openTab, scriptId, t]);

  const notices: ScriptLinkNotice[] = [
    ...(error ? [{ severity: "error" as const, message: error }] : []),
    ...linkErrors.map((issue) => ({
      severity: "warning" as const,
      message:
        issue.code === "duplicate_line_reference"
          ? t("screens4_15.storyboard.scriptLink.issues.duplicateLine", {
              lineId: issue.lineId ?? "",
              shotId: issue.shotId ?? ""
            })
          : issue.code === "unknown_line_reference"
            ? t("screens4_15.storyboard.scriptLink.issues.unknownLine", {
                shotId: issue.shotId ?? "",
                lineId: issue.lineId ?? ""
              })
            : t("screens4_15.storyboard.scriptLink.issues.unlinkedBoard", {
                shotId: issue.shotId ?? ""
              })
    })),
    ...linkWarnings.map(() => ({
      severity: "warning" as const,
      message: t("screens4_15.storyboard.scriptLink.issues.missingScript", {
        scriptId: scriptId ?? ""
      })
    }))
  ];

  return {
    label: scriptId
      ? t("screens4_15.storyboard.scriptLink.open")
      : extracting
        ? t("screens4_15.storyboard.scriptLink.extracting")
        : t("screens4_15.storyboard.scriptLink.extract"),
    tooltip: scriptId
      ? t("screens4_15.storyboard.scriptLink.openTooltip")
      : t("screens4_15.storyboard.scriptLink.extractTooltip"),
    onClick: scriptId ? onOpen : onExtract,
    disabled: !!disabled || extracting || (!scriptId && !hasShots),
    notices
  };
};

/** The notices of {@link useScriptLinkAction}, one banner each. */
export const ScriptLinkNotices = ({
  notices
}: {
  notices: readonly ScriptLinkNotice[];
}) => (
  <>
    {notices.map((notice) => (
      <AlertBanner key={notice.message} severity={notice.severity} compact>
        {notice.message}
      </AlertBanner>
    ))}
  </>
);

const ScriptLinkControlInner = ({
  boardId,
  disabled
}: ScriptLinkControlProps) => {
  const action = useScriptLinkAction(boardId, disabled);

  return (
    <FlexColumn gap={SPACING.xs}>
      <EditorButton
        variant="outlined"
        startIcon={<DescriptionOutlinedIcon />}
        onClick={action.onClick}
        disabled={action.disabled}
        tooltip={action.tooltip}
      >
        {action.label}
      </EditorButton>
      <ScriptLinkNotices notices={action.notices} />
    </FlexColumn>
  );
};

export const ScriptLinkControl = memo(ScriptLinkControlInner);
ScriptLinkControl.displayName = "ScriptLinkControl";

export default ScriptLinkControl;
