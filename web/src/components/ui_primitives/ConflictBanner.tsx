/**
 * ConflictBanner Component
 *
 * The one document-level notice that lists every conflict a merge produced
 * and lets the user accept or discard each external value (see ADR 0001).
 * Mounted by each document editor shell.
 *
 * A conflict may carry `detail` — the refused external value as text (e.g. a
 * script's code). The banner hides it behind a toggle so the list stays
 * scannable.
 */

import { forwardRef, useState, type ReactElement } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import { FlexRow } from "./FlexRow";
import { FlexColumn } from "./FlexColumn";
import { Caption } from "./Caption";
import { EditorButton } from "../editor_ui/EditorButton";
import { SPACING } from "./spacing";
import { BORDER_RADIUS, TYPOGRAPHY } from "./tokens";

export interface ConflictBannerConflict {
  /** Stable id of the merge unit, used as the React key and in callbacks. */
  unitId: string;
  /** One-line description of the refused external value. */
  label: string;
  /** The refused value as text, when it is worth reading in full. */
  detail?: string;
  /** The draft value as text, shown beside `detail` for a two-pane view. */
  draftDetail?: string;
}

export interface ConflictBannerProps {
  conflicts: ConflictBannerConflict[];
  onAccept: (unitId: string) => void;
  onDiscard: (unitId: string) => void;
  sx?: object;
}

/** One conflict row: label, actions, and the optional external-value view. */
const valuePaneSx = {
  margin: 0,
  p: SPACING.md,
  flex: 1,
  minWidth: 0,
  maxHeight: 240,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  ...TYPOGRAPHY.mono.code,
  borderRadius: BORDER_RADIUS.sm,
  border: 1,
  borderColor: "divider"
} as const;

function ConflictRow({
  conflict,
  onAccept,
  onDiscard
}: {
  conflict: ConflictBannerConflict;
  onAccept: (unitId: string) => void;
  onDiscard: (unitId: string) => void;
}): ReactElement {
  const [showDetail, setShowDetail] = useState(false);
  const hasDraft = conflict.draftDetail != null;
  const hasDetail = conflict.detail != null;
  const toggleLabel = hasDraft
    ? showDetail
      ? "Hide diff"
      : "View diff"
    : showDetail
      ? "Hide external value"
      : "View external value";
  return (
    <FlexColumn gap={0.25}>
      <FlexRow align="center" justify="space-between">
        <Caption noWrap>{conflict.label}</Caption>
        <FlexRow gap={0.5} align="center">
          {hasDetail && (
            <EditorButton
              size="small"
              onClick={() => setShowDetail((value) => !value)}
            >
              {toggleLabel}
            </EditorButton>
          )}
          <EditorButton size="small" onClick={() => onAccept(conflict.unitId)}>
            Accept
          </EditorButton>
          <EditorButton size="small" onClick={() => onDiscard(conflict.unitId)}>
            Discard
          </EditorButton>
        </FlexRow>
      </FlexRow>
      {showDetail && hasDetail && (
        <FlexRow gap={SPACING.md} align="stretch">
          {hasDraft && (
            <FlexColumn gap={0.25} sx={{ flex: 1, minWidth: 0 }}>
              <Caption>Your edit</Caption>
              <Box component="pre" sx={valuePaneSx}>
                {conflict.draftDetail}
              </Box>
            </FlexColumn>
          )}
          <FlexColumn gap={0.25} sx={{ flex: hasDraft ? 1 : undefined, minWidth: 0 }}>
            {hasDraft && <Caption>External</Caption>}
            <Box component="pre" sx={valuePaneSx}>
              {conflict.detail}
            </Box>
          </FlexColumn>
        </FlexRow>
      )}
    </FlexColumn>
  );
}

/**
 * ConflictBanner - lists the external values a dirty draft refused.
 *
 * @example
 * <ConflictBanner
 *   conflicts={[{ unitId: "shot-3", label: "Shot 3" }]}
 *   onAccept={(id) => acceptExternal(id)}
 *   onDiscard={(id) => keepDraft(id)}
 * />
 */
export const ConflictBanner = forwardRef<HTMLDivElement, ConflictBannerProps>(
  ({ conflicts, onAccept, onDiscard, sx }, ref) => {
    const summary = `${conflicts.length} change${conflicts.length === 1 ? "" : "s"} made outside the editor conflict${conflicts.length === 1 ? "s" : ""} with your edits.`;

    return (
      <Alert ref={ref} severity="warning" sx={sx}>
        <AlertTitle>{summary}</AlertTitle>
        <FlexColumn gap={0.5}>
          {conflicts.map((conflict) => (
            <ConflictRow
              key={conflict.unitId}
              conflict={conflict}
              onAccept={onAccept}
              onDiscard={onDiscard}
            />
          ))}
        </FlexColumn>
      </Alert>
    );
  }
);

ConflictBanner.displayName = "ConflictBanner";
