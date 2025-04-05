import React, { useState, useCallback } from "react";
import { Box, TextField, IconButton, Paper } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { client } from "../../stores/ApiClient";
import { Edge } from "@xyflow/react";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const WorkflowGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { workflow } = useWorkflowManager((state) => ({
    workflow: state.getCurrentWorkflow()
  }));
  const { setNodes, setEdges } = useNodes((state) => ({
    setNodes: state.setNodes,
    setEdges: state.setEdges
  }));

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || isLoading) return;

      setIsLoading(true);
      try {
        const { data, error } = await client.POST(
          "/api/workflows/create-smart",
          {
            body: { prompt: prompt.trim() }
          }
        );

        if (error) {
          console.error("Error creating workflow:", error);
          const errorMessage = error.detail
            ? Array.isArray(error.detail)
              ? error.detail.map((d) => d.msg).join(", ")
              : String(error.detail)
            : "Failed to create workflow";
          throw new Error(errorMessage);
        }

        if (data && data.nodes && data.edges && workflow) {
          setPrompt("");
          const nodes = data.nodes.map((node) =>
            graphNodeToReactFlowNode(workflow, node)
          );
          const edges = data.edges.map((edge) =>
            graphEdgeToReactFlowEdge(edge)
          );
          setNodes(nodes);
          setEdges(edges);
        }
      } catch (err) {
        console.error("Error creating workflow:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [prompt, isLoading, workflow, setNodes, setEdges]
  );

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
      <Paper
        elevation={3}
        sx={{
          borderRadius: 3,
          padding: 2,
          backgroundColor: "background.paper",
          backdropFilter: "blur(16px)",
          boxShadow: "0 4px 24px -1px rgba(0, 0, 0, 0.2)"
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex" }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Describe the workflow you want to create..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 3,
                pr: 0
              }
            }}
            InputProps={{
              endAdornment: (
                <IconButton
                  type="submit"
                  disabled={isLoading || !prompt.trim()}
                  sx={{ mr: 0.5 }}
                >
                  <SendIcon
                    color={isLoading || !prompt.trim() ? "disabled" : "primary"}
                  />
                </IconButton>
              )
            }}
          />
        </form>
      </Paper>
    </Box>
  );
};

export default WorkflowGenerator;
