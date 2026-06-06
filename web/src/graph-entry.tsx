/** @jsxImportSource @emotion/react */
/**
 * Standalone entry point for the workflow graph viewer.
 * Mounts the GraphViewerApp tree; workflow data comes via ?data=<base64 JSON>.
 */
import ReactDOM from "react-dom/client";

// xyflow + node CSS (global side-effect styles)
import "@xyflow/react/dist/style.css";
import "./styles/base.css";
import "./styles/nodes.css";
import "./styles/properties.css";
import "./styles/interactions.css";
import "./styles/special_nodes.css";
import "./styles/handle_edge_tooltip.css";

import App from "./GraphViewerApp";

// ─── Mount ───────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);
