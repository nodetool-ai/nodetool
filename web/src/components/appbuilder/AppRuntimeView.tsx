/** @jsxImportSource @emotion/react */
import React from "react";
import { Render, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";

import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import { Workflow } from "../../stores/ApiTypes";
import { useAppRuntime } from "./runtime/useAppRuntime";
import {
  AppRuntimeContext,
  useAppRuntimeContext,
  useRuntimeSelector
} from "./runtime/AppRuntimeContext";
import { appConfig } from "./puck/config";
import { AlertBanner, Box, SPACING, Z_INDEX } from "../ui_primitives";

interface AppRuntimeViewProps {
  workflow: Workflow;
  data: Data;
  /**
   * The app document, when the workflow carries one. Supplies the operation's
   * input mappings, declared variables, and resource bindings; without it the
   * runtime synthesizes a single-operation document from the graph.
   */
  document?: ApplicationDocument;
}

/**
 * Surfaces the active invocation's error as a dismissible banner pinned to the
 * top of the app's scroll container. Errors belong to an invocation, so the
 * next run replaces the banner and dismissing it clears the invocation's error.
 */
const RuntimeErrorBanner: React.FC = () => {
  const { store, scope } = useAppRuntimeContext();
  const operationId = scope.defaultOperationId;
  const invocationId = useRuntimeSelector(
    (s) => s.activeInvocation[operationId]
  );
  const error = useRuntimeSelector((s) =>
    invocationId ? s.invocations[invocationId]?.error : undefined
  );
  const setError = (value: string | null) => {
    if (!invocationId) return;
    store
      .getState()
      .dispatchEvent({ type: "invocationError", invocationId, error: value ?? "" });
  };
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
const AppRuntimeView: React.FC<AppRuntimeViewProps> = ({
  workflow,
  data,
  document
}) => {
  const runtime = useAppRuntime(workflow, false, { document });
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
