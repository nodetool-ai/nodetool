/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useState } from "react";
import { useRunWarningStore } from "../../stores/RunWarningStore";
import { Dialog, Checkbox, Text, FlexColumn } from "../ui_primitives";

/**
 * Confirmation shown before a "Run Workflow" that would execute many
 * provider/model nodes at once. Mounted once at the app root; driven entirely
 * by {@link useRunWarningStore}.
 */
const RunWarningDialog: React.FC = () => {
  const open = useRunWarningStore((s) => s.open);
  const heavyCount = useRunWarningStore((s) => s.heavyCount);
  const confirm = useRunWarningStore((s) => s.confirm);
  const cancel = useRunWarningStore((s) => s.cancel);

  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleConfirm = useCallback(() => {
    confirm(dontAskAgain);
    setDontAskAgain(false);
  }, [confirm, dontAskAgain]);

  const handleCancel = useCallback(() => {
    cancel();
    setDontAskAgain(false);
  }, [cancel]);

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      title="Run this workflow?"
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmText="Run anyway"
      cancelText="Cancel"
      content={
        <FlexColumn gap={1.5}>
          <Text>
            This run will execute{" "}
            <strong>{heavyCount} model/provider nodes</strong>, each of which may
            call an external API or run a model. Running them all at once can be
            slow or hit provider rate limits.
          </Text>
          <Checkbox
            label="Don't ask again for this session"
            checked={dontAskAgain}
            onChange={(_event, checked) => setDontAskAgain(checked)}
          />
        </FlexColumn>
      }
    />
  );
};

RunWarningDialog.displayName = "RunWarningDialog";

export default memo(RunWarningDialog);
