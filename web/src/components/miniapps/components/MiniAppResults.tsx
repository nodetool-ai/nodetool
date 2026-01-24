import React, { useState, useCallback } from "react";
import { Typography, IconButton, Tooltip, Box } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import OutputRenderer from "../../node/OutputRenderer";
import { MiniAppResult } from "../types";

interface MiniAppResultsProps {
  results: MiniAppResult[];
  isRunning?: boolean;
  onClear?: () => void;
}

const MiniAppResults: React.FC<MiniAppResultsProps> = ({
  results,
  isRunning = false,
  onClear
}) => {
  const hasResults = results.length > 0;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = useCallback(
    async (result: MiniAppResult) => {
      try {
        let textToCopy: string;

        // Convert result value to string based on type
        if (result.outputType === "string" && typeof result.value === "string") {
          textToCopy = result.value;
        } else if (
          result.value instanceof Uint8Array ||
          (result.value &&
            typeof result.value === "object" &&
            "data" in result.value)
        ) {
          // For binary data, copy a reference or placeholder
          textToCopy = `[${result.outputType} data]`;
        } else if (typeof result.value === "object") {
          textToCopy = JSON.stringify(result.value, null, 2);
        } else {
          textToCopy = String(result.value ?? "");
        }

        await navigator.clipboard.writeText(textToCopy);
        setCopiedId(result.id);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
      }
    },
    []
  );

  const handleCopyResult = useCallback(
    (result: MiniAppResult) => () => {
      handleCopy(result);
    },
    [handleCopy]
  );

  return (
    <section className="results-shell glass-card">
      <div className="results-heading">
        <Typography variant="subtitle2" fontWeight="600" color="text.secondary">
          Results
          {hasResults && (
            <Box
              component="span"
              sx={{
                ml: 1,
                fontSize: "0.75rem",
                fontWeight: 400,
                opacity: 0.7
              }}
            >
              ({results.length})
            </Box>
          )}
        </Typography>
        {hasResults && onClear && (
          <Tooltip title="Clear results">
            <IconButton
              size="small"
              onClick={onClear}
              aria-label="Clear results"
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </div>

      {hasResults ? (
        <div className="results-list">
          {results.map((result) => (
            <div className="result-card" key={result.id}>
              {result.outputName && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    fontWeight: 500,
                    opacity: 0.7,
                    mb: 0.5
                  }}
                >
                  {result.outputName}
                </Typography>
              )}
              <div className="result-card-body">
                <OutputRenderer value={result.value} showTextActions={false} />
                <Tooltip
                  title={copiedId === result.id ? "Copied!" : "Copy to clipboard"}
                >
                  <IconButton
                    size="small"
                    onClick={handleCopyResult(result)}
                    aria-label="Copy result"
                    className="result-card-copy-button"
                    sx={{
                      position: "absolute",
                      bottom: 8,
                      right: 8,
                      backgroundColor: "background.paper",
                      boxShadow: 1,
                      "&:hover": {
                        backgroundColor: "action.hover"
                      }
                    }}
                  >
                    {copiedId === result.id ? (
                      <CheckIcon fontSize="small" />
                    ) : (
                      <ContentCopyIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="result-placeholder">
          {isRunning ? (
            <>
              <AutoAwesomeIcon className="result-placeholder-icon" />
              <Typography variant="h6" className="result-placeholder-title">
                Creating something amazing...
              </Typography>
              <Typography
                variant="body2"
                className="result-placeholder-subtitle"
              >
                Your workflow is running. Results will appear here as they're
                generated.
              </Typography>
            </>
          ) : (
            <>
              <PlayCircleOutlineIcon className="result-placeholder-icon" />
              <Typography variant="h6" className="result-placeholder-title">
                Ready to run
              </Typography>
              <Typography
                variant="body2"
                className="result-placeholder-subtitle"
              >
                Configure your inputs on the left and click "Run Workflow" to
                see results here.
              </Typography>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default MiniAppResults;
