import React, { useState, useCallback, useMemo } from "react";
import { Typography, IconButton, Tooltip, CircularProgress } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import OutputRenderer from "../../node/OutputRenderer";
import { MiniAppResult } from "../types";
import { Workflow, Node } from "../../../stores/ApiTypes";
import type { NodeUIProperties } from "../../../stores/nodeUiDefaults";

interface MiniAppResultsProps {
  results: MiniAppResult[];
  isRunning?: boolean;
  onClear?: () => void;
  workflow?: Workflow;
}

const MiniAppResults: React.FC<MiniAppResultsProps> = ({
  results,
  isRunning = false,
  onClear,
  workflow
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Get set of bypassed node IDs and preview node IDs for filtering results
  const excludedNodeIds = useMemo(() => {
    if (!workflow?.graph?.nodes) {
      return new Set<string>();
    }
    return new Set(
      workflow.graph.nodes
        .filter((node: Node) => {
          const uiProps = node.ui_properties as NodeUIProperties | undefined;
          return (
            // Exclude bypassed nodes
            uiProps?.bypassed ||
            // Exclude PreviewNode - they shouldn't show in app mode
            node.type === "nodetool.workflows.base_node.Preview"
          );
        })
        .map((node) => node.id)
    );
  }, [workflow]);

  // Filter out results from bypassed and preview nodes
  const filteredResults = useMemo(() => {
    return results.filter((result) => !excludedNodeIds.has(result.nodeId));
  }, [results, excludedNodeIds]);

  const hasResults = filteredResults.length > 0;

  // Check for output nodes and their bypass status (exclude preview nodes)
  const outputNodeStatus = useMemo(() => {
    if (!workflow?.graph?.nodes) {
      return { totalOutputs: 0, activeOutputs: 0, allBypassed: false };
    }

    // Only count actual output nodes, not preview nodes
    const outputNodes = workflow.graph.nodes.filter(
      (node) => node.type?.includes(".output.")
    );
    const activeOutputNodes = outputNodes.filter((node: Node) => {
      const uiProps = node.ui_properties as NodeUIProperties | undefined;
      return !uiProps?.bypassed;
    });

    return {
      totalOutputs: outputNodes.length,
      activeOutputs: activeOutputNodes.length,
      allBypassed: outputNodes.length > 0 && activeOutputNodes.length === 0
    };
  }, [workflow]);

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
    <section className="results-shell application-card">
      {/* Clear button - shown only when there are results */}
      {hasResults && onClear && (
        <Tooltip title={`Clear ${filteredResults.length} result${filteredResults.length > 1 ? "s" : ""}`}>
          <IconButton
            size="small"
            onClick={onClear}
            aria-label="Clear results"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 10,
              backgroundColor: "background.paper",
              boxShadow: 1,
              "&:hover": {
                backgroundColor: "action.hover"
              }
            }}
          >
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      {hasResults ? (
        <div className="results-list">
          {filteredResults.map((result) => (
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
            <CircularProgress size={40} />
          ) : outputNodeStatus.totalOutputs === 0 ? (
            <>
              <InfoOutlinedIcon className="result-placeholder-icon" />
              <Typography variant="h6" className="result-placeholder-title">
                No output nodes
              </Typography>
              <Typography
                variant="body2"
                className="result-placeholder-subtitle"
              >
                This workflow has no output nodes. The workflow can still run
                and perform actions, but results won&apos;t be displayed here.
              </Typography>
            </>
          ) : outputNodeStatus.allBypassed ? (
            <>
              <InfoOutlinedIcon className="result-placeholder-icon" />
              <Typography variant="h6" className="result-placeholder-title">
                All outputs bypassed
              </Typography>
              <Typography
                variant="body2"
                className="result-placeholder-subtitle"
              >
                All output nodes in this workflow are currently bypassed. The
                workflow can still run, but no results will be displayed.
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
                Configure your inputs on the left and click &quot;Run Workflow&quot; to
                see results here.
              </Typography>
            </>
          )}
        </div>
      )}
    </section>
  );
};

MiniAppResults.displayName = 'MiniAppResults';

export default React.memo(MiniAppResults);
