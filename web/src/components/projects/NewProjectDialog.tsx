import { useCallback, useState } from "react";

import {
  useCreateProject,
  useOpenNewProjectTab,
  useOpenProject
} from "../../hooks/useProjects";
import { Dialog, TextInput } from "../ui_primitives";

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Names and creates a project, then opens its Home. Every "New project" entry
 * point uses it, so a click always leaves a project in the Projects list.
 */
const NewProjectDialog = ({ open, onClose }: NewProjectDialogProps) => {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const createProject = useCreateProject();
  const openProject = useOpenProject();
  const openNewProjectTab = useOpenNewProjectTab();

  const trimmed = name.trim();
  const isPending = createProject.isPending;

  const close = useCallback(() => {
    setName("");
    setError(undefined);
    onClose();
  }, [onClose]);

  const create = useCallback(async () => {
    if (!trimmed || isPending) {
      return;
    }
    try {
      const project = await createProject.mutateAsync({ name: trimmed });
      close();
      if (await openProject(project)) {
        openNewProjectTab();
      }
    } catch (createError) {
      setError(
        `Could not create the project: ${
          createError instanceof Error ? createError.message : String(createError)
        }`
      );
    }
  }, [
    close,
    createProject,
    isPending,
    openNewProjectTab,
    openProject,
    trimmed
  ]);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New project"
      onConfirm={() => void create()}
      confirmText="Create project"
      confirmDisabled={!trimmed}
      isLoading={isPending}
    >
      <TextInput
        label="Project name"
        value={name}
        autoFocus
        inputProps={{ maxLength: 200 }}
        errorMessage={error}
        onChange={(event) => {
          setName(event.target.value);
          setError(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void create();
          }
        }}
      />
    </Dialog>
  );
};

export default NewProjectDialog;
