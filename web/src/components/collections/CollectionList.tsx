import {
  Box,
  List,
} from "@mui/material";
import { memo, useEffect, useCallback, useMemo } from "react";
import CollectionForm from "./CollectionForm";
import AddIcon from "@mui/icons-material/Add";
import CollectionHeader from "./CollectionHeader";
import EmptyCollectionState from "./EmptyCollectionState";
import CollectionItem from "./CollectionItem";
import { useCollectionStore } from "../../stores/CollectionStore";
import { useShallow } from "zustand/react/shallow";
import {
  CreateFab,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  ListGroup,
  ListItemRow,
  Surface,
  Text
} from "../ui_primitives";
import { CollectionResponse } from "../../stores/ApiTypes";

const CollectionList = () => {
  // Group related state to reduce selector calls
  const {
    collections,
    isLoading,
    error,
    deleteTarget,
    showForm,
    dragOverCollection,
    indexProgress,
    indexErrors,
    setDeleteTarget,
    setShowForm,
    setIndexErrors,
    fetchCollections,
    confirmDelete,
    cancelDelete,
    handleDragOver: storeHandleDragOver,
    handleDragLeave: storeHandleDragLeave,
    handleDrop: storeHandleDrop
  } = useCollectionStore(useShallow((state) => ({
    collections: state.collections,
    isLoading: state.isLoading,
    error: state.error,
    deleteTarget: state.deleteTarget,
    showForm: state.showForm,
    dragOverCollection: state.dragOverCollection,
    indexProgress: state.indexProgress,
    indexErrors: state.indexErrors,
    setDeleteTarget: state.setDeleteTarget,
    setShowForm: state.setShowForm,
    setIndexErrors: state.setIndexErrors,
    fetchCollections: state.fetchCollections,
    confirmDelete: state.confirmDelete,
    cancelDelete: state.cancelDelete,
    handleDragOver: state.handleDragOver,
    handleDragLeave: state.handleDragLeave,
    handleDrop: state.handleDrop
  })));

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleDeleteClick = useCallback((collectionName: string) => {
    setDeleteTarget(collectionName);
  }, [setDeleteTarget]);

  const handleShowForm = useCallback(() => {
    setShowForm(true);
  }, [setShowForm]);

  const handleHideForm = useCallback(() => {
    setShowForm(false);
  }, [setShowForm]);

  const handleClearIndexErrors = useCallback(() => {
    setIndexErrors([]);
  }, [setIndexErrors]);

  // Memoize drag event handlers to prevent recreating functions on every render
  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, collectionName: string) => {
      storeHandleDragOver(e, collectionName);
    },
    [storeHandleDragOver]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      storeHandleDragLeave(e);
    },
    [storeHandleDragLeave]
  );

  // Create a stable map of drop handlers for each collection
  const dropHandlers = useMemo(() => {
    const handlers: Record<string, (e: React.DragEvent<HTMLDivElement>) => void> = {};
    if (collections?.collections) {
      for (const collection of collections.collections) {
        handlers[collection.name] = (e: React.DragEvent<HTMLDivElement>) => {
          storeHandleDrop(collection.name)(e);
        };
      }
    }
    return handlers;
  }, [collections?.collections, storeHandleDrop]);

  const totalCount = collections?.collections.length || 0;

  return (
    <>
      {!showForm && (
        <>
          <FlexRow
            align="center"
            justify="space-between"
            sx={{
              mb: 2,
              mt: 1
            }}
          >
            <Box>
              <Text size="big" weight={700}>
                Collections
              </Text>
              <Text size="small" color="secondary">
                {totalCount} {totalCount === 1 ? "collection" : "collections"}
              </Text>
            </Box>
            <CreateFab
              onClick={handleShowForm}
              label="Create Collection"
              icon={<AddIcon />}
              aria-label="Create Collection"
            />
          </FlexRow>

          {collections?.collections.length ? <CollectionHeader /> : null}
          {error && (
            <Text color="error" sx={{ mt: 2 }}>
              Error loading collections
            </Text>
          )}
          {isLoading ? (
            <Text sx={{ mt: 2 }}>Loading collections...</Text>
          ) : !collections?.collections.length ? (
            <EmptyCollectionState />
          ) : (
            <Surface
              elevation={0}
              background="transparent"
              sx={(theme) => ({
                mt: 2,
                borderRadius: 3,
                p: 1,
                border: `1px solid ${theme.vars.palette.divider}`
              })}
            >
              <List>
                {collections?.collections.map((collection: CollectionResponse) => (
                  <CollectionItem
                    key={collection.name}
                    collection={collection}
                    dragOverCollection={dragOverCollection}
                    indexProgress={indexProgress}
                    onDelete={handleDeleteClick}
                    onDrop={dropHandlers[collection.name]}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    deleteMutation={
                      {
                        isPending: false,
                        mutate: () => { },
                        mutateAsync: async () => { },
                        reset: () => { },
                        context: undefined,
                        data: undefined,
                        error: null,
                        failureCount: 0,
                        failureReason: null,
                        isError: false,
                        isIdle: true,
                        isPaused: false,
                        isSuccess: false,
                        status: "idle",
                        submittedAt: 0,
                        variables: undefined
                      } as any
                    }
                  />
                ))}
              </List>
            </Surface>
          )}
        </>
      )}
      {showForm && <CollectionForm onClose={handleHideForm} />}

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={cancelDelete}
        title="Confirm Deletion"
        onConfirm={confirmDelete}
        confirmText="Delete"
        cancelText="Cancel"
        destructive
      >
        Are you sure you want to delete the collection &quot;{deleteTarget}
        &quot;?
      </Dialog>

      {indexErrors.length > 0 && (
        <Dialog open={true} onClose={handleClearIndexErrors} title="Indexing Report">
          <FlexColumn gap={2}>
            <Text>
              The following files encountered errors during indexing:
            </Text>
            <ListGroup compact flush sx={{ pl: 2 }}>
              {indexErrors.map((error) => (
                <ListItemRow
                  key={error.file}
                  primary={<strong>{error.file}</strong>}
                  secondary={error.error}
                  sx={{ display: "list-item" }}
                />
              ))}
            </ListGroup>
            <FlexRow justify="flex-end">
              <EditorButton onClick={handleClearIndexErrors}>
                Close
              </EditorButton>
            </FlexRow>
          </FlexColumn>
        </Dialog>
      )}
    </>
  );
};

export default memo(CollectionList);
