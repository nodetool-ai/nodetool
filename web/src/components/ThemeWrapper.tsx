/** @jsxImportSource @emotion/react */
import React from "react";
import { CssVarsProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import ThemeNodetool from "./themes/ThemeNodetool";

const ThemeWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <CssVarsProvider
      theme={ThemeNodetool}
      defaultMode="dark"
      modeStorageKey="mui-mode"
    >
      <CssBaseline />
      {children}
    </CssVarsProvider>
  );
};

export default ThemeWrapper;
