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

// Removed manual resizing – the list expands with content
const ROW_HEIGHT = 1.5; // height of each row in the folder list in em
const LIST_MIN_WIDTH = "200px"; // minimum width of the folder list
const LEVEL_PADDING = 1; // padding for each level of the folder tree in em

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
      gap: "0",
      padding: "0",
      height: "auto",
      overflow: "visible"
    },
    ".childless": {
      marginBottom: "0.25em"
    },
    ".accordion": {
      height: ROW_HEIGHT + "em",
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
      flexDirection: "row-reverse",
      height: ROW_HEIGHT + "em",
      minHeight: "unset",
      "&.Mui-expanded": {
        minHeight: "auto"
      }
    },
    ".accordion-summary .MuiAccordionSummary-content": {
      margin: "0"
    },
    ".accordion .MuiAccordionDetails-root": {
      padding: "0",
      marginTop: "0"
    },
    ".accordion .MuiAccordionDetails-root .MuiBox-root": {
      height: "1.5em"
    },
    ".MuiAccordionSummary-expandIconWrapper": {
      position: "relative",
      padding: "0",
      width: "0px",
      height: "0px",
      overflow: "visible",
      transform: "none"
    },
    ".MuiAccordionSummary-expandIconWrapper.Mui-expanded": {
      transform: "none"
    },
    ".MuiAccordionSummary-expandIconWrapper:hover": {
      color: "var(--palette-primary-main)"
    },
    ".MuiAccordionSummary-expandIconWrapper svg": {
      width: "25px",
      height: "25px",
      position: "absolute",
      top: "-.6em",
      bottom: "0",
      left: "4px",
      right: "0",
      zIndex: 1000,
      color: theme.vars.palette.grey[200],
      filter: "none",
      transform: "rotate(-90deg)",
      transition: "transform 0.25s ease"
    },
    ".MuiAccordionSummary-expandIconWrapper.Mui-expanded svg": {
      color: theme.vars.palette.grey[200],
      transform: "rotate(0deg)"
    },
    //
    ".root-folder": {
      paddingLeft: "0",
      marginLeft: "-.5em"
    },
    ".root-folder .folder-icon": {
      width: "18px !important"
    },
    ".root-folder .folder-name": {
      fontSize: theme.fontSizeSmaller
    },
    // No resize handle styles
    // Narrow sidebar tweaks
    "@media (max-width: 520px)": {
      "&.folder-list-container": {
        height: "100px"
      },
      ".MuiAccordionSummary-expandIconWrapper svg": {
        left: "0"
      }
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
            marginBottom: 0,
            paddingLeft: `${level * LEVEL_PADDING}em !important`
          }}
          expandIcon={<ExpandMoreIcon />}
          aria-controls={`panel-${folder.id}-content`}
          id={`panel-${folder.id}-header`}
        >
          <FolderItem
            folder={folder}
            onSelect={() => handleSelect(folder)}
            isSelected={selectedFolderIds.includes(folder.id)}
          />
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
          height: ROW_HEIGHT + "em",
          marginTop: 0,
          marginBottom: 0,
          paddingLeft: `${level * LEVEL_PADDING}em !important`
        }}
        key={folder.id}
      >
        <FolderItem
          folder={folder}
          onSelect={() => handleSelect(folder)}
          isSelected={selectedFolderIds.includes(folder.id)}
        />
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
