/**
 * PackageRail — the Package Manager's left navigation.
 *
 * A segmented Software / Node Packs switcher on top, then the category list for
 * the active tab (each with a live count and an active accent), and a footer
 * note. Selecting a category drives the right pane. Matches the left rail in the
 * claude.ai/design `PackageManager.dc.html` template.
 */
import { memo } from "react";

import {
  Box,
  FlexColumn,
  FlexRow,
  Text,
  ToggleGroup,
  ToggleOption,
  BORDER_RADIUS,
  MOTION
} from "../ui_primitives";
import type { PMTab, PMCount } from "./usePackageManager";

interface PackageRailProps {
  tab: PMTab;
  onTab: (tab: PMTab) => void;
  categories: PMCount[];
  activeCat: string;
  onCat: (id: string) => void;
}

const PackageRail = ({
  tab,
  onTab,
  categories,
  activeCat,
  onCat
}: PackageRailProps) => (
  <FlexColumn
    gap={0.75}
    sx={(theme) => ({
      width: 250,
      flexShrink: 0,
      height: "100%",
      p: 1.75,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor:
        theme.vars.palette.c_app_header ?? theme.vars.palette.background.default
    })}
  >
    <ToggleGroup
      value={tab}
      exclusive
      segmented
      fullWidth
      onChange={(_, value) => {
        if (value) onTab(value as PMTab);
      }}
    >
      <ToggleOption value="software">Software</ToggleOption>
      <ToggleOption value="packs">Node Packs</ToggleOption>
    </ToggleGroup>

    <Text
      size="small"
      color="secondary"
      weight={600}
      sx={{
        textTransform: "uppercase",
        letterSpacing: "0.09em",
        px: 1.25,
        pt: 2,
        pb: 0.5
      }}
    >
      Browse
    </Text>

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
            gap: 1.25,
            width: "100%",
            textAlign: "left",
            padding: "9px 12px 9px 15px",
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
              marginLeft: "auto",
              fontFamily: theme.fontFamily2,
              fontSize: "var(--fontSizeSmaller)",
              fontWeight: 500,
              color: theme.vars.palette.text.secondary,
              backgroundColor: theme.vars.palette.action.selected,
              padding: "1px 7px",
              borderRadius: BORDER_RADIUS.sm
            })}
          >
            {c.count}
          </Box>
        </Box>
      );
    })}

    <FlexRow sx={{ flex: 1 }} />

    <Text
      size="small"
      color="secondary"
      sx={(theme) => ({
        lineHeight: 1.5,
        p: 1.25,
        borderTop: `1px solid ${theme.vars.palette.divider}`
      })}
    >
      Changes take effect after the NodeTool server restarts.
    </Text>
  </FlexColumn>
);

export default memo(PackageRail);
