/**
 * One section of the start page below the composer: an h2 with an optional
 * link on its right and a caption under it, then the section's cards. Every
 * row of cards on the page uses `START_CARD_GRID_SX`, so their columns line
 * up from one section to the next.
 */

import { memo, type ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  SHADOW,
  Skeleton,
  Text
} from "../ui_primitives";

/** Cards per row on a wide screen, in every start page section. */
export const START_CARD_COLUMNS = 4;

/** The one grid every start page card row sits on. */
export const START_CARD_GRID_SX = {
  display: "grid",
  gap: GAP.comfortable,
  gridTemplateColumns: {
    xs: "minmax(0, 1fr)",
    sm: "repeat(2, minmax(0, 1fr))",
    md: `repeat(${START_CARD_COLUMNS}, minmax(0, 1fr))`
  }
} as const;

/** The chrome every start page card shares, with `radius="lg"`: a soft lift. */
export const START_CARD_SX: SxProps<Theme> = {
  minWidth: 0,
  overflow: "hidden",
  boxShadow: (theme) => SHADOW(theme).sm
};

interface StartSectionProps {
  title: string;
  /** One line under the title. */
  subtitle?: ReactNode;
  /** A link or control on the title's row, on the right. */
  action?: ReactNode;
  id?: string;
  /** The region's accessible name, when it differs from the title. */
  ariaLabel?: string;
  children: ReactNode;
}

const StartSection = ({
  title,
  subtitle,
  action,
  id,
  ariaLabel,
  children
}: StartSectionProps) => (
  <FlexColumn
    component="section"
    id={id}
    aria-label={ariaLabel ?? title}
    gap={GAP.comfortable}
  >
    <FlexColumn gap={GAP.tight}>
      <FlexRow align="center" gap={GAP.normal}>
        <Text size="big" component="h2" sx={{ flex: 1, minWidth: 0 }}>
          {title}
        </Text>
        {action}
      </FlexRow>
      {subtitle ? <Caption color="secondary">{subtitle}</Caption> : null}
    </FlexColumn>
    {children}
  </FlexColumn>
);

/** A row of `count` placeholder cards while a section's cards load. */
export const StartCardSkeletons = ({
  count = START_CARD_COLUMNS,
  height
}: {
  count?: number;
  height: number;
}) => (
  <Box sx={START_CARD_GRID_SX} aria-hidden>
    {Array.from({ length: count }, (_, index) => (
      <Skeleton
        key={index}
        variant="rectangular"
        height={height}
        sx={{ borderRadius: BORDER_RADIUS.lg }}
      />
    ))}
  </Box>
);

export default memo(StartSection);
