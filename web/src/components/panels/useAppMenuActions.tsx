import React, { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import SettingsIcon from "@mui/icons-material/Settings";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import DownloadIcon from "@mui/icons-material/Download";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import FolderSpecialOutlinedIcon from "@mui/icons-material/FolderSpecialOutlined";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";

import { isProduction } from "../../lib/env";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { openPageTab } from "../workspace/openPageTab";
import { type PageTabKey } from "../workspace/pageTabs";

export interface AppMenuAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
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
 * Callers own the Help dialog: render `<Help>` against `useAppHeaderStore`,
 * since the Downloads dialog and page tabs mount themselves but Help does not.
 */
export const useAppMenuActions = (onFinish?: () => void): AppMenuAction[] => {
  const navigate = useNavigate();
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
        key: "dashboard",
        label: "Dashboard",
        icon: <SpaceDashboardOutlinedIcon />,
        onClick: () => {
          navigate("/dashboard");
          finish();
        }
      },
      {
        key: "tutorials",
        label: "Tutorials",
        icon: <SchoolOutlinedIcon />,
        onClick: () => openPage("tutorials")
      },
      {
        key: "examples",
        label: "Examples",
        icon: <AutoAwesomeOutlinedIcon />,
        onClick: () => openPage("examples")
      },
      {
        key: "costs",
        label: "Costs",
        icon: <PaidOutlinedIcon />,
        onClick: () => openPage("costs"),
        dividerAfter: true
      },
      {
        key: "models",
        label: "Model Manager",
        icon: <ViewInArOutlinedIcon />,
        onClick: () => openPage("models")
      }
    ];

    if (!isProduction) {
      actions.push({
        key: "packages",
        label: "Package Manager",
        icon: <Inventory2OutlinedIcon />,
        onClick: () => openPage("packages")
      });
    }

    actions.push(
      {
        key: "assets",
        label: "Assets",
        icon: <PermMediaOutlinedIcon />,
        onClick: () => openPage("assets")
      },
      {
        key: "collections",
        label: "Collections",
        icon: <LibraryBooksOutlinedIcon />,
        onClick: () => openPage("collections")
      },
      {
        key: "workspaces",
        label: "Workspaces",
        icon: <FolderSpecialOutlinedIcon />,
        onClick: () => openPage("workspaces"),
        dividerAfter: true
      },
      {
        key: "settings",
        label: "Settings",
        icon: <SettingsIcon />,
        onClick: () => openPage("settings")
      },
      {
        key: "help",
        label: "Help",
        icon: <HelpOutlineIcon />,
        onClick: () => {
          handleOpenHelp();
          finish();
        }
      },
      {
        key: "downloads",
        label: "Downloads",
        icon: <DownloadIcon />,
        onClick: () => {
          openDownloadsDialog();
          finish();
        },
        secondary: downloadProgress != null ? `${downloadProgress}%` : undefined
      }
    );

    return actions;
  }, [
    navigate,
    openPage,
    finish,
    handleOpenHelp,
    openDownloadsDialog,
    downloadProgress
  ]);
};
