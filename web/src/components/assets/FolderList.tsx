/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import FolderItem from "./FolderItem";
import useAssets from "../../serverState/useAssets";
import useSessionStateStore from "../../stores/SessionStateStore";
import { useAssetStore } from "../../stores/AssetStore";

const INITIAL_FOLDER_LIST_HEIGHT = 150;
const MIN_FOLDER_LIST_HEIGHT = 100;
const MAX_FOLDER_LIST_HEIGHT = 800;
const RESIZE_HANDLE_HEIGHT = 20;
const LIST_MIN_WIDTH = "300px";

const styles = (theme: any) =>
  css({
    "&.folder-list-container": {
      position: "relative",
      height: "120px",
      overflow: "hidden",
      paddingBottom: ".5em",
    },
    ".folder-list": {
      display: "flex",
      flexDirection: "column",
      flexWrap: "nowrap",
      gap: "0",
      padding: "10px",
      paddingBottom: "1em",
      height: `calc(100% - ${RESIZE_HANDLE_HEIGHT}px)`,
      overflow: "hidden auto",
    },
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
        backgroundColor: "#4c4c4c",
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
        backgroundColor: theme.palette.c_gray0,
      },
    },
    ".resize-handle:hover::after, .resize-handle.resizing::after": {
      backgroundColor: theme.palette.c_hl1,
    },
  });

interface FolderListProps {
  isHorizontal?: boolean;
}

const FolderList: React.FC<FolderListProps> = ({ isHorizontal }) => {
  const [folderListHeight, setFolderListHeight] = useState(
    INITIAL_FOLDER_LIST_HEIGHT
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialMouseY = useRef<number>(0);
  const initialHeight = useRef<number>(INITIAL_FOLDER_LIST_HEIGHT);

  const { folderTree } = useAssets();
  const selectedFolderId = useSessionStateStore(
    (state) => state.selectedFolderId
  );
  const setSelectedFolderId = useSessionStateStore(
    (state) => state.setSelectedFolderId
  );

  const setCurrentFolderId = useAssetStore((state) => state.setCurrentFolderId);

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

  // Updated handleSelect function to work with selectedFolderId
  const handleSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
    setCurrentFolderId(folderId);
  };

  const renderFolder = (node: any) => {
    if (!node || !node.id) return null;

    const hasChildren = node.children && node.children.length > 0;

    return (
      <Accordion key={node.id}>
        <AccordionSummary
          expandIcon={hasChildren ? <ExpandMoreIcon /> : null}
          aria-controls={`panel-${node.id}-content`}
          id={`panel-${node.id}-header`}
        >
          <FolderItem folder={node} onSelect={() => handleSelect(node.id)} />
        </AccordionSummary>
        {hasChildren && (
          <AccordionDetails>
            <Box sx={{ paddingLeft: 2 }}>
              {node.children.map((childNode: any) => renderFolder(childNode))}
            </Box>
          </AccordionDetails>
        )}
      </Accordion>
    );
  };

  return (
    <div
      className="folder-list-container"
      css={styles}
      style={{
        height: `${folderListHeight}px`,
        minHeight: isHorizontal ? "100%" : "auto",
        minWidth: isHorizontal ? LIST_MIN_WIDTH : "auto",
        marginRight: isHorizontal ? "1em" : "0",
      }}
      ref={containerRef}
    >
      {selectedFolderId}
      <div className="folder-list">
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
