/** @jsxImportSource @emotion/react */
import React from "react";
import { Render, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";

import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { runJsScript } from "../jsScript/runJsScript";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import { Workflow } from "../../stores/ApiTypes";
import ReportBugButton from "../support/ReportBugButton";
import { useAppRuntime } from "./runtime/useAppRuntime";
import {
  AppRuntimeContext,
  useAppRuntimeContext,
  useRuntimeSelector
} from "./runtime/AppRuntimeContext";
import { appConfig } from "./puck/config";
import {
  AlertBanner,
  Box,
  CloseButton,
  SPACING,
  LoadingSpinner,
  EditorButton,
  Z_INDEX
} from "../ui_primitives";

interface AppRuntimeViewProps {
  workflow: Workflow;
  data: Data;
  /**
   * The app document, when the workflow carries one. Supplies the operation's
   * input mappings, declared variables, and resource bindings; without it the
   * runtime synthesizes a single-operation document from the graph.
   */
  document?: ApplicationDocument;
  /** The application record this app belongs to (budget + release metering). */
  application?: { id: string; version?: number };
  instanceId?: string;
  /**
   * Workflow graphs the caller already has, by id — the graphs a release
   * pinned. An operation whose workflow is here runs that exact graph.
   */
  workflowOverrides?: Record<string, Workflow>;
  scriptOverrides?: Record<string, JsScriptDocument>;
  scriptRunner?: typeof runJsScript;
}

/**
 * Surfaces the active invocation's error as a dismissible banner pinned to the
 * top of the app's scroll container. Errors belong to an invocation, so the
 * next run replaces the banner and dismissing it clears the invocation's error.
 */
const RuntimeErrorBanner: React.FC = () => {
  const { store, operations } = useAppRuntimeContext();
  const runtimeState = useRuntimeSelector((s) => s);
  const errors = operations.flatMap((operation) => {
    const invocationId = runtimeState.activeInvocation[operation.id];
    const error = invocationId
      ? runtimeState.invocations[invocationId]?.error
      : undefined;
    return error && invocationId
      ? [
          {
            invocationId,
            operationId: operation.id,
            name: operation.name,
            error
          }
        ]
      : [];
  });

  if (errors.length === 0) return null;
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
      {errors.map(({ invocationId, operationId, name, error }) => (
        <AlertBanner
          key={invocationId}
          severity="error"
          action={
            <>
              <ReportBugButton
                label="Report failure"
                context={{
                  source: "operation-failure",
                  summary: `${name || operationId} operation failed`,
                  errorText: error
                }}
              />
              <CloseButton
                onClick={() =>
                  store.getState().dispatchEvent({
                    type: "invocationError",
                    invocationId,
                    error: ""
                  })
                }
              />
            </>
          }
          onClose={() =>
            store.getState().dispatchEvent({
              type: "invocationError",
              invocationId,
              error: ""
            })
          }
        >
          {`${name || operationId}: ${error}`}
        </AlertBanner>
      ))}
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
  document,
  application,
  instanceId,
  workflowOverrides,
  scriptOverrides,
  scriptRunner
}) => {
  const runtime = useAppRuntime(workflow, false, {
    document,
    application,
    instanceId,
    workflowOverrides,
    scriptOverrides,
    scriptRunner
  });
  if (runtime.instanceLoading)
    return <LoadingSpinner text="Loading instance" />;
  if (runtime.instanceError)
    return (
      <AlertBanner
        severity="error"
        action={
          <>
            <EditorButton onClick={() => void runtime.reloadInstance?.()}>
              Reload instance
            </EditorButton>
            <ReportBugButton
              context={{
                source: "operation-failure",
                summary: "App instance could not be saved",
                errorText: runtime.instanceError
              }}
            />
          </>
        }
      >
        {runtime.instanceError}
      </AlertBanner>
    );
  return (
    <AppRuntimeContext.Provider value={runtime}>
      <Box
        data-focus-id="app-runtime"
        className="appbuilder-runtime"
        sx={{ width: "100%", height: "100%", overflow: "auto" }}
      >
        <RuntimeErrorBanner />
        {/* The parser validates Puck data while leaving widget-specific props opaque. */}
        <Render
          config={appConfig}
          data={
            runtime.document ? (runtime.document.ui as unknown as Data) : data
          }
        />
      </Box>
    </AppRuntimeContext.Provider>
  );
};

export default AppRuntimeView;
