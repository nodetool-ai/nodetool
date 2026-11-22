/**
 * The synchronization status of a document in the desktop app's cloud window
 * (PRD, "Two statuses"): Saved to cloud, Changes waiting, Offline or Not
 * saving. Saved to cloud shows only once the server accepted the edits and
 * the local draft is gone.
 */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";

import type { CloudSyncStatus } from "../../stores/CloudSyncStatusStore";
import { FlexRow, SaveState, SPACING } from "../ui_primitives";

const DOT: Record<CloudSyncStatus, "saved" | "dirty" | "error"> = {
  savedToCloud: "saved",
  changesWaiting: "dirty",
  offline: "dirty",
  notSaving: "error"
};

export interface CloudSyncStatusLabelProps {
  status: CloudSyncStatus;
}

const CloudSyncStatusLabelInternal: React.FC<CloudSyncStatusLabelProps> = ({ status }) => {
  const { t } = useTranslation();
  const label = t(`cloudAccount.syncStatus.${status}`);
  const state = DOT[status];
  return (
    <FlexRow role="status" gap={SPACING.sm} align="center" sx={{ flexShrink: 0 }}>
      <SaveState state={state} showLabel labels={{ [state]: label }} />
    </FlexRow>
  );
};

export const CloudSyncStatusLabel = memo(CloudSyncStatusLabelInternal);
