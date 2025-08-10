/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import React, { useCallback } from "react";
import FolderItem from "./FolderItem";
import useAssets from "../../serverState/useAssets";
import useAuth from "../../stores/useAuth";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

// Layout constants for folder tree
const ROW_HEIGHT_REM = 1.3; // compact row height in em
const INDENT_PER_LEVEL_EM = 0.7; // left indent per tree level
const LIST_MIN_WIDTH = "100px"; // minimum width of the folder list
const EXPAND_ICON_SIZE_PX = 26; // accordion expand icon size
// const EXPAND_ICON_LEFT_PX = 8; // visual alignment of expand icon
// const EXPAND_ICON_GUTTER_PX = EXPAND_ICON_SIZE_PX + EXPAND_ICON_LEFT_PX + 2; // space reserved so the arrow doesn't overlap the folder icon

const styles = (theme: Theme) =>
  css({
    "&.folder-list-container": {
      position: "relative",
      height: "auto",
      overflow: "visible",
      padding: ".25em 0 0 0"
    },
    ".folder-list": {
      display: "flex",
      flexDirection: "column",
      flexWrap: "nowrap",
      gap: 0,
      padding: 0,
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
      alignItems: "center",
      height: ROW_HEIGHT_REM + "rem",
      gap: ".25rem"
    },
    ".expand-gutter": {
      position: "absolute",
      left: "-20px",
      top: 0,
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
      height: ROW_HEIGHT_REM + "rem",
      alignItems: "center"
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
  const { navigateToFolder } = useAssets();

  const selectedFolderIds = useAssetGridStore(
    (state) => state.selectedFolderIds
  );

  const handleSelect = (folder: Asset) => {
    navigateToFolder(folder);
  };

  const renderFolder = (folder: any, level = 0, isRoot = false) => {
    if (!folder || !folder.id) return null;
    const hasChildren = folder.children && folder.children.length > 0;

    return hasChildren ? (
      <Accordion
        slotProps={{ heading: { component: "div" } }}
        className={"accordion " + (isRoot ? "root-folder" : "")}
        key={folder.id}
        sx={{
          marginTop: "0 !important",
          marginBottom: "0 !important"
        }}
      >
        <AccordionSummary
          className="accordion-summary"
          sx={{
            marginTop: 0,
            marginBottom: 0
            // padding applied to inner row for consistent structure
          }}
          aria-controls={`panel-${folder.id}-content`}
          id={`panel-${folder.id}-header`}
        >
          <div
            className="row"
            style={{ paddingLeft: `${level * INDENT_PER_LEVEL_EM}em` }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              const summary =
                (e.currentTarget.parentElement as HTMLElement) || null;
              // parentElement should be the AccordionSummary
              if (summary) {
                summary.click();
              }
            }}
          >
            <FolderItem
              folder={folder}
              onSelect={() => handleSelect(folder)}
              isSelected={selectedFolderIds.includes(folder.id)}
              showDeleteButton={false}
            >
              <span className="expand-gutter" aria-hidden="true">
                <ExpandMoreIcon />
              </span>
            </FolderItem>
          </div>
        </AccordionSummary>
        <AccordionDetails>
          {folder.children.map((childNode: any) =>
            renderFolder(childNode, level + 1)
          )}
        </AccordionDetails>
      </Accordion>
    ) : (
      <Box
        className={"childless " + (isRoot ? "root-folder" : "")}
        sx={{
          height: ROW_HEIGHT_REM + "rem",
          marginTop: 0,
          marginBottom: 0
        }}
        key={folder.id}
      >
        <div
          className="row"
          style={{ paddingLeft: `${level * INDENT_PER_LEVEL_EM}em` }}
        >
          <FolderItem
            folder={folder}
            onSelect={() => handleSelect(folder)}
            isSelected={selectedFolderIds.includes(folder.id)}
          />
        </div>
      </Box>
    );
  };

  const rootFolder = {
    id: currentUser?.id,
    name: "ASSETS",
    content_type: "folder",
    children: Object.values(folderTree || {}),
    parent_id: currentUser?.id || ""
  };

  return (
    <div
      className="folder-list-container"
      css={styles(theme)}
      style={{
        minHeight: isHorizontal ? "100%" : "auto",
        minWidth: isHorizontal ? LIST_MIN_WIDTH : "auto"
      }}
    >
      <div className="folder-list">{renderFolder(rootFolder, 0, true)}</div>
    </div>
  );
};

export default FolderList;
