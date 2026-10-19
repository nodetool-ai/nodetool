/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRunWarningStore } from "../../stores/RunWarningStore";
import {
  Dialog,
  Checkbox,
  Text,
  FlexColumn,
  SPACING
} from "../ui_primitives";

/**
 * Confirmation shown before a "Run Entire Workflow" action that would execute many
 * provider/model nodes at once. Mounted once at the app root; driven entirely
 * by {@link useRunWarningStore}.
 */
const RunWarningDialog: React.FC = () => {
  const { t } = useTranslation();
  const open = useRunWarningStore((s) => s.open);
  const kind = useRunWarningStore((s) => s.kind);
  const heavyCount = useRunWarningStore((s) => s.heavyCount);
  const threshold = useRunWarningStore((s) => s.threshold);
  const confirm = useRunWarningStore((s) => s.confirm);
  const cancel = useRunWarningStore((s) => s.cancel);

  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleConfirm = useCallback(() => {
    // The session suppression only applies to the heavy-run warning; a
    // concurrent-run confirmation always asks.
    confirm(kind === "heavy" && dontAskAgain);
    setDontAskAgain(false);
  }, [confirm, dontAskAgain, kind]);

  const handleCancel = useCallback(() => {
    cancel();
    setDontAskAgain(false);
  }, [cancel]);

  const isConcurrent = kind === "concurrent";

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      title={
        isConcurrent
          ? t("screen_shared.runWarning.concurrentTitle")
          : t("screen_shared.runWarning.heavyTitle")
      }
      onConfirm={handleConfirm}
      confirmText={isConcurrent ? t("screen_shared.runWarning.startSecondRun") : t("screen_shared.runWarning.runAnyway")}
      content={
        <FlexColumn gap={SPACING.sm}>
          {isConcurrent ? (
            <Text>
              {t("screen_shared.runWarning.concurrentBody", { count: heavyCount })}
            </Text>
          ) : (
            <>
              <Text>
                {t("screen_shared.runWarning.heavyBody", { count: heavyCount, threshold })}
              </Text>
              <Checkbox
                label={t("screen_shared.runWarning.dontAskAgain")}
                checked={dontAskAgain}
                onChange={(_event, checked) => setDontAskAgain(checked)}
              />
            </>
          )}
        </FlexColumn>
      }
    />
  );
};

RunWarningDialog.displayName = "RunWarningDialog";

export default memo(RunWarningDialog);
