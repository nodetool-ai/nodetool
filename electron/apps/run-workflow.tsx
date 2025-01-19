import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App";
import "./run-workflow.css";
import { Provider } from "./components/ui/provider";

const urlParams = new URLSearchParams(window.location.search);
const workflowId = urlParams.get("workflow_id");

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Provider>
      <App initialWorkflowId={workflowId || undefined} />
    </Provider>
  </React.StrictMode>
);
