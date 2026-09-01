/**
 * What a project cost, split by what it bought.
 *
 * One stacked bar over the four ledger categories, and a legend that names
 * each figure. Calls no catalog priced are shown as their own `unpriced`
 * segment rather than dropped or summed as zero: a total that silently omits
 * them reads as cheaper than the project was.
 */

import { memo, useMemo } from "react";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexRow,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import { colorForType } from "../../config/data_types";
import type { ProjectDetail } from "./projectStatus";

type ProjectSpend = ProjectDetail["spend"];
type SpendCategory = ProjectSpend["byCategory"][number]["category"];

/**
 * A category is drawn in the colour of the medium it bought, from the same
 * palette the node graph types use — stills fuchsia, clips violet, voice sky.
 * Pipeline is the LLM work around them, so it takes the app's own primary.
 */
const CATEGORY_COLOR: Record<SpendCategory, string> = {
  stills: colorForType("image"),
  clips: colorForType("video"),
  voice: colorForType("audio"),
  pipeline: "var(--palette-primary-main)"
};

/** The colour of what nothing could price. */
const UNPRICED_COLOR = "var(--palette-text-disabled)";

interface Segment {
  key: string;
  color: string;
  /** Share of the bar, 0–1. */
  share: number;
  label: string;
}

const BAR_HEIGHT = 6;

interface ProjectSpendBarProps {
  spend: ProjectSpend;
}

const ProjectSpendBar = ({ spend }: ProjectSpendBarProps) => {
  const segments = useMemo<Segment[]>(() => {
    const priced = spend.byCategory.filter((entry) => entry.usd > 0);
    // Unpriced calls have no dollar width of their own, so they take a fixed
    // slice: the point is that they exist, not how much they were.
    const unpricedShare = spend.unpricedCount > 0 ? 0.08 : 0;
    const total = priced.reduce((sum, entry) => sum + entry.usd, 0);
    const bars: Segment[] = total
      ? priced.map((entry) => ({
          key: entry.category,
          color: CATEGORY_COLOR[entry.category],
          share: (entry.usd / total) * (1 - unpricedShare),
          label: `${entry.category} $${entry.usd.toFixed(2)}`
        }))
      : [];
    if (unpricedShare > 0) {
      const calls = spend.unpricedCount === 1 ? "call" : "calls";
      bars.push({
        key: "unpriced",
        color: UNPRICED_COLOR,
        share: bars.length > 0 ? unpricedShare : 1,
        label: `unpriced ${spend.unpricedCount} ${calls}`
      });
    }
    return bars;
  }, [spend]);

  return (
    <FlexRow
      align="center"
      gap={SPACING.lg}
      sx={{
        p: SPACING.lg,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: BORDER_RADIUS.md
      }}
    >
      <Caption color="muted" sx={{ textTransform: "uppercase" }}>
        Spend
      </Caption>
      <FlexRow
        role="img"
        aria-label={
          segments.length > 0
            ? segments.map((segment) => segment.label).join(", ")
            : "nothing spent yet"
        }
        sx={{
          flex: 1,
          minWidth: 0,
          height: `${BAR_HEIGHT}px`,
          borderRadius: BORDER_RADIUS.xs,
          overflow: "hidden",
          bgcolor: "background.default"
        }}
      >
        {segments.map((segment) => (
          <Box
            key={segment.key}
            sx={{
              width: `${segment.share * 100}%`,
              bgcolor: segment.color
            }}
          />
        ))}
      </FlexRow>
      <FlexRow
        align="center"
        gap={SPACING.lg}
        sx={{ flexWrap: "wrap", ...TYPOGRAPHY.mono.caption }}
      >
        {segments.map((segment) => (
          <FlexRow key={segment.key} align="center" gap={SPACING.sm}>
            <Box
              aria-hidden
              sx={{
                width: `${BAR_HEIGHT}px`,
                height: `${BAR_HEIGHT}px`,
                borderRadius: BORDER_RADIUS.circle,
                bgcolor: segment.color
              }}
            />
            <Box component="span" sx={{ color: "text.secondary" }}>
              {segment.label}
            </Box>
          </FlexRow>
        ))}
        <Box component="span">
          {spend.partial ? "≥" : ""}${spend.totalUsd.toFixed(2)}
        </Box>
      </FlexRow>
    </FlexRow>
  );
};

export default memo(ProjectSpendBar);
