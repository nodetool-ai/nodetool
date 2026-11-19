/**
 * The sign-out dialog of FR30, shown when this computer holds cloud changes
 * that were not sent. The person keeps them on this computer and signs out,
 * waits until they are sent, or cancels. Nothing is deleted in any case.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Caption, Dialog, EditorButton, FlexColumn, FlexRow, LoadingSpinner, SPACING, Text } from "../ui_primitives";
import type { CloudAccountState } from "../../window";
import { countCloudDrafts, type DraftCounts } from "../../lib/cloud/waitingDrafts";

/** How often the dialog counts again while it waits for changes to be sent. */
export const SIGN_OUT_WAIT_POLL_MS = 2000;

interface CloudSignOutDialogProps {
  account: CloudAccountState;
  /** What the count found when the person chose Sign out. Null when the count failed. */
  counts: DraftCounts | null;
  onSignOut: () => void;
  onCancel: () => void;
}

const CloudSignOutDialog: React.FC<CloudSignOutDialogProps> = ({ account, counts, onSignOut, onCancel }) => {
  const { t } = useTranslation();
  const [waiting, setWaiting] = useState(false);
  const [current, setCurrent] = useState(counts);

  useEffect(() => {
    if (!waiting) {
      return undefined;
    }
    let active = true;
    const timer = window.setInterval(() => {
      void countCloudDrafts(account).then((next) => {
        if (!active || !next) {
          return;
        }
        setCurrent(next);
        if (next.waiting === 0) {
          active = false;
          onSignOut();
        }
      });
    }, SIGN_OUT_WAIT_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [waiting, account, onSignOut]);

  const actions = waiting ? (
    <FlexRow gap={SPACING.sm}>
      <EditorButton variant="text" onClick={onCancel}>
        {t("cloudAccount.signOutDialog.cancel")}
      </EditorButton>
      <EditorButton variant="outlined" onClick={onSignOut}>
        {t("cloudAccount.signOutDialog.signOutNow")}
      </EditorButton>
    </FlexRow>
  ) : (
    <FlexRow gap={SPACING.sm}>
      <EditorButton variant="text" onClick={onCancel}>
        {t("cloudAccount.signOutDialog.cancel")}
      </EditorButton>
      {current !== null && current.waiting > 0 && (
        <EditorButton variant="outlined" onClick={() => setWaiting(true)}>
          {t("cloudAccount.signOutDialog.wait")}
        </EditorButton>
      )}
      <EditorButton variant="contained" onClick={onSignOut}>
        {t("cloudAccount.signOutDialog.keep")}
      </EditorButton>
    </FlexRow>
  );

  return (
    <Dialog open onClose={onCancel} title={t("cloudAccount.signOutDialog.title")} actions={actions}>
      <FlexColumn gap={SPACING.sm}>
        {current === null && <Text>{t("cloudAccount.signOutDialog.unknown")}</Text>}
        {current !== null && current.waiting > 0 && (
          <Text>{t("cloudAccount.signOutDialog.waiting", { count: current.waiting })}</Text>
        )}
        {current !== null && current.unsent > 0 && (
          <Text>{t("cloudAccount.signOutDialog.unsent", { count: current.unsent })}</Text>
        )}
        <Caption>{t("cloudAccount.signOutDialog.kept")}</Caption>
        {waiting && (
          <FlexRow gap={SPACING.sm} align="center">
            <LoadingSpinner size="small" />
            <Caption>{t("cloudAccount.signOutDialog.waitingNote")}</Caption>
          </FlexRow>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default CloudSignOutDialog;
