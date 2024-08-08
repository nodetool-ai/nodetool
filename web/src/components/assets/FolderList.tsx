/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Asset } from "../../stores/ApiTypes";
import FolderItem from "./FolderItem";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useAssets from "../../serverState/useAssets";

const INITIAL_FOLDER_LIST_HEIGHT = 150;
const MIN_FOLDER_LIST_HEIGHT = 100;
const MAX_FOLDER_LIST_HEIGHT = 800;
const RESIZE_HANDLE_HEIGHT = 10;
const LIST_MIN_WIDTH = "300px"; // used if isHorizontal
const SCALING_SPEED = 2; // hack

const styles = (theme: any) =>
  css({
    "&.folder-list-container": {
      position: "relative",
      height: "120px",
      overflow: "hidden",
      paddingBottom: "2em",
    },
    ".folder-list": {
      display: "flex",
      flexDirection: "column",
      flexWrap: "nowrap",
      gap: ".25em",
      padding: "10px",
      height: "calc(100% - ${RESIZE_HANDLE_HEIGHT}px)",
      overflow: "hidden auto",
    },
    ".resize-handle": {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: `${RESIZE_HANDLE_HEIGHT}px`,
      cursor: "ns-resize",
      backgroundColor: theme.palette.c_gray2,
      transition: "background-color 0.2s ease",
      "&:hover, &.resizing": {
        backgroundColor: theme.palette.primary.main,
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
  });

interface FolderListProps {
  folders: Asset[];
  isHorizontal?: boolean;
}

const FolderList: React.FC<FolderListProps> = ({ folders, isHorizontal }) => {
  const [folderListHeight, setFolderListHeight] = useState(
    INITIAL_FOLDER_LIST_HEIGHT
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialMouseY = useRef<number>(0);
  const initialHeight = useRef<number>(INITIAL_FOLDER_LIST_HEIGHT);

  const { sortedAssets } = useAssets();
  const { selectedAssetIds, handleSelectAsset } =
    useAssetSelection(sortedAssets);

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
        const newHeight = initialHeight.current + deltaY * SCALING_SPEED;
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
      <div className="folder-list">
        {folders.map((folder) => (
          <FolderItem
            key={folder.id}
            folder={folder}
            isSelected={selectedAssetIds.includes(folder.id)}
            onSelect={() => handleSelectAsset(folder.id)}
          />
        ))}
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
