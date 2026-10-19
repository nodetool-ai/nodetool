import React, { memo, useCallback, useMemo } from "react";
import { DeleteButton, FlexRow, FlexColumn, Text, Caption, Tooltip, LoadingSpinner, EditorButton, ProgressBar, MOTION, BORDER_RADIUS, SPACING, TYPOGRAPHY, DropZoneOverlay, getSpacingPx } from "../ui_primitives";
import { CollectionResponse } from "../../stores/ApiTypes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import WorkflowSelect from "./WorkflowSelect";
import { useState } from "react";
import { trpcClient } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTranslation } from "react-i18next";

interface CollectionItemProps {
  collection: CollectionResponse;
  dragOverCollection: string | null;
  indexProgress: {
    collection: string;
    current: number;
    total: number;
    startTime: number;
  } | null;
  onDelete: (name: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, collection: string) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  /** Name of the collection whose deletion is in flight, if any. */
  deletingCollection: string | null;
}

const formatEta = (seconds: number, locale: string): string => {
  const secondFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "second",
    unitDisplay: "short"
  });
  if (seconds < 60) {
    return secondFormatter.format(seconds);
  }
  const minuteFormatter = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short"
  });
  return `${minuteFormatter.format(Math.round(seconds / 60))} ${secondFormatter.format(seconds % 60)}`;
};

const IndexingProgress = memo(function IndexingProgress({
  indexProgress
}: {
  indexProgress: CollectionItemProps["indexProgress"];
}) {
  const { t, i18n } = useTranslation();
  if (!indexProgress) { return null; }

  const { current, total, startTime } = indexProgress;
  let label = t("i18n-next30.collections.indexingProgress", {
    current,
    total
  });
  if (current > 0) {
    const avgTimePerItem = (Date.now() - startTime) / current;
    const etaSeconds = Math.round((avgTimePerItem * (total - current)) / 1000);
    label += ` · ${t("i18n-next30.collections.eta", {
      eta: formatEta(etaSeconds, i18n.resolvedLanguage ?? "en")
    })}`;
  }

  return (
    <ProgressBar
      value={(current / total) * 100}
      label={label}
      showValue={false}
      size="small"
    />
  );
});

const CollectionItem = ({
  collection,
  dragOverCollection,
  indexProgress,
  onDelete,
  onDrop,
  onDragOver,
  onDragLeave,
  deletingCollection
}: CollectionItemProps) => {
  const { t } = useTranslation();
  const isDeleting = deletingCollection !== null;
  const addNotification = useNotificationStore((state) => state.addNotification);
  const queryClient = useQueryClient();
  const [isEditingWorkflow, setIsEditingWorkflow] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      return trpcClient.collections.update.mutate({
        name: collection.name,
        metadata: { workflow: workflowId }
      });
    },
    onSuccess: () => {
      addNotification({
        alert: true,
        type: "success",
        content: t("i18n-next30.collections.updateSuccess")
      });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (error) => {
      addNotification({
        alert: true,
        type: "error",
        content: t("i18n-next30.collections.updateError", {
          error: error.message
        })
      });
    }
  });

  const onWorkflowChange = useCallback(
    (value: { type: "workflow"; id: string }) => {
      updateMutation.mutate(value.id);
      setIsEditingWorkflow(false);
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    [updateMutation, queryClient]
  );

  const handleDeleteClick = useCallback(() => {
    onDelete(collection.name);
  }, [onDelete, collection.name]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    onDragOver(e, collection.name);
  }, [onDragOver, collection.name]);

  const handleEditWorkflow = useCallback(() => {
    setIsEditingWorkflow(true);
  }, []);

  const handleBlurWorkflow = useCallback(() => {
    setIsEditingWorkflow(false);
  }, []);

  const listItemSx = useMemo(() => ({
    borderBottom: "1px solid",
    borderColor: "divider",
    backgroundColor: "transparent",
    ...(dragOverCollection === collection.name && {
      backgroundColor: "action.hover",
      borderRadius: BORDER_RADIUS.md,
      "& > :not(.drop-zone-overlay)": {
        opacity: 0.12,
        filter: "blur(1px)"
      }
    }),
    "&:hover": {
      backgroundColor: "action.hover"
    },
    transition: MOTION.all,
    py: 3,
    px: 3,
    position: "relative"
  }), [dragOverCollection, collection.name]);

  return (
    <FlexColumn
      onDrop={onDrop}
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      sx={listItemSx}
      gap={2}
    >
      <FlexRow justify="flex-end" sx={{
          position: "absolute",
          top: getSpacingPx(SPACING.md),
          right: getSpacingPx(SPACING.md)
        }}>
        {deletingCollection === collection.name ? (
          <LoadingSpinner size="small" inline />
        ) : (
          <DeleteButton
            onClick={handleDeleteClick}
            tooltip={t("i18n-next30.collections.deleteTooltip")}
            disabled={isDeleting}
            sx={{ mt: -10 }}
            nodrag={false}
          />
        )}
      </FlexRow>
      {dragOverCollection === collection.name && <DropZoneOverlay />}
      <FlexRow align="center" gap={SPACING.lg} fullWidth>
        <Tooltip
          title={t("i18n-next30.collections.collectionTooltip", {
            name: collection.name
          })}
        >
          <Text
            size="small"
            truncate
            sx={{
              color: "text.primary",
              flexShrink: 0,
              maxWidth: "150px"
            }}
          >
            {collection.name}
          </Text>
        </Tooltip>
        {indexProgress?.collection === collection.name && (
          <IndexingProgress indexProgress={indexProgress} />
        )}
      </FlexRow>

      <FlexRow align="center" gap={SPACING.lg} fullWidth>
        <Tooltip title={t("i18n-next30.collections.documentCountTooltip")}>
          <Caption color="secondary" sx={{ flexShrink: 0 }}>
            {t("i18n-next30.collections.itemCount", {
              count: collection.count
            })}
          </Caption>
        </Tooltip>
        <Tooltip title={t("i18n-next30.collections.embeddingModelTooltip")}>
          <Caption
            sx={{
              flexShrink: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {collection.metadata?.embedding_model as React.ReactNode}
          </Caption>
        </Tooltip>
        <div style={{ flexGrow: 1 }} />
        {isEditingWorkflow ? (
          <WorkflowSelect
            onChange={onWorkflowChange}
            label={t("i18n-next30.collections.workflow")}
            value={
              collection.metadata?.workflow
                ? { id: collection.metadata.workflow as string }
                : undefined
            }
            loading={updateMutation.isPending}
            open={isEditingWorkflow}
            onBlur={handleBlurWorkflow}
            sx={{
              minWidth: "120px",
              maxWidth: "120px"
            }}
          />
        ) : (
          <Tooltip title={t("i18n-next30.collections.changeWorkflowTooltip")}>
            <EditorButton
              variant="text"
              sx={{
                ...TYPOGRAPHY.sans.caption,
                color: "text.secondary",
                cursor: "pointer",
                flexShrink: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                borderRadius: BORDER_RADIUS.xs,
                "&:hover": {
                  backgroundColor: "action.hover",
                  color: "text.primary"
                }
              }}
              onClick={handleEditWorkflow}
            >
              {collection.workflow_name ||
                t("i18n-next30.collections.noWorkflow")}
            </EditorButton>
          </Tooltip>
        )}
      </FlexRow>
    </FlexColumn>
  );
};

export default memo(CollectionItem);
