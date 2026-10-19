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
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "../../../trpc/client";
import type { Workflow } from "../../../stores/ApiTypes";
import {
  AlertBanner,
  Caption,
  Dialog,
  EmptyState,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Label,
  LoadingSpinner,
  SearchInput,
  SPACING,
  Text
} from "../../ui_primitives";
import { useCreateGeneratedLayer } from "../../../hooks/sketch/useCreateGeneratedLayer";
import { useAutoFocusEnabled } from "../../../hooks/useAutoFocusEnabled";
import { isString } from "../../../utils/typePredicates";

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

const listStyles = (theme: Theme) =>
  css({
    gap: theme.spacing(GAP.tight),
    maxHeight: 360,
    overflow: "auto",
    padding: theme.spacing(SPACING.micro),
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
    isString(data?.title) && data.title
      ? data.title
      : isString(data?.name) && data.name
      ? data.name
      : (node.type ?? "").split(".").pop() ?? node.id;
  return `${name}`;
}

function extractImageOutputs(workflow: Workflow): ImageOutputNode[] {
  const nodes = workflow.graph?.nodes ?? [];
  return nodes
    .filter((n) => IMAGE_OUTPUT_TYPES.has(n.type))
    .map((n) => ({ id: n.id, label: shortNodeLabel(n) }));
}

interface CreateGeneratedLayerDialogProps {
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
    const { t, i18n } = useTranslation();
    const numberFormat = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);
    const [filter, setFilter] = useState("");
    const autoFocusEnabled = useAutoFocusEnabled();
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
          name: w.name || t("screens4_25.sketch.createGeneratedLayer.untitledWorkflow"),
          description: w.description ?? null,
          outputNodes: extractImageOutputs(w)
        }))
        .filter((w) => w.outputNodes.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, i18n.resolvedLanguage ?? i18n.language));
    }, [data, i18n.language, i18n.resolvedLanguage, t]);

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
      setError(null);
      const result = await createGeneratedLayer({
        workflowId: selectedWorkflow.id,
        layerName: selectedWorkflow.name,
        selectedOutputNodeId: selectedOutputNodeId ?? undefined
      });
      if (result.ok) {
        onCreated?.(result.layerId);
        handleClose();
      } else if (result.reason === "no-document") {
        setError(t("screens4_25.sketch.createGeneratedLayer.noImageDocument"));
      } else if (result.reason === "error") {
        setError(result.message ?? t("screens4_25.sketch.createGeneratedLayer.createFailed"));
      }
    }, [
      createGeneratedLayer,
      handleClose,
      onCreated,
      selectedOutputNodeId,
      selectedWorkflow,
      t
    ]);

    return (
      <Dialog
        open
        onClose={handleClose}
        title={t("screens4_25.sketch.createGeneratedLayer.title")}
        maxWidth="sm"
        fullWidth
        onConfirm={() => void handleConfirm()}
        confirmText={t("screens4_25.sketch.createGeneratedLayer.createLayer")}
        confirmDisabled={confirmDisabled}
        isLoading={isBusy}
      >
        <FlexColumn gap={SPACING.sm}>
          <Caption color="secondary">
            {t("screens4_25.sketch.createGeneratedLayer.description")}
          </Caption>

          {/* autoFocus is skipped on touch, where the virtual keyboard
              would cover the workflow list below. */}
          <SearchInput
            autoFocus={autoFocusEnabled}
            placeholder={t("screens4_25.sketch.createGeneratedLayer.searchPlaceholder")}
            ariaLabel={t("screens4_25.sketch.createGeneratedLayer.searchLabel")}
            value={filter}
            onChange={setFilter}
            fullWidth
          />

          {isLoading && (
            <FlexRow justify="center" sx={{ py: SPACING.lg }}>
              <LoadingSpinner size="small" />
            </FlexRow>
          )}

          {isError && (
            <EmptyState
              variant="error"
              size="small"
              description={t("screens4_25.sketch.createGeneratedLayer.loadFailed")}
            />
          )}

          {!isLoading && !isError && pickerWorkflows.length === 0 && (
            <EmptyState
              variant="empty"
              size="small"
              title={t("screens4_25.sketch.createGeneratedLayer.noWorkflowsTitle")}
              description={t("screens4_25.sketch.createGeneratedLayer.noWorkflowsDescription")}
            />
          )}

          {!isLoading && !isError && filteredWorkflows.length > 0 && (
            <FlexColumn css={listStyles(theme)}>
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
                    <FlexColumn gap={SPACING.micro}>
                      <FlexRow align="center" gap={SPACING.xs}>
                        <Label noWrap sx={{ flex: 1 }}>
                          {w.name}
                        </Label>
                        <Caption color="secondary">
                          {t("screens4_25.sketch.createGeneratedLayer.outputCount", {
                            count: w.outputNodes.length,
                            formattedCount: numberFormat.format(w.outputNodes.length)
                          })}
                        </Caption>
                      </FlexRow>
                      {w.description && (
                        <Caption color="secondary" noWrap>
                          {w.description}
                        </Caption>
                      )}
                    </FlexColumn>
                  </div>
                );
              })}
            </FlexColumn>
          )}

          {!isLoading &&
            !isError &&
            filter.trim() !== "" &&
            filteredWorkflows.length === 0 &&
            pickerWorkflows.length > 0 && (
              <Caption color="secondary" sx={{ pl: SPACING.xs }}>
                {t("screens4_25.sketch.createGeneratedLayer.noSearchResults", { filter })}
              </Caption>
            )}

          {requiresOutputPick && selectedWorkflow && (
            <FlexColumn gap={SPACING.xs}>
              <Text size="small">
                {t("screens4_25.sketch.createGeneratedLayer.chooseOutput")}
              </Text>
              <FlexRow gap={SPACING.micro} wrap>
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

          {error && (
            <AlertBanner severity="error" onClose={() => setError(null)}>
              {error}
            </AlertBanner>
          )}
        </FlexColumn>
      </Dialog>
    );
};

CreateGeneratedLayerDialog.displayName = "CreateGeneratedLayerDialog";
CreateGeneratedLayerDialogBody.displayName = "CreateGeneratedLayerDialogBody";

export default CreateGeneratedLayerDialog;
