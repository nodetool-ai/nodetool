import React, { useCallback, useEffect } from "react";
import ChatView from "./ChatView";
import { useChatStore } from "../../stores/ChatStore";
import {
  Box,
  List,
  ListItem,
  ListItemText,
  Typography,
  Button
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import { useTutorialStore } from "../../stores/TutorialStore";
import { useNodeStore } from "../../stores/NodeStore";
import useWorkflowRunnner from "../../stores/WorkflowRunner";
import { tutorials } from "../../stores/TutorialStore";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";

const HelpChat: React.FC = () => {
  const { messages, isLoading, sendMessage, setMessages } = useChatStore();
  const { isInTutorial, getStep, nextStep } = useTutorialStore();
  const { state } = useWorkflowRunnner();
  const step = getStep();
  const { nodes, edges } = useNodeStore();
  const { startTutorial } = useTutorialStore();
  const loadHuggingFaceModels = useModelStore(
    (state) => state.loadHuggingFaceModels
  );
  const loadLlamaModels = useModelStore((state) => state.loadLlamaModels);

  const { data: huggingfaceModels, isLoading: isLoadingHuggingFaceModels } =
    useQuery({
      queryKey: ["huggingfaceModels"],
      queryFn: loadHuggingFaceModels
    });

  const { data: llamaModels, isLoading: isLoadingLlamaModels } = useQuery({
    queryKey: ["llamaModels"],
    queryFn: loadLlamaModels
  });

  const handleSendMessage = useCallback(
    async (prompt: string) => {
      await sendMessage({
        role: "user",
        content: prompt
      });
    },
    [sendMessage]
  );

  const handleResetChat = useCallback(() => {
    setMessages([]);
    useTutorialStore.getState().endTutorial();
  }, [setMessages]);

  useEffect(() => {
    if (isInTutorial) {
      if (
        step &&
        step.isCompleted({
          nodes,
          edges,
          workflowState: state,
          huggingfaceModels: huggingfaceModels || [],
          llamaModels: llamaModels || []
        })
      ) {
        nextStep();
      }
    }
  }, [
    step,
    isInTutorial,
    nextStep,
    nodes,
    edges,
    state,
    huggingfaceModels,
    llamaModels
  ]);

  return (
    <div className="help-chat" style={{ margin: ".5em" }}>
      {messages.length > 0 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "right",
            mb: 2
          }}
        >
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleResetChat}
            disabled={messages.length === 0}
          >
            Reset Chat
          </Button>
        </Box>
      )}
      {messages.length === 0 && (
        <>
          <Typography variant="h4">Hello</Typography>
          <Box sx={{ mb: 2 }}>
            <Typography>I&apos;m your experimental AI assistant!</Typography>
            <Typography sx={{ mt: 2 }}>
              Ask me anything about Nodetool&apos;s features, or try one of the
              following tutorials:
            </Typography>
          </Box>
          <Box
            sx={{
              paddingLeft: "1em",
              margin: ".5em 0 1em 0"
            }}
          >
            {Object.keys(tutorials).map((name) => (
              <Button
                key={name}
                variant="outlined"
                component="a"
                href=""
                onClick={(e) => {
                  e.preventDefault();
                  startTutorial(name);
                }}
                sx={{
                  textTransform: "none",
                  margin: ".25em"
                }}
              >
                {name}
              </Button>
            ))}
          </Box>
        </>
      )}
      <ChatView
        status={isLoading ? "loading" : "connected"}
        messages={messages}
        sendMessage={handleSendMessage}
        currentNodeName={null}
        progress={0}
        total={0}
      />
    </div>
  );
};

export default HelpChat;
