/** @jsxImportSource @emotion/react */
import React from "react";
import ReactDOM from "react-dom/client";
import TimelineDemo from "./TimelineDemo";

// Standalone entry point for Timeline Demo
const root = ReactDOM.createRoot(
  document.getElementById("demo-root") as HTMLElement
);

root.render(
  <React.StrictMode>
    <TimelineDemo />
  </React.StrictMode>
);
