/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useStore } from "@xyflow/react";
import { useEffect, useState } from "react";
import { useLoaderData, useNavigate } from "react-router-dom";
import CloseIcon from "@mui/icons-material/Close";
import { MIN_ZOOM } from "../../config/constants";
import { useWorkflowManager } from "../../contexts/NodeContext";
import { Workflow } from "../../stores/ApiTypes";
import NodeEditor from "../node_editor/NodeEditor";
import { DragEvent } from "react";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";

const styles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",

    "& .tabs": {
      zIndex: 1000,
      display: "flex",
      flexWrap: "nowrap",
      marginLeft: "4em",
      minHeight: "30px",
      maxHeight: "100px",
      overflowX: "auto",
      overflowY: "hidden",
      padding: "0 10px",
      paddingTop: "5px",
      whiteSpace: "nowrap",
      width: "calc(100% - 4em)",
      maxWidth: "100%",

      "&::-webkit-scrollbar": {
        display: "block",
        height: "2px",
        color: theme.palette.c_gray3
      },

      "&::-webkit-scrollbar-track": {
        background: theme.palette.background.default
      },

      "&::-webkit-scrollbar-thumb": {
        background: theme.palette.c_gray3,
        borderRadius: "3px"
      }
    },

    "& .tab:hover": {
      color: theme.palette.c_gray6,
      background: theme.palette.c_gray1
    },

    "& .tab.active": {
      color: theme.palette.c_white,
      textShadow: "0 0 2px rgba(0, 0, 0, 0.5)",
      backgroundColor: theme.palette.c_editor_bg_color,
      borderBottom: "none",
      zIndex: 1
    },

    "& .tab": {
      padding: "5px 5px 5px 15px",
      height: "30px",
      display: "flex",
      flexWrap: "nowrap",
      lineHeight: "1.1em",
      alignItems: "center",
      gap: "8px",
      minWidth: "100px",
      flex: "0 0 auto",
      cursor: "pointer",
      color: theme.palette.c_gray5,
      background: theme.palette.background.default,
      borderRadius: "5px 5px 0 0",
      fontSize: theme.fontSizeNormal,
      transition: "all 0.1s ease-in-out",
      position: "relative",
      marginRight: "2px",
      border: `1px solid ${theme.palette.c_gray1}`,
      borderBottom: "none",
      boxSizing: "border-box",

      "& .close-icon": {
        opacity: 0.4,
        transition: "all 0.1s ease-in-out",
        "&:hover": {
          opacity: 1,
          transform: "rotate(90deg)",
          color: theme.palette.c_hl1
        }
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
      position: "relative",
      borderTop: "none"
    }
  });

const TabsNodeEditor = () => {
  const currentZoom = useStore((state) => state.transform[2]);
  const isMinZoom = currentZoom <= MIN_ZOOM;
  const {
    listWorkflows,
    getWorkflow,
    addWorkflow,
    removeWorkflow,
    reorderWorkflows,
    updateWorkflow
  } = useWorkflowManager();
  const { workflow: currentWorkflow } = useLoaderData() as {
    workflow: Workflow;
  };
  const navigate = useNavigate();
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "left" | "right";
  } | null>(null);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!getWorkflow(currentWorkflow.id)) {
      addWorkflow(currentWorkflow);
    }
  }, [currentWorkflow.id]);

  const handleClose = (workflowId: string) => {
    removeWorkflow(workflowId);
    if (currentWorkflow.id === workflowId) {
      // Switch to the last remaining tab
      const remaining = listWorkflows().filter(
        (workflow) => workflow.id !== workflowId
      );
      if (remaining.length > 0) {
        navigate(`/editor/${remaining[remaining.length - 1].id}`);
      } else {
        navigate("/editor");
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
      const workflows = listWorkflows();
      const sourceIndex = workflows.findIndex((w) => w.id === sourceId);
      const targetIndex = workflows.findIndex((w) => w.id === targetId);
      const finalTargetIndex =
        dropTarget.position === "right" ? targetIndex + 1 : targetIndex;
      reorderWorkflows(sourceIndex, finalTargetIndex);
    }
    setDropTarget(null);
  };

  const handleDoubleClick = (workflowId: string) => {
    setEditingWorkflowId(workflowId);
  };

  const handleNameChange = (workflowId: string, newName: string) => {
    const workflow = getWorkflow(workflowId);
    if (workflow) {
      updateWorkflow({ ...workflow, name: newName });
    }
    setEditingWorkflowId(null);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    workflowId: string,
    newName: string
  ) => {
    if (e.key === "Enter") {
      handleNameChange(workflowId, newName);
    } else if (e.key === "Escape") {
      setEditingWorkflowId(null);
    }
  };

  const { collapsed: panelLeftCollapsed, size: panelSize } =
    useResizePanel("left");

  return (
    <div
      css={styles}
      style={{ marginLeft: panelLeftCollapsed ? "0" : panelSize - 65 }}
    >
      <div className="tabs">
        {listWorkflows().map((workflow) => (
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
            onDoubleClick={() => handleDoubleClick(workflow.id)}
            draggable={editingWorkflowId !== workflow.id}
            onDragStart={(e) => handleDragStart(e, workflow.id)}
            onDragOver={(e) => handleDragOver(e, workflow.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, workflow.id)}
          >
            {editingWorkflowId === workflow.id ? (
              <input
                type="text"
                defaultValue={workflow.name}
                autoFocus
                onBlur={(e) => handleNameChange(workflow.id, e.target.value)}
                onKeyDown={(e) =>
                  handleKeyDown(e, workflow.id, e.currentTarget.value)
                }
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  padding: 0,
                  fontSize: "inherit",
                  width: "100%",
                  outline: "none"
                }}
              />
            ) : (
              <span>{workflow.name}</span>
            )}
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
