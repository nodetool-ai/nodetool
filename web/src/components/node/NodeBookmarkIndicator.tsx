import { memo } from "react";
import { Box, Tooltip } from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import { useTheme } from "@mui/material/styles";
import useNodeBookmarkStore from "../../stores/NodeBookmarkStore";

interface NodeBookmarkIndicatorProps {
  nodeId: string;
  workflowId: string;
}

const NodeBookmarkIndicator: React.FC<NodeBookmarkIndicatorProps> = memo(
  ({ nodeId, workflowId }) => {
    const theme = useTheme();
    const isBookmarked = useNodeBookmarkStore((state) =>
      state.isBookmarked(workflowId, nodeId)
    );

    if (!isBookmarked) {
      return null;
    }

    return (
      <Tooltip title="Bookmarked (Ctrl+M to toggle)" placement="top">
        <Box
          sx={{
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.vars.palette.warning.main,
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))"
          }}
        >
          <BookmarkIcon sx={{ fontSize: 18 }} />
        </Box>
      </Tooltip>
    );
  }
);

NodeBookmarkIndicator.displayName = "NodeBookmarkIndicator";

export default NodeBookmarkIndicator;
