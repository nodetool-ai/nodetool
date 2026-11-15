import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";

import {
  useCreateProject,
  useOpenNewProjectTab,
  useOpenProject,
  useOpenProjectFolder
} from "../../hooks/useProjects";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import { useFolderPicker } from "../workspaces/useFolderPicker";
import {
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  SPACING,
  TextInput
} from "../ui_primitives";
import { isElectron } from "../../lib/env";

interface OpenedProject {
  id: string;
  name: string;
}

interface OpenFolderActionProps {
  /** The name typed so far, given to the project when set. */
  name: string;
  disabled: boolean;
  onOpened: (project: OpenedProject) => Promise<void>;
  onError: (message: string) => void;
}

/**
 * "Open folder", which makes a folder the user already has into a project.
 * It states what a folder from another machine brings and what stays behind,
 * since chats and database documents are not files in the folder. Renders
 * nothing on a server that refuses host folders.
 */
const OpenFolderAction = ({
  name,
  disabled,
  onOpened,
  onError
}: OpenFolderActionProps) => {
  const { t } = useTranslation();
  const { canManage } = useWorkspaces();
  const openProjectFolder = useOpenProjectFolder();
  const { pickFolder, dialog } = useFolderPicker();
  const isPending = disabled || openProjectFolder.isPending;

  const openFolder = useCallback(async () => {
    if (isPending) {
      return;
    }
    const path = await pickFolder();
    if (!path) {
      return;
    }
    try {
      const project = await openProjectFolder.mutateAsync(
        name ? { path, name } : { path }
      );
      await onOpened(project);
    } catch (openError) {
      onError(
        t("pass3_32.projects.newProject.openFolderError", {
          error: openError instanceof Error ? openError.message : String(openError)
        })
      );
    }
  }, [isPending, name, onError, onOpened, openProjectFolder, pickFolder, t]);

  if (!canManage) {
    return null;
  }

  return (
    <FlexColumn gap={SPACING.sm} align="flex-start">
      <Caption color="secondary">
        {t("pass3_32.projects.newProject.openFolderHint")}
      </Caption>
      <Caption color="secondary">
        {t("pass3_32.projects.newProject.openFolderTravels")}
      </Caption>
      <EditorButton
        variant="outlined"
        startIcon={<FolderOpenOutlinedIcon />}
        onClick={() => void openFolder()}
        disabled={isPending}
      >
        {t("pass3_32.projects.newProject.openFolder")}
      </EditorButton>
      {dialog}
    </FlexColumn>
  );
};

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Names and creates a project, then opens its Home. Every "New project" entry
 * point uses it, so a click always leaves a project in the Projects list.
 *
 * On the desktop app it also opens a folder the user already has as a
 * project. The server refuses that in production, where the option is absent.
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

  const opened = useCallback(
    async (project: OpenedProject) => {
      close();
      if (await openProject(project)) {
        openNewProjectTab();
      }
    },
    [close, openNewProjectTab, openProject]
  );

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
      <FlexColumn gap={SPACING.lg}>
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
        {isElectron && (
          <OpenFolderAction
            name={trimmed}
            disabled={isPending}
            onOpened={opened}
            onError={setError}
          />
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default NewProjectDialog;
