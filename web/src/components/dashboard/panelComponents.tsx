import React from "react";
import { Box } from "@mui/material";
import { IDockviewPanelProps } from "dockview";
import ChatView from "../chat/containers/ChatView";
import ExamplesList from "./ExamplesList";
import WorkflowsList from "./WorkflowsList";
import RecentChats from "./RecentChats";
import WelcomePanel from "./WelcomePanel";
import SetupPanel from "./SetupPanel";
import { DEFAULT_MODEL } from "../../config/constants";
import { PanelProps } from "./panelConfig";
import ActivityPanel from "./ActivityPanel";
import TemplatesPanel from "./TemplatesPanel";

export const createPanelComponents = () => ({
  activity: (props: IDockviewPanelProps<PanelProps>) => (
    <ActivityPanel
      // Workflow props
      sortedWorkflows={props.params?.sortedWorkflows || []}
      isLoadingWorkflows={props.params?.isLoadingWorkflows ?? true}
      settings={props.params?.settings || {}}
      handleOrderChange={props.params?.handleOrderChange || (() => {})}
      handleCreateNewWorkflow={
        props.params?.handleCreateNewWorkflow || (() => {})
      }
      handleWorkflowClick={props.params?.handleWorkflowClick || (() => {})}
      
      // Chat props
      threads={props.params?.threads || {}}
      currentThreadId={props.params?.currentThreadId || null}
      onNewThread={props.params?.onNewThread || (() => {})}
      onSelectThread={props.params?.onSelectThread || (() => {})}
      onDeleteThread={props.params?.onDeleteThread || (() => {})}
      getThreadPreview={
        props.params?.getThreadPreview || (() => "No messages yet")
      }
    />
  ),
  templates: (props: IDockviewPanelProps<PanelProps>) => (
    <TemplatesPanel
      startTemplates={props.params?.startTemplates || []}
      isLoadingTemplates={props.params?.isLoadingTemplates ?? true}
      loadingExampleId={props.params?.loadingExampleId || null}
      handleExampleClick={props.params?.handleExampleClick || (() => {})}
      handleViewAllTemplates={
        props.params?.handleViewAllTemplates || (() => {})
      }
    />
  ),
  // Legacy panels kept for backward compatibility
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
      showToolbar={false}
      currentPlanningUpdate={props.params?.currentPlanningUpdate || null}
      currentTaskUpdate={props.params?.currentTaskUpdate || null}
    />
  ),
  welcome: (props: IDockviewPanelProps<PanelProps>) => (
    <Box sx={{ overflow: "auto", height: "100%" }}>
      <WelcomePanel />
    </Box>
  ),
  setup: (props: IDockviewPanelProps<PanelProps>) => (
    <Box sx={{ overflow: "auto", height: "100%" }}>
      <SetupPanel />
    </Box>
  )
});
