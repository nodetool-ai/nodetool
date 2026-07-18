/** @jsxImportSource @emotion/react */
import React from "react";
import { Render, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";

import { Workflow } from "../../stores/ApiTypes";
import { useAppRuntime } from "./runtime/useAppRuntime";
import {
  AppRuntimeContext,
  useRuntimeSelector
} from "./runtime/AppRuntimeContext";
import { appConfig } from "./puck/config";
import { AlertBanner, Box, SPACING, Z_INDEX } from "../ui_primitives";

interface AppRuntimeViewProps {
  workflow: Workflow;
  data: Data;
}

/**
 * Surfaces a run error from the runtime store as a dismissible banner pinned to
 * the top of the app's scroll container. New runs clear the error themselves; the
 * close button clears it on demand.
 */
const RuntimeErrorBanner: React.FC = () => {
  const error = useRuntimeSelector((s) => s.error);
  const setError = useRuntimeSelector((s) => s.setError);
  if (!error) return null;
  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: Z_INDEX.sticky,
        px: SPACING.xl,
        pt: SPACING.md
      }}
    >
      <AlertBanner severity="error" onClose={() => setError(null)}>
        {error}
      </AlertBanner>
    </Box>
  );
};

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
        <RuntimeErrorBanner />
        <Render config={appConfig} data={data} />
      </Box>
    </AppRuntimeContext.Provider>
  );
};

export default AppRuntimeView;
