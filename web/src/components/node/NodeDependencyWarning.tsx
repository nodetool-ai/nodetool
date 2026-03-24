/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";

const RUNTIME_LABELS: Record<string, string> = {
  ffmpeg: "FFmpeg & Codecs",
  python: "Python Runtime",
  ollama: "Ollama",
  "llama-cpp": "llama.cpp",
};

const warningStyles = (theme: Theme) =>
  css({
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderRadius: "1px",
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    width: "100%",
    maxWidth: "100%",

    ".warning-title": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: "#f59e0b",
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: "6px",
    },

    ".warning-text": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeTiny,
      color: "#d4a34a",
      lineHeight: "1.3em",
    },

    ".install-link": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeTiny,
      color: "#4a9eff",
      cursor: "pointer",
      textDecoration: "underline",
      border: "none",
      background: "none",
      padding: 0,
      "&:hover": {
        color: "#6db5ff",
      },
    },
  });

interface NodeDependencyWarningProps {
  requiredRuntimes: string[];
}

const NodeDependencyWarning: React.FC<NodeDependencyWarningProps> = ({
  requiredRuntimes,
}) => {
  const theme = useTheme();

  if (!requiredRuntimes || requiredRuntimes.length === 0) {
    return null;
  }

  const runtimeNames = requiredRuntimes
    .map((r) => RUNTIME_LABELS[r] || r)
    .join(", ");

  const handleOpenPackageManager = () => {
    // Open the package manager in Electron, or show guidance in web mode
    if ((window as any).api?.packages?.showManager) {
      (window as any).api.packages.showManager();
    }
  };

  return (
    <div
      css={warningStyles(theme)}
      className="node-dependency-warning nodrag nowheel"
    >
      <div className="warning-title">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Requires {runtimeNames}
      </div>
      <div className="warning-text">
        Install via the{" "}
        <button className="install-link" onClick={handleOpenPackageManager}>
          Package Manager
        </button>{" "}
        to use this node.
      </div>
    </div>
  );
};

export default memo(NodeDependencyWarning, isEqual);
