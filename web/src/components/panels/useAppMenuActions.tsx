import React, { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import SettingsIcon from "@mui/icons-material/Settings";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import DownloadIcon from "@mui/icons-material/Download";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import FolderSpecialOutlinedIcon from "@mui/icons-material/FolderSpecialOutlined";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";

import { isProduction } from "../../lib/env";
import { isCloudProfile } from "../../lib/runtimeConfig";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { openPageTab } from "../workspace/openPageTab";
import { type PageTabKey } from "../workspace/pageTabs";
import { useTranslation } from "react-i18next";

export interface AppMenuAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /**
   * Where the entry shows on desktop: the logo menu, the rail's More panel,
   * or both. Mobile and the command palette show every entry once.
   */
  placement: "logo" | "sidebar" | "both";
  /** Trailing text, e.g. live download progress. */
  secondary?: string;
  /** Group separator after this entry. */
  dividerAfter?: boolean;
}

/**
 * The app-level destinations behind the logo: page tabs, Help, and Downloads.
 * Shared by the desktop rail's popover (RailAppMenu) and the mobile browse
 * sheet's More section (AppPagesList) so the two cannot drift.
 *
 * App-level dialog hosts own Help and Downloads independently of menu lifetime.
 */
export const useAppMenuActions = (onFinish?: () => void): AppMenuAction[] => {
  const { t } = useTranslation();
  const handleOpenHelp = useAppHeaderStore((state) => state.handleOpenHelp);
  const { downloads, openDownloadsDialog } = useModelDownloadStore(
    useShallow((state) => ({
      downloads: state.downloads,
      openDownloadsDialog: state.openDialog
    }))
  );

  const finish = useCallback(() => onFinish?.(), [onFinish]);

  const openPage = useCallback(
    (key: PageTabKey) => {
      openPageTab(key);
      finish();
    },
    [finish]
  );

  // Aggregate percent across in-flight downloads; null when nothing is running.
  const downloadProgress = useMemo(() => {
    const active = Object.values(downloads).filter(
      (download) => download.status === "progress"
    );
    if (active.length === 0) return null;
    const total = active.reduce((sum, d) => sum + d.totalBytes, 0);
    const done = active.reduce((sum, d) => sum + d.downloadedBytes, 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [downloads]);

  return useMemo(() => {
    const actions: AppMenuAction[] = [
      {
        key: "tutorials",
        label: t("batch2_3.navigation.tutorials"),
        icon: <SchoolOutlinedIcon />,
        placement: "sidebar",
        onClick: () => openPage("tutorials")
      },
      {
        key: "examples",
        label: t("batch2_3.navigation.examples"),
        icon: <AutoAwesomeOutlinedIcon />,
        placement: "sidebar",
        onClick: () => openPage("examples")
      },
      {
        key: "costs",
        label: t("batch2_3.navigation.costs"),
        icon: <PaidOutlinedIcon />,
        placement: "sidebar",
        onClick: () => openPage("costs"),
        dividerAfter: true
      }
    ];

    // The Model Manager and Downloads fill the server's model caches, which
    // the cloud does not offer (see LOCAL_ONLY_PAGES in PageSurface).
    const cloud = isCloudProfile();

    if (!cloud) {
      actions.push({
        key: "models",
        label: t("batch2_3.navigation.modelManager"),
        icon: <ViewInArOutlinedIcon />,
        placement: "sidebar",
        onClick: () => openPage("models")
      });
    }

    if (!isProduction) {
      actions.push({
        key: "packages",
        label: t("batch2_3.navigation.packageManager"),
        icon: <Inventory2OutlinedIcon />,
        placement: "sidebar",
        onClick: () => openPage("packages")
      });
    }

    actions.push(
      {
        key: "assets",
        label: t("batch2_3.navigation.assets"),
        icon: <PermMediaOutlinedIcon />,
        placement: "sidebar",
        onClick: () => openPage("assets")
      },
      {
        key: "collections",
        label: t("batch2_3.navigation.collections"),
        icon: <LibraryBooksOutlinedIcon />,
        placement: "sidebar",
        onClick: () => openPage("collections")
      },
      {
        key: "workspaces",
        label: t("batch2_3.navigation.workspaces"),
        icon: <FolderSpecialOutlinedIcon />,
        placement: "sidebar",
        onClick: () => openPage("workspaces")
      },
      {
        key: "memory",
        label: t("batch2_3.navigation.memory"),
        icon: <PsychologyOutlinedIcon />,
        placement: "sidebar",
        onClick: () => openPage("memory"),
        dividerAfter: true
      },
      {
        key: "settings",
        label: t("batch2_3.navigation.settings"),
        icon: <SettingsIcon />,
        placement: "both",
        onClick: () => openPage("settings")
      },
      {
        key: "help",
        label: t("batch2_3.navigation.help"),
        icon: <HelpOutlineIcon />,
        placement: "both",
        onClick: () => {
          handleOpenHelp();
          finish();
        }
      }
    );

    if (!cloud) {
      actions.push({
        key: "downloads",
        label: t("batch2_3.navigation.downloads"),
        icon: <DownloadIcon />,
        placement: "logo",
        onClick: () => {
          openDownloadsDialog();
          finish();
        },
        secondary: downloadProgress != null ? `${downloadProgress}%` : undefined
      });
    }

    return actions;
  }, [openPage, finish, handleOpenHelp, openDownloadsDialog, downloadProgress, t]);
};
