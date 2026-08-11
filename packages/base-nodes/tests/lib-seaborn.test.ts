import { describe, expect, it } from "vitest";
import { ChartRendererLibNode } from "../src/index.js";

// ── lib.seaborn (ChartRenderer) ────────────────────────────────────

let hasCanvas = false;
try {
  require("canvas");
  hasCanvas = true;
} catch {
  /* not installed */
}

describe.skipIf(!hasCanvas)("lib.seaborn.ChartRenderer", () => {
  it("renders a bar chart and returns base64 image data", async () => {
    const result = await new ChartRendererLibNode({
      chart_config: {
        title: "Sales by Month",
        x_label: "Month",
        y_label: "Sales",
        data: {
          series: [{ x: "month", y: "sales", plot_type: "barplot" }]
        }
      },
      width: 400,
      height: 300,
      data: {
        columns: [
          { name: "month", data_type: "string" },
          { name: "sales", data_type: "float" }
        ],
        data: [
          ["Jan", 100],
          ["Feb", 200],
          ["Mar", 150]
        ]
      }
    }).process();
    const output = result.output as { type: string; data: string };
    expect(output.type).toBe("image");
    expect(typeof output.data).toBe("string");
    expect(output.data.length).toBeGreaterThan(100);
    // Verify it's valid base64 by decoding it
    const buf = Buffer.from(output.data, "base64");
    expect(buf.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // 'P'
    expect(buf[2]).toBe(0x4e); // 'N'
    expect(buf[3]).toBe(0x47); // 'G'
  }, 15000);

  it("throws when data has no rows", async () => {
    await expect(
      new ChartRendererLibNode({
        chart_config: {
          title: "Empty",
          data: { series: [{ x: "x", y: "y", plot_type: "line" }] }
        },
        data: {
          columns: [{ name: "x" }, { name: "y" }],
          data: []
        }
      }).process()
    ).rejects.toThrow("Data is required");
  });

  it("renders a line chart", async () => {
    const result = await new ChartRendererLibNode({
      chart_config: {
        title: "Temperature",
        data: {
          series: [{ x: "day", y: "temp", plot_type: "line" }]
        }
      },
      width: 300,
      height: 200,
      data: {
        columns: [
          { name: "day", data_type: "string" },
          { name: "temp", data_type: "float" }
        ],
        data: [
          ["Mon", 20],
          ["Tue", 22],
          ["Wed", 19]
        ]
      }
    }).process();
    const output = result.output as { type: string; data: string };
    expect(output.type).toBe("image");
    expect(output.data.length).toBeGreaterThan(100);
  }, 15000);
});
