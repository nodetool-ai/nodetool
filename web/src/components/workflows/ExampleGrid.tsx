/** @jsxImportSource @emotion/react */

import {
  Typography,
  Box,
  CircularProgress,
  Button,
  ButtonGroup,
  Tooltip,
  TextField
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
    ".workflow-grid": {
      height: "100%",
      width: "100%",
      position: "relative"
    },
    "&": {
      position: "relative",
      width: "calc(100% - 70px)",
      left: "60px",
      height: "calc(100vh - 64px)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },
    ".container": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "flex-start",
      overflowY: "auto",
      flex: 1,
      padding: "0 20px"
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
    ".workflow h4": {
      marginTop: "8px",
      marginBottom: "4px"
    },
    ".workflow .description": {
      fontSize: "0.875rem",
      color: theme.palette.text.secondary,
      lineHeight: "1.2",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 3,
      overflow: "hidden",
      width: "100%"
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
      margin: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      "& .MuiButtonGroup-root": {
        flexWrap: "wrap",
        gap: "4px",
        "& .MuiButton-root": {
          marginLeft: "0 !important",
          borderRadius: "4px !important",
          minWidth: "80px",
          margin: "2px"
        }
      }
    },
    ".tag-menu .button-row": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px"
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
      },
      fontSize: "0.8rem",
      padding: "6px 12px",
      "@media (max-width: 600px)": {
        fontSize: "0.75rem",
        padding: "4px 8px"
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
    },
    ".search-container": {
      padding: "0 20px",
      marginBottom: "10px"
    },
    ".search-field": {
      width: "100%",
      maxWidth: "400px",
      "& .MuiOutlinedInput-root": {
        "&:hover fieldset": {
          borderColor: theme.palette.c_hl1
        },
        "&.Mui-focused fieldset": {
          borderColor: theme.palette.c_hl1
        }
      }
    }
  });

const ExampleGrid = () => {
  const navigate = useNavigate();
  const loadWorkflows = useWorkflowStore((state) => state.loadExamples);
  const createWorkflow = useWorkflowStore((state) => state.create);
  const [selectedTag, setSelectedTag] = useState<string | null>("start");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, isError, error } = useQuery<WorkflowList, Error>({
    queryKey: ["examples"],
    queryFn: loadWorkflows
  });

  const copyExampleWorkflow = useCallback(
    async (workflow: Workflow) => {
      const req = {
        name: workflow.name,
        description: workflow.description,
        thumbnail: workflow.thumbnail,
        thumbnail_url: workflow.thumbnail_url,
        tags: workflow.tags,
        access: "private",
        graph: JSON.parse(JSON.stringify(workflow.graph)),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      return await createWorkflow(req);
    },
    [createWorkflow]
  );

  const onClickWorkflow = useCallback(
    async (workflow: Workflow) => {
      const newWorkflow = await copyExampleWorkflow(workflow);
      navigate("/editor/" + newWorkflow.id);
    },
    [copyExampleWorkflow, navigate, createWorkflow]
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
    let workflows =
      !selectedTag || !groupedWorkflows[selectedTag]
        ? data?.workflows || []
        : groupedWorkflows[selectedTag];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      workflows = workflows.filter(
        (workflow) =>
          workflow.name.toLowerCase().includes(query) ||
          (workflow.description || "").toLowerCase().includes(query)
      );
    }

    return [...workflows].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }, [selectedTag, groupedWorkflows, data, searchQuery]);

  return (
    <div className="workflow-grid" css={styles}>
      <Box className="tag-menu">
        <div className="button-row">
          <Tooltip title="Show all example workflows">
            <Button
              onClick={() => setSelectedTag(null)}
              variant="outlined"
              className={selectedTag === null ? "selected" : ""}
            >
              All
            </Button>
          </Tooltip>
          <Tooltip title="Basic examples to get started">
            <Button
              onClick={() => setSelectedTag("start")}
              variant="outlined"
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
                  variant="outlined"
                  className={selectedTag === tag ? "selected" : ""}
                >
                  {tag}
                </Button>
              </Tooltip>
            ))}
        </div>
      </Box>
      <Box className="search-container">
        <TextField
          className="search-field"
          placeholder="Search examples..."
          variant="outlined"
          size="small"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (e.target.value.trim()) {
              setSelectedTag(null);
            }
          }}
        />
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
            <Typography className="description">
              {workflow.description}
            </Typography>
          </Box>
        ))}
      </Box>
    </div>
  );
};

export default ExampleGrid;
