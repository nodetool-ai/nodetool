/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { ReactFlowProvider, useStore } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import NodeEditor from "../node_editor/NodeEditor";
import { DragEvent, WheelEvent } from "react";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeProvider } from "../../contexts/NodeContext";
import StatusMessage from "../panels/StatusMessage";
import AppHeaderActions from "../panels/AppHeaderActions";
import { Workflow } from "../../stores/ApiTypes";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TabHeader from "./TabHeader";
import { createPortal } from "react-dom";
import { generateCSS } from "../themes/GenerateCSS";

const styles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    flex: 1,
    minWidth: 0,
    "& .tabs-container": {
      display: "flex",
      alignItems: "center",
      position: "relative"
    },
    "& .tabs": {
      width: "100%",
      zIndex: 1000,
      display: "flex",
      flexWrap: "nowrap",
      minHeight: "30px",
      maxHeight: "100px",
      overflowX: "auto",
      overflowY: "hidden",
      padding: "0 10px",
      paddingTop: "5px",
      whiteSpace: "nowrap",
      maxWidth: "100%",
      scrollbarWidth: "none",
      msOverflowStyle: "none",

      "&::-webkit-scrollbar": {
        display: "none"
      },

      "&::-webkit-scrollbar-track": {
        display: "none"
      },

      "&::-webkit-scrollbar-thumb": {
        display: "none"
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

      "& .dirty-indicator": {
        color: theme.palette.c_hl1,
        fontSize: "0.8em",
        marginLeft: "5px"
      },

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
    },
    ".status-message-container": {
      position: "absolute",
      top: "-70px",
      right: "300px",
      zIndex: 10000
    },
    "& .scroll-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "24px",
      height: "30px",
      background: theme.palette.background.default,
      border: "none",
      cursor: "pointer",
      color: theme.palette.c_gray5,
      transition: "all 0.1s ease-in-out",
      padding: 0,
      flexShrink: 0,
      visibility: "visible",

      "&[data-hidden='true']": {
        visibility: "hidden"
      },

      "&:hover": {
        color: theme.palette.c_white,
        background: theme.palette.c_gray1
      },

      "&:disabled": {
        opacity: 0.3,
        "&:hover": {
          color: theme.palette.c_gray5,
          background: theme.palette.background.default
        }
      }
    }
  });

const TabsNodeEditor = () => {
  const {
    listWorkflows,
    getWorkflow,
    removeWorkflow,
    reorderWorkflows,
    updateWorkflow,
    currentWorkflowId,
    loadingStates
  } = useWorkflowManager((state) => ({
    listWorkflows: state.listWorkflows,
    getWorkflow: state.getWorkflow,
    removeWorkflow: state.removeWorkflow,
    reorderWorkflows: state.reorderWorkflows,
    updateWorkflow: state.updateWorkflow,
    currentWorkflowId: state.currentWorkflowId,
    loadingStates: state.loadingStates
  }));
  const navigate = useNavigate();
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "left" | "right";
  } | null>(null);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(
    null
  );
  const tabsRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const workflows = useMemo(() => {
    const workflows = listWorkflows();
    const loadingWorkflows = Object.keys(loadingStates)
      .filter((id) => !workflows.some((w) => w.id === id))
      .map(
        (id) =>
          ({
            id,
            name: "Loading...",
            thumbnail: "",
            access: "private",
            description: "",
            isDirty: false,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            graph: { nodes: [], edges: [] }
          } as Workflow)
      );
    return [...workflows, ...loadingWorkflows];
  }, [listWorkflows, loadingStates]);

  const handleClose = useCallback(
    (workflowId: string) => {
      removeWorkflow(workflowId);
      if (currentWorkflowId === workflowId) {
        const remaining = workflows.filter(
          (workflow) => workflow.id !== workflowId
        );
        if (remaining.length > 0) {
          navigate(`/editor/${remaining[remaining.length - 1].id}`);
        } else {
          navigate("/editor");
        }
      }
    },
    [currentWorkflowId, workflows, navigate, removeWorkflow]
  );

  const handleDragStart = (
    e: DragEvent<HTMLDivElement>,
    workflowId: string
  ) => {
    e.dataTransfer.setData("text/plain", workflowId);
  };

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      const boundingRect = (e.target as HTMLElement).getBoundingClientRect();
      const mouseX = e.clientX;
      const position =
        mouseX < boundingRect.left + boundingRect.width / 2 ? "left" : "right";
      setDropTarget({ id: targetId, position });
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, targetId: string) => {
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
    },
    [dropTarget, listWorkflows, reorderWorkflows]
  );

  const handleDoubleClick = useCallback((workflowId: string) => {
    setEditingWorkflowId(workflowId);
  }, []);

  const handleNameChange = useCallback(
    (workflowId: string, newName: string) => {
      const workflow = getWorkflow(workflowId);
      if (workflow) {
        updateWorkflow({ ...workflow, name: newName });
      }
      setEditingWorkflowId(null);
    },
    [getWorkflow, updateWorkflow]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, workflowId: string, newName: string) => {
      if (e.key === "Enter") {
        handleNameChange(workflowId, newName);
      } else if (e.key === "Escape") {
        setEditingWorkflowId(null);
      }
    },
    [handleNameChange, setEditingWorkflowId]
  );

  const checkScrollability = useCallback(() => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth);
      setShowScrollButtons(scrollWidth > clientWidth);
    }
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      const tabsContainer = e.currentTarget;
      tabsContainer.scrollLeft += e.deltaY;
      e.preventDefault();
      checkScrollability();
    },
    [checkScrollability]
  );

  const handleScroll = useCallback(
    (direction: "left" | "right") => {
      if (tabsRef.current) {
        const scrollAmount = 180;
        const newScrollLeft =
          tabsRef.current.scrollLeft +
          (direction === "left" ? -scrollAmount : scrollAmount);
        tabsRef.current.scrollTo({
          left: newScrollLeft,
          behavior: "smooth"
        });
        setTimeout(checkScrollability, 300);
      }
    },
    [checkScrollability]
  );

  const handleNavigate = useCallback(
    (id: string) => navigate(`/editor/${id}`),
    [navigate]
  );
  const handleScrollLeft = useCallback(
    () => handleScroll("left"),
    [handleScroll]
  );
  const handleScrollRight = useCallback(
    () => handleScroll("right"),
    [handleScroll]
  );
  useEffect(() => {
    checkScrollability();
    window.addEventListener("resize", checkScrollability);
    return () => window.removeEventListener("resize", checkScrollability);
  }, [listWorkflows, checkScrollability]);

  useEffect(() => {
    const tabsElement = tabsRef.current;
    if (tabsElement) {
      tabsElement.addEventListener("scroll", checkScrollability);
      return () =>
        tabsElement.removeEventListener("scroll", checkScrollability);
    }
  }, [checkScrollability]);

  return (
    <div css={styles}>
      <div className="tabs-container">
        <button
          className="scroll-button"
          onClick={handleScrollLeft}
          disabled={!canScrollLeft}
          data-hidden={!showScrollButtons}
        >
          <ChevronLeftIcon />
        </button>
        <div className="tabs" ref={tabsRef} onWheel={handleWheel}>
          {workflows.map((workflow) => (
            <TabHeader
              key={workflow.id}
              workflow={workflow}
              isActive={workflow.id === currentWorkflowId}
              isEditing={editingWorkflowId === workflow.id}
              dropTarget={dropTarget}
              onNavigate={handleNavigate}
              onDoubleClick={handleDoubleClick}
              onClose={handleClose}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onNameChange={handleNameChange}
              onKeyDown={handleKeyDown}
            />
          ))}
        </div>
        <button
          className="scroll-button"
          onClick={handleScrollRight}
          disabled={!canScrollRight}
          data-hidden={!showScrollButtons}
        >
          <ChevronRightIcon />
        </button>
      </div>
      <div className="editor-container" css={generateCSS}>
        {workflows.map((workflow) =>
          currentWorkflowId === workflow.id ? (
            <div key={workflow.id}>
              <ReactFlowProvider>
                <NodeProvider workflowId={workflow.id}>
                  {createPortal(
                    <div className="actions-container">
                      <AppHeaderActions />
                    </div>,
                    document.body
                  )}
                  <div className="status-message-container">
                    <StatusMessage />
                  </div>
                  <NodeEditor workflowId={workflow.id} />
                </NodeProvider>
              </ReactFlowProvider>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
};

export default TabsNodeEditor;
