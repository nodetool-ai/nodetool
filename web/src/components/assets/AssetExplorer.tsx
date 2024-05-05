/** @jsxImportSource @emotion/react */
import React from "react";
import AssetGrid from "./AssetGrid";
import { Box } from "@mui/material";
import { css } from "@emotion/react";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      width: "100%",
      height: "calc(-120px + 100vh)",
      padding: "2em",
      backgroundColor: theme.palette.c_gray1
    },
    ".asset-explorer": {
      width: "100%"
    },
    ".audio-controls-container": {
      padding: "2em"
    }
  });

const AssetExplorer: React.FC = () => {
  return (
    <div css={styles}>
      <Box className="asset-explorer">
        <AssetGrid maxItemSize={10} itemSpacing={2} />
      </Box>
    </div>
  );
};

export default AssetExplorer;
