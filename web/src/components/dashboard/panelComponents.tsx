import React from "react";
import { Box } from "@mui/material";
import { IDockviewPanelProps } from "dockview";
import ChatView from "../chat/containers/ChatView";
import ExamplesList from "./ExamplesList";
import WorkflowsList from "./WorkflowsList";
import RecentChats from "./RecentChats";
import { DEFAULT_MODEL } from "../../config/constants";
import { PanelProps } from "./panelConfig";

export const createPanelComponents = () => ({
  examples: (props: IDockviewPanelProps<PanelProps>) => (
    <ExamplesList
      startExamples={props.params?.startExamples || []}
      isLoadingExamples={props.params?.isLoadingExamples ?? true}
      loadingExampleId={props.params?.loadingExampleId || null}
      handleExampleClick={props.params?.handleExampleClick || (() => {})}
      handleViewAllExamples={props.params?.handleViewAllExamples || (() => {})}
    />
  ),
  workflows: (props: IDockviewPanelProps<PanelProps>) => (
    <WorkflowsList
      sortedWorkflows={props.params?.sortedWorkflows || []}
      isLoadingWorkflows={props.params?.isLoadingWorkflows ?? true}
      settings={props.params?.settings || {}}
      handleOrderChange={props.params?.handleOrderChange || (() => {})}
      handleCreateNewWorkflow={
        props.params?.handleCreateNewWorkflow || (() => {})
      }
      handleWorkflowClick={props.params?.handleWorkflowClick || (() => {})}
    />
  ),
  "recent-chats": (props: IDockviewPanelProps<PanelProps>) => (
    <Box sx={{ overflow: "auto", height: "100%" }}>
      <RecentChats
        threads={props.params?.threads || {}}
        currentThreadId={props.params?.currentThreadId || null}
        onNewThread={props.params?.onNewThread || (() => {})}
        onSelectThread={props.params?.onSelectThread || (() => {})}
        onDeleteThread={props.params?.onDeleteThread || (() => {})}
        getThreadPreview={
          props.params?.getThreadPreview || (() => "No messages yet")
        }
      />
    </Box>
  ),
  chat: (props: IDockviewPanelProps<PanelProps>) => (
    <ChatView
      status={props.params?.status || "disconnected"}
      messages={[]} // empty array to hide the chat view
      sendMessage={props.params?.sendMessage || (() => {})}
      progress={props.params?.progress?.current || 0}
      total={props.params?.progress?.total || 0}
      progressMessage={props.params?.statusMessage || ""}
      model={props.params?.model || DEFAULT_MODEL}
      selectedTools={props.params?.selectedTools || []}
      onToolsChange={props.params?.onToolsChange || (() => {})}
      onModelChange={props.params?.onModelChange || (() => {})}
      onStop={props.params?.onStop || (() => {})}
      onNewChat={props.params?.onNewChat || (() => {})}
      agentMode={props.params?.agentMode || false}
      onAgentModeToggle={props.params?.onAgentModeToggle || (() => {})}
      currentPlanningUpdate={props.params?.currentPlanningUpdate || null}
      currentTaskUpdate={props.params?.currentTaskUpdate || null}
    />
  )
});
