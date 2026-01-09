import React, { memo } from "react";
import { Button, Box } from "@mui/material";
import { Visibility } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { NodeInputs } from "./NodeInputs";
import { NodeOutputs } from "./NodeOutputs";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import isEqual from "lodash/isEqual";
import NodeProgress from "./NodeProgress";
import { useDynamicProperty } from "../../hooks/nodes/useDynamicProperty";
import NodePropertyForm from "./NodePropertyForm";
import ResultOverlay from "./ResultOverlay";

interface NodeContentProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  isConstantNode: boolean;
  isOutputNode: boolean;
  data: NodeData;
  basicFields: string[];
  showAdvancedFields: boolean;
  hasAdvancedFields: boolean;
  onToggleAdvancedFields: () => void;
  status: string;
  workflowId: string;
  showResultOverlay: boolean;
  result: any;
  onShowInputs: () => void;
  onShowResults?: () => void;
}

const NodeContent: React.FC<NodeContentProps> = ({
  id,
  nodeType,
  nodeMetadata,
  isConstantNode,
  isOutputNode,
  data,
  basicFields,
  showAdvancedFields,
  hasAdvancedFields,
  onToggleAdvancedFields,
  status,
  workflowId,
  showResultOverlay,
  result,
  onShowInputs,
  onShowResults
}) => {
  const theme = useTheme();
  const { handleAddProperty } = useDynamicProperty(
    id,
    data.dynamic_properties as Record<string, any>
  );

  const isEmptyObject = (obj: any) => {
    return obj && typeof obj === "object" && Object.keys(obj).length === 0;
  };

  // For output nodes, always show overlay when result is available
  const shouldShowOverlay = isOutputNode
    ? result && !isEmptyObject(result)
    : showResultOverlay && result && !isEmptyObject(result);

  if (shouldShowOverlay) {
    return (
      <Box
        sx={{
          position: "relative"
        }}
      >
        {/* Keep inputs and outputs in DOM for handles and to set size, but hide most content visually */}
        <Box
          sx={{
            visibility: "hidden",
            pointerEvents: "none",
            // Keep handles visible and interactive
            "& .react-flow__handle": {
              visibility: "visible",
              pointerEvents: "auto",
              zIndex: 2
            }
          }}
        >
          <NodeInputs
            id={id}
            nodeMetadata={nodeMetadata}
            layout={nodeMetadata.layout}
            properties={nodeMetadata.properties}
            nodeType={nodeType}
            data={data}
            showHandle={!isConstantNode}
            hasAdvancedFields={hasAdvancedFields}
            showAdvancedFields={showAdvancedFields}
            basicFields={basicFields}
            onToggleAdvancedFields={onToggleAdvancedFields}
          />
          {!isOutputNode && (
            <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
          )}
        </Box>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            width: "100%",
            height: "100%",
            overflow: "auto",
            // Keep handles clickable even when overlay is on top
            "& .react-flow__handle": {
              pointerEvents: "none"
            }
          }}
        >
          <ResultOverlay
            result={result}
            onShowInputs={isOutputNode ? undefined : onShowInputs}
          />
        </Box>
      </Box>
    );
  }

  // Determine what to show when overlay is not active
  const shouldShowResultButton =
    result &&
    !isEmptyObject(result) &&
    onShowResults &&
    status === "completed" &&
    !isConstantNode;

  return (
    <Box sx={{ position: "relative" }}>
      <NodeInputs
        id={id}
        nodeMetadata={nodeMetadata}
        layout={nodeMetadata.layout}
        properties={nodeMetadata.properties}
        nodeType={nodeType}
        data={data}
        showHandle={!isConstantNode}
        hasAdvancedFields={hasAdvancedFields}
        showAdvancedFields={showAdvancedFields}
        basicFields={basicFields}
        onToggleAdvancedFields={onToggleAdvancedFields}
      />
      {(nodeMetadata?.is_dynamic || nodeMetadata?.supports_dynamic_outputs) && (
        <NodePropertyForm
          id={id}
          isDynamic={nodeMetadata.is_dynamic}
          supportsDynamicOutputs={nodeMetadata.supports_dynamic_outputs}
          dynamicOutputs={data.dynamic_outputs || {}}
          onAddProperty={handleAddProperty}
          nodeType={nodeType}
        />
      )}
      {!isOutputNode && <NodeOutputs id={id} outputs={nodeMetadata.outputs} />}
      {/* Show "Show Result" button when result is available and node is completed - only on hover */}
      {shouldShowResultButton && (
        <Box
          className="show-result-button"
          sx={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%) translateY(-4px)",
            zIndex: 20,
            opacity: 0,
            transition: "opacity 0.2s ease, transform 0.2s ease",
            ".base-node:hover &": {
              opacity: 1,
              transform: "translateX(-50%) translateY(0)"
            }
          }}
        >
          <Button
            size="small"
            startIcon={<Visibility sx={{ fontSize: 16 }} />}
            onClick={onShowResults}
            sx={{
              textTransform: "none",
              fontSize: "0.75rem",
              padding: "4px 12px",
              backgroundColor: theme.vars.palette.background.paper,
              color: theme.vars.palette.text.primary,
              border: `1px solid ${theme.vars.palette.divider}`,
              borderRadius: "16px",
              backdropFilter: theme.vars.palette.glass.blur,
              boxShadow: 1,
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover,
                borderColor: theme.vars.palette.primary.main
              }
            }}
          >
            Show Result
          </Button>
        </Box>
      )}
      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </Box>
  );
};

export default memo(NodeContent, isEqual);
