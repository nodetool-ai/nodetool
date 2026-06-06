/** @jsxImportSource @emotion/react */
/**
 * CreateGeneratedLayerDialog
 *
 * Workflow picker dialog. Lists the user's workflows whose graph contains
 * at least one image-output node and creates a generated layer bound to the
 * chosen workflow. Multiple image-output nodes prompt the user to pick one.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "../../../trpc/client";
import type { Workflow } from "../../../stores/ApiTypes";
import {
  Caption,
  Dialog,
  EmptyState,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  Text,
  TextInput,
  Toast
} from "../../ui_primitives";
import { useCreateGeneratedLayer } from "../../../hooks/sketch/useCreateGeneratedLayer";

const IMAGE_OUTPUT_TYPES = new Set([
  "nodetool.output.ImageOutput",
  "nodetool.output.MaskOutput",
  "nodetool.output.Output"
]);

interface ImageOutputNode {
  id: string;
  label: string;
}

interface PickerWorkflow {
  id: string;
  name: string;
  description: string | null;
  outputNodes: ImageOutputNode[];
}

const ROW_GAP_PX = 4;

const dialogStyles = (theme: Theme) =>
  css({
    minWidth: 560,
    maxWidth: 720
  });

const listStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: ROW_GAP_PX,
    maxHeight: 360,
    overflow: "auto",
    padding: theme.spacing(0.5),
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.vars.palette.background.default
  });

const rowStyles = (theme: Theme, selected: boolean) =>
  css({
    padding: theme.spacing(1, 1),
    borderRadius: theme.shape.borderRadius,
    cursor: "pointer",
    backgroundColor: selected
      ? theme.vars.palette.action.selected
      : "transparent",
    border: `1px solid ${
      selected ? theme.vars.palette.primary.main : "transparent"
    }`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    }
  });

function shortNodeLabel(node: { id: string; type?: string; data?: unknown }) {
  const data = node.data as { name?: unknown; title?: unknown } | undefined;
  const name =
    typeof data?.title === "string" && data.title
      ? data.title
      : typeof data?.name === "string" && data.name
      ? data.name
      : (node.type ?? "").split(".").pop() ?? node.id;
  return `${name}`;
}

function extractImageOutputs(workflow: Workflow): ImageOutputNode[] {
  const nodes = (workflow.graph?.nodes ?? []) as Array<{
    id: string;
    type: string;
    data?: unknown;
  }>;
  return nodes
    .filter((n) => IMAGE_OUTPUT_TYPES.has(n.type))
    .map((n) => ({ id: n.id, label: shortNodeLabel(n) }));
}

export interface CreateGeneratedLayerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new layer id after a successful create. */
  onCreated?: (layerId: string) => void;
}

export const CreateGeneratedLayerDialog: React.FC<CreateGeneratedLayerDialogProps> =
  memo(({ open, onClose, onCreated }) => {
    if (!open) {
      return null;
    }
    return (
      <CreateGeneratedLayerDialogBody onClose={onClose} onCreated={onCreated} />
    );
  });

const CreateGeneratedLayerDialogBody: React.FC<{
  onClose: () => void;
  onCreated?: (layerId: string) => void;
}> = ({ onClose, onCreated }) => {
    const theme = useTheme();
    const [filter, setFilter] = useState("");
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
      null
    );
    const [selectedOutputNodeId, setSelectedOutputNodeId] = useState<
      string | null
    >(null);
    const [error, setError] = useState<string | null>(null);

    const { createGeneratedLayer, isBusy } = useCreateGeneratedLayer();

    const { data, isLoading, isError } = useQuery({
      queryKey: ["sketch-create-generated-layer-workflows"],
      queryFn: async () => {
        const result = await trpcClient.workflows.list.query({ limit: 200 });
        return result as { workflows: Workflow[]; next: string | null };
      },
      staleTime: 30_000
    });

    const pickerWorkflows = useMemo<PickerWorkflow[]>(() => {
      const workflows = data?.workflows ?? [];
      return workflows
        .map((w) => ({
          id: w.id,
          name: w.name || "Untitled workflow",
          description: w.description ?? null,
          outputNodes: extractImageOutputs(w)
        }))
        .filter((w) => w.outputNodes.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    }, [data]);

    const filteredWorkflows = useMemo(() => {
      const q = filter.trim().toLowerCase();
      if (!q) {
        return pickerWorkflows;
      }
      return pickerWorkflows.filter((w) => {
        return (
          w.name.toLowerCase().includes(q) ||
          (w.description?.toLowerCase().includes(q) ?? false)
        );
      });
    }, [filter, pickerWorkflows]);

    const selectedWorkflow = useMemo(
      () => pickerWorkflows.find((w) => w.id === selectedWorkflowId) ?? null,
      [pickerWorkflows, selectedWorkflowId]
    );

    const handleSelect = useCallback((workflow: PickerWorkflow) => {
      setSelectedWorkflowId(workflow.id);
      setSelectedOutputNodeId(
        workflow.outputNodes.length === 1 ? workflow.outputNodes[0].id : null
      );
    }, []);

    const handleClose = useCallback(() => {
      setFilter("");
      setSelectedWorkflowId(null);
      setSelectedOutputNodeId(null);
      onClose();
    }, [onClose]);

    const requiresOutputPick =
      !!selectedWorkflow && selectedWorkflow.outputNodes.length > 1;
    const confirmDisabled =
      !selectedWorkflow ||
      isBusy ||
      (requiresOutputPick && !selectedOutputNodeId);

    const handleConfirm = useCallback(async () => {
      if (!selectedWorkflow) {
        return;
      }
      const result = await createGeneratedLayer({
        workflowId: selectedWorkflow.id,
        layerName: selectedWorkflow.name,
        selectedOutputNodeId: selectedOutputNodeId ?? undefined
      });
      if (result.ok) {
        onCreated?.(result.layerId);
        handleClose();
      } else if (result.reason === "no-document") {
        setError("No image document is open.");
      } else if (result.reason === "error") {
        setError(result.message ?? "Failed to create layer.");
      }
    }, [
      createGeneratedLayer,
      handleClose,
      onCreated,
      selectedOutputNodeId,
      selectedWorkflow
    ]);

    return (
      <>
        <Dialog
          open
          onClose={handleClose}
          title="Create generated layer"
          showActions
          onConfirm={() => void handleConfirm()}
          onCancel={handleClose}
          confirmText={isBusy ? "Creating…" : "Create layer"}
          confirmDisabled={confirmDisabled}
          PaperProps={{ css: dialogStyles(theme) }}
        >
          <FlexColumn gap={1.5}>
            <Caption color="secondary">
              Pick any workflow whose graph has an image output node.
            </Caption>

            <TextInput
              autoFocus
              compact
              size="small"
              placeholder="Search workflows…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              fullWidth
            />

            {isLoading && (
              <FlexRow justify="center" sx={{ py: 3 }}>
                <LoadingSpinner size="small" />
              </FlexRow>
            )}

            {isError && (
              <EmptyState
                variant="error"
                size="small"
                description="Could not load workflows."
              />
            )}

            {!isLoading && !isError && pickerWorkflows.length === 0 && (
              <EmptyState
                variant="empty"
                size="small"
                title="No matching workflows"
                description="None of your workflows have an image output. Add an ImageOutput, MaskOutput, or Output node to a workflow to use it here."
              />
            )}

            {!isLoading && !isError && filteredWorkflows.length > 0 && (
              <div css={listStyles(theme)}>
                {filteredWorkflows.map((w) => {
                  const selected = w.id === selectedWorkflowId;
                  return (
                    <div
                      key={w.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(w)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelect(w);
                        }
                      }}
                      css={rowStyles(theme, selected)}
                      data-testid="create-generated-layer-row"
                    >
                      <FlexColumn gap={0.25}>
                        <FlexRow align="center" gap={1}>
                          <Label
                            sx={{
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {w.name}
                          </Label>
                          <Caption color="secondary">
                            {w.outputNodes.length} output
                            {w.outputNodes.length === 1 ? "" : "s"}
                          </Caption>
                        </FlexRow>
                        {w.description && (
                          <Caption
                            color="secondary"
                            sx={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {w.description}
                          </Caption>
                        )}
                      </FlexColumn>
                    </div>
                  );
                })}
              </div>
            )}

            {!isLoading &&
              !isError &&
              filter.trim() !== "" &&
              filteredWorkflows.length === 0 &&
              pickerWorkflows.length > 0 && (
                <Caption color="secondary" sx={{ pl: 1 }}>
                  No workflows match &ldquo;{filter}&rdquo;.
                </Caption>
              )}

            {requiresOutputPick && selectedWorkflow && (
              <FlexColumn gap={0.75}>
                <Text size="small">
                  This workflow has multiple image outputs. Pick one:
                </Text>
                <FlexRow gap={0.5} sx={{ flexWrap: "wrap" }}>
                  {selectedWorkflow.outputNodes.map((node) => (
                    <EditorButton
                      key={node.id}
                      size="small"
                      variant={
                        node.id === selectedOutputNodeId
                          ? "contained"
                          : "outlined"
                      }
                      onClick={() => setSelectedOutputNodeId(node.id)}
                    >
                      {node.label}
                    </EditorButton>
                  ))}
                </FlexRow>
              </FlexColumn>
            )}
          </FlexColumn>
        </Dialog>

        <Toast
          open={error !== null}
          message={error ?? ""}
          severity="error"
          onClose={() => setError(null)}
          vertical="top"
          horizontal="center"
        />
      </>
    );
};

CreateGeneratedLayerDialog.displayName = "CreateGeneratedLayerDialog";
CreateGeneratedLayerDialogBody.displayName = "CreateGeneratedLayerDialogBody";

export default CreateGeneratedLayerDialog;
