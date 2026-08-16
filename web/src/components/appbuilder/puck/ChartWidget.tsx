/** @jsxImportSource @emotion/react */
/**
 * Plots a bound array or dataframe.
 *
 * The app author picks a chart kind, not a Plotly spec: an app binds whatever
 * its workflow emits — a dataframe, an array of records, a list of numbers — and
 * the widget derives the axes from that shape. Plotly itself stays behind
 * `React.lazy` (the `vendor-plotly` chunk), so the app editor never loads it
 * until a chart actually renders.
 */
import React from "react";
import type { Data } from "plotly.js";

import {
  Box,
  Caption,
  FlexColumn,
  LoadingSpinner,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import { AppEvent } from "../types";
import { useWidgetRuntime } from "./useWidgetRuntime";
import { isNumber, isString } from "../../../utils/typePredicates";

const LazyPlotlyChart = React.lazy(
  () => import("../../node/output/PlotlyChart")
);

/** The trace kinds a mini app can pick, and what each maps to in Plotly. */
export const CHART_KINDS = ["line", "bar", "scatter", "pie"] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

const isChartKind = (value: unknown): value is ChartKind =>
  CHART_KINDS.includes(value as ChartKind);

interface ChartTable {
  columns: string[];
  rows: unknown[][];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A number the chart can plot, tolerating the numeric strings JSON carries. */
const numeric = (value: unknown): number | null => {
  if (isNumber(value)) return Number.isFinite(value) ? value : null;
  if (isString(value) && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const fromDataframe = (value: unknown): ChartTable | null => {
  if (!isRecord(value) || value.type !== "dataframe") return null;
  const columns = Array.isArray(value.columns)
    ? value.columns.map((column) =>
        isString(column)
          ? column
          : String((column as { name?: unknown })?.name ?? "")
      )
    : [];
  const rows = Array.isArray(value.data) ? (value.data as unknown[][]) : [];
  if (columns.length === 0 || rows.length === 0) return null;
  return { columns, rows };
};

const fromArray = (value: unknown): ChartTable | null => {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  if (items.length === 0) return null;

  const records = items.filter(isRecord);
  if (records.length === items.length) {
    const columns: string[] = [];
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }
    return {
      columns,
      rows: records.map((record) => columns.map((key) => record[key]))
    };
  }
  return { columns: ["value"], rows: items.map((item) => [item]) };
};

/** A column plots as a series only when every row of it is a number. */
const isNumericColumn = (table: ChartTable, index: number): boolean =>
  table.rows.every((row) => numeric(row[index]) !== null);

/**
 * Turns a table into traces: the first non-numeric column is the category axis
 * (falling back to the row number), every numeric column becomes a series.
 */
export const chartTraces = (value: unknown, kind: ChartKind): Data[] => {
  const table = fromDataframe(value) ?? fromArray(value);
  if (!table) return [];

  const numericColumns = table.columns
    .map((_, index) => index)
    .filter((index) => isNumericColumn(table, index));
  if (numericColumns.length === 0) return [];

  const labelIndex = table.columns.findIndex(
    (_, index) => !numericColumns.includes(index)
  );
  const labels =
    labelIndex >= 0
      ? table.rows.map((row) => String(row[labelIndex] ?? ""))
      : table.rows.map((_, index) => String(index + 1));

  if (kind === "pie") {
    const index = numericColumns[0];
    return [
      {
        type: "pie",
        labels,
        values: table.rows.map((row) => numeric(row[index]) ?? 0)
      }
    ];
  }

  return numericColumns.map((index): Data => {
    const name = table.columns[index];
    const y = table.rows.map((row) => numeric(row[index]));
    if (kind === "bar") return { type: "bar", name, x: labels, y };
    return {
      type: "scatter",
      mode: kind === "line" ? "lines+markers" : "markers",
      name,
      x: labels,
      y
    };
  });
};

export interface ChartWidgetProps {
  id: string;
  binding?: string;
  events?: AppEvent[];
  disabled?: boolean;
  label?: string;
  chartKind?: string;
  height?: number;
  placeholder?: string;
}

export const ChartWidget: React.FC<ChartWidgetProps> = (props) => {
  const { value } = useWidgetRuntime({
    id: props.id,
    bindingMode: "read",
    binding: props.binding,
    events: props.events
  });
  const kind = isChartKind(props.chartKind) ? props.chartKind : "line";
  const height = props.height ?? 320;
  const traces = React.useMemo(() => chartTraces(value, kind), [value, kind]);

  const layout = React.useMemo(
    () => ({
      autosize: true,
      margin: { t: 24, r: 16, b: 40, l: 48 },
      showlegend: traces.length > 1,
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent"
    }),
    [traces.length]
  );

  if (traces.length === 0) {
    return (
      <Caption color="secondary">
        {props.placeholder ?? "Nothing to plot yet"}
      </Caption>
    );
  }

  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      {props.label ? <Caption color="secondary">{props.label}</Caption> : null}
      <Box sx={{ width: "100%", height, borderRadius: BORDER_RADIUS.md }}>
        <React.Suspense
          fallback={<LoadingSpinner size="small" text="Loading chart" />}
        >
          <LazyPlotlyChart
            data={traces}
            layout={layout}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%", height: "100%" }}
          />
        </React.Suspense>
      </Box>
    </FlexColumn>
  );
};
