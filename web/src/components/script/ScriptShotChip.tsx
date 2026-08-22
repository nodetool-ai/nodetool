/**
 * ScriptShotChip
 *
 * The gutter affordance for a line a storyboard shot covers: the shot's
 * keyframe still as a small thumbnail, clicking through to the board with that
 * shot selected (design §4). Falls back to the shot number while no still has
 * been rendered.
 */

import { memo } from "react";
import type { Shot } from "@nodetool-ai/protocol";

import {
  Box,
  Tooltip,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY,
  ResponsiveImage
} from "../ui_primitives";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";

interface ScriptShotChipProps {
  shot: Shot;
  onOpen: () => void;
}

const ScriptShotChipInner = ({ shot, onOpen }: ScriptShotChipProps) => {
  const uri = useResolvedMediaUri(shot.keyframe);
  const label = `Shot ${shot.index + 1}${shot.slug ? `: ${shot.slug}` : ""}`;

  return (
    <Tooltip title={`${label} — open on the storyboard`}>
      <Box
        component="button"
        type="button"
        onClick={onOpen}
        aria-label={`Open ${label} on the storyboard`}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 44,
          height: 26,
          padding: SPACING.none,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: BORDER_RADIUS.sm,
          background: "none",
          color: "text.secondary",
          cursor: "pointer",
          ...TYPOGRAPHY.sans.caption,
          "&:hover": { borderColor: "primary.main" },
          "& img": { width: "100%", height: "100%", objectFit: "cover" }
        }}
      >
        {uri ? (
          <ResponsiveImage
            locator={shot.keyframe}
            alt=""
            fit="cover"
            sx={{ width: "100%", height: "100%" }}
          />
        ) : (
          `#${shot.index + 1}`
        )}
      </Box>
    </Tooltip>
  );
};

export const ScriptShotChip = memo(ScriptShotChipInner);
ScriptShotChip.displayName = "ScriptShotChip";

export default ScriptShotChip;
