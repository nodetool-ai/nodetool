/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import AssetGrid from "./AssetGrid";
import { Box } from "@mui/material";
import useAssets from "../../serverState/useAssets";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      width: "calc(100% - 80px)",
      height: "calc(-120px + 100vh)",
      padding: "1em 2em 1em 1em",
      left: "80px"
    },
    ".asset-explorer": {
      width: "100%"
    },
    ".audio-controls-container": {
      padding: "2em"
    },
    ".current-folder": {
      position: "absolute",
      top: "3.5em",
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
    },
    ".asset-explorer .file-upload-button": {
      position: "absolute",
      top: "-15px !important",
      left: "0 !important",
      right: "0 !important",
      margin: "0 auto ",
      height: "fit-content ",
      width: "fit-content"
    },
    ".asset-explorer .file-upload-button button": {
      padding: "1em .5em",
      fontSize: theme.fontSizeNormal
    }
  });

const AssetExplorer: React.FC = () => {
  const { folderFiles } = useAssets();
  return (
    <div css={styles}>
      <Box className="asset-explorer">
        <AssetGrid
          maxItemSize={10}
          itemSpacing={2}
          isHorizontal={true}
          sortedAssets={folderFiles}
        />
      </Box>
    </div>
  );
};

export default AssetExplorer;
