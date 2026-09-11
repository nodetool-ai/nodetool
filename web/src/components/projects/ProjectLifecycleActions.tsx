import { useCallback, useState, type MouseEvent } from "react";

import {
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING
} from "../ui_primitives";
import {
  useArchiveProject,
  useDeleteProject,
  useRestoreProject
} from "../../hooks/useProjects";
import { useNotificationStore } from "../../stores/NotificationStore";

interface ProjectLifecycleActionsProps {
  readonly project: {
    id: string;
    name: string;
    isPersonal: boolean;
    archivedAt: string | null;
  };
}

/** Archive or permanently delete a named project from its management surface. */
const ProjectLifecycleActions = ({ project }: ProjectLifecycleActionsProps) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const archive = useArchiveProject();
  const restore = useRestoreProject();
  const remove = useDeleteProject();
  const addNotification = useNotificationStore((state) => state.addNotification);

  const stop = (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation();
  const reportError = (action: string, error: Error) =>
    addNotification({
      type: "error",
      alert: true,
      content: `Could not ${action} ${project.name}: ${error.message}`
    });
  const handleArchive = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      stop(event);
      archive.mutate({ id: project.id }, { onError: (error) => reportError("archive", error) });
    },
    [archive, project.id]
  );
  const handleRestore = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      stop(event);
      restore.mutate({ id: project.id }, { onError: (error) => reportError("restore", error) });
    },
    [project.id, restore]
  );
  const requestDelete = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      stop(event);
      setConfirmingDelete(true);
    },
    []
  );
  const confirmDelete = useCallback(() => {
    remove.mutate(
      { id: project.id },
      {
        onSuccess: () => setConfirmingDelete(false),
        onError: (error) => reportError("delete", error)
      }
    );
  }, [project.id, remove]);

  if (project.isPersonal) return null;

  return (
    <>
      <FlexRow gap={SPACING.sm}>
        {project.archivedAt ? (
          <EditorButton density="compact" variant="text" onClick={handleRestore}>
            Restore
          </EditorButton>
        ) : (
          <EditorButton density="compact" variant="text" onClick={handleArchive}>
            Archive
          </EditorButton>
        )}
        <EditorButton density="compact" color="error" variant="text" onClick={requestDelete}>
          Delete
        </EditorButton>
      </FlexRow>
      <Dialog
        open={confirmingDelete}
        onClose={() => !remove.isPending && setConfirmingDelete(false)}
        title={`Delete ${project.name}?`}
        onConfirm={confirmDelete}
        confirmText="Delete project"
        cancelText="Cancel"
        destructive
        isLoading={remove.isPending}
      >
        <FlexColumn gap={SPACING.md}>
          <Caption>
            Delete {project.name} and all of its documents, conversations,
            generated outputs, assets, jobs, and project files.
          </Caption>
          <Caption color="error">This cannot be undone.</Caption>
        </FlexColumn>
      </Dialog>
    </>
  );
};

export default ProjectLifecycleActions;
