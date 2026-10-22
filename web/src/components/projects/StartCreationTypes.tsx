/**
 * The start page's creation-type cards: the primary kinds in a row, and an
 * "Explore all creation types" bar that unfolds the rest below them. Every
 * card routes somewhere (a guided flow, or a blank 3D model), so each is its
 * own tab stop and carries no selection state.
 */

import { memo, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";

import {
  AutoGrid,
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  MOTION,
  PADDING,
  focusRing,
  reducedMotion,
  SHADOW,
  SPACING,
  Text,
  TYPOGRAPHY
} from "../ui_primitives";
import { SetupCardButton } from "../setup/SetupCardButton";

/** Side of the tinted square that holds a card's icon, in px. */
const ICON_TILE_SIZE = 44;
/** Narrowest a primary card gets before the row drops a column, in px. */
const CARD_MIN_WIDTH = 200;
/** The unfolded cards carry a full sentence, so they keep three a row. */
const MORE_CARD_MIN_WIDTH = 300;

/** The class every creation card carries, for the host's shadow and hover. */
export const CREATION_CARD_CLASS = "start-creation-card";

export interface CreationTypeCard {
  id: string;
  title: string;
  description?: string;
  /** Status line under the description while the card's flow starts. */
  meta?: string;
  icon: ReactNode;
  /** A theme colour (`var(--palette-…)`) that tints the icon tile. */
  accent: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface StartCreationTypesProps {
  primary: readonly CreationTypeCard[];
  more: readonly CreationTypeCard[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onSelect: (id: string) => void;
  /** Controls that only matter while the full list is open. */
  moreControls?: ReactNode;
}

const IconTile = ({ icon, accent }: { icon: ReactNode; accent: string }) => (
  <FlexRow
    component="span"
    aria-hidden
    align="center"
    justify="center"
    sx={{
      flexShrink: 0,
      width: ICON_TILE_SIZE,
      height: ICON_TILE_SIZE,
      borderRadius: BORDER_RADIUS.lg,
      color: accent,
      bgcolor: `color-mix(in srgb, ${accent} 14%, transparent)`
    }}
  >
    {icon}
  </FlexRow>
);

const CardRow = ({
  cards,
  onSelect,
  minItemWidth = CARD_MIN_WIDTH
}: {
  cards: readonly CreationTypeCard[];
  onSelect: (id: string) => void;
  minItemWidth?: number;
}) => (
  <AutoGrid
    minItemWidth={minItemWidth}
    fill="fit"
    gap={GAP.comfortable}
    sx={{
      [`& .${CREATION_CARD_CLASS}`]: {
        borderRadius: BORDER_RADIUS.lg,
        boxShadow: (theme) => SHADOW(theme).sm
      }
    }}
  >
    {cards.map((card) => (
      <SetupCardButton
        key={card.id}
        role="navigation"
        className={CREATION_CARD_CLASS}
        disabled={card.disabled}
        disabledReason={card.disabledReason}
        padding={PADDING.comfortable}
        onSelect={() => onSelect(card.id)}
      >
        <FlexRow align="center" gap={GAP.comfortable}>
          <IconTile icon={card.icon} accent={card.accent} />
          <FlexColumn gap={GAP.micro} sx={{ flex: 1, minWidth: 0 }}>
            <Text component="span" sx={TYPOGRAPHY.sans.label}>
              {card.title}
            </Text>
            {card.description ? (
              <Caption component="span" color="secondary">
                {card.description}
              </Caption>
            ) : null}
            {card.meta ? (
              <Caption component="span" color="muted">
                {card.meta}
              </Caption>
            ) : null}
          </FlexColumn>
          <ChevronRightIcon
            aria-hidden
            fontSize="small"
            sx={{ color: "text.secondary", flexShrink: 0 }}
          />
        </FlexRow>
      </SetupCardButton>
    ))}
  </AutoGrid>
);

const StartCreationTypes = ({
  primary,
  more,
  expanded,
  onToggleExpanded,
  onSelect,
  moreControls
}: StartCreationTypesProps) => {
  const { t } = useTranslation();
  const moreRef = useRef<HTMLDivElement>(null);
  // The unfolded cards start below the fold on a laptop screen, where the
  // only new thing in view was the game type control (study-10-I3).
  useEffect(() => {
    if (!expanded) {
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    moreRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth"
    });
  }, [expanded]);
  return (
    <FlexColumn
      role="group"
      aria-label={t("pass3_32.projects.home.guidedFlowsRegion")}
      gap={GAP.comfortable}
    >
      <CardRow cards={primary} onSelect={onSelect} />
      <Box
        component="button"
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? "start-more-creation-types" : undefined}
        onClick={onToggleExpanded}
        sx={(theme) => ({
          appearance: "none",
          font: "inherit",
          textAlign: "left",
          width: "100%",
          cursor: "pointer",
          color: "text.primary",
          px: SPACING.xl,
          py: SPACING.lg,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: BORDER_RADIUS.lg,
          bgcolor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.05)`,
          transition: `${MOTION.border}, ${MOTION.background}`,
          ...reducedMotion({ transition: MOTION.none }),
          "&:hover": {
            borderColor: "primary.main",
            bgcolor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`
          },
          "&:focus-visible": focusRing(theme, 2)
        })}
      >
        <FlexRow align="center" gap={GAP.spacious}>
          <GridViewOutlinedIcon aria-hidden sx={{ color: "primary.main" }} />
          <FlexColumn gap={GAP.micro} sx={{ flex: 1, minWidth: 0 }}>
            <Text component="span" sx={TYPOGRAPHY.sans.label}>
              {t("pass3_32.projects.home.allTypes.title")}
            </Text>
            <Caption component="span" color="secondary">
              {t("pass3_32.projects.home.allTypes.description")}
            </Caption>
          </FlexColumn>
          <ExpandMoreIcon
            aria-hidden
            sx={{
              color: "text.secondary",
              transform: expanded ? "rotate(180deg)" : "rotate(-90deg)",
              transition: MOTION.transform,
              ...reducedMotion({ transition: MOTION.none })
            }}
          />
        </FlexRow>
      </Box>
      {expanded && (
        <FlexColumn
          ref={moreRef}
          id="start-more-creation-types"
          gap={GAP.comfortable}
        >
          {moreControls}
          <CardRow
            cards={more}
            onSelect={onSelect}
            minItemWidth={MORE_CARD_MIN_WIDTH}
          />
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(StartCreationTypes);
