import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabMode,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { useRenameDocument } from "../../hooks/useRenameDocument";
import { DocumentBar, ModeSwitch } from "../ui_primitives";
import type { DocumentBarProps } from "../ui_primitives";
import { tabCanRename } from "./tabRename";

/** Whether a document type supports both View and Edit (vs view-only). */
export const SUPPORTS_BOTH_MODES = {
  workflow: false,
  image: true,
  svg: true,
  sketch: false,
  timeline: true,
  storyboard: false,
  script: false,
  jsscript: false,
  skill: true,
  model3d: true,
  text: true,
  audio: true,
  "workspace-file": true,
  chat: false,
  application: true,
  "example-app": false,
  game: true,
  page: false,
  "project-list": false,
  project: false,
  "guided-flow": false,
  "project-new": false,
  create: false
} satisfies Record<WorkspaceTabType, boolean>;

interface ViewEditSwitchProps {
  tab: WorkspaceTab;
}

/** The generic View/Edit mode control, a compact eye and pencil switch. */
export const ViewEditSwitch = memo(function ViewEditSwitch({
  tab
}: ViewEditSwitchProps) {
  const { t } = useTranslation();
  const setMode = useWorkspaceTabsStore((state) => state.setMode);
  const options = [
    {
      value: "view" as const,
      label: t("i18n-next51.tabBar.view"),
      icon: <VisibilityOutlinedIcon />
    },
    {
      value: "edit" as const,
      label: t("i18n-next51.tabBar.edit"),
      icon: <EditOutlinedIcon />
    }
  ];
  return (
    <ModeSwitch<WorkspaceTabMode>
      ariaLabel={t("i18n-next103.documentBar.mode")}
      iconOnly
      options={options}
      value={tab.mode}
      onChange={(mode) => setMode(tab.id, mode)}
    />
  );
});

export interface WorkspaceDocumentBarProps
  extends Omit<DocumentBarProps, "title" | "onRename" | "mode"> {
  tab: WorkspaceTab;
  /**
   * The Mode slot. Omit for the View/Edit switch on the types that have
   * both modes; pass `null` to leave the slot empty.
   */
  mode?: React.ReactNode | null;
}

/**
 * The document bar of one workspace tab: its title (renamed through the same
 * path as the tab), the View/Edit switch where the type has both modes, and
 * the slots the surface fills.
 */
const WorkspaceDocumentBar = ({
  tab,
  mode,
  ...slots
}: WorkspaceDocumentBarProps) => {
  const renameDocument = useRenameDocument();
  const canRename = tabCanRename(tab.type);
  const rename = useCallback(
    (name: string) => {
      void renameDocument(
        { type: tab.type, ref: tab.ref, currentName: tab.title },
        name
      );
    },
    [renameDocument, tab.ref, tab.title, tab.type]
  );
  const modeSlot =
    mode === undefined ? (
      SUPPORTS_BOTH_MODES[tab.type] ? (
        <ViewEditSwitch tab={tab} />
      ) : null
    ) : (
      mode
    );

  return (
    <DocumentBar
      title={tab.title}
      onRename={canRename ? rename : undefined}
      mode={modeSlot}
      {...slots}
    />
  );
};

export default memo(WorkspaceDocumentBar);
