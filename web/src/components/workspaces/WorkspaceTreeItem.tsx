import React, { memo } from "react";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import { BASE_URL } from "../../stores/BASE_URL";
import { BORDER_RADIUS, ResponsiveImage, TruncatedText } from "../ui_primitives";
import {
  workspaceFileKind,
  type WorkspaceFileKind
} from "../workspace/workspaceFileKind";
import { workspaceFileDownloadPath } from "../workspace/workspaceFileRef";

const KIND_ICON: Record<WorkspaceFileKind, typeof FolderOutlinedIcon> = {
  image: ImageOutlinedIcon,
  audio: AudiotrackOutlinedIcon,
  video: MovieOutlinedIcon,
  pdf: PictureAsPdfOutlinedIcon,
  model3d: ViewInArOutlinedIcon,
  markdown: DescriptionOutlinedIcon,
  csv: DescriptionOutlinedIcon,
  code: CodeOutlinedIcon,
  text: DescriptionOutlinedIcon,
  binary: InsertDriveFileOutlinedIcon
};

const THUMB_SIZE = 24;

interface RowLeadingProps {
  readonly itemId: string;
  readonly label: string;
  readonly isFolder: boolean;
  readonly workspaceId: string | undefined;
}

const RowLeading: React.FC<RowLeadingProps> = ({
  itemId,
  label,
  isFolder,
  workspaceId
}) => {
  if (isFolder) {
    return <FolderOutlinedIcon className="row-icon folder-icon" />;
  }
  const kind = workspaceFileKind(label);
  if (kind === "image" && workspaceId) {
    return (
      <ResponsiveImage
        className="row-thumb"
        locator={`${BASE_URL}${workspaceFileDownloadPath(workspaceId, itemId)}`}
        alt=""
        loading="lazy"
        fit="cover"
        borderRadius={BORDER_RADIUS.xs}
        showErrorFallback={false}
        sx={{ width: THUMB_SIZE, height: THUMB_SIZE, flexShrink: 0 }}
      />
    );
  }
  const Icon = KIND_ICON[kind];
  return <Icon className="row-icon" />;
};

export interface WorkspaceTreeRowProps {
  readonly id: string;
  readonly label: string;
  readonly depth: number;
  readonly isFolder: boolean;
  readonly isPlaceholder: boolean;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly workspaceId: string | undefined;
  readonly top: number;
  readonly height: number;
}

/**
 * One Files row: indent, a disclosure chevron for a folder, a folder icon,
 * file-type icon or image thumbnail, then the name. Click and keyboard
 * handling sit on the list, which finds the row by `data-itemid`.
 */
const WorkspaceTreeRow: React.FC<WorkspaceTreeRowProps> = ({
  id,
  label,
  depth,
  isFolder,
  isPlaceholder,
  expanded,
  selected,
  workspaceId,
  top,
  height
}) => (
  <div
    role="treeitem"
    id={`workspace-tree-${id}`}
    aria-level={depth + 1}
    aria-selected={selected}
    aria-expanded={isFolder ? expanded : undefined}
    data-testid="tree-item"
    data-itemid={id}
    draggable={!isPlaceholder}
    className={`tree-row${selected ? " selected" : ""}${
      isPlaceholder ? " placeholder" : ""
    }`}
    style={{
      transform: `translateY(${top}px)`,
      height,
      paddingLeft: `calc(${depth} * var(--tree-indent))`
    }}
  >
    <span className="tree-chevron">
      {isFolder && (
        <ChevronRightIcon
          className={`row-icon${expanded ? " expanded" : ""}`}
        />
      )}
    </span>
    {!isPlaceholder && (
      <RowLeading
        itemId={id}
        label={label}
        isFolder={isFolder}
        workspaceId={workspaceId}
      />
    )}
    <TruncatedText className="tree-label">{label}</TruncatedText>
  </div>
);

export default memo(WorkspaceTreeRow);
