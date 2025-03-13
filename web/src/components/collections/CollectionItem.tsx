import {
  ListItem,
  Typography,
  IconButton,
  CircularProgress,
  LinearProgress,
  Tooltip,
  Button
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { CollectionResponse } from "../../stores/ApiTypes";
import {
  UseMutationResult,
  useMutation,
  useQueryClient
} from "@tanstack/react-query";
import WorkflowSelect from "./WorkflowSelect";
import { useCallback, useState } from "react";
import { client } from "../../stores/ApiClient";
import { useNotificationStore } from "../../stores/NotificationStore";
interface CollectionItemProps {
  collection: CollectionResponse;
  isElectron: boolean;
  dragOverCollection: string | null;
  indexProgress: {
    collection: string;
    current: number;
    total: number;
    startTime: number;
  } | null;
  onDelete: (name: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  deleteMutation: UseMutationResult<void, Error, string>;
}

const IndexingProgress = ({
  indexProgress
}: {
  indexProgress: CollectionItemProps["indexProgress"];
}) => {
  if (!indexProgress) return null;

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
};

const CollectionItem = ({
  collection,
  isElectron,
  dragOverCollection,
  indexProgress,
  onDelete,
  onDrop,
  onDragOver,
  onDragLeave,
  deleteMutation
}: CollectionItemProps) => {
  const { addNotification } = useNotificationStore();
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
    (collection: CollectionResponse) =>
      (value: { type: "workflow"; id: string }) => {
        updateMutation.mutate(value.id);
        setIsEditingWorkflow(false);
        queryClient.invalidateQueries({ queryKey: ["collections"] });
      },
    [updateMutation, queryClient]
  );

  return (
    <ListItem
      component="div"
      onDrop={onDrop}
      onDragOver={(e) => onDragOver(e)}
      onDragLeave={onDragLeave}
      sx={{
        borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
        cursor: isElectron ? "copy" : "default",
        "&:hover": {
          backgroundColor: isElectron ? "action.hover" : "transparent"
        },
        ...(dragOverCollection === collection.name &&
          isElectron && {
            backgroundColor: "action.selected",
            borderStyle: "dashed",
            borderWidth: 2,
            borderColor: "primary.main",
            "& .MuiTypography-root": {
              color: "primary.main"
            }
          }),
        transition: "all 0.2s",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        py: 2.5,
        px: 3
      }}
      secondaryAction={
        <Tooltip title="Delete this collection">
          <span>
            <IconButton
              edge="end"
              aria-label="delete"
              sx={{ mt: -10 }}
              onClick={() => onDelete(collection.name)}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          width: "100%"
        }}
      >
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          width: "100%"
        }}
      >
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
            {collection.metadata?.embedding_model}
          </Typography>
        </Tooltip>
        <div style={{ flexGrow: 1 }} />
        {isEditingWorkflow ? (
          <WorkflowSelect
            onChange={onWorkflowChange(collection)}
            label="Workflow"
            value={collection.metadata?.workflow}
            loading={updateMutation.isPending}
            open={isEditingWorkflow}
            onBlur={() => setIsEditingWorkflow(false)}
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
              onClick={() => setIsEditingWorkflow(true)}
            >
              {collection.workflow_name || "No workflow"}
            </Button>
          </Tooltip>
        )}
      </div>
    </ListItem>
  );
};

export default CollectionItem;
