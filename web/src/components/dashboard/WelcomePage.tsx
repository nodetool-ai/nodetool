/** @jsxImportSource @emotion/react */
import React from "react";
import { Box } from "@mui/material";
import AppHeader from "../panels/AppHeader";
import GettingStartedPanel from "./GettingStartedPanel";
import { HEADER_HEIGHT } from "../../config/constants";

const WelcomePage: React.FC = () => {
  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        // AppHeader is position: fixed, so reserve space below it.
        paddingTop: `${HEADER_HEIGHT}px`,
        boxSizing: "border-box"
      }}
    >
      <AppHeader />
      <Box
        sx={{
          height: "100%",
          overflow: "auto",
          width: "100%",
          maxWidth: 900,
          mx: "auto",
          px: 3,
          py: 4
        }}
      >
        <GettingStartedPanel />
      </Box>
    </Box>
  );
};

export default React.memo(WelcomePage);
