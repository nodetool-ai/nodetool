/**
 * PackageRail — the Package Manager's left navigation.
 *
 * One list of categories, each with a hint line, a count and an active
 * accent. A list with updates shows the update count instead of its size.
 * Selecting a category drives the right pane.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Caption,
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
}: PackageRailProps) => {
  const { t } = useTranslation();
  return (
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
            <FlexColumn sx={{ minWidth: 0 }}>
              <Text
                size="small"
                sx={{ color: active ? "text.primary" : "text.secondary" }}
              >
                {t(`i18n-next31.packages.category.${c.id}`)}
              </Text>
              <Caption
                color="secondary"
                sx={{ display: { xs: "none", sm: "block" } }}
              >
                {t(`i18n-next31.packages.categoryHint.${c.id}`)}
              </Caption>
            </FlexColumn>
            <Box
              sx={(theme) => ({
                marginLeft: { xs: 0, sm: "auto" },
                flexShrink: 0,
                fontFamily: theme.fontFamily2,
                fontSize: "var(--fontSizeSmaller)",
                fontWeight: 500,
                color:
                  c.updates > 0
                    ? theme.vars.palette.primary.contrastText
                    : theme.vars.palette.text.secondary,
                backgroundColor:
                  c.updates > 0
                    ? theme.vars.palette.primary.main
                    : theme.vars.palette.action.selected,
                py: SPACING.micro,
                px: SPACING.md,
                borderRadius: BORDER_RADIUS.sm
              })}
            >
              {c.updates > 0
                ? t("i18n-next31.packages.updates", { count: c.updates })
                : c.count}
            </Box>
          </Box>
        );
      })}
    </Box>
  </FlexColumn>
  );
}

export default memo(PackageRail);
