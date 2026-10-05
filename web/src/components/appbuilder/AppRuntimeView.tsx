/** @jsxImportSource @emotion/react */
import React, { useEffect } from "react";
import AppInstanceManager from "./AppInstanceManager";
import AppRunHistory from "./AppRunHistory";
import type { ServerAppInstance } from "./runtime/appInstanceApi";
import { Render, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";

import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { runJsScript } from "../jsScript/runJsScript";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import { Workflow } from "../../stores/ApiTypes";
import ReportBugButton from "../support/ReportBugButton";
import { AskRunAgentButton } from "../runs/AskRunAgentButton";
import { useAppOperationRun } from "../../hooks/useAppOperationRun";
import { useRunInspection } from "../../hooks/useRunInspection";
import { useRun } from "../../serverState/useRuns";
import { getAppSessionToken } from "../../lib/appSession";
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
  FlexRow,
  Caption,
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
  previewDraft?: boolean;
  selectedRunId?: string | null;
  onSelectRun?: (id: string | null) => void;
  onInstanceReady?: (instance: ServerAppInstance) => void;
  onAdvanced?: () => void;
  /**
   * Workflow graphs the caller already has, by id — the graphs a release
   * pinned. An operation whose workflow is here runs that exact graph.
   */
  workflowOverrides?: Record<string, Workflow>;
  scriptOverrides?: Record<string, JsScriptDocument>;
  scriptRunner?: typeof runJsScript;
}

interface RuntimeErrorActionsProps {
  operationId: string;
  invocationId: string;
  name: string;
  error: string;
}

function RuntimeErrorActions({
  operationId,
  invocationId,
  name,
  error
}: RuntimeErrorActionsProps): React.ReactElement {
  const { store } = useAppRuntimeContext();
  const { runId } = useAppOperationRun(operationId);
  const summary = useRun(runId);
  const spanId = summary.data?.summary.first_failed_span_id ?? undefined;
  const { openRunInspection } = useRunInspection();
  return (
    <FlexRow gap={SPACING.xs}>
      {runId ? (
        <EditorButton onClick={() => openRunInspection({ runId, spanId })}>
          View trace
        </EditorButton>
      ) : null}
      {runId ? <AskRunAgentButton runId={runId} spanId={spanId} /> : null}
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
          store
            .getState()
            .dispatchEvent({ type: "invocationError", invocationId, error: "" })
        }
      />
    </FlexRow>
  );
}

function RuntimeRunLinks(): React.ReactElement | null {
  const { operations } = useAppRuntimeContext();
  if (getAppSessionToken() !== null) {
    return null;
  }
  return (
    <FlexRow
      gap={SPACING.md}
      sx={{ px: SPACING.xl, pt: SPACING.md, flexWrap: "wrap" }}
    >
      {operations.map((operation) => (
        <RuntimeOperationRunLink
          key={operation.id}
          operationId={operation.id}
          name={operation.name}
        />
      ))}
    </FlexRow>
  );
}

function RuntimeOperationRunLink({
  operationId,
  name
}: {
  operationId: string;
  name: string;
}): React.ReactElement | null {
  const { runId, traceIncomplete } = useAppOperationRun(operationId);
  const { openRunInspection } = useRunInspection();
  if (!runId) {
    return null;
  }
  return (
    <FlexRow gap={SPACING.xs}>
      <Caption>{name}</Caption>
      <EditorButton onClick={() => openRunInspection({ runId })}>
        View trace
      </EditorButton>
      <AskRunAgentButton runId={runId} />
      {traceIncomplete ? (
        <Caption>Some browser activity could not be recorded.</Caption>
      ) : null}
    </FlexRow>
  );
}

/**
 * Surfaces the active invocation's error as a dismissible banner pinned to the
 * top of the app's scroll container. Errors belong to an invocation, so the
 * next run replaces the banner and dismissing it clears the invocation's error.
 */
const RuntimeErrorBanner: React.FC = () => {
  const { store, operations } = useAppRuntimeContext();
  const activeInvocation = useRuntimeSelector(
    (state) => state.activeInvocation
  );
  const invocations = useRuntimeSelector((state) => state.invocations);
  const errors = operations.flatMap((operation) => {
    const invocationId = activeInvocation[operation.id];
    const error = invocationId ? invocations[invocationId]?.error : undefined;
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
            <RuntimeErrorActions
              {...{ operationId, invocationId, name, error }}
            />
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
  previewDraft,
  selectedRunId,
  onSelectRun,
  onInstanceReady,
  onAdvanced,
  workflowOverrides,
  scriptOverrides,
  scriptRunner
}) => {
  const runtime = useAppRuntime(workflow, false, {
    document,
    application,
    instanceId,
    previewDraft,
    workflowOverrides,
    scriptOverrides,
    scriptRunner
  });
  useEffect(() => {
    if (runtime.instance) {
      onInstanceReady?.(runtime.instance);
    }
  }, [runtime.instance, onInstanceReady]);
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
        {application && !previewDraft && getAppSessionToken() === null ? (
          <AppInstanceManager
            applicationId={application.id}
            latestVersion={application.version}
            onAdvanced={onAdvanced ?? (() => void runtime.reloadInstance?.())}
          />
        ) : null}
        <RuntimeErrorBanner />
        <RuntimeRunLinks />
        {runtime.instanceId &&
        !previewDraft &&
        onSelectRun &&
        getAppSessionToken() === null ? (
          <AppRunHistory
            instanceId={runtime.instanceId}
            selectedRunId={selectedRunId ?? null}
            onSelect={onSelectRun}
          />
        ) : null}
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
