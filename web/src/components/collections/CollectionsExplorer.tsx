/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AppHeader from "../panels/AppHeader";
import CollectionList from "./CollectionList";
import PanelHeadline from "../ui/PanelHeadline";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      width: "100%",
      height: "100%",
      top: "0",
      left: "0",
      padding: "0",
      backgroundColor: theme.vars.palette.c_editor_bg_color
    },
    ".collections-explorer": {
      position: "relative",
      width: "100%",
      top: "64px",
      padding: "0 24px"
    }
  });

const CollectionsExplorer: React.FC = () => {
  const theme = useTheme();
  return (
    <Box css={styles(theme)}>
      <Box
        className="actions-container"
        sx={{
          position: "absolute",
          top: "32px",
          left: 0,
          right: 0,
          zIndex: 1000
        }}
      >
        <AppHeader />
      </Box>
      <Box className="collections-explorer">
        <PanelHeadline title="Collections" />
        <CollectionList />
      </Box>
    </Box>
  );
};

export default CollectionsExplorer;
