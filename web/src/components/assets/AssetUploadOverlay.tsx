/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import ReactDOM from "react-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { Text, FlexColumn, ProgressBar, BORDER_RADIUS, Z_INDEX, getSpacingPx, SPACING, SHADOW } from "../ui_primitives";
import { useAssetUpload } from "../../serverState/useAssetUpload";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "100%",
      height: "50%",
      padding: "0",
      backgroundColor: "transparent",
      zIndex: Z_INDEX.overlay,
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    },
    ".uploading-message": {
      width: "50%",
      maxWidth: "600px",
      maxHeight: "500px",
      overflowY: "auto",
      backgroundColor: theme.vars.palette.background.paper,
      outline: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: SHADOW(theme).lg,
      padding: getSpacingPx(SPACING.xl),
      borderRadius: BORDER_RADIUS.lg
    }
  });

const AssetUploadOverlay = () => {
  const theme = useTheme();
  const { files, isUploading, overallProgress, completed } = useAssetUpload();

  if (!isUploading) {
    return null;
  }

  return ReactDOM.createPortal(
    <div css={styles(theme)} className="uploading-overlay">
      <FlexColumn className="uploading-message" gap={SPACING.lg}>
        <Text size="big" weight={600}>
          Uploading assets
        </Text>
        <ProgressBar
          value={overallProgress}
          label={`${completed} of ${files.length} files uploaded`}
        />
        <FlexColumn gap={SPACING.md} sx={{ px: SPACING.xl }}>
          {files.map((file) => (
            <ProgressBar
              key={file.id}
              value={file.progress || 0}
              label={file.file.name}
              size="small"
            />
          ))}
        </FlexColumn>
      </FlexColumn>
    </div>,
    document.body
  );
};

export default AssetUploadOverlay;
