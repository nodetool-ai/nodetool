/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Box, CircularProgress, LinearProgress, Typography } from "@mui/material";
//server state
import { useAssetUpload } from "../../serverState/useAssetUpload";
import LinearProgressWithLabel from "./LinearProgressWithLabel";

const styles = (theme: any) =>
  css({
    "&": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.9)",
      zIndex: 300,
      cursor: "not-allowed"
    },
    ".uploading-message": {
      position: "absolute",
      backgroundColor: theme.palette.c_gray2,
      padding: "50px",
      top: "50%",
      left: "50%",
      width: "80%",
      transform: "translate(-50%, -50%)",
      zindex: 1000
    }
  });

const AssetUploadOverlay = () => {
  const { files, isUploading, overallProgress, completed } = useAssetUpload();

  if (isUploading) {
    return (
      <div css={styles} className="uploading-overlay">
        <div className="uploading-message">
          <div>
            <Box>
              <Typography variant="h6">
                Overall progress: {completed} / {files.length} files completed
              </Typography>
            </Box>
            <LinearProgressWithLabel value={overallProgress} />
          </div>
          <ul>
            {files.map((file, index) => (
              <LinearProgressWithLabel key={index} filename={file.file.name} value={file.progress || 0} />
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // if (uploadMutation.isError) {
  //
  //   return (
  //     <Typography variant="h6" color="error">
  //       {"Error uploading assets."}
  //     </Typography>
  //   );
  // }

  return null;
};

export default AssetUploadOverlay;
