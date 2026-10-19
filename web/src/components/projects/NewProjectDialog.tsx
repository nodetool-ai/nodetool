import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        t("pass3_32.projects.newProject.createError", {
          error: createError instanceof Error ? createError.message : String(createError)
        })
      );
    }
  }, [
    close,
    createProject,
    isPending,
    openNewProjectTab,
    openProject,
    t,
    trimmed
  ]);

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t("pass3_32.projects.newProject.title")}
      onConfirm={() => void create()}
      confirmText={t("pass3_32.projects.newProject.confirm")}
      confirmDisabled={!trimmed}
      isLoading={isPending}
    >
      <TextInput
        label={t("pass3_32.projects.newProject.nameLabel")}
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
