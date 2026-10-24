/**
 * SaveStatus
 *
 * The save readout of a document bar, with one vocabulary for every document
 * type: "Saved", "Saving…", "Unsaved changes", "Not saved" (with Retry) and
 * "Read only". It draws `SaveState`, so the dot colours match the status bars.
 *
 * @example
 * <SaveStatus state={saving ? "saving" : dirty ? "dirty" : "saved"} />
 * <SaveStatus state="error" onRetry={save} />
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";

import { Box } from "./Box";
import { EditorButton } from "../editor_ui/EditorButton";
import { SaveState } from "./StatusBar";
import { SPACING } from "./spacing";
import { TYPOGRAPHY } from "./tokens";

export type SaveStatusValue =
  | "saved"
  | "saving"
  | "dirty"
  | "error"
  | "readOnly";

export interface SaveStatusProps {
  state: SaveStatusValue;
  /** Shown as a Retry button beside "Not saved". */
  onRetry?: () => void;
  /**
   * Keep only the dot, labelled for screen readers. The document bar sets
   * this when it runs out of width.
   */
  compact?: boolean;
  className?: string;
}

const SaveStatusInternal: React.FC<SaveStatusProps> = ({
  state,
  onRetry,
  compact = false,
  className
}) => {
  const { t } = useTranslation();

  if (state === "readOnly") {
    return (
      <Box
        component="span"
        className={className}
        sx={{
          ...TYPOGRAPHY.sans.caption,
          color: "text.secondary",
          whiteSpace: "nowrap",
          flexShrink: 0
        }}
      >
        {t("i18n-next103.saveStatus.readOnly")}
      </Box>
    );
  }

  return (
    <Box
      className={className}
      role="status"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: SPACING.sm,
        minWidth: 0,
        flexShrink: 0
      }}
    >
      <SaveState
        state={state}
        showLabel={!compact}
        labels={{ error: t("i18n-next103.saveStatus.notSaved") }}
      />
      {state === "error" && onRetry && (
        <EditorButton density="compact" variant="text" onClick={onRetry}>
          {t("i18n-next103.saveStatus.retry")}
        </EditorButton>
      )}
    </Box>
  );
};

export const SaveStatus = memo(SaveStatusInternal);
SaveStatus.displayName = "SaveStatus";
