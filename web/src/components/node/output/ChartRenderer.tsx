/** @jsxImportSource @emotion/react */
import React, { Suspense, lazy, memo, useMemo } from "react";
import { Box } from "@mui/material";
import { LoadingSpinner, Text } from "../../ui_primitives";
import type { ChartConfig, ChartSeries } from "../../../stores/ApiTypes";
import type { ChartData, ChartOptions, ChartType } from "chart.js";

// react-chartjs-2 + chart.js are lazy-loaded so they stay out of the initial
// JS payload (matches the previous behaviour for the plot bundle).
const LazyChart = lazy(async () => {
  const [{ Chart }, chartjs] = await Promise.all([
    import("react-chartjs-2"),
    import("chart.js")
  ]);
  chartjs.Chart.register(...chartjs.registerables);
  return { default: Chart };
});

interface ChartRendererProps {
  config: ChartConfig;
}

const palette = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac"
];

const colorAt = (i: number) => palette[i % palette.length];

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const toNumberArray = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => Number(x)).filter(isFiniteNumber) : [];

const toLabelArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (x == null ? "" : String(x))) : [];

/** Map a series `type` (seaborn / generic plot kind) onto a Chart.js chart type. */
const inferChartType = (series: ChartSeries): ChartType => {
  const t = String(series.type ?? "bar").toLowerCase();
  if (t === "line" || t === "pointplot") return "line";
  if (t === "scatter") return "scatter";
  if (t === "pie") return "pie";
  if (t === "doughnut") return "doughnut";
  if (t === "bubble") return "bubble";
  if (t === "radar") return "radar";
  if (t === "polar" || t === "polararea") return "polarArea";
  // barplot, histplot, countplot, boxplot, …
  return "bar";
};

/**
 * A series can carry inline data via either x/y arrays or labels/values
 * (depending on producer). Returns null if no inline data is present, in
 * which case the renderer falls back to a metadata preview.
 */
const inlineSeriesData = (
  series: ChartSeries
): { labels: string[]; values: number[] } | null => {
  const x = (series as Record<string, unknown>).x;
  const y = (series as Record<string, unknown>).y;
  if (Array.isArray(x) && Array.isArray(y)) {
    return { labels: toLabelArray(x), values: toNumberArray(y) };
  }
  const labels = (series as Record<string, unknown>).labels;
  const values = (series as Record<string, unknown>).values;
  if (Array.isArray(labels) && Array.isArray(values)) {
    return { labels: toLabelArray(labels), values: toNumberArray(values) };
  }
  return null;
};

const buildChart = (
  config: ChartConfig
): { type: ChartType; data: ChartData; options: ChartOptions } | null => {
  const series = config.data?.series ?? [];
  if (series.length === 0) return null;

  const datasets: Record<string, unknown>[] = [];
  let labels: string[] = [];

  series.forEach((s, i) => {
    const inline = inlineSeriesData(s);
    if (!inline) return;
    if (labels.length === 0) labels = inline.labels;
    const color = colorAt(i);
    const chartType = inferChartType(s);
    const label = (s.label as string | null | undefined) ?? s.y_column ?? `Series ${i + 1}`;
    datasets.push({
      type: chartType,
      label,
      data: inline.values,
      backgroundColor: chartType === "bar" ? color : `${color}33`,
      borderColor: color,
      borderWidth: 2,
      ...(chartType === "line" ? { tension: 0.2, fill: false, pointRadius: 3 } : {})
    });
  });

  if (datasets.length === 0) return null;

  const baseType = (datasets[0].type as ChartType) ?? "bar";
  const isCategorical = !["pie", "doughnut", "polarArea", "radar"].includes(baseType);
  const showLegend = config.legend !== false && (datasets.length > 1 || baseType === "pie" || baseType === "doughnut");

  const options: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: config.title ? { display: true, text: config.title } : { display: false },
      legend: { display: showLegend }
    },
    ...(isCategorical
      ? {
          scales: {
            x: { title: config.x_label ? { display: true, text: config.x_label } : { display: false } },
            y: { title: config.y_label ? { display: true, text: config.y_label } : { display: false } }
          }
        }
      : {})
  };

  return {
    type: baseType,
    data: { labels, datasets: datasets as unknown as ChartData["datasets"] },
    options
  };
};

/**
 * When the chart_config carries no inline data (e.g. ChartGenerator output that
 * only references dataframe columns), show a compact metadata card instead of
 * trying to render an empty chart.
 */
const ChartConfigPreview: React.FC<{ config: ChartConfig }> = ({ config }) => {
  const series = config.data?.series ?? [];
  return (
    <Box sx={{ p: 2, width: "100%", height: "100%", overflow: "auto" }}>
      {config.title && (
        <Text size="big" weight={600}>
          {config.title}
        </Text>
      )}
      <Text size="small" color="secondary">
        {series.length} series · x: {config.x_label || "—"} · y: {config.y_label || "—"}
      </Text>
      {series.map((s, i) => (
        <Box key={i} sx={{ mt: 1 }}>
          <Text size="small">
            {(s.type ?? "bar")}: {s.x_column ?? "?"} → {s.y_column ?? "?"}
            {s.label ? ` (${s.label})` : ""}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

const ChartRenderer: React.FC<ChartRendererProps> = ({ config }) => {
  const built = useMemo(() => {
    if (!config) return null;
    try {
      return buildChart(config);
    } catch {
      return null;
    }
  }, [config]);

  if (!built) {
    return (
      <div className="render-content" style={{ width: "100%", height: "100%" }}>
        <ChartConfigPreview config={config} />
      </div>
    );
  }

  return (
    <div className="render-content" style={{ width: "100%", height: "100%" }}>
      <Suspense
        fallback={
          <Box
            sx={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "action.hover",
              borderRadius: 1
            }}
          >
            <LoadingSpinner size="small" />
          </Box>
        }
      >
        <LazyChart type={built.type} data={built.data} options={built.options} />
      </Suspense>
    </div>
  );
};

export default memo(ChartRenderer);
