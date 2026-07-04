/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useMemo, useRef, useState } from "react";
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

import { isProduction } from "../../lib/env";
import { useCombo } from "../../stores/KeyPressedStore";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  PAGE_TAB_TITLES,
  type PageTabKey
} from "../workspace/pageTabs";
import Help from "../content/Help/Help";
import Logo from "../Logo";
import { Popover, MenuItemPrimitive, Tooltip, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";

const workspacesEnabled = !isProduction;

const logoButtonStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "40px",
    height: "34px",
    margin: `0 ${theme.spacing(0.625)}`,
    padding: 0,
    border: "none",
    borderRadius: BORDER_RADIUS.lg,
    background: "transparent",
    cursor: "pointer",
    opacity: 0.9,
    transition: `background-color ${MOTION.fast}, opacity ${MOTION.fast}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      opacity: 1
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: "-2px"
    }
  });

const menuStyles = () =>
  css({
    minWidth: "208px",
    padding: `${getSpacingPx(SPACING.xs)} 0`
  });

/**
 * The app menu docked at the top of the workspace rail. The logo opens a menu
 * carrying the global actions that used to live in the old header's right cluster:
 * Settings, Help, and Downloads (with live progress when active).
 */
const RailAppMenu: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const { helpOpen, handleCloseHelp, handleOpenHelp, setHelpIndex } =
    useAppHeaderStore(
      useShallow((state) => ({
        helpOpen: state.helpOpen,
        handleCloseHelp: state.handleCloseHelp,
        handleOpenHelp: state.handleOpenHelp,
        setHelpIndex: state.setHelpIndex
      }))
    );

  const handleShowKeyboardShortcuts = useCallback(() => {
    setHelpIndex(1);
    handleOpenHelp();
  }, [setHelpIndex, handleOpenHelp]);

  // Cmd+/ (Mac) or Ctrl+/ (Win/Linux) opens Help at Keyboard Shortcuts tab
  useCombo(["Meta", "/"], handleShowKeyboardShortcuts);
  useCombo(["Control", "/"], handleShowKeyboardShortcuts);

  const close = useCallback(() => setOpen(false), []);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  // Open an app page (Settings, Costs, …) as a workspace tab and focus the
  // workspace, instead of navigating to a dedicated route.
  const openPage = useCallback(
    (key: PageTabKey) => {
      openTab({
        type: "page",
        ref: key,
        mode: "view",
        title: PAGE_TAB_TITLES[key]
      });
      navigate("/workspace");
      close();
    },
    [openTab, navigate, close]
  );

  const goDashboard = useCallback(() => {
    navigate("/dashboard");
    close();
  }, [navigate, close]);

  const goExamples = useCallback(() => openPage("examples"), [openPage]);
  const goTutorials = useCallback(() => openPage("tutorials"), [openPage]);
  const goCosts = useCallback(() => openPage("costs"), [openPage]);
  const goModels = useCallback(() => openPage("models"), [openPage]);
  const goPackages = useCallback(() => openPage("packages"), [openPage]);
  const goCollections = useCallback(() => openPage("collections"), [openPage]);
  const goWorkspaces = useCallback(() => openPage("workspaces"), [openPage]);
  const goSettings = useCallback(() => openPage("settings"), [openPage]);

  const openHelp = useCallback(() => {
    handleOpenHelp();
    close();
  }, [handleOpenHelp, close]);

  const { downloads, openDownloadsDialog } = useModelDownloadStore(
    useShallow((state) => ({
      downloads: state.downloads,
      openDownloadsDialog: state.openDialog
    }))
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

  const openDownloads = useCallback(() => {
    openDownloadsDialog();
    close();
  }, [openDownloadsDialog, close]);

  return (
    <>
      <Tooltip title="Menu" placement="right-start">
        <button
          ref={anchorRef}
          type="button"
          css={logoButtonStyles(theme)}
          className="rail-app-logo"
          aria-label="Open app menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Logo
            small
            width="22px"
            height="22px"
            fontSize="1em"
            borderRadius={BORDER_RADIUS.sm}
          />
        </button>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={close}
        placement="bottom-left"
      >
        <div css={menuStyles()} role="menu">
          <MenuItemPrimitive
            label="Dashboard"
            icon={<SpaceDashboardOutlinedIcon />}
            onClick={goDashboard}
          />
          <MenuItemPrimitive
            label="Tutorials"
            icon={<SchoolOutlinedIcon />}
            onClick={goTutorials}
          />
          <MenuItemPrimitive
            label="Examples"
            icon={<AutoAwesomeOutlinedIcon />}
            onClick={goExamples}
          />
          <MenuItemPrimitive
            label="Costs"
            icon={<PaidOutlinedIcon />}
            onClick={goCosts}
            dividerAfter
          />
          <MenuItemPrimitive
            label="Model Manager"
            icon={<ViewInArOutlinedIcon />}
            onClick={goModels}
          />
          {!isProduction && (
            <MenuItemPrimitive
              label="Package Manager"
              icon={<Inventory2OutlinedIcon />}
              onClick={goPackages}
            />
          )}
          <MenuItemPrimitive
            label="Collections"
            icon={<LibraryBooksOutlinedIcon />}
            onClick={goCollections}
            dividerAfter={!workspacesEnabled}
          />
          {workspacesEnabled && (
            <MenuItemPrimitive
              label="Workspaces"
              icon={<FolderSpecialOutlinedIcon />}
              onClick={goWorkspaces}
              dividerAfter
            />
          )}
          <MenuItemPrimitive
            label="Settings"
            icon={<SettingsIcon />}
            onClick={goSettings}
          />
          <MenuItemPrimitive
            label="Help"
            icon={<HelpOutlineIcon />}
            onClick={openHelp}
          />
          <MenuItemPrimitive
            label="Downloads"
            icon={<DownloadIcon />}
            onClick={openDownloads}
            secondary={
              downloadProgress != null ? `${downloadProgress}%` : undefined
            }
          />
        </div>
      </Popover>

      <Help open={helpOpen} handleClose={handleCloseHelp} />
    </>
  );
};

RailAppMenu.displayName = "RailAppMenu";

export default RailAppMenu;
