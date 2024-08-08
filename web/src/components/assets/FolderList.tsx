/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Asset } from "../../stores/ApiTypes";
import FolderItem from "./FolderItem";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useAssets from "../../serverState/useAssets";
// import { useAssetStore } from "../../hooks/AssetStore";

const INITIAL_FOLDER_LIST_HEIGHT = 150;
const MIN_FOLDER_LIST_HEIGHT = 100;
const MAX_FOLDER_LIST_HEIGHT = 800;
const RESIZE_HANDLE_HEIGHT = 20;
const LIST_MIN_WIDTH = "300px"; // used if isHorizontal
const SCALE_OFFSET = 150; // should not be needed

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
      height: "100%",
      overflow: "hidden auto",
    },
    ".resize-handle": {
      position: "absolute",
      // bottom: "-5px",
      left: 0,
      right: 0,
      height: `${RESIZE_HANDLE_HEIGHT}px`,
      cursor: "ns-resize",
      backgroundColor: theme.palette.c_gray2,
      transition: "background-color 0.2s ease",
      "&:hover, &.resizing": {
        borderTop: "1px solid" + theme.palette.primary.main,
      },
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.palette.c_gray0,
      paddingBottom: ".5em",
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
  // const setCurrentFolderId = useAssetStore((state) => state.setCurrentFolderId);
  const { sortedAssets } = useAssets();
  const { selectedAssetIds, handleSelectAsset } =
    useAssetSelection(sortedAssets);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newHeight = e.clientY - containerRect.top + SCALE_OFFSET;
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
            // onDoubleClick={() => setCurrentFolderId(folder.id)}
          />
        ))}
      </div>
      <div
        className={`resize-handle ${isResizing ? "resizing" : ""}`}
        onMouseDown={handleResizeStart}
        ref={resizeRef}
      >
        ...
      </div>
    </div>
  );
};

export default FolderList;
