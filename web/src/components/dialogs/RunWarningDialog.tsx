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
      title={isConcurrent ? "Start another run?" : "Run this workflow?"}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmText={isConcurrent ? "Start second run" : "Run anyway"}
      cancelText="Cancel"
      content={
        <FlexColumn gap={1.5}>
          {isConcurrent ? (
            <Text>
              This workflow is <strong>already running</strong>. Starting
              another run will execute both at the same time — for realtime
              audio patches that means overlapping sound. Stop the current run
              first if you meant to restart it.
            </Text>
          ) : (
            <>
              <Text>
                This run will execute{" "}
                <strong>{heavyCount} model/provider nodes</strong> — above the
                warning threshold of {threshold}. Each may call an external API
                or run a model, so running them all at once can be slow or hit
                provider rate limits.
              </Text>
              <Checkbox
                label="Don't ask again for this session"
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
