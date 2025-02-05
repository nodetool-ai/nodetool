import React, { useCallback, useEffect } from "react";
import ChatView from "./ChatView";
import { useChatStore } from "../../stores/ChatStore";
import { Box, Typography, Button, Tooltip } from "@mui/material";
import { useTutorialStore } from "../../stores/TutorialStore";
import useWorkflowRunnner from "../../stores/WorkflowRunner";
import { tutorials } from "../../stores/TutorialStore";
import useModelStore from "../../stores/ModelStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOllamaModelInfo } from "../hugging_face/ModelUtils";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { isProduction } from "../../stores/ApiClient";
import { ChatHeader } from "./chat/ChatHeader";
import { DEFAULT_MODEL } from "../../config/constants";

const HelpChat: React.FC = () => {
  const { messages, isLoading, sendMessage, setMessages } = useChatStore();
  const { isInTutorial, getStep, nextStep } = useTutorialStore();
  // const { state } = useWorkflowRunnner();
  const step = getStep();
  // const { startTutorial } = useTutorialStore();
  // const loadHuggingFaceModels = useModelStore(
  //   (state) => state.loadHuggingFaceModels
  // );
  // const loadLlamaModels = useModelStore((state) => state.loadLlamaModels);
  const { startDownload, openDialog } = useModelDownloadStore();

  // const { data: huggingfaceModels } = useQuery({
  //   queryKey: ["huggingfaceModels"],
  //   queryFn: loadHuggingFaceModels
  // });

  // const { data: llamaModels } = useQuery({
  //   queryKey: ["llamaModels"],
  //   queryFn: loadLlamaModels
  // });

  const { data: ollamaModelInfo, isLoading: isLoadingOllamaModel } = useQuery({
    queryKey: ["ollamaModel", DEFAULT_MODEL],
    queryFn: () => fetchOllamaModelInfo(DEFAULT_MODEL)
  });

  const handleResetChat = useCallback(() => {
    setMessages([]);
    useTutorialStore.getState().endTutorial();
  }, [setMessages]);

  const handleDownloadModel = useCallback(() => {
    startDownload(DEFAULT_MODEL, "llama_model");
    openDialog();
  }, [startDownload, openDialog]);

  const isModelAvailable = isProduction || Boolean(ollamaModelInfo);
  const { downloads } = useModelDownloadStore();
  const isDownloading = downloads[DEFAULT_MODEL]?.status === "running";

  const queryClient = useQueryClient();

  useEffect(() => {
    const downloadStatus = downloads[DEFAULT_MODEL]?.status;
    if (downloadStatus === "completed") {
      queryClient.invalidateQueries({
        queryKey: ["ollamaModel", DEFAULT_MODEL]
      });
    }
  }, [downloads, queryClient]);

  // useEffect(() => {
  //   if (isInTutorial) {
  //     if (
  //       step?.isCompleted({
  //         nodes,
  //         edges,
  //         workflowState: state,
  //         huggingfaceModels: huggingfaceModels || [],
  //         llamaModels: llamaModels || []
  //       })
  //     ) {
  //       nextStep();
  //     }
  //   }
  // }, [step, isInTutorial, nextStep, state, huggingfaceModels, llamaModels]);

  return (
    <div
      className="help-chat"
      style={{
        margin: ".5em",
        height: "calc(100vh - 5em)",
        minHeight: "300px",
        maxHeight: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <ChatHeader
        isMinimized={false}
        onReset={messages.length > 0 ? handleResetChat : undefined}
        messagesCount={messages.length}
        title="Help Chat"
        description="Help Chat"
      />

      {/* {messages.length === 0 && isModelAvailable && (
        <Box sx={{ mb: 2, px: 2 }}>
          <Typography
            variant="h4"
            sx={{
              fontSize: "1.25rem",
              fontWeight: 500,
              mb: 2
            }}
          >
            Hello
          </Typography>
          <Typography sx={{ mb: 3 }}>
            Ask me anything about Nodetool's features, or get started with one
            of these interactive tutorials:
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5
            }}
          >
            {Object.keys(tutorials).map((name) => (
              <Tooltip
                key={name}
                title={`Start the ${name} tutorial`}
                arrow
                placement="right"
              >
                <Button
                  variant="contained"
                  component="a"
                  href=""
                  onClick={(e) => {
                    e.preventDefault();
                    startTutorial(name);
                  }}
                  tabIndex={-1}
                  sx={{
                    textTransform: "none",
                    py: 1.5,
                    px: 2.5,
                    borderRadius: 2,
                    backgroundColor: "rgba(80, 230, 180, 0.15)",
                    color: "rgb(80, 230, 180)",
                    fontWeight: 500,
                    justifyContent: "flex-start",
                    "&:hover": {
                      backgroundColor: "rgba(80, 230, 180, 0.25)",
                      transform: "translateY(-2px)",
                      transition: "all 0.2s ease-in-out"
                    }
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      mr: 1.5,
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M4 3.5V12.5L12 8L4 3.5Z" fill="currentColor" />
                    </svg>
                  </Box>
                  {name}
                </Button>
              </Tooltip>
            ))}
          </Box>
        </Box>
      )} */}

      {isLoadingOllamaModel ? (
        <Typography>Checking model availability...</Typography>
      ) : isDownloading ? (
        <Typography>Downloading model...</Typography>
      ) : !isModelAvailable ? (
        <Box sx={{ mb: 2 }}>
          <Typography>
            You need to download the {DEFAULT_MODEL} model to use the Help Chat.
          </Typography>
          <Tooltip
            title="Download the AI model to enable chat assistance features"
            arrow
          >
            <Button
              variant="outlined"
              onClick={handleDownloadModel}
              sx={{ mt: 1 }}
              tabIndex={-1}
            >
              Download {DEFAULT_MODEL} Model
            </Button>
          </Tooltip>
        </Box>
      ) : (
        <ChatView
          status={isLoading ? "loading" : "connected"}
          messages={messages}
          sendMessage={sendMessage}
          currentNodeName={null}
          progress={0}
          total={0}
        />
      )}
    </div>
  );
};

export default HelpChat;
