/**
 * SceneHeader — one scene's row in the shot grid.
 *
 * The number is derived, never stored: it is the scene's position in
 * `sceneOrder`, which is the position of its first shot's `index`
 * (PRD § 7.7.3). A legacy board has no `Scene` record at all — its shots sit
 * under one implicit header with no slugline — so the slugline is optional
 * rather than a reason to materialize a scene.
 *
 * The header spans its scene's shot grid, above that scene's cards. Its
 * `actions` sit at the end of the row: a scene clip belongs to its scene, so
 * the control that renders one does too.
 */

import React, { memo, type ReactNode } from "react";

import {
  Box,
  Caption,
  FlexRow,
  SPACING,
  Text,
  TYPOGRAPHY
} from "../ui_primitives";

export interface SceneHeaderProps {
  /** 1-based derived scene position. */
  number: number;
  /** The scene's slugline. Absent on the implicit legacy header. */
  slugline?: string;
  /** Controls at the end of the row: the scene's clips. */
  actions?: ReactNode;
}

const headerSx = {
  gridColumn: "1 / -1",
  pt: SPACING.md,
  pb: SPACING.xs,
  borderBottom: "1px solid",
  borderColor: "divider"
} as const;

const numberSx = {
  ...TYPOGRAPHY.mono.caption,
  color: "text.secondary",
  whiteSpace: "nowrap"
} as const;

const SceneHeaderInner: React.FC<SceneHeaderProps> = ({
  number,
  slugline,
  actions
}) => (
  <Box sx={headerSx}>
    <FlexRow align="baseline" gap={SPACING.md} wrap>
      <Text component="h3" size="small" sx={numberSx}>
        {`Scene ${number}`}
      </Text>
      {slugline ? (
        <Caption color="secondary">{slugline}</Caption>
      ) : null}
      {actions ? (
        <FlexRow
          align="center"
          gap={SPACING.xs}
          wrap
          sx={{ ml: "auto", alignSelf: "center" }}
        >
          {actions}
        </FlexRow>
      ) : null}
    </FlexRow>
  </Box>
);

export const SceneHeader = memo(SceneHeaderInner);
SceneHeader.displayName = "SceneHeader";

export default SceneHeader;
