/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useStaleDeployStore } from "../../stores/StaleDeployStore";
import { Dialog, Text } from "../ui_primitives";
import { reloadIntoNewDeploy } from "../../lib/staleDeployPrompt";

/**
 * Offers a reload after a new deploy replaced this tab's assets. Mounted once
 * at the app root and imported statically: a lazy chunk of a stale tab is
 * exactly what fails to load. Driven by {@link useStaleDeployStore}.
 */
const StaleDeployDialog: React.FC = () => {
  const open = useStaleDeployStore((s) => s.open);
  const reason = useStaleDeployStore((s) => s.reason);
  const dismiss = useStaleDeployStore((s) => s.dismiss);

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      title="A new version of NodeTool is available"
      onConfirm={reloadIntoNewDeploy}
      onCancel={dismiss}
      confirmText="Reload now"
      cancelText="Later"
      content={
        <Text>
          {reason === "chunk-error"
            ? "Part of the app could not load because NodeTool was updated. Reload to continue."
            : "Reload to switch to the new version."}{" "}
          If you have unsaved changes, your browser asks before reloading.
        </Text>
      }
    />
  );
};

StaleDeployDialog.displayName = "StaleDeployDialog";

export default memo(StaleDeployDialog);
