/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import React, { useCallback, useState, memo, useMemo } from "react";
import FolderItem from "./FolderItem";
import useAssets from "../../serverState/useAssets";
import useAuth from "../../stores/useAuth";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

// Layout constants for folder tree
const ROW_HEIGHT_REM = 1.5; // compact row height in em
const INDENT_PER_LEVEL_REM = 1.25; // left indent per tree level
const LIST_MIN_WIDTH = "100px"; // minimum width of the folder list
const EXPAND_ICON_SIZE_PX = 25; // accordion expand icon size

const styles = (theme: Theme) =>
  css({
    "&.folder-list-container": {
      position: "relative",
      height: "auto",
      overflow: "hidden",
      padding: ".25em 0 0 0"
    },
    ".folder-list": {
      display: "flex",
      flexDirection: "column",
      flexWrap: "nowrap",
      gap: 0,
      padding: "0 0 0 .5em",
      height: "auto",
      overflow: "visible"
    },
    ".childless": {
      margin: 0
    },
    ".accordion": {
      height: ROW_HEIGHT_REM + "rem",
      background: "transparent",
      boxShadow: "none",
      color: theme.vars.palette.grey[100],
      "&.Mui-expanded": {
        backgroundColor: "transparent"
      }
    },
    ".accordion::before": {
      display: "none"
    },
    ".accordion.Mui-expanded": {
      height: "auto",
      background: "transparent"
    },
    ".accordion-summary": {
      height: ROW_HEIGHT_REM + "rem",
      minHeight: ROW_HEIGHT_REM + "rem",
      padding: 0,
      "&.Mui-expanded": {
        minHeight: ROW_HEIGHT_REM + "rem"
      }
    },
    ".accordion-summary .MuiAccordionSummary-content": {
      margin: "0",
      alignItems: "center"
    },
    ".accordion .MuiAccordionDetails-root": {
      padding: 0,
      marginTop: 0
    },
    ".accordion .MuiAccordionDetails-root .MuiBox-root": {
      height: ROW_HEIGHT_REM + "rem"
    },
    // Custom expand gutter to align parent and leaf rows
    ".row": {
      position: "relative",
      display: "flex",
      width: "100%",
      alignItems: "center",
      height: ROW_HEIGHT_REM + "rem",
      gap: ".25rem",
      borderRadius: ".5em"
    },
    ".row:hover": {
      opacity: 0.9,

      backgroundColor: theme.vars.palette.grey[900]
    },
    ".expand-gutter": {
      position: "absolute",
      left: "-22px",
      top: 1,
      bottom: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: EXPAND_ICON_SIZE_PX + "px",
      height: "100%",
      color: theme.vars.palette.grey[200],
      zIndex: 2,
      pointerEvents: "auto"
    },
    ".expand-gutter svg": {
      width: EXPAND_ICON_SIZE_PX + "px",
      height: EXPAND_ICON_SIZE_PX + "px",
      transform: "rotate(-90deg)",
      transition: "transform 0.25s ease"
    },
    // Rotate icon only when the corresponding summary is expanded
    ".accordion .accordion-summary.Mui-expanded .expand-gutter svg": {
      transform: "rotate(0deg)"
    },
    // Ensure all folder rows have a fixed, consistent height
    ".folder-item": {
      height: ROW_HEIGHT_REM + "rem"
      // alignItems: "center"
    },
    ".folder-item .folder-name": {
      margin: 0,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    //
    ".root-folder": {
      paddingLeft: 0,
      marginLeft: 0
    },
    ".root-folder .folder-icon": {
      width: "18px !important"
    },
    ".root-folder .folder-name": {
      fontSize: theme.fontSizeNormal
    },
    // No resize handle styles
    // Narrow sidebar tweaks
    "@media (max-width: 520px)": {
      "&.folder-list-container": {
        height: "100px"
      },
      ".expand-gutter svg": { left: "0" }
    }
  });

interface FolderListProps {
  isHorizontal?: boolean;
}

const FolderList: React.FC<FolderListProps> = ({ isHorizontal }) => {
  const theme = useTheme();
  const currentUser = useAuth((state) => state.user);
  const { folderTree } = useAssets();
  const { navigateToFolder, navigateToFolderId } = useAssets();

  const selectedFolderIds = useAssetGridStore(
    (state) => state.selectedFolderIds
  );

  // Control which folders are expanded; disable single-click expansion
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    new Set()
  );

  // Memoize class names to prevent recreation on every render
  const accordionClassName = useMemo(() => "accordion", []);
  const rootFolderClassName = useMemo(() => "root-folder", []);
  const accordionSummaryClassName = useMemo(() => "accordion-summary", []);
  const childlessClassName = useMemo(() => "childless", []);
  const rowClassName = useMemo(() => "row", []);
  const expandGutterClassName = useMemo(() => "expand-gutter", []);
  const folderListClassName = useMemo(() => "folder-list", []);
  const folderListContainerClassName = useMemo(() => "folder-list-container", []);

  const handleSelect = useCallback((folder: Asset | RootFolder) => {
    if ((folder as Asset).user_id !== undefined) {
      navigateToFolder(folder as Asset);
    } else {
      navigateToFolderId(folder.id);
    }
  }, [navigateToFolder, navigateToFolderId]);

  interface FolderNode extends Asset {
    children?: FolderNode[];
  }
  type RootFolder = {
    id: string;
    name: string;
    content_type: string;
    parent_id: string;
    children: FolderNode[];
  };

  const hasChildNodes = useCallback(
    (folder: FolderNode | RootFolder): folder is FolderNode & { children: FolderNode[] } => {
      return (
        "children" in folder &&
        Array.isArray(folder.children) &&
        folder.children.length > 0
      );
    },
    []
  );

  const handleRowDoubleClick = useCallback(
    (folderId: string, isRoot: boolean) => {
      if (isRoot) {return;}
      setExpandedFolderIds((previousExpandedIds) => {
        const nextExpandedIds = new Set(previousExpandedIds);
        if (nextExpandedIds.has(folderId)) {
          nextExpandedIds.delete(folderId);
        } else {
          nextExpandedIds.add(folderId);
        }
        return nextExpandedIds;
      });
    },
    []
  );

  const handleExpandFolder = useCallback((folderId: string) => {
    setExpandedFolderIds((previousExpandedIds) => {
      const nextExpandedIds = new Set(previousExpandedIds);
      if (nextExpandedIds.has(folderId)) {
        nextExpandedIds.delete(folderId);
      } else {
        nextExpandedIds.add(folderId);
      }
      return nextExpandedIds;
    });
  }, []);

  const handleFolderSelect = useCallback((folder: Asset | RootFolder) => {
    handleSelect(folder);
  }, [handleSelect]);

  const handleFolderClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const noop = useCallback(() => {
    /* no-op */
  }, []);

  const renderFolder = useCallback(
    (
      folder: FolderNode | RootFolder,
      level = 0,
      isRoot = false
    ) => {
      if (!folder || !folder.id) {return null;}
      const hasChildren = hasChildNodes(folder);

      return hasChildren ? (
        // Folder with children
        <Accordion
          slotProps={{ heading: { component: "div" } }}
          className={isRoot ? `${accordionClassName} ${rootFolderClassName}` : accordionClassName}
          key={folder.id}
          sx={{
            marginTop: "0 !important",
            marginBottom: "0 !important"
          }}
          /* Keep root expanded; disable single-click toggle by controlling expanded */
          expanded={isRoot ? true : expandedFolderIds.has(folder.id)}
          onChange={noop}
        >
          <AccordionSummary
            component="div"
            className={accordionSummaryClassName}
            sx={{
              marginTop: 0,
              marginBottom: 0,
              cursor: "pointer"
            }}
            aria-controls={`panel-${folder.id}-content`}
            id={`panel-${folder.id}-header`}
            /* Prevent toggle interactions on the root summary */
            onClick={handleFolderClick}
          >
            <div
              className={rowClassName}
              style={{
                paddingLeft: `${level * INDENT_PER_LEVEL_REM}rem`
              }}
              data-is-root={isRoot ? "true" : "false"}
              onDoubleClick={() => handleRowDoubleClick(folder.id, isRoot)}
            >
              <FolderItem
                folder={folder as Asset}
                onSelect={() => handleFolderSelect(folder)}
                isSelected={selectedFolderIds.includes(folder.id)}
              >
                {!isRoot && (
                  <span
                    className={expandGutterClassName}
                    aria-hidden="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleExpandFolder(folder.id);
                    }}
                  >
                    <ExpandMoreIcon />
                  </span>
                )}
              </FolderItem>
            </div>
          </AccordionSummary>
          <AccordionDetails>
            {(("children" in folder ? folder.children : []) as FolderNode[]).map(
              (childNode: FolderNode) => renderFolder(childNode, level + 1)
            )}
          </AccordionDetails>
        </Accordion>
      ) : (
        // Folder without children
        <Box
          className={isRoot ? `${childlessClassName} ${rootFolderClassName}` : childlessClassName}
          sx={{
            height: ROW_HEIGHT_REM + "rem",
            marginTop: 0,
            marginBottom: 0
          }}
          key={folder.id}
        >
          <div
            className={rowClassName}
            style={{ paddingLeft: `${level * INDENT_PER_LEVEL_REM}rem` }}
          >
            <FolderItem
              folder={folder as Asset}
              onSelect={() => handleFolderSelect(folder)}
              isSelected={selectedFolderIds.includes(folder.id)}
            />
          </div>
        </Box>
      );
    },
    [
      expandedFolderIds,
      selectedFolderIds,
      handleRowDoubleClick,
      handleFolderSelect,
      handleFolderClick,
      handleExpandFolder,
      noop,
      hasChildNodes,
      accordionClassName,
      rootFolderClassName,
      accordionSummaryClassName,
      childlessClassName,
      rowClassName,
      expandGutterClassName
    ]
  );

  const rootFolder: RootFolder = useMemo(() => ({
    id: currentUser?.id ?? "root",
    name: "ASSETS",
    content_type: "folder",
    children: (Object.values(folderTree || {}) as FolderNode[]) || [],
    parent_id: currentUser?.id || ""
  }), [currentUser?.id, folderTree]);

  return (
    <div
      className={folderListContainerClassName}
      css={styles(theme)}
      style={{
        minHeight: isHorizontal ? "100%" : "auto",
        minWidth: isHorizontal ? LIST_MIN_WIDTH : "auto"
      }}
    >
      <div className={folderListClassName}>{renderFolder(rootFolder, 0, true)}</div>
    </div>
  );
};

const MemoizedFolderList = memo(FolderList);

MemoizedFolderList.displayName = "FolderList";

export default MemoizedFolderList;
