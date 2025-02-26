/**
 * Entry point for the Simple Node Tool application
 */
import React from "react";
import ReactDOM from "react-dom/client";
import SimpleApp from "./SimpleApp";
import "./styles/simple-nodes.css";
import "./styles/base.css";
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <React.StrictMode>
    <SimpleApp />
  </React.StrictMode>
);
