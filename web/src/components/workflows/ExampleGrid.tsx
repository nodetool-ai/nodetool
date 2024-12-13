/** @jsxImportSource @emotion/react */

import {
  Typography,
  Box,
  CircularProgress,
  Button,
  ButtonGroup,
  Tooltip
} from "@mui/material";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useCallback, useMemo, useState } from "react";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useNavigate } from "react-router-dom";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useQuery } from "@tanstack/react-query";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { css } from "@emotion/react";

const styles = (theme: any) =>
  css({
    ".container": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "flex-start"
    },
    ".workflow": {
      flex: "1 0 200px",
      margin: "20px",
      maxWidth: "200px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start"
    },
    ".loading-indicator": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      height: "50vh",
      width: "100%"
    },
    ".image-wrapper": {
      width: "200px",
      height: "200px",
      overflow: "hidden",
      position: "relative"
    },
    ".image-wrapper:hover": {
      animation: "sciFiPulse 2s infinite",
      boxShadow: `0 0 10px ${theme.palette.c_hl1}`,
      outline: `2px solid ${theme.palette.c_hl1}`
    },
    "@keyframes sciFiPulse": {
      "0%": {
        boxShadow: `0 0 5px ${theme.palette.c_hl1}`,
        filter: "brightness(1)"
      },
      "50%": {
        boxShadow: `0 0 20px ${theme.palette.c_hl1}`,
        filter: "brightness(1.2)"
      },
      "100%": {
        boxShadow: `0 0 5px ${theme.palette.c_hl1}`,
        filter: "brightness(1)"
      }
    },
    ".workflow img": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".tag-menu": {
      margin: "20px"
    },
    ".tag-menu button": {
      transition: "all 0.3s ease",
      textTransform: "uppercase",
      letterSpacing: "1px",
      fontWeight: "bold",
      color: theme.palette.text.primary,
      "&:hover": {
        background: `linear-gradient(45deg, ${theme.palette.c_hl1}, ${theme.palette.c_hl2})`,
        transform: "translateY(-2px)",
        boxShadow: `0 4px 8px rgba(0, 0, 0, 0.2)`,
        color: theme.palette.common.white
      }
    },
    ".tag-menu .selected": {
      background: `linear-gradient(45deg, 
        ${theme.palette.c_hl1}dd, 
        ${theme.palette.c_hl2}dd
      )`,
      boxShadow: `0 2px 4px rgba(0, 0, 0, 0.3)`,
      color: theme.palette.common.white,
      "&:hover": {
        transform: "none",
        boxShadow: `0 2px 4px rgba(0, 0, 0, 0.3)`
      }
    }
  });

const ExampleGrid = () => {
  const navigate = useNavigate();
  const copyWorkflow = useWorkflowStore((state) => state.copy);
  const loadWorkflows = useWorkflowStore((state) => state.loadExamples);
  const [selectedTag, setSelectedTag] = useState<string | null>("start");

  const { data, isLoading, isError, error } = useQuery<WorkflowList, Error>({
    queryKey: ["examples"],
    queryFn: loadWorkflows
  });

  const onClickWorkflow = useCallback(
    (workflow: Workflow) => {
      copyWorkflow(workflow).then((workflow) => {
        navigate("/editor/" + workflow.id);
      });
    },
    [copyWorkflow, navigate]
  );

  const groupedWorkflows = useMemo(() => {
    if (!data) return {};
    return data.workflows.reduce((acc, workflow) => {
      workflow.tags?.forEach((tag) => {
        if (!acc[tag]) acc[tag] = [];
        acc[tag].push(workflow);
      });
      return acc;
    }, {} as Record<string, Workflow[]>);
  }, [data]);

  const filteredWorkflows = useMemo(() => {
    const workflows =
      !selectedTag || !groupedWorkflows[selectedTag]
        ? data?.workflows || []
        : groupedWorkflows[selectedTag];

    return [...workflows].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }, [selectedTag, groupedWorkflows, data]);

  return (
    <div className="workflow-grid" css={styles}>
      <Box className="tag-menu">
        <ButtonGroup variant="outlined">
          <Tooltip title="Show all example workflows">
            <Button
              onClick={() => setSelectedTag(null)}
              variant={selectedTag === null ? "contained" : "outlined"}
              className={selectedTag === null ? "selected" : ""}
            >
              All
            </Button>
          </Tooltip>
          <Tooltip title="Basic examples to get started">
            <Button
              onClick={() => setSelectedTag("start")}
              variant={selectedTag === "start" ? "contained" : "outlined"}
              className={selectedTag === "start" ? "selected" : ""}
            >
              Start
            </Button>
          </Tooltip>
          {Object.keys(groupedWorkflows)
            .filter((tag) => tag !== "start")
            .map((tag) => (
              <Tooltip key={tag} title={`Show ${tag} examples`}>
                <Button
                  onClick={() => setSelectedTag(tag)}
                  variant={selectedTag === tag ? "contained" : "outlined"}
                  className={selectedTag === tag ? "selected" : ""}
                >
                  {tag}
                </Button>
              </Tooltip>
            ))}
        </ButtonGroup>
      </Box>
      <Box className="container">
        {isLoading && (
          <div className="loading-indicator">
            <CircularProgress />
            <Typography variant="h4">Loading Examples</Typography>
          </div>
        )}
        {isError && (
          <ErrorOutlineRounded>
            <Typography>{error?.message}</Typography>
          </ErrorOutlineRounded>
        )}
        {filteredWorkflows.map((workflow) => (
          <Tooltip
            key={workflow.id}
            title={workflow.description}
            placement="bottom"
          >
            <Box className="workflow" onClick={() => onClickWorkflow(workflow)}>
              <Box className="image-wrapper">
                {workflow.thumbnail_url && (
                  <img
                    width="200px"
                    src={workflow.thumbnail_url}
                    alt={workflow.name}
                  />
                )}
              </Box>
              <Typography variant="h4" component={"h4"}>
                {workflow.name}
              </Typography>
            </Box>
          </Tooltip>
        ))}
      </Box>
    </div>
  );
};

export default ExampleGrid;
