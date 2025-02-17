import React from "react";
import "./index.css";
import { createRoot } from "react-dom/client";
import { App } from "./components/App";
import { ComponentTest } from "./components/ComponentTest";
import { Provider } from "./components/ui/provider";
import ChatInterface from "./components/ChatInterface";
import { Box } from "@chakra-ui/react";
const urlParams = new URLSearchParams(window.location.search);

const workflowId = urlParams.get("workflow_id");
const isGlobalChat = urlParams.get("chat") === "true";
const isTestPage = urlParams.get("test") === "true";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Provider>
      {isTestPage ? (
        <ComponentTest />
      ) : isGlobalChat ? (
        <Box h="100%" className="chat-interface-container">
          <ChatInterface token="local_token" />
        </Box>
      ) : (
        <App initialWorkflowId={workflowId || undefined} />
      )}
    </Provider>
  </React.StrictMode>
);
