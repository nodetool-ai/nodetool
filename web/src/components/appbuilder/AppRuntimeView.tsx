/** @jsxImportSource @emotion/react */
import React from "react";
import { Render, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";

import { Workflow } from "../../stores/ApiTypes";
import { useAppRuntime } from "./runtime/useAppRuntime";
import { AppRuntimeContext } from "./runtime/AppRuntimeContext";
import { appConfig } from "./puck/config";
import { Box } from "../ui_primitives";

interface AppRuntimeViewProps {
  workflow: Workflow;
  data: Data;
}

/**
 * Renders a published app reactively: Puck's <Render> draws the layout while the
 * runtime context streams workflow outputs into bound widgets and turns widget
 * events into workflow runs.
 */
const AppRuntimeView: React.FC<AppRuntimeViewProps> = ({ workflow, data }) => {
  const runtime = useAppRuntime(workflow, false);
  return (
    <AppRuntimeContext.Provider value={runtime}>
      <Box
        className="appbuilder-runtime"
        sx={{ width: "100%", height: "100%", overflow: "auto" }}
      >
        <Render config={appConfig} data={data} />
      </Box>
    </AppRuntimeContext.Provider>
  );
};

export default AppRuntimeView;
