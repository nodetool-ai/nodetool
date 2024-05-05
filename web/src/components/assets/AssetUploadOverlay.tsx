/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { CircularProgress, Typography } from "@mui/material";
//server state
import { useAssetUpload } from "../../serverState/useAssetUpload";

const styles = (theme: any) =>
  css({
    "&": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      zIndex: 300,
      cursor: "not-allowed"
    },
    ".uploading-message": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      color: theme.palette.c_white,
      fontSize: theme.fontSizeLarge,
      fontWeight: 600
    }
  });

const AssetUploadOverlay = () => {
  const { mutation: uploadMutation } = useAssetUpload();
  if (uploadMutation.isLoading) {
    return (
      <div css={styles} className="uploading-overlay">
        <div className="uploading-message">
          <CircularProgress />
          Uploading...
        </div>
      </div>
    );
  }

  if (uploadMutation.isError) {
    return (
      <Typography variant="h6" color="error">
        {"Error uploading assets."}
      </Typography>
    );
  }

  return null;
};

export default AssetUploadOverlay;
