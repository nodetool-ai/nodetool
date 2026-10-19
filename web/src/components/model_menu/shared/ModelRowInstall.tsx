import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import InstallIcon from "@mui/icons-material/InstallDesktop";

import { EditorButton, LoadingSpinner, Tooltip } from "../../ui_primitives";
import type { LocalProviderInstallInfo } from "../../../hooks/useLocalProviderInstalls";

interface ModelRowInstallProps {
  info: LocalProviderInstallInfo;
}

/**
 * The Install button on a picker row whose provider needs a package on this
 * computer first. It shows progress while the package installs; the row
 * becomes usable once the model list reloads.
 */
const ModelRowInstall: React.FC<ModelRowInstallProps> = ({ info }) => {
  const { t } = useTranslation();
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      void info.install();
    },
    [info]
  );

  if (info.status === "installing") {
    return <LoadingSpinner size="small" text={t("screen_modelMenu.installing")} />;
  }

  return (
    <Tooltip title={t("screen_modelMenu.installOnThisComputer", { installLabel: info.spec.installLabel })}>
      <EditorButton
        variant="outlined"
        onClick={handleClick}
        startIcon={<InstallIcon />}
        sx={{ flexShrink: 0 }}
      >
        {t("screen_modelMenu.install")}
      </EditorButton>
    </Tooltip>
  );
};

export default React.memo(ModelRowInstall);
