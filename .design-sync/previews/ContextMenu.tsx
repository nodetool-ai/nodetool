import * as React from "react";
import { ContextMenu } from "nodetool";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

export const NodeActions = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [el, setEl] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => setEl(ref.current), []);
  return (
    <div>
      <div
        ref={ref}
        style={{
          display: "inline-block",
          padding: "6px 12px",
          borderRadius: 6,
          background: "var(--palette-action-hover)",
          fontSize: 13
        }}
      >
        Generate Image node
      </div>
      <ContextMenu open={Boolean(el)} anchorEl={el} minWidth={180}>
        <MenuItem>
          <ListItemIcon>
            <PlayArrowIcon fontSize="small" />
          </ListItemIcon>
          Run from here
        </MenuItem>
        <MenuItem>
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          Duplicate node
        </MenuItem>
        <MenuItem>
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </ContextMenu>
    </div>
  );
};
