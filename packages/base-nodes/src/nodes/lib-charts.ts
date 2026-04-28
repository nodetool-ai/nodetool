import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";

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

    let createCanvas: typeof import("@napi-rs/canvas").createCanvas;
    let napiPath2D: typeof import("@napi-rs/canvas").Path2D;
    let ChartJS: typeof import("chart.js");
    try {
      ({ createCanvas, Path2D: napiPath2D } = await import("@napi-rs/canvas"));
      ChartJS = await import("chart.js");
    } catch (e) {
      throw new Error(
        "Chart rendering requires '@napi-rs/canvas' and 'chart.js'. " +
          "Install them with: npm install @napi-rs/canvas chart.js. " +
          `(${e instanceof Error ? e.message : String(e)})`
      );
    }

    // chart.js reads globalThis.Path2D for path caching. Some peer libraries
    // (e.g. @llamaindex/liteparse, used by ConvertToMarkdown for PDF text
    // extraction) install a no-op Path2D stub so pdf.js can import in Node;
    // chart.js then constructs that empty stub and crashes with
    // "ctx.moveTo is not a function". Restore @napi-rs/canvas's real Path2D
    // for the duration of rendering.
    const previousPath2D = (globalThis as { Path2D?: unknown }).Path2D;
    (globalThis as { Path2D?: unknown }).Path2D = napiPath2D;

    const { Chart, registerables } = ChartJS;
    Chart.register(...registerables);

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
    const cvs = createCanvas(width, height);
    const ctx = cvs.getContext("2d");

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    let buffer: Buffer;
    try {
      // Chart.js accepts any canvas-like context
      const chart = new Chart(ctx as unknown as CanvasRenderingContext2D, {
        ...chartConfig,
        options: {
          ...chartConfig.options,
          responsive: false,
          animation: false
        }
      });
      chart.draw();

      buffer = cvs.toBuffer("image/png");
      chart.destroy();
    } finally {
      if (previousPath2D === undefined) {
        delete (globalThis as { Path2D?: unknown }).Path2D;
      } else {
        (globalThis as { Path2D?: unknown }).Path2D = previousPath2D;
      }
    }

    const data = Buffer.from(buffer).toString("base64");

    return { output: { type: "image", data } };
  }
}

export const LIB_SEABORN_NODES: readonly NodeClass[] = [
  ChartRendererLibNode
] as const;
