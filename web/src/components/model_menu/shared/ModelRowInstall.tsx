import React, { useCallback } from "react";
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
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      void info.install();
    },
    [info]
  );

  if (info.status === "installing") {
    return <LoadingSpinner size="small" text="Installing" />;
  }

  return (
    <Tooltip title={`Install ${info.spec.installLabel} on this computer`}>
      <EditorButton
        variant="outlined"
        onClick={handleClick}
        startIcon={<InstallIcon />}
        sx={{ flexShrink: 0 }}
      >
        Install
      </EditorButton>
    </Tooltip>
  );
};

export default React.memo(ModelRowInstall);
