import { DragEvent, WheelEvent } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useCallback, useEffect, useRef, useState } from "react";
import TabHeader from "./TabHeader";
import { WorkflowAttributes } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNavigate } from "react-router-dom";
import AddIcon from "@mui/icons-material/Add";

interface TabsBarProps {
  workflows: WorkflowAttributes[];
  currentWorkflowId: string;
}

const TabsBar = ({ workflows, currentWorkflowId }: TabsBarProps) => {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(
    null
  );
  const navigate = useNavigate();
  const {
    openWorkflows,
    getWorkflow,
    reorderWorkflows,
    updateWorkflow,
    removeWorkflow,
    saveWorkflow,
    createNewWorkflow,
    getNodeStore
  } = useWorkflowManager((state) => ({
    openWorkflows: state.openWorkflows,
    getWorkflow: state.getWorkflow,
    removeWorkflow: state.removeWorkflow,
    reorderWorkflows: state.reorderWorkflows,
    updateWorkflow: state.updateWorkflow,
    saveWorkflow: state.saveWorkflow,
    createNewWorkflow: state.createNew,
    getNodeStore: state.getNodeStore
  }));

  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "left" | "right";
  } | null>(null);
  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, workflowId: string) => {
      e.dataTransfer.setData("text/plain", workflowId);
    },
    []
  );

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
        const sourceIndex = openWorkflows.findIndex((w) => w.id === sourceId);
        const targetIndex = openWorkflows.findIndex((w) => w.id === targetId);
        const finalTargetIndex =
          dropTarget.position === "right" ? targetIndex + 1 : targetIndex;
        reorderWorkflows(sourceIndex, finalTargetIndex);
      }
      setDropTarget(null);
    },
    [dropTarget, openWorkflows, reorderWorkflows]
  );

  const handleDoubleClick = useCallback((workflowId: string) => {
    setEditingWorkflowId(workflowId);
  }, []);

  const handleNameChange = useCallback(
    async (workflowId: string, newName: string) => {
      const workflow = getWorkflow(workflowId);
      if (workflow) {
        const updatedWorkflow = { ...workflow, name: newName };
        updateWorkflow(updatedWorkflow);
        await saveWorkflow(updatedWorkflow);
      }
      setEditingWorkflowId(null);
    },
    [getWorkflow, updateWorkflow, saveWorkflow]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, workflowId: string, newName: string) => {
      if (e.key === "Enter") {
        const workflow = getWorkflow(workflowId);
        if (workflow) {
          const updatedWorkflow = { ...workflow, name: newName };
          updateWorkflow(updatedWorkflow);
          saveWorkflow(updatedWorkflow);
        }
        setEditingWorkflowId(null);
      } else if (e.key === "Escape") {
        setEditingWorkflowId(null);
      }
    },
    [getWorkflow, updateWorkflow, saveWorkflow]
  );

  const handleNavigate = useCallback(
    (id: string) => navigate(`/editor/${id}`),
    [navigate]
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

  const handleScrollLeft = useCallback(
    () => handleScroll("left"),
    [handleScroll]
  );
  const handleScrollRight = useCallback(
    () => handleScroll("right"),
    [handleScroll]
  );

  const handleNewWorkflow = useCallback(async () => {
    const newWorkflow = await createNewWorkflow();
    navigate(`/editor/${newWorkflow.id}`);
  }, [createNewWorkflow, navigate]);

  useEffect(() => {
    checkScrollability();
    window.addEventListener("resize", checkScrollability);
    return () => window.removeEventListener("resize", checkScrollability);
  }, [checkScrollability]);

  useEffect(() => {
    const tabsElement = tabsRef.current;
    if (tabsElement) {
      tabsElement.addEventListener("scroll", checkScrollability);
      return () =>
        tabsElement.removeEventListener("scroll", checkScrollability);
    }
  }, [checkScrollability]);

  return (
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
        {workflows.map((workflow) => {
          return (
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
          );
        })}
        <button
          tabIndex={-1}
          className="new-workflow-button"
          onClick={handleNewWorkflow}
          title="Create new workflow"
        >
          <AddIcon />
        </button>
      </div>
      <button
        tabIndex={-1}
        className="scroll-button"
        onClick={handleScrollRight}
        disabled={!canScrollRight}
        data-hidden={!showScrollButtons}
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
};

export default TabsBar;
