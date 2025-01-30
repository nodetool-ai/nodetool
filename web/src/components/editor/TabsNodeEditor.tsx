/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useStore } from "@xyflow/react";
import { useEffect, useState } from "react";
import { useLoaderData, useNavigate } from "react-router-dom";
import CloseIcon from "@mui/icons-material/Close";
import { MIN_ZOOM } from "../../config/constants";
import { useWorkflows } from "../../contexts/NodeContext";
import { Workflow } from "../../stores/ApiTypes";
import NodeEditor from "../node_editor/NodeEditor";
import { DragEvent } from "react";

const styles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: theme.palette.background.default,

    "& .tabs": {
      display: "flex",
      marginLeft: "4em",
      background: theme.palette.background.paper,
      borderBottom: `1px solid ${theme.palette.divider}`,
      height: "35px",
      overflowX: "auto",

      "&::-webkit-scrollbar": {
        height: "3px"
      }
    },

    "& .tab": {
      padding: "0 16px",
      height: "35px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      minWidth: "100px",
      cursor: "pointer",
      borderRight: `1px solid ${theme.palette.divider}`,
      color: theme.palette.c_gray5,
      position: "relative",
      transition: "all 0.2s ease-in-out",

      "&:hover": {
        background: `${theme.palette.c_gray2}33`,
        "&::before": {
          content: '""',
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: `linear-gradient(90deg, transparent, ${theme.palette.c_hl1}, transparent)`
        }
      },

      "&.active": {
        background: theme.palette.c_gray2,
        color: theme.palette.c_hl1,
        "&::after": {
          content: '""',
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: theme.palette.c_hl1,
          boxShadow: `0 0 8px ${theme.palette.c_hl1}`
        }
      },

      "& .close-icon": {
        opacity: 0,
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          opacity: 1,
          transform: "rotate(90deg)",
          color: theme.palette.c_hl1
        }
      },

      "&:hover .close-icon": {
        opacity: 0.7
      },

      "&.drop-target::before": {
        content: '""',
        position: "absolute",
        left: -1,
        top: 0,
        bottom: 0,
        width: 2,
        background: theme.palette.c_hl1
      },

      "&.drop-target-right::after": {
        content: '""',
        position: "absolute",
        right: -1,
        top: 0,
        bottom: 0,
        width: 2,
        background: theme.palette.c_hl1
      }
    },

    "& .editor-container": {
      flex: 1,
      position: "relative"
    }
  });

const TabsNodeEditor = () => {
  const currentZoom = useStore((state) => state.transform[2]);
  const isMinZoom = currentZoom <= MIN_ZOOM;
  const {
    workflows,
    getWorkflow,
    addWorkflow,
    removeWorkflow,
    reorderWorkflows
  } = useWorkflows();
  const { workflow: currentWorkflow } = useLoaderData() as {
    workflow: Workflow;
  };
  const navigate = useNavigate();
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "left" | "right";
  } | null>(null);

  useEffect(() => {
    if (!getWorkflow(currentWorkflow.id)) {
      addWorkflow(currentWorkflow);
    }
  }, [currentWorkflow.id]);

  const handleClose = (workflowId: string) => {
    removeWorkflow(workflowId);
    if (currentWorkflow.id === workflowId) {
      // Switch to the last remaining tab
      const remaining = workflows.filter(
        (workflow) => workflow.id !== workflowId
      );
      if (remaining.length > 0) {
        navigate(`/editor/${remaining[remaining.length - 1].id}`);
      }
    }
  };

  const handleDragStart = (
    e: DragEvent<HTMLDivElement>,
    workflowId: string
  ) => {
    e.dataTransfer.setData("text/plain", workflowId);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    const boundingRect = (e.target as HTMLElement).getBoundingClientRect();
    const mouseX = e.clientX;
    const position =
      mouseX < boundingRect.left + boundingRect.width / 2 ? "left" : "right";
    setDropTarget({ id: targetId, position });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    if (sourceId !== targetId && dropTarget) {
      const sourceIndex = workflows.findIndex((w) => w.id === sourceId);
      const targetIndex = workflows.findIndex((w) => w.id === targetId);
      const finalTargetIndex =
        dropTarget.position === "right" ? targetIndex + 1 : targetIndex;
      reorderWorkflows(sourceIndex, finalTargetIndex);
    }
    setDropTarget(null);
  };

  return (
    <div css={styles}>
      <div className="tabs">
        {workflows.map((workflow) => (
          <div
            key={workflow.id}
            className={`tab ${
              workflow.id === currentWorkflow.id ? "active" : ""
            } ${
              dropTarget?.id === workflow.id
                ? dropTarget.position === "left"
                  ? "drop-target"
                  : "drop-target-right"
                : ""
            }`}
            onClick={() => navigate(`/editor/${workflow.id}`)}
            draggable
            onDragStart={(e) => handleDragStart(e, workflow.id)}
            onDragOver={(e) => handleDragOver(e, workflow.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, workflow.id)}
          >
            <span>{workflow.name}</span>
            <CloseIcon
              className="close-icon"
              sx={{ fontSize: 16 }}
              onClick={(e) => {
                e.stopPropagation();
                handleClose(workflow.id);
              }}
            />
          </div>
        ))}
      </div>
      <div className="editor-container">
        <NodeEditor isMinZoom={isMinZoom} />
      </div>
    </div>
  );
};

export default TabsNodeEditor;
