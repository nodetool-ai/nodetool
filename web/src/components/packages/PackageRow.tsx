/**
 * PackageRow — one card in the right-pane package list.
 *
 * A bordered surface that lifts off the pane on hover, with the name + inline
 * metadata (badges, version) and a width-capped description on the left, and a
 * right-docked action cluster (toggle, or install/update/uninstall). Matches
 * the claude.ai/design `PackageManager.dc.html` row.
 */
import { memo } from "react";
import type { ReactNode } from "react";

import { FlexColumn, FlexRow, Text, BORDER_RADIUS, MOTION } from "../ui_primitives";

export interface PackageRowProps {
  name: string;
  /** Badges (chips) and version text shown inline after the name. */
  meta?: ReactNode;
  description?: ReactNode;
  /** Right-docked controls (buttons or switch). */
  actions: ReactNode;
}

const PackageRow = ({ name, meta, description, actions }: PackageRowProps) => (
  <FlexRow
    gap={3}
    align="center"
    sx={(theme) => ({
      px: 2.25,
      py: 1.75,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: `background-color ${MOTION.fast}, border-color ${MOTION.fast}`,
      "&:hover": {
        backgroundColor:
          theme.vars.palette.c_node_bg ?? theme.vars.palette.background.paper,
        borderColor: theme.vars.palette.action.focus
      }
    })}
  >
    <FlexColumn gap={0.75} sx={{ minWidth: 0, flex: 1 }}>
      <FlexRow gap={1} align="center" sx={{ flexWrap: "wrap" }}>
        <Text size="normal" weight={600} truncate>
          {name}
        </Text>
        {meta}
      </FlexRow>
      {description && (
        <Text size="small" color="secondary" sx={{ maxWidth: "62ch" }}>
          {description}
        </Text>
      )}
    </FlexColumn>

    <FlexRow
      gap={1}
      align="center"
      justify="flex-end"
      sx={{ flexShrink: 0, minWidth: 132 }}
    >
      {actions}
    </FlexRow>
  </FlexRow>
);

export default memo(PackageRow);
