/**
 * `@nodetool-ai/sandbox-docx` — the `docx` library, on the host.
 *
 * `docx` builds a document out of class instances (`Paragraph`, `TextRun`,
 * `Table`, …), which the plain-data bridge contract cannot carry across the
 * guest boundary. The guest instead describes the document as a JSON element
 * list — the same shape the deleted `lib.docx.*` builder nodes accumulated —
 * and this module turns that into real docx bytes.
 */

import { toGuestBytes, type GuestBytes } from "../sandbox-bytes.js";
import { optionsOf, requireBytes, unwrapLibrary } from "./limits.js";

type Alignment = "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY";

interface HeadingElement {
  type: "heading";
  text: string;
  level?: number;
}
interface ParagraphElement {
  type: "paragraph";
  text: string;
  alignment?: Alignment;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
}
interface TableElement {
  type: "table";
  rows: unknown[][];
}
interface ImageElement {
  type: "image";
  data: Uint8Array;
  width?: number;
  height?: number;
}
interface PageBreakElement {
  type: "pageBreak";
}
type DocxElement =
  | HeadingElement
  | ParagraphElement
  | TableElement
  | ImageElement
  | PageBreakElement;

/** The `docx.Document` option bag; each property only when the spec set it. */
interface DocxDocumentOptions {
  sections: { children: DocxComponent[] }[];
  title?: string;
  creator?: string;
  subject?: string;
  keywords?: string;
}

interface DocxSpec {
  properties?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
  };
  elements?: unknown[];
}

declare const docxComponentBrand: unique symbol;

/**
 * A node in `docx`'s document tree. The library builds these from option bags
 * and reads them back itself when it packs the file; this module only holds
 * them and passes them along, so they are opaque by contract rather than by
 * omission — a value that did not come from `docx` cannot be substituted.
 */
interface DocxComponent {
  readonly [docxComponentBrand]?: never;
}

interface DocxLike {
  Document: new (options: unknown) => DocxComponent;
  Packer: { toBuffer: (doc: DocxComponent) => Promise<Buffer | Uint8Array> };
  Paragraph: new (options: unknown) => DocxComponent;
  TextRun: new (options: unknown) => DocxComponent;
  ImageRun: new (options: unknown) => DocxComponent;
  Table: new (options: unknown) => DocxComponent;
  TableRow: new (options: unknown) => DocxComponent;
  TableCell: new (options: unknown) => DocxComponent;
  PageBreak: new () => DocxComponent;
  AlignmentType: Record<Alignment, unknown>;
  HeadingLevel: Record<string, unknown>;
  WidthType: Record<string, unknown>;
}

async function loadDocx(where: string): Promise<DocxLike> {
  const mod: unknown = await import("docx");
  return unwrapLibrary<DocxLike>(
    mod,
    where,
    "docx",
    (v) => typeof (v as DocxLike | undefined)?.Document === "function"
  );
}

const HEADING_LEVELS = [
  "HEADING_1",
  "HEADING_2",
  "HEADING_3",
  "HEADING_4",
  "HEADING_5",
  "HEADING_6"
] as const;

function isElement(value: unknown): value is DocxElement {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * Build a `.docx` file from a plain-JSON element list.
 *
 * `spec.elements` accepts `{type: "heading"|"paragraph"|"table"|"image"|"pageBreak", ...}`
 * entries — the same shape a Code node accumulates while composing a document
 * before writing it out.
 */
export async function build(spec: unknown): Promise<GuestBytes> {
  const where = "docx.build";
  const input = optionsOf(spec) as DocxSpec;
  const elements = Array.isArray(input.elements) ? input.elements : [];
  const docx = await loadDocx(where);

  const children = elements.map((raw, index) => {
    if (!isElement(raw)) {
      throw new Error(`${where}: elements[${index}] is missing a "type"`);
    }
    switch (raw.type) {
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(raw.level ?? 1)));
        return new docx.Paragraph({
          children: [new docx.TextRun({ text: String(raw.text ?? "") })],
          heading: docx.HeadingLevel[HEADING_LEVELS[level - 1]]
        });
      }
      case "paragraph": {
        const fontSize = Number(raw.fontSize ?? 12);
        return new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: String(raw.text ?? ""),
              bold: Boolean(raw.bold),
              italics: Boolean(raw.italic),
              size: fontSize * 2 // docx sizes are half-points
            })
          ],
          alignment: docx.AlignmentType[raw.alignment ?? "LEFT"]
        });
      }
      case "table": {
        const rows = Array.isArray(raw.rows) ? raw.rows : [];
        return new docx.Table({
          rows: rows.map(
            (row) =>
              new docx.TableRow({
                children: (Array.isArray(row) ? row : []).map(
                  (cell) =>
                    new docx.TableCell({
                      children: [
                        new docx.Paragraph({
                          children: [new docx.TextRun(String(cell ?? ""))]
                        })
                      ],
                      width: { size: 100, type: docx.WidthType.AUTO }
                    })
                )
              })
          )
        });
      }
      case "image": {
        const data = requireBytes(
          `${where}: elements[${index}]`,
          raw.data,
          "data"
        );
        const width = Number(raw.width ?? 0);
        const height = Number(raw.height ?? 0);
        return new docx.Paragraph({
          children: [
            new docx.ImageRun({
              data: Buffer.from(data),
              transformation: {
                width: width ? width * 96 : 200, // inches to pixels, approx
                height: height ? height * 96 : 200
              },
              type: "buf"
            } as never)
          ]
        });
      }
      case "pageBreak":
        return new docx.Paragraph({ children: [new docx.PageBreak()] });
      default:
        throw new Error(
          `${where}: elements[${index}] has unknown type "${(raw as { type: string }).type}"`
        );
    }
  });

  const properties = input.properties ?? {};
  const documentOptions: DocxDocumentOptions = { sections: [{ children }] };
  if (properties.title) documentOptions.title = properties.title;
  if (properties.author) documentOptions.creator = properties.author;
  if (properties.subject) documentOptions.subject = properties.subject;
  if (properties.keywords) documentOptions.keywords = properties.keywords;
  const document = new docx.Document(documentOptions);

  const buffer = await docx.Packer.toBuffer(document);
  return toGuestBytes(
    buffer instanceof Uint8Array ? buffer : Buffer.from(buffer)
  );
}
