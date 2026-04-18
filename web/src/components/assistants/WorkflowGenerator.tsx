import React, { useState, useCallback, memo } from "react";
import { Box, InputAdornment } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { restFetch } from "../../lib/rest-fetch";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { createErrorMessage } from "../../utils/errorHandling";
import { Card, NodeTextField, ToolbarIconButton } from "../ui_primitives";
import type { Graph } from "../../stores/ApiTypes";
import log from "loglevel";
import { shallow } from "zustand/shallow";

const WorkflowGenerator: React.FC = memo(() => {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { workflow } = useWorkflowManager((state) => ({
    workflow: state.getCurrentWorkflow()
  }));
  const { setNodes, setEdges } = useNodes((state) => ({
    setNodes: state.setNodes,
    setEdges: state.setEdges
  }), shallow);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPrompt(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || isLoading) {return;}

      setIsLoading(true);
      try {
        // The create-smart endpoint returns a Graph with nodes and edges
        const response = await restFetch("/api/workflows/create-smart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt.trim() })
        });

        const data = (await response.json().catch(() => null)) as
          | Graph
          | { detail?: unknown }
          | null;

        if (!response.ok) {
          const errorMsg = createErrorMessage(
            data,
            "Failed to create workflow"
          );
          throw new Error(
            typeof errorMsg === "string" ? errorMsg : errorMsg.message
          );
        }

        if (data && "nodes" in data && "edges" in data && workflow) {
          setPrompt("");
          const workflowData = data as Graph;
          const nodes = workflowData.nodes.map((node) =>
            graphNodeToReactFlowNode(workflow, node)
          );
          const edges = workflowData.edges.map((edge) =>
            graphEdgeToReactFlowEdge(edge)
          );
          setNodes(nodes);
          setEdges(edges);
        }
      } catch (err) {
        log.error("Error creating workflow:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [prompt, isLoading, workflow, setNodes, setEdges]
  );

  const handleButtonClick = useCallback(() => {
    // Call submit without an event - the form will handle the event properly
    void handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
  }, [handleSubmit]);

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        width: "500px",
        maxWidth: "90vw",
        zIndex: 1000
      }}
    >
      <Card
        variant="elevated"
        elevation={3}
        padding="normal"
        sx={{
          borderRadius: 3,
          backdropFilter: "blur(16px)",
          boxShadow: "0 4px 24px -1px rgba(0, 0, 0, 0.2)"
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex" }}>
          <NodeTextField
            fullWidth
            placeholder="Describe the workflow you want to create..."
            value={prompt}
            onChange={handlePromptChange}
            disabled={isLoading}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 3,
                pr: 0
              }
            }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <ToolbarIconButton
                    icon={<SendIcon
                      color={isLoading || !prompt.trim() ? "disabled" : "primary"}
                    />}
                    tooltip="Generate workflow"
                    onClick={handleButtonClick}
                    disabled={isLoading || !prompt.trim()}
                    sx={{ mr: 0.5 }}
                  />
                </InputAdornment>
              )
            }}
          />
        </form>
      </Card>
    </Box>
  );
});
WorkflowGenerator.displayName = "WorkflowGenerator";

export default WorkflowGenerator;
