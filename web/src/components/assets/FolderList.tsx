/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import FolderItem from "./FolderItem";
import useAssets from "../../serverState/useAssets";
import useAuth from "../../stores/useAuth";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { Asset } from "../../stores/ApiTypes";

const INITIAL_FOLDER_LIST_HEIGHT = 100;
const MIN_FOLDER_LIST_HEIGHT = 100;
const MAX_FOLDER_LIST_HEIGHT = 1500;
const RESIZE_HANDLE_HEIGHT = 20;
const ROW_HEIGHT = 1.75;
const LIST_MIN_WIDTH = "300px";
const LEVEL_PADDING = 0.7;

const styles = (theme: any) =>
  css({
    "&.folder-list-container": {
      position: "relative",
      height: "120px",
      overflow: "hidden",
      padding: ".5em 0 0 0"
    },
    ".folder-list": {
      display: "flex",
      flexDirection: "column",
      flexWrap: "nowrap",
      gap: "0",
      padding: "0 0 2em 0",
      height: `calc(100% - ${RESIZE_HANDLE_HEIGHT}px)`,
      overflow: "hidden auto"
    },
    ".accordion": {
      height: ROW_HEIGHT + "em",
      background: "transparent",
      boxShadow: "none",
      color: theme.palette.c_gray6,
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
      marginTop: "-.25em !important"
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
      color: theme.palette.c_hl1
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
      color: theme.palette.c_gray5,
      filter: "none",
      transform: "rotate(-90deg)",
      transition: "transform 0.25s ease"
    },
    ".MuiAccordionSummary-expandIconWrapper.Mui-expanded svg": {
      color: theme.palette.c_gray5,
      transform: "rotate(0deg)"
    },
    //
    ".root-folder": {
      paddingLeft: "0",
      marginLeft: "-.5em"
    },
    // resize folder list
    ".resize-handle": {
      position: "absolute",
      borderBottom: "5px solid" + theme.palette.c_gray1,
      bottom: 0,
      left: 0,
      right: 0,
      height: `${RESIZE_HANDLE_HEIGHT}px`,
      cursor: "ns-resize",
      backgroundColor: theme.palette.c_gray2,
      transition: "background-color 0.2s ease",
      "&:hover, &.resizing": {
        backgroundColor: "#4c4c4c"
      },
      "&::after": {
        content: '""',
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "2em",
        height: "4px",
        borderRadius: "2px",
        backgroundColor: theme.palette.c_gray0
      }
    },
    ".resize-handle:hover::after, .resize-handle.resizing::after": {
      backgroundColor: theme.palette.c_hl1
    }
  });

interface FolderListProps {
  isHorizontal?: boolean;
}

const FolderList: React.FC<FolderListProps> = ({ isHorizontal }) => {
  const currentUser = useAuth((state) => state.getUser());
  const { folderTree } = useAssets();
  const [folderListHeight, setFolderListHeight] = useState(
    INITIAL_FOLDER_LIST_HEIGHT
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialMouseY = useRef<number>(0);
  const initialHeight = useRef<number>(INITIAL_FOLDER_LIST_HEIGHT);
  const { navigateToFolder } = useAssets();

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      initialMouseY.current = e.clientY;
      initialHeight.current = folderListHeight;
    },
    [folderListHeight]
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && containerRef.current) {
        const deltaY = e.clientY - initialMouseY.current;
        const newHeight = initialHeight.current + deltaY;
        const clampedHeight = Math.max(
          MIN_FOLDER_LIST_HEIGHT,
          Math.min(newHeight, MAX_FOLDER_LIST_HEIGHT)
        );

        setFolderListHeight(clampedHeight);
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleResize);
      window.addEventListener("mouseup", handleResizeEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleResize);
      window.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [isResizing, handleResize, handleResizeEnd]);

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
      >
        <AccordionSummary
          className="accordion-summary"
          sx={{
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
    children: folderTree,
    parent_id: currentUser?.id || ""
  };

  return (
    <div
      className="folder-list-container"
      css={styles}
      style={{
        height: `${folderListHeight}px`,
        minHeight: isHorizontal ? "100%" : "auto",
        minWidth: isHorizontal ? LIST_MIN_WIDTH : "auto",
        marginRight: isHorizontal ? "1em" : "0"
      }}
      ref={containerRef}
    >
      <div className="folder-list">
        {renderFolder(rootFolder, 0, true)}
        {Object.values(folderTree || {}).map((rootFolder: any) =>
          renderFolder(rootFolder)
        )}
      </div>
      <div
        className={`resize-handle ${isResizing ? "resizing" : ""}`}
        onMouseDown={handleResizeStart}
        ref={resizeRef}
      />
    </div>
  );
};

export default FolderList;
