/**
 * End-to-end tests for the new document libraries:
 *  - EPUB: epub2-backed extraction (metadata, TOC, full text, per-chapter)
 *  - PPTX: office-text-extractor (full text) + custom per-slide extractor (jszip)
 *  - OCR:  tesseract.js node registration / interface
 *
 * Each block runs the corresponding node directly and through a workflow
 * (registry-resolved) to validate the end-to-end pipeline.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  EpubMetadataLibNode,
  EpubTableOfContentsLibNode,
  EpubExtractTextLibNode,
  EpubExtractChaptersLibNode,
  PptxExtractTextLibNode,
  PptxExtractSlidesLibNode,
  OcrExtractTextLibNode,
  OcrExtractDataLibNode,
  ConstantDocumentNode,
  OutputNode
} from "../../src/index.js";
import { makeRegistry, makeRunner } from "./helpers.js";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";

async function buildEpubBase64(): Promise<string> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">test-id-123</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`
  );
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="test-id-123"/></head>
  <docTitle><text>Test Book</text></docTitle>
  <navMap>
    <navPoint id="ch1" playOrder="1"><navLabel><text>Chapter One</text></navLabel><content src="chapter1.xhtml"/></navPoint>
    <navPoint id="ch2" playOrder="2"><navLabel><text>Chapter Two</text></navLabel><content src="chapter2.xhtml"/></navPoint>
  </navMap>
</ncx>`
  );
  zip.file(
    "OEBPS/chapter1.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head>
<body><h1>Chapter One</h1><p>This is the first chapter content.</p></body></html>`
  );
  zip.file(
    "OEBPS/chapter2.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 2</title></head>
<body><h1>Chapter Two</h1><p>The second chapter has different text.</p></body></html>`
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return buffer.toString("base64");
}

async function buildPptxBase64(): Promise<string> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>`
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Welcome to slide one</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`
  );
  zip.file(
    "ppt/slides/slide2.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Slide two title</a:t></a:r><a:r><a:t>Bullet point</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return buffer.toString("base64");
}

async function runWorkflow(nodes: NodeDescriptor[], edges: Edge[]) {
  return makeRunner(makeRegistry()).run(
    { job_id: `lib-doc-test-${Date.now()}` },
    { nodes, edges }
  );
}

describe("EPUB nodes", () => {
  it("reads metadata directly from base64 data", async () => {
    const data = await buildEpubBase64();
    const node = new EpubMetadataLibNode();
    node.assign({ epub: { data } });
    const result = await node.process();
    const meta = result.output as Record<string, unknown>;
    expect(meta.title).toBe("Test Book");
    expect(meta.creator).toBe("Test Author");
    expect(meta.language).toBe("en");
  });

  it("extracts table of contents", async () => {
    const data = await buildEpubBase64();
    const node = new EpubTableOfContentsLibNode();
    node.assign({ epub: { data } });
    const result = await node.process();
    const toc = result.output as Array<Record<string, unknown>>;
    expect(toc.length).toBe(2);
    expect(toc[0].title).toBe("Chapter One");
    expect(toc[1].title).toBe("Chapter Two");
  });

  it("extracts chapter text concatenated", async () => {
    const data = await buildEpubBase64();
    const node = new EpubExtractTextLibNode();
    node.assign({ epub: { data } });
    const result = await node.process();
    const text = String(result.output);
    expect(text).toContain("first chapter content");
    expect(text).toContain("second chapter has different text");
  });

  it("extracts each chapter as its own item", async () => {
    const data = await buildEpubBase64();
    const node = new EpubExtractChaptersLibNode();
    node.assign({ epub: { data } });
    const result = await node.process();
    const chapters = result.output as Array<Record<string, unknown>>;
    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toBe("Chapter One");
    expect(String(chapters[0].text)).toContain("first chapter content");
    expect(chapters[1].title).toBe("Chapter Two");
  });
});

describe("PPTX nodes", () => {
  it("extracts full text from a PPTX file", async () => {
    const data = await buildPptxBase64();
    const node = new PptxExtractTextLibNode();
    node.assign({ pptx: { data } });
    const result = await node.process();
    const text = String(result.output);
    expect(text).toContain("Welcome to slide one");
    expect(text).toContain("Slide two title");
    expect(text).toContain("Bullet point");
  });

  it("extracts text per slide preserving order", async () => {
    const data = await buildPptxBase64();
    const node = new PptxExtractSlidesLibNode();
    node.assign({ pptx: { data } });
    const result = await node.process();
    const slides = result.output as Array<Record<string, unknown>>;
    expect(slides.length).toBe(2);
    expect(slides[0].slide_number).toBe(1);
    expect(String(slides[0].text)).toContain("Welcome to slide one");
    expect(slides[1].slide_number).toBe(2);
    expect(String(slides[1].text)).toContain("Slide two title");
    expect(String(slides[1].text)).toContain("Bullet point");
  });
});

describe("OCR nodes (registration & interface)", () => {
  // tesseract.js downloads language data on first call which is too heavy
  // for a unit test. We validate node interface and that a missing image
  // raises a clear error so the workflow surface is correct.
  it("registers in the base node registry", () => {
    const registry = makeRegistry();
    expect(registry.has(OcrExtractTextLibNode.nodeType)).toBe(true);
    expect(registry.has(OcrExtractDataLibNode.nodeType)).toBe(true);
  });

  it("throws a clear error when no image data is provided", async () => {
    const node = new OcrExtractTextLibNode();
    node.assign({ image: {} });
    await expect(node.process()).rejects.toThrow("No image data or URI provided");
  });
});

describe("Document workflow integration", () => {
  it("runs the EPUB extract-text node inside a workflow graph", async () => {
    const data = await buildEpubBase64();
    const result = await runWorkflow(
      [
        {
          id: "doc",
          type: ConstantDocumentNode.nodeType,
          properties: {
            value: { type: "document", uri: "", data, metadata: null }
          }
        },
        {
          id: "extract",
          type: EpubExtractTextLibNode.nodeType
        },
        {
          id: "out",
          type: OutputNode.nodeType,
          name: "text"
        }
      ],
      [
        {
          source: "doc",
          sourceHandle: "output",
          target: "extract",
          targetHandle: "epub"
        },
        {
          source: "extract",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    );

    const text = String(result.outputs.text?.[0] ?? "");
    expect(text).toContain("first chapter content");
  });

  it("runs the PPTX extract-text node inside a workflow graph", async () => {
    const data = await buildPptxBase64();
    const result = await runWorkflow(
      [
        {
          id: "doc",
          type: ConstantDocumentNode.nodeType,
          properties: {
            value: { type: "document", uri: "", data, metadata: null }
          }
        },
        {
          id: "extract",
          type: PptxExtractTextLibNode.nodeType
        },
        {
          id: "out",
          type: OutputNode.nodeType,
          name: "text"
        }
      ],
      [
        {
          source: "doc",
          sourceHandle: "output",
          target: "extract",
          targetHandle: "pptx"
        },
        {
          source: "extract",
          sourceHandle: "output",
          target: "out",
          targetHandle: "value"
        }
      ]
    );

    const text = String(result.outputs.text?.[0] ?? "");
    expect(text).toContain("Welcome to slide one");
  });
});
