/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Asset } from "../../stores/ApiTypes";
// import { VariableSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import FolderItem from "./FolderItem";
import { useCallback, useEffect, useRef, useState } from "react";

// Constants for folder list
const INITIAL_FOLDER_LIST_HEIGHT = 150;
const MIN_FOLDER_LIST_HEIGHT = 50;
const MAX_FOLDER_LIST_HEIGHT = 300;
const FOLDER_SIZE = 100; // This can be easily changed

const styles = (theme: any) =>
  css({
    "&.folder-list-container": {
      position: "relative",
      height: "120px",
      overflow: "hidden",
      borderBottom: `1px solid ${theme.palette.divider}`,
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
      bottom: "-5px",
      left: 0,
      right: 0,
      height: "10px",
      cursor: "ns-resize",
      backgroundColor: theme.palette.divider,
      "&:hover": {
        backgroundColor: theme.palette.primary.main,
      },
    },
    // ".folder-item": {
    //   display: "flex",
    //   flexDirection: "column",
    //   alignItems: "center",
    //   width: `${FOLDER_SIZE}px`,
    //   height: `${FOLDER_SIZE}px`,
    // },
    // ".folder-name": {
    //   marginTop: "5px",
    //   fontSize: "0.8rem",
    //   textAlign: "center",
    //   wordBreak: "break-word",
    //   maxWidth: "100%",
    // },
  });

interface FolderListProps {
  folders: Asset[];
  selectedAssetIds: string[];
  handleSelectAsset: (id: string) => void;
  setCurrentFolderId: (id: string) => void;
}

const FolderList: React.FC<FolderListProps> = ({
  folders,
  selectedAssetIds,
  handleSelectAsset,
  setCurrentFolderId,
}) => {
  const [folderListHeight, setFolderListHeight] = useState(
    INITIAL_FOLDER_LIST_HEIGHT
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && resizeRef.current) {
        const newHeight =
          e.clientY - resizeRef.current.getBoundingClientRect().top;
        setFolderListHeight((prev) =>
          Math.max(
            MIN_FOLDER_LIST_HEIGHT,
            Math.min(newHeight, MAX_FOLDER_LIST_HEIGHT)
          )
        );
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
      style={{ height: folderListHeight }}
    >
      <div className="folder-list">
        {folders.map((folder) => (
          <>
            <FolderItem
              folder={folder}
              isSelected={selectedAssetIds.includes(folder.id)}
              onSelect={() => handleSelectAsset(folder.id)}
              onDoubleClick={() => setCurrentFolderId(folder.id)}
            />
          </>
        ))}
      </div>
      <div
        className="resize-handle"
        onMouseDown={handleResizeStart}
        ref={resizeRef}
      />
    </div>
  );
};

export default FolderList;
