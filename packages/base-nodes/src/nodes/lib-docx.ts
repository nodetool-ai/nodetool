import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  PageBreak,
  AlignmentType,
  WidthType
} from "docx";
import mammoth from "mammoth";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Document state: an array of element descriptors that gets built up incrementally.
// SaveDocument renders them into an actual .docx file.
type ElementDescriptor =
  | {
      type: "paragraph";
      text: string;
      alignment: string;
      bold: boolean;
      italic: boolean;
      font_size: number;
    }
  | { type: "heading"; text: string; level: number }
  | { type: "image"; image_data: Buffer; width: number; height: number }
  | { type: "table"; data: string[][] }
  | { type: "page_break" };

type DocState = {
  elements: ElementDescriptor[];
  properties?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
  };
};

function getDocState(input: unknown): DocState {
  if (input && typeof input === "object" && "elements" in input) {
    return input as DocState;
  }
  return { elements: [] };
}

function expandUser(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function formatDate(template: string): string {
  const now = new Date();
  return template
    .replace(/%Y/g, String(now.getFullYear()))
    .replace(/%m/g, String(now.getMonth() + 1).padStart(2, "0"))
    .replace(/%d/g, String(now.getDate()).padStart(2, "0"))
    .replace(/%H/g, String(now.getHours()).padStart(2, "0"))
    .replace(/%M/g, String(now.getMinutes()).padStart(2, "0"))
    .replace(/%S/g, String(now.getSeconds()).padStart(2, "0"));
}

const ALIGNMENT_MAP: Record<
  string,
  (typeof AlignmentType)[keyof typeof AlignmentType]
> = {
  LEFT: AlignmentType.LEFT,
  CENTER: AlignmentType.CENTER,
  RIGHT: AlignmentType.RIGHT,
  JUSTIFY: AlignmentType.JUSTIFIED
};

const HEADING_MAP: Record<
  number,
  (typeof HeadingLevel)[keyof typeof HeadingLevel]
> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6
};

export class CreateDocumentLibNode extends BaseNode {
  static readonly nodeType = "lib.docx.CreateDocument";
  static readonly title = "Create Document";
  static readonly description =
    "Creates a new Word document\n    document, docx, file, create";
  static readonly metadataOutputTypes = {
    output: "document"
  };

  async process(): Promise<Record<string, unknown>> {
    return { output: { elements: [], properties: {} } as DocState };
  }
}

export class LoadWordDocumentLibNode extends BaseNode {
  static readonly nodeType = "lib.docx.LoadWordDocument";
  static readonly title = "Load Word Document";
  static readonly description =
    "Loads a Word document from disk\n    document, docx, file, load, input";
  static readonly metadataOutputTypes = {
    output: "document"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the document to load"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const filePath = String(this.path ?? "");
    if (!filePath.trim()) throw new Error("path cannot be empty");
    const expanded = expandUser(filePath);
    const result = await mammoth.extractRawText({ path: expanded });
    return { output: result.value };
  }
}

export class AddHeadingLibNode extends BaseNode {
  static readonly nodeType = "lib.docx.AddHeading";
  static readonly title = "Add Heading";
  static readonly description =
    "Adds a heading to the document\n    document, docx, heading, format";
  static readonly metadataOutputTypes = {
    output: "document"
  };

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "The document to add the heading to"
  })
  declare document: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The heading text"
  })
  declare text: any;

  @prop({
    type: "int",
    default: 1,
    title: "Level",
    description: "Heading level (1-9)",
    min: 1,
    max: 9
  })
  declare level: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = getDocState(this.document);
    const text = String(this.text ?? "");
    const level = Number(this.level ?? 1);
    const newDoc: DocState = {
      ...doc,
      elements: [...doc.elements, { type: "heading", text, level }]
    };
    return { output: newDoc };
  }
}

export class AddParagraphLibNode extends BaseNode {
  static readonly nodeType = "lib.docx.AddParagraph";
  static readonly title = "Add Paragraph";
  static readonly description =
    "Adds a paragraph of text to the document\n    document, docx, text, format";
  static readonly metadataOutputTypes = {
    output: "document"
  };

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "The document to add the paragraph to"
  })
  declare document: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The paragraph text"
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "LEFT",
    title: "Alignment",
    description: "Text alignment",
    values: ["LEFT", "CENTER", "RIGHT", "JUSTIFY"]
  })
  declare alignment: any;

  @prop({
    type: "bool",
    default: false,
    title: "Bold",
    description: "Make text bold"
  })
  declare bold: any;

  @prop({
    type: "bool",
    default: false,
    title: "Italic",
    description: "Make text italic"
  })
  declare italic: any;

  @prop({
    type: "int",
    default: 12,
    title: "Font Size",
    description: "Font size in points"
  })
  declare font_size: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = getDocState(this.document);
    const text = String(this.text ?? "");
    const alignment = String(this.alignment ?? "LEFT");
    const bold = Boolean(this.bold ?? false);
    const italic = Boolean(this.italic ?? false);
    const fontSize = Number(this.font_size ?? 12);
    const newDoc: DocState = {
      ...doc,
      elements: [
        ...doc.elements,
        {
          type: "paragraph",
          text,
          alignment,
          bold,
          italic,
          font_size: fontSize
        }
      ]
    };
    return { output: newDoc };
  }
}

export class AddTableLibNode extends BaseNode {
  static readonly nodeType = "lib.docx.AddTable";
  static readonly title = "Add Table";
  static readonly description =
    "Adds a table to the document\n    document, docx, table, format";
  static readonly metadataOutputTypes = {
    output: "document"
  };

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "The document to add the table to"
  })
  declare document: any;

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
    description: "The data to add to the table"
  })
  declare data: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = getDocState(this.document);
    const dataInput = this.data ?? {};
    // Accept DataframeRef-like { data: string[][], columns: string[] } or { rows: Row[] }
    let tableData: string[][] = [];
    if (dataInput && typeof dataInput === "object") {
      const d = dataInput as {
        data?: unknown[][];
        columns?: string[];
        rows?: Record<string, unknown>[];
      };
      if (Array.isArray(d.data)) {
        tableData = d.data.map((row) => row.map((cell) => String(cell ?? "")));
      } else if (Array.isArray(d.rows)) {
        for (const row of d.rows) {
          tableData.push(Object.values(row).map((v) => String(v ?? "")));
        }
      }
    }
    const newDoc: DocState = {
      ...doc,
      elements: [...doc.elements, { type: "table", data: tableData }]
    };
    return { output: newDoc };
  }
}

export class AddImageLibNode extends BaseNode {
  static readonly nodeType = "lib.docx.AddImage";
  static readonly title = "Add Image";
  static readonly description =
    "Adds an image to the document\n    document, docx, image, format";
  static readonly metadataOutputTypes = {
    output: "document"
  };

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "The document to add the image to"
  })
  declare document: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to add"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0,
    title: "Width",
    description: "Image width in inches"
  })
  declare width: any;

  @prop({
    type: "float",
    default: 0,
    title: "Height",
    description: "Image height in inches"
  })
  declare height: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = getDocState(this.document);
    const imageInput = this.image ?? {};
    const width = Number(this.width ?? 0);
    const height = Number(this.height ?? 0);

    // Read image data from path or uri
    let imageData: Buffer;
    if (typeof imageInput === "string") {
      imageData = readFileSync(expandUser(imageInput));
    } else if (imageInput && typeof imageInput === "object") {
      const img = imageInput as {
        uri?: string;
        path?: string;
        data?: Buffer | Uint8Array | string;
      };
      if (img.data) {
        imageData = Buffer.isBuffer(img.data)
          ? img.data
          : Buffer.from(img.data as Uint8Array);
      } else {
        const imgPath = img.uri?.replace("file://", "") ?? img.path ?? "";
        if (!imgPath) throw new Error("Image path is not set");
        imageData = readFileSync(expandUser(imgPath));
      }
    } else {
      throw new Error("Invalid image input");
    }

    const newDoc: DocState = {
      ...doc,
      elements: [
        ...doc.elements,
        { type: "image", image_data: imageData, width, height }
      ]
    };
    return { output: newDoc };
  }
}

export class AddPageBreakLibNode extends BaseNode {
  static readonly nodeType = "lib.docx.AddPageBreak";
  static readonly title = "Add Page Break";
  static readonly description =
    "Adds a page break to the document\n    document, docx, format, layout";
  static readonly metadataOutputTypes = {
    output: "document"
  };

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "The document to add the page break to"
  })
  declare document: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = getDocState(this.document);
    const newDoc: DocState = {
      ...doc,
      elements: [...doc.elements, { type: "page_break" }]
    };
    return { output: newDoc };
  }
}

export class SetDocumentPropertiesLibNode extends BaseNode {
  static readonly nodeType = "lib.docx.SetDocumentProperties";
  static readonly title = "Set Document Properties";
  static readonly description =
    "Sets document metadata properties\n    document, docx, metadata, properties";
  static readonly metadataOutputTypes = {
    output: "document"
  };

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "The document to modify"
  })
  declare document: any;

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Document title"
  })
  declare title: any;

  @prop({
    type: "str",
    default: "",
    title: "Author",
    description: "Document author"
  })
  declare author: any;

  @prop({
    type: "str",
    default: "",
    title: "Subject",
    description: "Document subject"
  })
  declare subject: any;

  @prop({
    type: "str",
    default: "",
    title: "Keywords",
    description: "Document keywords"
  })
  declare keywords: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = getDocState(this.document);
    const title = String(this.title ?? "");
    const author = String(this.author ?? "");
    const subject = String(this.subject ?? "");
    const keywords = String(this.keywords ?? "");

    const newDoc: DocState = {
      ...doc,
      properties: {
        ...(doc.properties ?? {}),
        ...(title ? { title } : {}),
        ...(author ? { author } : {}),
        ...(subject ? { subject } : {}),
        ...(keywords ? { keywords } : {})
      }
    };
    return { output: newDoc };
  }
}

export class SaveDocumentLibNode extends BaseNode {
  static readonly nodeType = "lib.docx.SaveDocument";
  static readonly title = "Save Document";
  static readonly description =
    "Writes the document to a file\n    document, docx, file, save, output";

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "The document to write"
  })
  declare document: any;

  @prop({
    type: "file_path",
    default: {
      type: "file_path",
      path: ""
    },
    title: "Path",
    description: "The folder to write the document to."
  })
  declare path: any;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description:
      "\n        The filename to write the document to.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare filename: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = getDocState(this.document);
    const pathInput = this.path;
    const folderPath =
      typeof pathInput === "string"
        ? pathInput
        : ((pathInput as { path?: string })?.path ?? "");
    if (!folderPath) throw new Error("Path is not set");

    const filenameTemplate = String(this.filename ?? "");
    const filename = formatDate(filenameTemplate);
    const fullPath = expandUser(path.join(folderPath, filename));

    // Build document elements
    const children = doc.elements.map((el) => {
      switch (el.type) {
        case "heading":
          return new Paragraph({
            children: [new TextRun({ text: el.text })],
            heading: HEADING_MAP[el.level] ?? HeadingLevel.HEADING_1
          });
        case "paragraph":
          return new Paragraph({
            children: [
              new TextRun({
                text: el.text,
                bold: el.bold,
                italics: el.italic,
                size: el.font_size * 2 // docx uses half-points
              })
            ],
            alignment: ALIGNMENT_MAP[el.alignment] ?? AlignmentType.LEFT
          });
        case "image": {
          const imgRunOpts: ConstructorParameters<typeof ImageRun>[0] = {
            data: el.image_data,
            transformation: {
              width: el.width ? el.width * 96 : 200, // inches to pixels (approx)
              height: el.height ? el.height * 96 : 200
            },
            type: "buf" as never
          };
          return new Paragraph({
            children: [new ImageRun(imgRunOpts)]
          });
        }
        case "table":
          return new Table({
            rows: el.data.map(
              (rowData) =>
                new TableRow({
                  children: rowData.map(
                    (cellText) =>
                      new TableCell({
                        children: [
                          new Paragraph({ children: [new TextRun(cellText)] })
                        ],
                        width: { size: 100, type: WidthType.AUTO }
                      })
                  )
                })
            )
          });
        case "page_break":
          return new Paragraph({
            children: [new PageBreak()]
          });
      }
    });

    const docObj = new Document({
      ...(doc.properties?.title ? { title: doc.properties.title } : {}),
      ...(doc.properties?.author ? { creator: doc.properties.author } : {}),
      ...(doc.properties?.subject ? { subject: doc.properties.subject } : {}),
      ...(doc.properties?.keywords
        ? { keywords: doc.properties.keywords }
        : {}),
      sections: [{ children }]
    });

    const buffer = await Packer.toBuffer(docObj);
    writeFileSync(fullPath, buffer);
    return { output: fullPath };
  }
}

export const LIB_DOCX_NODES = [
  CreateDocumentLibNode,
  LoadWordDocumentLibNode,
  AddHeadingLibNode,
  AddParagraphLibNode,
  AddTableLibNode,
  AddImageLibNode,
  AddPageBreakLibNode,
  SetDocumentPropertiesLibNode,
  SaveDocumentLibNode
];
