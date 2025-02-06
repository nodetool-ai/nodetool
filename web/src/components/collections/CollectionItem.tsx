import {
  ListItem,
  ListItemText,
  Typography,
  IconButton,
  CircularProgress,
  LinearProgress
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { CollectionResponse } from "../../stores/ApiTypes";
import { UseMutationResult } from "@tanstack/react-query";
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
  return (
    <ListItem
      component="div"
      onDrop={onDrop}
      onDragOver={(e) => onDragOver(e)}
      onDragLeave={onDragLeave}
      sx={{
        borderBottom: "1px solid #666",
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
        transition: "all 0.2s"
      }}
      secondaryAction={
        <IconButton
          edge="end"
          aria-label="delete"
          onClick={() => onDelete(collection.name)}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending &&
          deleteMutation.variables === collection.name ? (
            <CircularProgress size={20} />
          ) : (
            <DeleteIcon />
          )}
        </IconButton>
      }
    >
      <ListItemText
        primary={
          <Typography
            variant="body1"
            sx={{ fontWeight: 600, color: "primary.main" }}
          >
            {collection.name}
            {indexProgress?.collection === collection.name && (
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
                <CircularProgress
                  size={16}
                  sx={{ ml: 1, verticalAlign: "middle" }}
                />
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
                          : `${Math.round(etaSeconds / 60)}m ${
                              etaSeconds % 60
                            }s`;
                      })()}
                    </>
                  )}
                </Typography>
              </>
            )}
          </Typography>
        }
        secondary={
          <Typography
            variant="body1"
            sx={{ color: "text.secondary", fontSize: "0.8em" }}
          >
            {collection.metadata?.embedding_model}
            <br />
            {collection.count} items
          </Typography>
        }
      />
    </ListItem>
  );
};

export default CollectionItem;
