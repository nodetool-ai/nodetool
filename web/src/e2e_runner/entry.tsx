/** @jsxImportSource @emotion/react */
/**
 * Standalone entry point for the E2E workflow test runner.
 * Mounts E2ERunnerApp. The suite manifest is fetched from /e2e-suite/manifest.json
 * and each workflow is executed against the backend over the /ws WebSocket.
 */
import ReactDOM from "react-dom/client";

import "@xyflow/react/dist/style.css";
import "../styles/base.css";
import "../styles/nodes.css";
import "../styles/properties.css";
import "../styles/interactions.css";
import "../styles/special_nodes.css";
import "../styles/handle_edge_tooltip.css";

import E2ERunnerApp from "./E2ERunnerApp";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<E2ERunnerApp />);
