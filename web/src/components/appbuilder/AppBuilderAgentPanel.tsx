/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import ChatView from "../chat/containers/ChatView";
import ChatPanelHeader from "../chat/containers/ChatPanelHeader";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { Box, Caption, FlexColumn, Text } from "../ui_primitives";

type ChatViewStatus = React.ComponentProps<typeof ChatView>["status"];

// Sent to the agent as a system-prompt addendum whenever this panel is open.
// Teaches the canonical build sequence: read the workflow, map inputs/outputs,
// then lay out widgets bound to node names.
const APP_BUILDER_SYSTEM_PROMPT = `# Building an app UI
An app UI turns the current workflow into a form: Input nodes become input
widgets, Output nodes become display widgets, and a Run button executes the
workflow. Widgets connect to the graph through their \`binding\` prop — the
EXACT \`name\` of an Input or Output node. Inputs write to the graph; outputs
read from it.

Follow this sequence when asked to build (or rebuild) an app UI:

1. Read the workflow: call \`get_workflow\` with the active workflow id. List
   every Input node (\`nodetool.input.*\`) and Output node (\`nodetool.output.*\`);
   note each node's \`name\` (the binding key), its data type, and any
   min/max/options. This is the contract for the whole UI.
2. Inspect the canvas: call \`ui_app_get_snapshot\` (don't duplicate existing
   widgets), then \`ui_app_list_component_types\` to confirm widget types/props.
3. Plan the layout before adding: a Heading + short Text intro, an inputs
   Container, a Run Button, a Divider, then an outputs Container.
4. Add input widgets, one per Input node, with \`binding\` = that node's \`name\`.
   Match the type: string → TextInput (multiline:true for long text), int/float
   → NumberInput or Slider (carry over min/max), bool → Switch, enum/options →
   Select. Give a clear \`label\` and \`placeholder\`. Nest via \`parent_id\` (the
   inputs Container) and \`slot:"content"\`.
5. Add a Run Button with \`events: [{ "trigger": "click", "kind": "run",
   "key": "", "value": "" }]\`. Clicking it writes the bound inputs and runs the
   workflow; results stream to the bound output widgets.
6. Add display widgets, one per Output node, with \`binding\` = that node's
   \`name\`. Match the type: text/string → Text or Markdown, image → Image,
   dict/list/structured → Json. Add a Progress widget for long runs.
7. Set the page title with \`ui_app_set_title\`, then \`ui_app_get_snapshot\` to
   confirm every input and output node is represented and bindings match node
   names exactly. Fix mismatches with \`ui_app_update_component\`.

A binding that doesn't match an existing node \`name\` renders nothing — copy
names from \`get_workflow\`, never guess. Build incrementally; keep labels concise.`;

interface AppBuilderAgentPanelProps {
  workflowId: string;
}

/**
 * The in-builder agent chat. Reuses the global agent loop (and its global tool
 * registry), so the agent has both the app tools (`ui_app_*`) and the workflow
 * tools (`ui_*`) at once. Bound to a workflow thread so runs and graph edits
 * target this workflow.
 */
const AppBuilderAgentPanel: React.FC<AppBuilderAgentPanelProps> = ({
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
    sendMessage,
    stopGeneration,
    setSelectedModel,
    getCurrentMessagesSync
  } = useGlobalChatStore(
    useShallow((state) => ({
      connect: state.connect,
      openWorkflowThread: state.openWorkflowThread,
      newWorkflowThread: state.newWorkflowThread,
      sendMessage: state.sendMessage,
      stopGeneration: state.stopGeneration,
      setSelectedModel: state.setSelectedModel,
      getCurrentMessagesSync: state.getCurrentMessagesSync
    }))
  );

  // Connect and bind a thread to this workflow so the agent's runs and graph
  // edits target it.
  useEffect(() => {
    let cancelled = false;
    connect()
      .then(() => {
        if (!cancelled) return openWorkflowThread(workflowId);
      })
      .catch((err) => {
        console.error("AppBuilder agent: failed to connect", err);
      });
    return () => {
      cancelled = true;
    };
  }, [connect, openWorkflowThread, workflowId]);

  const handleNewChat = useCallback(async () => {
    await newWorkflowThread(workflowId);
  }, [newWorkflowThread, workflowId]);

  const messages = getCurrentMessagesSync();
  const viewStatus: ChatViewStatus =
    status === "stopping" ? "loading" : (status as ChatViewStatus);

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
      <ChatPanelHeader onNewChat={handleNewChat} />
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
          workflowAssistant
          systemPrompt={APP_BUILDER_SYSTEM_PROMPT}
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
