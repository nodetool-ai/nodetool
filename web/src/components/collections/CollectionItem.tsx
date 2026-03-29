import React, { memo, useCallback, useMemo } from "react";
import {
  ListItem,
  Typography,
  IconButton,
  CircularProgress,
  LinearProgress,
  Tooltip,
  Button,
  Box
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { CollectionResponse } from "../../stores/ApiTypes";
import {
  UseMutationResult,
  useMutation,
  useQueryClient
} from "@tanstack/react-query";
import WorkflowSelect from "./WorkflowSelect";
import { useState } from "react";
import { client } from "../../stores/ApiClient";
import { useNotificationStore } from "../../stores/NotificationStore";

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
  deleteMutation: UseMutationResult<void, Error, string>;
}

const IndexingProgress = memo(function IndexingProgress({
  indexProgress
}: {
  indexProgress: CollectionItemProps["indexProgress"];
}) {
  if (!indexProgress) { return null; }

  return (
    <>
      <LinearProgress
        sx={{
          ml: 2,
          width: 100,
          display: "inline-block",
          verticalAlign: "middle"
        }}
        variant="determinate"
        value={(indexProgress.current / indexProgress.total) * 100}
      />
      <br />
      <CircularProgress size={16} sx={{ ml: 1, verticalAlign: "middle" }} />
      <Typography variant="caption" sx={{ ml: 1 }}>
        Indexing {indexProgress.current}&nbsp;of&nbsp;
        {indexProgress.total} documents
        {indexProgress.current > 0 && (
          <>
            {" "}
            • ETA:{" "}
            {(() => {
              const elapsed = Date.now() - indexProgress.startTime;
              const avgTimePerItem = elapsed / indexProgress.current;
              const remainingItems =
                indexProgress.total - indexProgress.current;
              const etaSeconds = Math.round(
                (avgTimePerItem * remainingItems) / 1000
              );
              return etaSeconds < 60
                ? `${etaSeconds}s`
                : `${Math.round(etaSeconds / 60)}m ${etaSeconds % 60}s`;
            })()}
          </>
        )}
      </Typography>
    </>
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
  deleteMutation
}: CollectionItemProps) => {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const queryClient = useQueryClient();
  const [isEditingWorkflow, setIsEditingWorkflow] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      const { data, error } = await client.PUT("/api/collections/{name}", {
        params: {
          path: {
            name: collection.name
          }
        },
        body: {
          metadata: {
            workflow: workflowId
          }
        }
      });

      if (error) {
        throw new Error(error.detail?.[0]?.msg || "Unknown error");
      }

      return data;
    },
    onSuccess: () => {
      addNotification({
        alert: true,
        type: "success",
        content: "Collection updated successfully"
      });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (error) => {
      addNotification({
        alert: true,
        type: "error",
        content: `Failed to update collection: ${error.message}`
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
    borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
    ...(dragOverCollection === collection.name && {
      backgroundColor: "rgba(var(--mui-palette-primary-mainChannel) / 0.08)",
      borderStyle: "dashed",
      borderWidth: 2,
      borderColor: "primary.main",
      borderRadius: 1,
      m: 0.5,
      width: "calc(100% - 8px)",
      "& > :not(.drop-zone-overlay)": {
        opacity: 0.1,
        filter: "blur(1px)"
      }
    }),
    transition: "all 0.2s ease-in-out",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    py: 2.5,
    px: 3,
    position: "relative"
  }), [dragOverCollection, collection.name]);

  const containerStyle = useMemo(() => ({
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%"
  }), []);

  return (
    <ListItem
      component="div"
      onDrop={onDrop}
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      sx={listItemSx}
      secondaryAction={
        <Tooltip title="Delete this collection">
          <span>
            <IconButton
              edge="end"
              aria-label="delete"
              sx={{ mt: -10 }}
              onClick={handleDeleteClick}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending &&
                deleteMutation.variables === collection.name ? (
                <CircularProgress size={20} />
              ) : (
                <DeleteIcon sx={{ fontSize: "1rem" }} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      }
    >
      {dragOverCollection === collection.name && (
        <Box
          className="drop-zone-overlay"
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
            pointerEvents: "none",
            zIndex: 1
          }}
        >
          <Typography
            variant="h6"
            sx={{
              color: "primary.main",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              pointerEvents: "none",
              textShadow: "0 0 10px rgba(var(--mui-palette-primary-mainChannel) / 0.2)"
            }}
          >
            <UploadFileIcon sx={{ fontSize: "1.5rem" }} />
            Drop files to upload
          </Typography>
        </Box>
      )}
      <div style={containerStyle}>
        <Tooltip title={`Collection: ${collection.name}`}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 600,
              color: "primary.main",
              fontSize: "1.1rem",
              flexShrink: 0,
              maxWidth: "150px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {collection.name}
          </Typography>
        </Tooltip>
        {indexProgress?.collection === collection.name && (
          <IndexingProgress indexProgress={indexProgress} />
        )}
      </div>

      <div style={containerStyle}>
        <Tooltip title="Number of documents in this collection">
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              fontSize: "0.8em",
              flexShrink: 0
            }}
          >
            {collection.count} items
          </Typography>
        </Tooltip>
        <Tooltip title="Model used for embedding documents">
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontSize: "0.8em",
              flexShrink: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {collection.metadata?.embedding_model as React.ReactNode}
          </Typography>
        </Tooltip>
        <div style={{ flexGrow: 1 }} />
        {isEditingWorkflow ? (
          <WorkflowSelect
            onChange={onWorkflowChange}
            label="Workflow"
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
          <Tooltip title="Click to change the ingestion workflow for this collection">
            <Button
              variant="text"
              sx={{
                color: "text.secondary",
                fontSize: "0.8em",
                cursor: "pointer",
                flexShrink: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
              onClick={handleEditWorkflow}
            >
              {collection.workflow_name || "No workflow"}
            </Button>
          </Tooltip>
        )}
      </div>
    </ListItem>
  );
};

export default memo(CollectionItem);
