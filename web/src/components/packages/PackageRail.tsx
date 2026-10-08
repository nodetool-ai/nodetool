/**
 * PackageRail — the Package Manager's left navigation.
 *
 * One list of categories, each with a live count and an active accent.
 * Selecting a category drives the right pane.
 */
import { memo } from "react";

import {
  Box,
  FlexColumn,
  Text,
  BORDER_RADIUS,
  MOTION,
  SPACING
} from "../ui_primitives";
import type { PMCount } from "./usePackageManager";

interface PackageRailProps {
  categories: PMCount[];
  activeCat: string;
  onCat: (id: string) => void;
}

const PackageRail = ({
  categories,
  activeCat,
  onCat
}: PackageRailProps) => (
  <FlexColumn
    gap={SPACING.xs}
    sx={(theme) => ({
      // Phone width: the rail sits above the list as a full-width header
      // instead of taking 250px of a 375px viewport.
      width: { xs: "100%", sm: 250 },
      flexShrink: 0,
      height: { xs: "auto", sm: "100%" },
      p: SPACING.md,
      borderRight: { xs: "none", sm: `1px solid ${theme.vars.palette.divider}` },
      borderBottom: {
        xs: `1px solid ${theme.vars.palette.divider}`,
        sm: "none"
      },
      backgroundColor:
        theme.vars.palette.c_app_header ?? theme.vars.palette.background.default
    })}
  >
    {/* Column of categories on desktop, one scrollable row on a phone. */}
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "row", sm: "column" },
        gap: SPACING.xs,
        minWidth: 0,
        overflowX: { xs: "auto", sm: "visible" }
      }}
    >
      {categories.map((c) => {
        const active = c.id === activeCat;
        return (
          <Box
            key={c.id}
            component="button"
            type="button"
            onClick={() => onCat(c.id)}
            aria-current={active ? "true" : undefined}
            sx={(theme) => ({
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: SPACING.sm,
              width: { xs: "auto", sm: "100%" },
              flexShrink: 0,
              whiteSpace: "nowrap",
              textAlign: "left",
              padding: theme.spacing(SPACING.md, SPACING.lg, SPACING.md, SPACING.xl),
              borderRadius: BORDER_RADIUS.lg,
              border: "none",
              cursor: "pointer",
              backgroundColor: active
                ? theme.vars.palette.action.selected
                : "transparent",
              transition: `background-color ${MOTION.fast}`,
              "&:hover": {
                backgroundColor: active
                  ? theme.vars.palette.action.selected
                  : theme.vars.palette.action.hover
              },
              "&:focus-visible": {
                outline: `2px solid ${theme.vars.palette.primary.main}`,
                outlineOffset: "-2px"
              }
            })}
          >
            {active && (
              <Box
                aria-hidden
                sx={(theme) => ({
                  position: "absolute",
                  left: 4,
                  top: 9,
                  bottom: 9,
                  width: 3,
                  borderRadius: BORDER_RADIUS.sm,
                  backgroundColor: theme.vars.palette.primary.main
                })}
              />
            )}
            <Text
              size="small"
              sx={{ color: active ? "text.primary" : "text.secondary" }}
            >
              {c.label}
            </Text>
            <Box
              sx={(theme) => ({
                marginLeft: { xs: 0, sm: "auto" },
                fontFamily: theme.fontFamily2,
                fontSize: "var(--fontSizeSmaller)",
                fontWeight: 500,
                color: theme.vars.palette.text.secondary,
                backgroundColor: theme.vars.palette.action.selected,
                py: SPACING.micro,
                px: SPACING.md,
                borderRadius: BORDER_RADIUS.sm
              })}
            >
              {c.count}
            </Box>
          </Box>
        );
      })}
    </Box>
  </FlexColumn>
);

export default memo(PackageRail);
