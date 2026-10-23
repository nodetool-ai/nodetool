import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AutoGrid,
  Box,
  Chip,
  EmptyState,
  FlexColumn,
  FlexRow,
  PanelHeader,
  ScrollArea,
  ToolbarIconButton,
  SPACING
} from "../../ui_primitives";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import {
  useGenerationActivityStore,
  type GenerationActivity
} from "../../../stores/GenerationActivityStore";
import GenerationTile from "./GenerationTile";

/** Narrowest tile before the grid drops a column. */
const TILE_MIN_WIDTH = 168;

type Filter = "all" | "generating" | "failed";

const FILTERS: { id: Filter; color?: "error" }[] = [
  { id: "all" },
  { id: "generating" },
  { id: "failed", color: "error" }
];

/** Running first, oldest of those first; then finished, newest first. */
export const orderGenerations = (
  generations: GenerationActivity[]
): GenerationActivity[] => {
  const running = generations
    .filter((generation) => generation.status === "generating")
    .sort((a, b) => a.startedAt - b.startedAt);
  const finished = generations
    .filter((generation) => generation.status !== "generating")
    .sort(
      (a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt)
    );
  return [...running, ...finished];
};

/** One clock for every running tile, ticking only while one runs. */
const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);
  return now;
};

/**
 * Generations view of the bottom panel: every image, video and audio
 * generation in the app, from any editor, guided flow, chat or workflow run.
 * Running ones lead, the rest follow as this browser's recent history.
 */
const GenerationsPanel = memo(function GenerationsPanel() {
  const { t } = useTranslation();
  const generations = useGenerationActivityStore((state) => state.generations);
  const clearFinished = useGenerationActivityStore(
    (state) => state.clearFinished
  );
  const [filter, setFilter] = useState<Filter>("all");

  const { ordered, counts } = useMemo(() => {
    const ordered = orderGenerations(Object.values(generations));
    const counts: Record<Filter, number> = {
      all: ordered.length,
      generating: 0,
      failed: 0
    };
    for (const generation of ordered) {
      if (generation.status === "generating") {
        counts.generating += 1;
      } else if (generation.status === "failed") {
        counts.failed += 1;
      }
    }
    return { ordered, counts };
  }, [generations]);

  // A filter whose last generation left the list falls back to everything.
  const activeFilter = counts[filter] > 0 ? filter : "all";
  const visible =
    activeFilter === "all"
      ? ordered
      : ordered.filter((generation) => generation.status === activeFilter);
  const now = useNow(counts.generating > 0);
  const finishedCount = counts.all - counts.generating;

  return (
    <FlexColumn
      className="generations-panel"
      fullWidth
      fullHeight
      sx={{ overflow: "hidden" }}
    >
      <PanelHeader
        title={t("generations.title")}
        count={counts.all > 0 ? counts.all : undefined}
        actions={
          finishedCount > 0 ? (
            <ToolbarIconButton
              icon={<ClearAllIcon fontSize="inherit" />}
              tooltip={t("generations.clearFinished")}
              ariaLabel={t("generations.clearFinished")}
              onClick={clearFinished}
            />
          ) : undefined
        }
      />
      {counts.all === 0 ? (
        <EmptyState
          size="small"
          icon={<AutoAwesomeOutlinedIcon />}
          title={t("generations.emptyTitle")}
          description={t("generations.emptyDescription")}
        />
      ) : (
        <FlexColumn
          gap={SPACING.sm}
          sx={{
            flex: 1,
            minHeight: 0,
            px: SPACING.lg,
            pt: SPACING.sm
          }}
        >
          <FlexRow
            gap={SPACING.xs}
            role="group"
            aria-label={t("generations.filter.label")}
          >
            {FILTERS.filter(
              (item) => item.id === "all" || counts[item.id] > 0
            ).map((item) => (
              <Chip
                key={item.id}
                compact
                color={item.color}
                active={activeFilter === item.id}
                label={`${t(`generations.filter.${item.id}`)} ${counts[item.id]}`}
                onClick={() => setFilter(item.id)}
              />
            ))}
          </FlexRow>
          <ScrollArea sx={{ flex: 1, minHeight: 0, pb: SPACING.md }}>
            <AutoGrid
              minItemWidth={TILE_MIN_WIDTH}
              gap={SPACING.sm}
              role="list"
              aria-label={t("generations.title")}
            >
              {visible.map((generation) => (
                <Box key={generation.id} role="listitem" sx={{ minWidth: 0 }}>
                  <GenerationTile generation={generation} now={now} />
                </Box>
              ))}
            </AutoGrid>
          </ScrollArea>
        </FlexColumn>
      )}
    </FlexColumn>
  );
});

GenerationsPanel.displayName = "GenerationsPanel";

export default GenerationsPanel;
