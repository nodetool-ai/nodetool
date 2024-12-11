import React, { useCallback, useEffect } from "react";
import ChatView from "./ChatView";
import { useChatStore } from "../../stores/ChatStore";
import { Box, Typography, Button } from "@mui/material";
import { useTutorialStore } from "../../stores/TutorialStore";
import { useNodeStore } from "../../stores/NodeStore";
import useWorkflowRunnner from "../../stores/WorkflowRunner";
import { tutorials } from "../../stores/TutorialStore";
import useModelStore from "../../stores/ModelStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOllamaModelInfo } from "../hugging_face/ModelUtils";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { isProduction } from "../../stores/ApiClient";
import { ChatHeader } from "./chat/ChatHeader";

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
  const { startDownload, openDialog } = useModelDownloadStore();

  const { data: huggingfaceModels } = useQuery({
    queryKey: ["huggingfaceModels"],
    queryFn: loadHuggingFaceModels
  });

  const { data: llamaModels } = useQuery({
    queryKey: ["llamaModels"],
    queryFn: loadLlamaModels
  });

  const { data: ollamaModelInfo, isLoading: isLoadingOllamaModel } = useQuery({
    queryKey: ["ollamaModel", "qwen2.5:1.5b"],
    queryFn: () => fetchOllamaModelInfo("qwen2.5:1.5b")
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

  const handleDownloadModel = useCallback(() => {
    startDownload("qwen2.5:1.5b", "llama_model");
    openDialog();
  }, [startDownload, openDialog]);

  const isModelAvailable = isProduction || Boolean(ollamaModelInfo);
  const { downloads } = useModelDownloadStore();
  const isDownloading = downloads["qwen2.5:1.5b"]?.status === "running";

  const queryClient = useQueryClient();

  useEffect(() => {
    const downloadStatus = downloads["qwen2.5:1.5b"]?.status;
    if (downloadStatus === "completed") {
      queryClient.invalidateQueries({
        queryKey: ["ollamaModel", "qwen2.5:1.5b"]
      });
    }
  }, [downloads, queryClient]);

  useEffect(() => {
    if (isInTutorial) {
      if (
        step?.isCompleted({
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
      <ChatHeader
        isMinimized={false}
        onReset={messages.length > 0 ? handleResetChat : undefined}
        messagesCount={messages.length}
        title="Help Chat"
        description="Help Chat"
      />

      {messages.length === 0 && isModelAvailable && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4">Hello</Typography>
          <Typography>I&apos;m your experimental AI assistant!</Typography>
          <Typography sx={{ mt: 2 }}>
            Ask me anything about Nodetool&apos;s features, or try one of the
            following tutorials:
          </Typography>
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
        </Box>
      )}

      {isLoadingOllamaModel ? (
        <Typography>Checking model availability...</Typography>
      ) : isDownloading ? (
        <Typography>Downloading model...</Typography>
      ) : !isModelAvailable ? (
        <Box sx={{ mb: 2 }}>
          <Typography>
            You need to download the Qwen2.5 model to use the Help Chat.
          </Typography>
          <Button
            variant="outlined"
            onClick={handleDownloadModel}
            sx={{ mt: 1 }}
          >
            Download Qwen2.5 1.5B Model
          </Button>
        </Box>
      ) : (
        <ChatView
          status={isLoading ? "loading" : "connected"}
          messages={messages}
          sendMessage={handleSendMessage}
          currentNodeName={null}
          progress={0}
          total={0}
        />
      )}
    </div>
  );
};

export default HelpChat;
