/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import ReactDOM from "react-dom";

import { Box, Typography } from "@mui/material";
//server state
import { useAssetUpload } from "../../serverState/useAssetUpload";
import LinearProgressWithLabel from "./LinearProgressWithLabel";

const styles = (theme: any) =>
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
      zIndex: 1000,
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    },
    ".uploading-message": {
      width: "50%",
      maxWidth: "600px",
      maxHeight: "500px",
      overflowY: "auto",
      backgroundColor: theme.palette.c_gray2,
      outline: `2px solid ${theme.palette.c_gray0}`,
      boxShadow: "0px 0px 10px 0px rgba(0, 0, 0, 0.01)",
      padding: "1em",
      borderRadius: "8px"
    },
    ul: {
      padding: "0 1em"
    }
  });

const AssetUploadOverlay = () => {
  const { files, isUploading, overallProgress, completed } = useAssetUpload();

  if (!isUploading) {
    return null;
  }

  return ReactDOM.createPortal(
    <div css={styles} className="uploading-overlay">
      <div className="uploading-message">
        <Box>
          <Typography variant="h2">Uploading assets</Typography>
          <Typography variant="h5">
            {completed} / {files.length} files completed
          </Typography>
        </Box>
        <LinearProgressWithLabel value={overallProgress} />
        <ul>
          {files.map((file, index) => (
            <LinearProgressWithLabel
              key={index}
              filename={file.file.name}
              value={file.progress || 0}
            />
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
};

export default AssetUploadOverlay;
