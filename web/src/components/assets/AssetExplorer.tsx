/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import AssetGrid from "./AssetGrid";
import { Box } from "@mui/material";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      width: "100%",
      height: "calc(-120px + 100vh)",
      padding: "2em"
    },
    ".asset-explorer": {
      width: "100%"
    },
    ".audio-controls-container": {
      padding: "2em"
    },
    ".current-folder": {
      position: "absolute",
      top: "2em",
      right: "2em",
      textAlign: "right",
      margin: "0",
      padding: "0"
    },
    ".selected-asset-info": {
      position: "absolute",
      top: "2em",
      right: "2em",
      maxWidth: "500px",
      textAlign: "right"
    },
    ".asset-size-slider": {
      width: "200px",
      maxWidth: "unset",
      paddingLeft: "1em"
    },
    ".dropzone": {
      outline: "none"
    },
    ".infinite-scroll-component": {
      border: 0
    }
  });

const AssetExplorer: React.FC = () => {
  return (
    <div css={styles}>
      <Box className="asset-explorer">
        <AssetGrid maxItemSize={10} itemSpacing={2} isHorizontal={true} />
      </Box>
    </div>
  );
};

export default AssetExplorer;
