/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState, useMemo, memo } from "react";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import WorkflowToolbar from "./WorkflowToolbar";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import WorkflowDeleteDialog from "./WorkflowDeleteDialog";
import {
  Workflow,
  WorkflowAttributes,
  WorkflowList as WorkflowListType
} from "../../stores/ApiTypes";
import isEqual from "../../utils/isEqual";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../../trpc/client";
import { useNavigate, useLocation } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowListView from "./WorkflowListView";
import SharedWithMeSection from "./SharedWithMeSection";
import WorkflowFormModal from "./WorkflowFormModal";
import { usePanelStore } from "../../stores/PanelStore";
import { useFavoriteWorkflowIds } from "../../stores/FavoriteWorkflowsStore";
import { useSelectedTags } from "../../stores/WorkflowListViewStore";
import { EmptyState, FlexColumn, FlexRow, LoadingSpinner } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    "&": {
      margin: 0,
      height: "100%"
    },
    ".toolbar-header": {
      padding: theme.spacing(0.75, 0, 1)
    },
    ".workflow-items": {
      flex: 1,
      minHeight: 0,
      overflow: "hidden"
    }
  });

const loadWorkflows = async (cursor?: string, limit?: number) => {
  return trpcClient.workflows.list.query({
    cursor: cursor ?? "",
    limit: limit ?? 100
  }) as unknown as WorkflowListType;
};

const WorkflowList = () => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => styles(theme), [theme]);
  const queryClient = useQueryClient();
  const [filterValue, setFilterValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const [workflowsToDelete, setWorkflowsToDelete] = useState<
    WorkflowAttributes[]
  >([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [showCheckboxes, setShowCheckboxes] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const pageSize = 1000;
  const [workflowToEdit, setWorkflowToEdit] = useState<Workflow | null>(null);

  const { data, isLoading, error, isError } = useQuery<WorkflowListType, Error>(
    {
      queryKey: ["workflows"],
      queryFn: () => loadWorkflows("", pageSize),
      staleTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false
    }
  );

  const favoriteWorkflowIds = useFavoriteWorkflowIds();
  const selectedTags = useSelectedTags();

  // Derive available tags from all workflows
  const availableTags = useMemo(() => {
    if (!data?.workflows) { return []; }
    const tagSet = new Set<string>();
    data.workflows.forEach((workflow) => {
      workflow.tags?.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [data?.workflows]);

  const workflows = useMemo(() => {
    if (!data?.workflows) { return []; }
    let filtered = data.workflows;

    if (filterValue !== "") {
      const filterValueLower = filterValue.toLowerCase();
      filtered = filtered.filter((workflow) =>
        workflow.name.toLowerCase().includes(filterValueLower)
      );
    }

    if (showFavoritesOnly) {
      const favSet = new Set(favoriteWorkflowIds);
      filtered = filtered.filter((workflow) => favSet.has(workflow.id));
    }

    // Filter by selected tags (workflow must have ALL selected tags)
    if (selectedTags.length > 0) {
      filtered = filtered.filter((workflow) => {
        const workflowTags = workflow.tags || [];
        const workflowTagsSet = new Set(workflowTags);
        return selectedTags.every((tag) => workflowTagsSet.has(tag));
      });
    }

    return filtered;
  }, [data?.workflows, filterValue, showFavoritesOnly, favoriteWorkflowIds, selectedTags]);

  const onSelect = useCallback((workflow: Workflow) => {
    setSelectedWorkflows((prev) =>
      prev.includes(workflow.id)
        ? prev.filter((id) => id !== workflow.id)
        : [...prev, workflow.id]
    );
  }, []);

  const onDeselect = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const keyState = useKeyPressedStore.getState();
      if (keyState.isKeyPressed("Control") || keyState.isKeyPressed("Shift")) { return; }
      if (
        !target.closest(".workflow") &&
        !target.closest(".MuiDialog-root") &&
        !target.closest(".delete-selected-button")
      ) {
        setSelectedWorkflows([]);
      }
    },
    []
  );

  const onDelete = useCallback((workflow: Workflow) => {
    setWorkflowsToDelete([workflow]);
    setIsDeleteDialogOpen(true);
  }, []);

  useEffect(() => {
    document.addEventListener("click", onDeselect);
    return () => document.removeEventListener("click", onDeselect);
  }, [onDeselect]);

  const navigate = useNavigate();
  const location = useLocation();
  const copyWorkflow = useWorkflowManager((state) => state.copy);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const updateWorkflow = useWorkflowManager((state) => state.updateWorkflow);
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);


  const handleOpenWorkflow = useCallback(
    (workflow: Workflow) => {
      if (location.pathname.startsWith("/apps/")) {
        navigate("/apps/" + workflow.id);
        usePanelStore.getState().setVisibility(false);
      } else {
        navigate("/editor/" + workflow.id);
        usePanelStore.getState().setVisibility(false);
      }
    },
    [navigate, location.pathname]
  );

  // Memoize workflow name lookup map to avoid recalculating on every duplicateWorkflow call
  const workflowNamesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    workflows.forEach((w) => {
      const baseName = w.name.replace(/ \(\d+\)$/, "");
      if (!map.has(baseName)) {
        map.set(baseName, []);
      }
      map.get(baseName)!.push(w.name);
    });
    return map;
  }, [workflows]);

  const duplicateWorkflow = useCallback(
    async (event: React.MouseEvent, workflow: Workflow) => {
      event.stopPropagation();
      const workflowRequest = await copyWorkflow(workflow);
      const baseName = workflow.name.replace(/ \(\d+\)$/, "");
      const existingNames = workflowNamesMap.get(baseName) || [];
      let highestNumber = 0;
      const regex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\((\\d+)\\)$`);
      existingNames.forEach((name) => {
        const match = name.match(regex);
        if (match && match[1]) {
          const number = parseInt(match[1], 10);
          if (number > highestNumber) {
            highestNumber = number;
          }
        }
      });
      const newName = `${baseName} (${highestNumber + 1})`;
      workflowRequest.name = newName.substring(0, 50);
      const newWorkflow = await createWorkflow(workflowRequest);
      navigate(`/editor/${newWorkflow.id}`);
    },
    [copyWorkflow, createWorkflow, workflowNamesMap, navigate]
  );

  const handleEdit = useCallback((workflow: Workflow) => {
    setWorkflowToEdit(workflow);
  }, []);

  const handleRename = useCallback(
    async (workflow: Workflow, newName: string) => {
      try {
        await trpcClient.workflows.update.mutate({
          id: workflow.id,
          name: newName
        });
        // Update the cache optimistically
        queryClient.setQueryData<WorkflowListType>(["workflows"], (old) => {
          if (!old) { return old; }
          return {
            ...old,
            workflows: old.workflows.map((w) =>
              w.id === workflow.id ? { ...w, name: newName } : w
            )
          };
        });
        // The optimistic write only updates the list query. Detail consumers
        // (`["workflow", id]`) and the workflow tools picker also surface the
        // name and must be refetched. The backend resource_change broadcast
        // will normally cover this, but invalidating here keeps the UI
        // consistent even if the broadcast is missed.
        queryClient.invalidateQueries({
          queryKey: ["workflow", workflow.id]
        });
        queryClient.invalidateQueries({ queryKey: ["workflow-tools"] });
        // Also update the workflow manager if this workflow is open (updates tabs)
        const openWorkflow = getWorkflow(workflow.id);
        if (openWorkflow) {
          updateWorkflow({ ...openWorkflow, name: newName });
        }
      } catch (err) {
        console.error("Failed to rename workflow:", err);
      }
    },
    [queryClient, getWorkflow, updateWorkflow]
  );

  const handleToggleFavorites = useCallback(() => {
    setShowFavoritesOnly((prev) => !prev);
  }, []);

  const handleCloseDeleteDialog = useCallback(() => {
    setIsDeleteDialogOpen(false);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setWorkflowToEdit(null);
  }, []);

  const handleToggleCheckboxes = useCallback(() => {
    setShowCheckboxes((prev) => !prev);
  }, []);

  const handleBulkDelete = useCallback(() => {
    const selectedWorkflowsSet = new Set(selectedWorkflows);
    setWorkflowsToDelete(
      workflows.filter((w) => selectedWorkflowsSet.has(w.id))
    );
    setIsDeleteDialogOpen(true);
  }, [workflows, selectedWorkflows]);

  return (
    <>
      <WorkflowDeleteDialog
        open={isDeleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        workflowsToDelete={workflowsToDelete}
      />
      {workflowToEdit && (
        <WorkflowFormModal
          open={!!workflowToEdit}
          onClose={handleCloseEditModal}
          workflow={workflowToEdit}
          availableTags={availableTags}
        />
      )}
      <FlexColumn gap={0} fullHeight css={memoizedStyles}>
        <CategorySearchBar
          ref={searchRef}
          value={filterValue}
          onChange={setFilterValue}
          placeholder="Search workflows..."
        />
        <FlexRow
          className="toolbar-header"
          align="center"
          gap={3}
          justify="space-between"
        >
          <WorkflowToolbar
            showCheckboxes={showCheckboxes}
            toggleCheckboxes={handleToggleCheckboxes}
            selectedWorkflowsCount={selectedWorkflows.length}
            onBulkDelete={handleBulkDelete}
            showFavoritesOnly={showFavoritesOnly}
            onToggleFavorites={handleToggleFavorites}
            availableTags={availableTags}
          />
        </FlexRow>
        {isLoading ? (
          <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
            <LoadingSpinner size="large" text="Loading workflows" />
          </FlexColumn>
        ) : isError ? (
          <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1, px: 2 }}>
            <EmptyState
              variant="error"
              title="Could not load workflows"
              description={error?.message ?? "Try again later."}
            />
          </FlexColumn>
        ) : workflows.length === 0 ? (
          <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1, px: 2 }}>
            {showFavoritesOnly ? (
              <EmptyState
                title="No favorite workflows"
                description="Click the star icon on a workflow to add it to your favorites."
              />
            ) : data?.workflows && data.workflows.length > 0 ? (
              <EmptyState
                title="No matching workflows"
                description={
                  filterValue && selectedTags.length > 0
                    ? "Try adjusting your search term or tag filters."
                    : filterValue
                      ? "Try a different search term."
                      : selectedTags.length > 0
                        ? "Try removing some tag filters."
                        : "No workflows match the current filters."
                }
              />
            ) : (
              <EmptyState
                title="No workflows yet"
                description="Create your first workflow with the + button above."
              />
            )}
          </FlexColumn>
        ) : (
          <div className="workflow-items">
            <WorkflowListView
              workflows={workflows}
              onOpenWorkflow={handleOpenWorkflow}
              onDuplicateWorkflow={duplicateWorkflow}
              onDelete={onDelete}
              onEdit={handleEdit}
              onRename={handleRename}
              onSelect={onSelect}
              selectedWorkflows={selectedWorkflows}
              workflowCategory="user"
              showCheckboxes={showCheckboxes}
            />
          </div>
        )}
        <SharedWithMeSection />
      </FlexColumn>
    </>
  );
};

export default memo(WorkflowList, isEqual);
