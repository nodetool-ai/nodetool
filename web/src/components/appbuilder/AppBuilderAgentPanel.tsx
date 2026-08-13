/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type { BuildUiContextOptions } from "../../lib/chat/uiContext";

import ChatView from "../chat/containers/ChatView";
import ChatPanelHeader from "../chat/containers/ChatPanelHeader";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { Box, Caption, FlexColumn, Text } from "../ui_primitives";

type ChatViewStatus = React.ComponentProps<typeof ChatView>["status"];

// Sent to the agent as a system-prompt addendum whenever this panel is open.
// Teaches the build sequence (operations → binding tokens → widgets) and the
// harness loop that verifies it (`ui_app_debug`).
const APP_BUILDER_SYSTEM_PROMPT = `# Building an app UI
An app is a tree of widgets over one or more **operations**. An operation binds
a workflow the app can run and maps its input and output nodes. A widget joins
that wiring through its \`binding\` prop, which is a token, never a bare name:
\`op:<opId>/in:<nodeId>\` (an input node), \`op:<opId>/out:<nodeId>\` (an output
node), \`op:<opId>/exec#running|progress|error|activity\` (run state),
\`var:<id>\` (an app variable), or \`node:<nodeId>#<property>\` (any node property,
for tweakable parameters that need no Input node). Get every token from
\`ui_app_get_binding_targets\` — a guessed name renders nothing.

Sequence when asked to build or rebuild an app:

1. Read the workflow with \`get_workflow\` (the active workflow id): its Input
   and Output nodes, their types, and any min/max/options. That is the contract.
   When the app binds no workflow yet there is no active id: author one with
   \`create_workflow\` first, then bind it in step 3.
2. \`ui_app_get_snapshot\` to see what's already placed, and
   \`ui_app_list_component_types\` for valid widget types and props.
3. Declare the operations with \`ui_app_add_operation\` (one per workflow the app
   runs; \`inputs\`/\`outputs\` key on node **ids**). Then
   \`ui_app_get_binding_targets\` for the exact binding tokens.
4. Lay out widgets: a Heading and short intro, an inputs Container, a run
   Button, then an outputs Container. Match types — string → TextInput
   (multiline for long text), int/float → NumberInput or Slider (carry over
   min/max), bool → Switch, options → Select; text → Text or Markdown, image →
   Image, structured → Json. Nest with \`parent_id\` and \`slot:"content"\`.
   The run Button takes \`events: [{ "trigger": "click", "kind": "run",
   "operationId": "<opId>" }]\`.
5. State shared between operations (one operation's output feeding another's
   input, a remembered setting) goes in a variable: \`ui_app_declare_variable\`,
   map the output \`{to:"variable"}\` and the input \`{from:"variable"}\`.
6. Set the page title with \`ui_app_set_title\`.

Verify — don't assume:

- After **any** wiring change (binding, operation, variable), call
  \`ui_app_debug { application_id, run: false }\`. It grades the live draft,
  unsaved edits included; it is free and instant. Fix every issue it names,
  then call it again.
- Before you tell the user the app is done, call
  \`ui_app_debug { application_id, run: true }\` **once** and read the verdict: a
  run executes the real workflows and spends real money. Check often, run once.
  Script a specific flow with \`interact\` (set / click / change / run) when the
  natural run trigger isn't what you want to test.

If the user asks for a whole new app and nothing is open to edit, the
\`build_app\` tool drafts and verifies a complete app as a bundle to import; the
\`ui_app_*\` tools are for refining the app in this editor. Build incrementally;
keep labels concise.`;

interface AppBuilderAgentPanelProps {
  /** The app being edited — the id the `ui_app_*` tools take. */
  applicationId: string;
  /**
   * Workflow the `ui_*` graph tools and the chat thread target. Absent until
   * the app binds an operation — the agent still edits the document, so the
   * panel opens on a plain thread instead.
   */
  workflowId?: string;
}

/**
 * The in-builder agent chat. Reuses the global agent loop (and its global tool
 * registry), so the agent has both the app tools (`ui_app_*`) and the workflow
 * tools (`ui_*`) at once. Bound to a workflow thread so runs and graph edits
 * target this workflow.
 */
const AppBuilderAgentPanel: React.FC<AppBuilderAgentPanelProps> = ({
  applicationId,
  workflowId
}) => {
  const {
    status,
    progress,
    statusMessage,
    currentThreadId,
    runningToolCallId,
    runningToolMessage,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate,
    selectedModel
  } = useGlobalChatStore(
    useShallow((state) => ({
      status: state.status,
      progress: state.progress,
      statusMessage: state.statusMessage,
      currentThreadId: state.currentThreadId,
      runningToolCallId: state.currentRunningToolCallId,
      runningToolMessage: state.currentToolMessage,
      currentPlanningUpdate: state.currentPlanningUpdate,
      currentTaskUpdate: state.currentTaskUpdate,
      currentLogUpdate: state.currentLogUpdate,
      selectedModel: state.selectedModel
    }))
  );

  const {
    connect,
    openWorkflowThread,
    newWorkflowThread,
    createNewThread,
    sendMessage,
    stopGeneration,
    setSelectedModel,
    getCurrentMessagesSync
  } = useGlobalChatStore(
    useShallow((state) => ({
      connect: state.connect,
      openWorkflowThread: state.openWorkflowThread,
      newWorkflowThread: state.newWorkflowThread,
      createNewThread: state.createNewThread,
      sendMessage: state.sendMessage,
      stopGeneration: state.stopGeneration,
      setSelectedModel: state.setSelectedModel,
      getCurrentMessagesSync: state.getCurrentMessagesSync
    }))
  );

  // Connect and bind a thread to this workflow so the agent's runs and graph
  // edits target it. Without a workflow the panel opens one plain thread —
  // guarded by a ref so a remount does not pile up empty threads.
  const plainThreadStarted = useRef(false);
  useEffect(() => {
    let cancelled = false;
    connect()
      .then(() => {
        if (cancelled) return undefined;
        if (workflowId) return openWorkflowThread(workflowId);
        if (plainThreadStarted.current) return undefined;
        plainThreadStarted.current = true;
        return createNewThread();
      })
      .catch((err) => {
        console.error("AppBuilder agent: failed to connect", err);
      });
    return () => {
      cancelled = true;
    };
  }, [connect, createNewThread, openWorkflowThread, workflowId]);

  const handleNewChat = useCallback(async () => {
    if (workflowId) {
      await newWorkflowThread(workflowId);
      return;
    }
    await createNewThread();
  }, [createNewThread, newWorkflowThread, workflowId]);

  // The App Builder names its own focused document — the application the
  // ui_app_* tools edit, which is not the workflow the graph tools edit.
  const appBuilderUiContext = useMemo<BuildUiContextOptions>(
    () => ({ focused: { type: "app", id: applicationId } }),
    [applicationId]
  );

  const messages = getCurrentMessagesSync();
  const viewStatus: ChatViewStatus =
    status === "stopping" ? "connected" : (status as ChatViewStatus);

  return (
    <FlexColumn
      fullHeight
      sx={{
        minHeight: 0,
        backgroundColor: "background.paper"
      }}
    >
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: "1px solid",
          borderColor: "divider"
        }}
      >
        <Text size="small" weight={500}>
          App Builder Agent
        </Text>
        <Caption color="secondary" sx={{ display: "block", mt: 0.5 }}>
          Build the app layout and bind widgets to workflow inputs and outputs.
        </Caption>
      </Box>
      <ChatPanelHeader
        onNewChat={handleNewChat}
        docsTopic="appBuilder"
        docsLabel="App builder"
      />
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ChatView
          status={viewStatus}
          messages={messages}
          sendMessage={sendMessage}
          progress={progress.current}
          total={progress.total}
          progressMessage={statusMessage}
          runningToolCallId={runningToolCallId}
          runningToolMessage={runningToolMessage}
          model={selectedModel}
          onModelChange={setSelectedModel}
          onStop={stopGeneration}
          onNewChat={handleNewChat}
          currentPlanningUpdate={currentPlanningUpdate}
          currentTaskUpdate={currentTaskUpdate}
          currentLogUpdate={currentLogUpdate}
          workflowId={workflowId}
          workflowAssistant={Boolean(workflowId)}
          systemPrompt={APP_BUILDER_SYSTEM_PROMPT}
          uiContext={appBuilderUiContext}
          composerVariant="media"
          hideModePicker
          composerPlaceholder="Ask the agent to build your app or edit the workflow…"
          key={currentThreadId ?? "no-thread"}
        />
      </Box>
    </FlexColumn>
  );
};

export default AppBuilderAgentPanel;
