/** @jsxImportSource @emotion/react */
import React, { Suspense, lazy, memo, useMemo } from "react";
import { Box } from "@mui/material";
import { LoadingSpinner } from "../../ui_primitives";
import type { PlotlyConfig } from "../../../stores/ApiTypes";
import type { ChartData, ChartOptions, ChartType } from "chart.js";

// react-chartjs-2 is split into per-chart entry points, but the umbrella module
// re-exports them all. Lazy-load to keep the chart bundle out of the initial
// JS payload (matches the previous Plotly behaviour).
const LazyChart = lazy(async () => {
  const [{ Chart }, chartjs] = await Promise.all([
    import("react-chartjs-2"),
    import("chart.js")
  ]);
  chartjs.Chart.register(...chartjs.registerables);
  return { default: Chart };
});

interface ChartRendererProps {
  config: PlotlyConfig;
}

type AnyTrace = Record<string, unknown>;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const toNumberArray = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => Number(x)).filter(isFiniteNumber) : [];

const toLabelArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (x == null ? "" : String(x))) : [];

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

/**
 * Map a Plotly trace `type`/`mode` pair onto the closest Chart.js chart type.
 * Anything we don't recognise falls through to "line" so we still render
 * something sensible instead of a blank canvas.
 */
const inferChartType = (trace: AnyTrace): ChartType => {
  const t = String(trace.type ?? "scatter").toLowerCase();
  if (t === "bar") return "bar";
  if (t === "pie") return "pie";
  if (t === "doughnut") return "doughnut";
  if (t === "scatter" || t === "scattergl") {
    const mode = String(trace.mode ?? "lines").toLowerCase();
    if (mode.includes("lines")) return "line";
    return "scatter";
  }
  if (t === "line") return "line";
  if (t === "bubble") return "bubble";
  if (t === "radar") return "radar";
  if (t === "polar" || t === "polararea") return "polarArea";
  return "line";
};

/**
 * Convert a single Plotly trace into a Chart.js dataset. We model:
 *  - bar / line / scatter (with x,y arrays)
 *  - pie / doughnut (with labels,values arrays)
 *  - bubble (x,y,size triples via `marker.size`)
 */
const traceToDataset = (
  trace: AnyTrace,
  index: number,
  chartType: ChartType
): { dataset: Record<string, unknown>; labels?: string[] } => {
  const color = colorAt(index);
  const label = (trace.name as string | undefined) ?? `Series ${index + 1}`;

  if (chartType === "pie" || chartType === "doughnut" || chartType === "polarArea") {
    const labels = toLabelArray(trace.labels);
    const values = toNumberArray(trace.values);
    return {
      labels,
      dataset: {
        label,
        data: values,
        backgroundColor: values.map((_, i) => colorAt(i))
      }
    };
  }

  if (chartType === "bubble") {
    const xs = Array.isArray(trace.x) ? trace.x : [];
    const ys = Array.isArray(trace.y) ? trace.y : [];
    const marker = (trace.marker as AnyTrace | undefined) ?? {};
    const sizes = Array.isArray(marker.size) ? marker.size : [];
    const points = xs.map((x, i) => ({
      x: Number(x),
      y: Number(ys[i]),
      r: Number(sizes[i] ?? 6)
    }));
    return {
      dataset: {
        label,
        data: points,
        backgroundColor: color,
        borderColor: color
      }
    };
  }

  if (chartType === "scatter") {
    const xs = Array.isArray(trace.x) ? trace.x : [];
    const ys = Array.isArray(trace.y) ? trace.y : [];
    const points = xs.map((x, i) => ({ x: Number(x), y: Number(ys[i]) }));
    return {
      dataset: {
        label,
        data: points,
        backgroundColor: color,
        borderColor: color,
        showLine: false
      }
    };
  }

  // bar / line / radar: use parallel labels (x) + values (y)
  const labels = toLabelArray(trace.x);
  const values = toNumberArray(trace.y);
  const dataset: Record<string, unknown> = {
    label,
    data: values,
    backgroundColor: chartType === "bar" ? color : `${color}33`,
    borderColor: color,
    borderWidth: 2
  };
  if (chartType === "line") {
    const mode = String(trace.mode ?? "lines").toLowerCase();
    dataset.tension = 0.2;
    dataset.fill = false;
    dataset.pointRadius = mode.includes("markers") ? 3 : 0;
  }
  return { dataset, labels };
};

/**
 * Build full Chart.js (data, options, type) inputs from the wire-format
 * `plotly_config` payload. Mixed trace types fall back to "line" with a Chart.js
 * `type` set per-dataset so each series can render independently.
 */
const buildChart = (
  config: PlotlyConfig
): { type: ChartType; data: ChartData; options: ChartOptions } => {
  const traces = (config.data as AnyTrace[] | undefined) ?? [];
  const layout = (config.layout ?? {}) as AnyTrace;

  const perTrace = traces.map((trace, i) => {
    const t = inferChartType(trace);
    const { dataset, labels } = traceToDataset(trace, i, t);
    return { t, dataset: { type: t, ...dataset }, labels };
  });

  const baseType: ChartType = perTrace[0]?.t ?? "line";
  const labels = perTrace.find((p) => p.labels && p.labels.length > 0)?.labels ?? [];

  const title = layout.title;
  const titleText =
    typeof title === "string"
      ? title
      : typeof (title as AnyTrace | undefined)?.text === "string"
        ? ((title as AnyTrace).text as string)
        : undefined;

  const xAxis = (layout.xaxis as AnyTrace | undefined) ?? {};
  const yAxis = (layout.yaxis as AnyTrace | undefined) ?? {};
  const xTitle =
    typeof (xAxis.title as AnyTrace | undefined)?.text === "string"
      ? ((xAxis.title as AnyTrace).text as string)
      : typeof xAxis.title === "string"
        ? (xAxis.title as string)
        : undefined;
  const yTitle =
    typeof (yAxis.title as AnyTrace | undefined)?.text === "string"
      ? ((yAxis.title as AnyTrace).text as string)
      : typeof yAxis.title === "string"
        ? (yAxis.title as string)
        : undefined;

  const isCategorical = !["pie", "doughnut", "polarArea", "radar"].includes(baseType);

  const options: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: titleText ? { display: true, text: titleText } : { display: false },
      legend: { display: traces.length > 1 || baseType === "pie" || baseType === "doughnut" }
    },
    ...(isCategorical
      ? {
          scales: {
            x: {
              title: xTitle ? { display: true, text: xTitle } : { display: false }
            },
            y: {
              title: yTitle ? { display: true, text: yTitle } : { display: false }
            }
          }
        }
      : {})
  };

  return {
    type: baseType,
    data: {
      labels,
      datasets: perTrace.map((p) => p.dataset) as ChartData["datasets"]
    },
    options
  };
};

const ChartRenderer: React.FC<ChartRendererProps> = ({ config }) => {
  const built = useMemo(() => {
    if (!config?.data) return null;
    try {
      return buildChart(config);
    } catch {
      return null;
    }
  }, [config]);

  if (!built) {
    return <div>Invalid chart config</div>;
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
