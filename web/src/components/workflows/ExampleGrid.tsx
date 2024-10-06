/** @jsxImportSource @emotion/react */

import {
  Typography,
  Box,
  CircularProgress,
  Button,
  ButtonGroup
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
      flexWrap: "wrap"
    },
    ".workflow": {
      flex: "1 0 200px",
      margin: "20px",
      maxWidth: "200px",
      cursor: "pointer"
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
      fontSize: "0.7em"
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
    if (!selectedTag || !groupedWorkflows[selectedTag])
      return data?.workflows || [];
    return groupedWorkflows[selectedTag];
  }, [selectedTag, groupedWorkflows, data]);

  return (
    <div className="workflow-grid" css={styles}>
      <Box className="tag-menu">
        <ButtonGroup variant="outlined">
          <Button onClick={() => setSelectedTag(null)}>All</Button>
          {Object.keys(groupedWorkflows).map((tag) => (
            <Button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              variant={selectedTag === tag ? "contained" : "outlined"}
              className={selectedTag === tag ? "selected" : ""}
            >
              {tag}
            </Button>
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
          <Box
            key={workflow.id}
            className="workflow"
            onClick={() => onClickWorkflow(workflow)}
          >
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
            <Typography style={{ fontFamily: ThemeNodetool.fontFamily1 }}>
              {workflow.description}
            </Typography>
          </Box>
        ))}
      </Box>
    </div>
  );
};

export default ExampleGrid;
