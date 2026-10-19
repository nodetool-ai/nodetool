/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { useStaleDeployStore } from "../../stores/StaleDeployStore";
import { Dialog, Text } from "../ui_primitives";
import { reloadIntoNewDeploy } from "../../lib/staleDeployPrompt";

/**
 * Offers a reload after a new deploy replaced this tab's assets. Mounted once
 * at the app root and imported statically: a lazy chunk of a stale tab is
 * exactly what fails to load. Driven by {@link useStaleDeployStore}.
 */
const StaleDeployDialog: React.FC = () => {
  const { t } = useTranslation();
  const open = useStaleDeployStore((s) => s.open);
  const reason = useStaleDeployStore((s) => s.reason);
  const dismiss = useStaleDeployStore((s) => s.dismiss);

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      title={t("screen_shared.staleDeploy.title")}
      onConfirm={reloadIntoNewDeploy}
      onCancel={dismiss}
      confirmText={t("screen_shared.staleDeploy.reloadNow")}
      cancelText={t("screen_shared.staleDeploy.later")}
      content={
        <Text>
          {reason === "chunk-error"
            ? t("screen_shared.staleDeploy.chunkError")
            : t("screen_shared.staleDeploy.updated")}{" "}
          {t("screen_shared.staleDeploy.unsavedChanges")}
        </Text>
      }
    />
  );
};

StaleDeployDialog.displayName = "StaleDeployDialog";

export default memo(StaleDeployDialog);
