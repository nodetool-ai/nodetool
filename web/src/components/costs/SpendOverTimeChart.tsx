/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, FlexRow, FlexColumn, Text, MOTION, BORDER_RADIUS } from "../ui_primitives";
import {
  providerColor,
  providerLabel,
  formatMoney,
  formatAxisDate,
  type DayPoint
} from "./costsData";
import type { ProviderView } from "./costsView";

const PLOT_HEIGHT = 240;
const X_AXIS_HEIGHT = 22;
const Y_LABEL_WIDTH = 52;

export interface SpendOverTimeChartProps {
  days: DayPoint[];
  /** Providers shown in the legend (in order). */
  providers: ProviderView[];
  /** Provider ids bottom-to-top within each stacked bar. */
  stackOrder: string[];
  /** Providers currently enabled (legend + stacks); defaults to all. */
  activeProviders?: Set<string>;
  rangeLabel: string;
}

const SpendOverTimeChartInternal: React.FC<SpendOverTimeChartProps> = ({
  days,
  providers,
  stackOrder,
  activeProviders,
  rangeLabel
}) => {
  const theme = useTheme();
  const [hovered, setHovered] = useState<number | null>(null);

  const colorOf = useCallback(
    (id: string) =>
      providers.find((p) => p.id === id)?.color ?? providerColor(id),
    [providers]
  );

  const isActive = useCallback(
    (id: string) => !activeProviders || activeProviders.has(id),
    [activeProviders]
  );

  const activeStackIds = useMemo(
    () => stackOrder.filter(isActive),
    [stackOrder, isActive]
  );

  const { axisMax, ticks, legendTotals } = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of providers) totals[p.id] = 0;
    let maxStack = 0;
    for (const d of days) {
      let stack = 0;
      for (const id of stackOrder) {
        if (!isActive(id)) continue;
        const v = d.values[id] ?? 0;
        totals[id] = (totals[id] ?? 0) + v;
        stack += v;
      }
      maxStack = Math.max(maxStack, stack);
    }
    const max = maxStack > 0 ? maxStack * 1.18 : 1;
    return {
      axisMax: max,
      ticks: [1, 0.75, 0.5, 0.25, 0].map((f) => f * max),
      legendTotals: totals
    };
  }, [days, providers, stackOrder, isActive]);

  return (
    <Box
      sx={{
        backgroundColor: theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: BORDER_RADIUS.xl,
        padding: theme.spacing(6, 6, 4)
      }}
    >
      {/* header: title + legend */}
      <FlexRow
        justify="space-between"
        align="center"
        wrap
        sx={{ rowGap: 1, mb: 2.5 }}
      >
        <FlexRow gap={1} align="baseline">
          <Text size="big" weight={600}>
            Spend over time
          </Text>
          <Text size="small" color="secondary">
            {rangeLabel}
          </Text>
        </FlexRow>
        <FlexRow gap={2} wrap align="center" sx={{ rowGap: 0.5 }}>
          {providers.map((p) => (
            <FlexRow
              key={p.id}
              gap={1}
              align="center"
              sx={{ opacity: isActive(p.id) ? 1 : 0.35 }}
            >
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: BORDER_RADIUS.sm,
                  backgroundColor: p.color,
                  flexShrink: 0
                }}
              />
              <Text
                size="small"
                sx={{ color: theme.vars.palette.text.primary }}
              >
                {p.label}
              </Text>
              <Text size="small" family="secondary" color="secondary">
                {formatMoney(legendTotals[p.id] ?? 0)}
              </Text>
            </FlexRow>
          ))}
        </FlexRow>
      </FlexRow>

      {/* plot */}
      <Box sx={{ position: "relative", height: PLOT_HEIGHT + X_AXIS_HEIGHT }}>
        {/* gridlines + y labels */}
        {ticks.map((value, i) => {
          const top = (1 - value / axisMax) * PLOT_HEIGHT;
          return (
            <Box
              key={i}
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                top,
                height: 0,
                borderTop: `1px solid ${theme.vars.palette.divider}`,
                opacity: i === ticks.length - 1 ? 0.9 : 0.5
              }}
            >
              <Text
                size="smaller"
                family="secondary"
                sx={{
                  position: "absolute",
                  top: -8,
                  left: 0,
                  width: Y_LABEL_WIDTH - 10,
                  color: theme.vars.palette.text.disabled
                }}
              >
                {formatMoney(value)}
              </Text>
            </Box>
          );
        })}

        {/* bars */}
        <FlexRow
          align="flex-end"
          gap={1}
          sx={{
            position: "absolute",
            left: Y_LABEL_WIDTH,
            right: 0,
            top: 0,
            height: PLOT_HEIGHT
          }}
        >
          {days.map((day, index) => {
            const visibleTotal = stackOrder.reduce(
              (sum, id) => (isActive(id) ? sum + (day.values[id] ?? 0) : sum),
              0
            );
            const barPx = (visibleTotal / axisMax) * PLOT_HEIGHT;
            const isHovered = hovered === index;
            return (
              <Box
                key={index}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered((h) => (h === index ? null : h))}
                sx={{
                  position: "relative",
                  flex: "1 1 0",
                  maxWidth: 34,
                  height: PLOT_HEIGHT,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  cursor: "default"
                }}
              >
                <Box
                  sx={{
                    height: Math.max(barPx, visibleTotal > 0 ? 2 : 0),
                    borderRadius: BORDER_RADIUS.md + " " + BORDER_RADIUS.md + " 0 0",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column-reverse",
                    transition: `filter ${MOTION.fast}`,
                    filter: isHovered ? "brightness(1.12)" : "none",
                    outline: isHovered
                      ? `1px solid ${theme.vars.palette.divider}`
                      : "none"
                  }}
                >
                  {activeStackIds.map((id) => {
                    const segPx =
                      ((day.values[id] ?? 0) / axisMax) * PLOT_HEIGHT;
                    if (segPx < 0.4) return null;
                    return (
                      <Box
                        key={id}
                        sx={{
                          height: segPx,
                          flexShrink: 0,
                          backgroundColor: colorOf(id)
                        }}
                      />
                    );
                  })}
                </Box>

                {isHovered && (
                  <BarTooltip
                    day={day}
                    stackOrder={stackOrder}
                    colorOf={colorOf}
                    isActive={isActive}
                  />
                )}
              </Box>
            );
          })}
        </FlexRow>

        {/* x axis */}
        <FlexRow
          gap={1}
          sx={{
            position: "absolute",
            left: Y_LABEL_WIDTH,
            right: 0,
            top: PLOT_HEIGHT + 4,
            height: X_AXIS_HEIGHT
          }}
        >
          {days.map((day, index) => (
            <Box
              key={index}
              sx={{
                flex: "1 1 0",
                maxWidth: 34,
                textAlign: "center"
              }}
            >
              {index % 2 === 0 && (
                <Text
                  size="smaller"
                  family="secondary"
                  sx={{ color: theme.vars.palette.text.disabled }}
                >
                  {formatAxisDate(day.date)}
                </Text>
              )}
            </Box>
          ))}
        </FlexRow>
      </Box>
    </Box>
  );
};

const BarTooltip: React.FC<{
  day: DayPoint;
  stackOrder: string[];
  colorOf: (id: string) => string;
  isActive: (id: string) => boolean;
}> = ({ day, stackOrder, colorOf, isActive }) => {
  const theme = useTheme();
  const total = stackOrder.reduce(
    (sum, id) => (isActive(id) ? sum + (day.values[id] ?? 0) : sum),
    0
  );
  return (
    <Box
      sx={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5,
        minWidth: 168,
        padding: theme.spacing(2, 3),
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: theme.vars.palette.background.default,
        border: `1px solid ${theme.vars.palette.divider}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        pointerEvents: "none"
      }}
    >
      <Text size="small" weight={600} sx={{ display: "block", mb: 0.75 }}>
        {formatAxisDate(day.date)}
      </Text>
      <FlexColumn gap={0.5}>
        {[...stackOrder]
          .reverse()
          .filter((id) => isActive(id) && (day.values[id] ?? 0) > 0)
          .map((id) => (
            <FlexRow key={id} justify="space-between" align="center" gap={1.5}>
              <FlexRow gap={1} align="center">
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: BORDER_RADIUS.xs,
                    backgroundColor: colorOf(id)
                  }}
                />
                <Text size="smaller" color="secondary">
                  {providerLabel(id)}
                </Text>
              </FlexRow>
              <Text size="smaller" family="secondary">
                {formatMoney(day.values[id] ?? 0)}
              </Text>
            </FlexRow>
          ))}
        <Box
          sx={{
            borderTop: `1px solid ${theme.vars.palette.divider}`,
            mt: 0.5,
            pt: 0.5
          }}
        >
          <FlexRow justify="space-between" align="center">
            <Text size="smaller" weight={600}>
              Total
            </Text>
            <Text size="smaller" weight={600} family="secondary">
              {formatMoney(total)}
            </Text>
          </FlexRow>
        </Box>
      </FlexColumn>
    </Box>
  );
};

export const SpendOverTimeChart = memo(SpendOverTimeChartInternal);
SpendOverTimeChart.displayName = "SpendOverTimeChart";

export default SpendOverTimeChart;
