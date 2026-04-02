import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

export class ChartRendererLibNode extends BaseNode {
  static readonly nodeType = "lib.charts.ChartRenderer";
  static readonly title = "Chart Renderer";
  static readonly description =
    "Node responsible for rendering chart configurations into image format using seaborn.\n    chart, seaborn, plot, visualization, data";
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "chart_config",
    default: {
      type: "chart_config",
      title: "",
      x_label: "",
      y_label: "",
      legend: true,
      data: {
        type: "chart_data",
        series: [],
        row: null,
        col: null,
        col_wrap: null
      },
      height: null,
      aspect: null,
      x_lim: null,
      y_lim: null,
      x_scale: null,
      y_scale: null,
      legend_position: "auto",
      palette: null,
      hue_order: null,
      hue_norm: null,
      sizes: null,
      size_order: null,
      size_norm: null,
      marginal_kws: null,
      joint_kws: null,
      diag_kind: null,
      corner: false,
      center: null,
      vmin: null,
      vmax: null,
      cmap: null,
      annot: false,
      fmt: ".2g",
      square: false
    },
    title: "Chart Config",
    description: "The chart configuration to render."
  })
  declare chart_config: any;

  @prop({
    type: "int",
    default: 640,
    title: "Width",
    description: "The width of the chart in pixels.",
    min: 0,
    max: 10000
  })
  declare width: any;

  @prop({
    type: "int",
    default: 480,
    title: "Height",
    description: "The height of the chart in pixels.",
    min: 0,
    max: 10000
  })
  declare height: any;

  @prop({
    type: "dataframe",
    default: {
      type: "dataframe",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      columns: null
    },
    title: "Data",
    description: "The data to visualize as a pandas DataFrame."
  })
  declare data: any;

  @prop({
    type: "str",
    default: "#ffffff",
    title: "Background Color",
    description: "Background color of the chart (CSS color string)."
  })
  declare background_color: any;

  @prop({
    type: "bool",
    default: true,
    title: "Despine",
    description: "Whether to remove top and right spines."
  })
  declare despine: any;

  @prop({
    type: "bool",
    default: true,
    title: "Trim Margins",
    description: "Whether to use tight layout for margins."
  })
  declare trim_margins: any;

  async process(): Promise<Record<string, unknown>> {
    const config = (this.chart_config ?? {}) as Record<string, unknown>;
    const width = Number(this.width ?? 640);
    const height = Number(this.height ?? 480);
    const dataRef = (this.data ?? {}) as Record<string, unknown>;

    const columns = (dataRef.columns ?? []) as Array<Record<string, unknown>>;
    const rows = (dataRef.data ?? []) as unknown[][];

    if (!rows.length) {
      throw new Error("Data is required for rendering the chart.");
    }

    const { ChartJSNodeCanvas } = await import("chartjs-node-canvas");

    const configData = (config.data ?? {}) as Record<string, unknown>;
    const series = (configData.series ?? []) as Array<Record<string, unknown>>;

    // Map column names
    const colNames = columns.map((c) => String(c.name ?? c));

    // Determine chart type from first series (default to bar)
    const plotTypeMap: Record<string, string> = {
      scatter: "scatter",
      line: "line",
      barplot: "bar",
      histplot: "bar",
      boxplot: "bar",
      pointplot: "line",
      countplot: "bar"
    };

    const firstSeries = series[0] ?? {};
    const plotType = String(firstSeries.plot_type ?? "barplot").toLowerCase();
    const chartType = plotTypeMap[plotType] ?? "bar";

    // Extract x and y column indices
    const xCol = String(firstSeries.x ?? colNames[0] ?? "");
    const yCol = String(firstSeries.y ?? colNames[1] ?? "");
    const xIdx = colNames.indexOf(xCol);
    const yIdx = colNames.indexOf(yCol);

    const labels =
      xIdx >= 0
        ? rows.map((r) => String(r[xIdx]))
        : rows.map((_, i) => String(i));
    const values = yIdx >= 0 ? rows.map((r) => Number(r[yIdx])) : [];

    const datasets =
      series.length > 0
        ? series.map((s) => {
            const sYCol = String(s.y ?? yCol);
            const sYIdx = colNames.indexOf(sYCol);
            const data =
              sYIdx >= 0 ? rows.map((r) => Number(r[sYIdx])) : values;
            return {
              label: sYCol,
              data,
              backgroundColor: s.color ? String(s.color) : undefined
            };
          })
        : [{ label: yCol, data: values }];

    const chartConfig = {
      type: chartType as "bar" | "line" | "scatter",
      data: { labels, datasets },
      options: {
        responsive: false,
        plugins: {
          title: config.title
            ? { display: true, text: String(config.title) }
            : undefined
        },
        scales: {
          x: config.x_label
            ? { title: { display: true, text: String(config.x_label) } }
            : undefined,
          y: config.y_label
            ? { title: { display: true, text: String(config.y_label) } }
            : undefined
        }
      }
    };

    const backgroundColor = String(this.background_color ?? "#ffffff");
    const canvas = new ChartJSNodeCanvas({
      width,
      height,
      backgroundColour: backgroundColor
    });
    const buffer = await canvas.renderToBuffer(
      chartConfig as Parameters<typeof canvas.renderToBuffer>[0]
    );
    const data = Buffer.from(buffer).toString("base64");

    return { output: { type: "image", data } };
  }
}

export const LIB_SEABORN_NODES: readonly NodeClass[] = [
  ChartRendererLibNode
] as const;
