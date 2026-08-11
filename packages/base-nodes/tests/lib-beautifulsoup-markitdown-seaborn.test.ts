import { describe, expect, it } from "vitest";
import {
  ConvertToMarkdownLibNode,
  ChartRendererLibNode
} from "../src/index.js";

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createSimplePdf(text: string): Buffer {
  const stream = [
    "BT",
    "/F1 24 Tf",
    "72 100 Td",
    `(${escapePdfText(text)}) Tj`,
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const startXref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}

// ── lib.convert ─────────────────────────────────────────────────

describe("lib.convert.ConvertToMarkdown", () => {
  it("converts HTML data to markdown", async () => {
    const result = await new ConvertToMarkdownLibNode({
      document: {
        uri: "",
        data: "<h1>Hello</h1><p>World with <strong>bold</strong> text</p>"
      }
    }).process();
    const output = result.output as string;
    expect(output).toContain("Hello");
    expect(output).toContain("**bold**");
  });

  it("converts HTML string input", async () => {
    const result = await new ConvertToMarkdownLibNode({
      html: "<p>Simple <em>test</em></p>"
    }).process();
    expect(result.output).toContain("test");
  });

  it("converts raw HTML bytes from a number array", async () => {
    const bytes = Array.from(Buffer.from("<h1>Hello</h1><p>From bytes</p>"));
    const result = await new ConvertToMarkdownLibNode({ bytes }).process();
    const output = result.output as string;
    expect(output).toContain("Hello");
    expect(output).toContain("From bytes");
  });

  it("converts raw HTML bytes from a JSON-serialized Buffer", async () => {
    const bytes = {
      type: "Buffer",
      data: Array.from(Buffer.from("<p>Buffer payload</p>"))
    };
    const result = await new ConvertToMarkdownLibNode({ bytes }).process();
    expect(result.output).toContain("Buffer payload");
  });

  it("converts raw HTML bytes from a numeric-key object", async () => {
    const encoded = Buffer.from(
      `<p>Numeric object payload ${"x".repeat(50_000)}</p>`
    );
    const bytes = Object.fromEntries(
      Array.from(encoded, (value, index) => [String(index), value] as const)
    );
    const result = await new ConvertToMarkdownLibNode({ bytes }).process();
    expect(result.output).toContain("Numeric object payload");
  });

  it("converts raw PDF bytes", async () => {
    const bytes = createSimplePdf("Hello PDF");
    const result = await new ConvertToMarkdownLibNode({ bytes }).process();
    expect(result.output).toContain("Hello PDF");
  });

  it("throws when no input is provided", async () => {
    await expect(
      new ConvertToMarkdownLibNode({}).process()
    ).rejects.toThrow("Provide a document, bytes, or HTML input");
  });
});

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
