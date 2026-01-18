import React, { useState, useCallback, useRef, useEffect } from "react";
import { Typography, IconButton, Tooltip } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";

import OutputRenderer from "../../node/OutputRenderer";
import { MiniAppResult } from "../types";

interface MiniAppResultsProps {
  results: MiniAppResult[];
  onClear?: () => void;
}

const MiniAppResults: React.FC<MiniAppResultsProps> = ({
  results,
  onClear
}) => {
  const hasResults = results.length > 0;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Ref for tracking copy timeout to prevent memory leaks
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear copy timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

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
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
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
        {hasResults && (
          <>
            <Typography variant="body2" color="text.secondary">
              {results.length} {results.length === 1 ? "result" : "results"}
            </Typography>
            {onClear && (
              <Tooltip title="Clear results">
                <IconButton
                  size="small"
                  onClick={onClear}
                  aria-label="Clear results"
                  sx={{ ml: "auto" }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </>
        )}
      </div>

      {hasResults ? (
        <div className="results-list">
          {results.map((result) => (
            <div className="result-card" key={result.id}>
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
          <Typography
            className="empty-eyebrow"
            variant="overline"
            color="text.secondary"
          >
            No results
          </Typography>
        </div>
      )}
    </section>
  );
};

export default MiniAppResults;
