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
  FlexRow,
  SPACING,
  TextInput,
  TruncatedText
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

interface LocationFieldProps {
  /** The chosen directory, or null for the projects folder. */
  location: string | null;
  disabled: boolean;
  onChange: (location: string | null) => void;
}

/**
 * Where the new project's folder is created. By default it goes in the
 * projects folder. "Choose…" picks any other directory. Renders nothing on a
 * server that refuses host folders.
 */
const LocationField = ({ location, disabled, onChange }: LocationFieldProps) => {
  const { t } = useTranslation();
  const { canManage } = useWorkspaces();
  const { pickFolder, dialog } = useFolderPicker();

  const choose = useCallback(async () => {
    const path = await pickFolder();
    if (path) {
      onChange(path);
    }
  }, [onChange, pickFolder]);

  if (!canManage) {
    return null;
  }

  return (
    <FlexColumn gap={SPACING.xs} align="stretch">
      <Caption color="secondary">
        {t("pass3_32.projects.newProject.locationLabel")}
      </Caption>
      <FlexRow gap={SPACING.sm} align="center">
        <TruncatedText showTooltip sx={{ flex: 1, minWidth: 0 }}>
          {location ?? t("pass3_32.projects.newProject.locationDefault")}
        </TruncatedText>
        {location && (
          <EditorButton
            variant="text"
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            {t("pass3_32.projects.newProject.locationReset")}
          </EditorButton>
        )}
        <EditorButton
          variant="outlined"
          onClick={() => void choose()}
          disabled={disabled}
        >
          {t("pass3_32.projects.newProject.locationChoose")}
        </EditorButton>
      </FlexRow>
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
 * On the desktop app it also lets the user choose where the project's folder
 * is created, and opens a folder the user already has as a project. The server refuses that in production, where the option is absent.
 */
const NewProjectDialog = ({ open, onClose }: NewProjectDialogProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const createProject = useCreateProject();
  const openProject = useOpenProject();
  const openNewProjectTab = useOpenNewProjectTab();

  const trimmed = name.trim();
  const isPending = createProject.isPending;

  const close = useCallback(() => {
    setName("");
    setLocation(null);
    setError(undefined);
    onClose();
  }, [onClose]);

  const create = useCallback(async () => {
    if (!trimmed || isPending) {
      return;
    }
    try {
      const project = await createProject.mutateAsync(
        location ? { name: trimmed, location } : { name: trimmed }
      );
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
    location,
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
          <LocationField
            location={location}
            disabled={isPending}
            onChange={(next) => {
              setLocation(next);
              setError(undefined);
            }}
          />
        )}
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
