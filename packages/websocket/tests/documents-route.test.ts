/**
 * Integration tests for `POST /api/documents/extract-text` (PRD § 7.6).
 *
 * Runs an in-process Fastify instance with only this route registered, plus
 * the same raw-buffer content-type parser the server installs. Real pdfium and
 * real mammoth run — no DB, no network.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- documents
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

import documentsRoutes, {
  EXTRACT_TEXT_MAX_BYTES
} from "../src/routes/documents.js";
import {
  docx,
  multipartBody,
  scannedPdf,
  textPdf
} from "./document-fixtures.js";

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false, bodyLimit: 100 * 1024 * 1024 });
  // Mirrors server.ts: every body arrives as a Buffer.
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  await app.register(documentsRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function post(
  file: {
    name: string;
    type: string;
    bytes: Buffer;
  } | null
) {
  const { body, contentType } = multipartBody(file);
  return app.inject({
    method: "POST",
    url: "/api/documents/extract-text",
    headers: { "content-type": contentType },
    payload: body
  });
}

describe("POST /api/documents/extract-text", () => {
  it("returns the text and the page count of a PDF with a text layer", async () => {
    const res = await post({
      name: "script.pdf",
      type: "application/pdf",
      bytes: textPdf(["INT. KITCHEN - DAY", "She pours the coffee."])
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.text).toContain("INT. KITCHEN - DAY");
    expect(body.text).toContain("She pours the coffee.");
    expect(body.pages).toBe(1);
  });

  it("returns the text of a DOCX", async () => {
    const res = await post({
      name: "script.docx",
      type: DOCX_TYPE,
      bytes: docx(["EXT. ROOFTOP - NIGHT", "The city hums below."])
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.text).toContain("EXT. ROOFTOP - NIGHT");
    expect(body.text).toContain("The city hums below.");
    // Page count is a PDF notion; a DOCX has none.
    expect(body.pages).toBeUndefined();
  });

  it("refuses a scanned PDF with the § 7.6 message and no text", async () => {
    const res = await post({
      name: "scan.pdf",
      type: "application/pdf",
      bytes: scannedPdf()
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.detail).toBe(
      "No text found in this PDF. Paste the script, or upload a DOCX or FDX."
    );
    expect(body.text).toBeUndefined();
  });

  it("refuses an unsupported type and names the accepted ones", async () => {
    const res = await post({
      name: "script.fdx",
      type: "application/xml",
      bytes: Buffer.from("<FinalDraft/>", "utf8")
    });

    expect(res.statusCode).toBe(415);
    expect(res.json().detail).toBe(
      "Unsupported file type. Upload a PDF or a DOCX."
    );
  });

  it("refuses a body over the cap and states the cap", async () => {
    const { body, contentType } = multipartBody({
      name: "huge.pdf",
      type: "application/pdf",
      bytes: Buffer.alloc(EXTRACT_TEXT_MAX_BYTES + 1)
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/documents/extract-text",
      headers: { "content-type": contentType },
      payload: body
    });

    expect(res.statusCode).toBe(413);
    expect(res.json().detail).toBe(
      `File is too large. The limit is ${EXTRACT_TEXT_MAX_BYTES} bytes.`
    );
  });

  it("falls back to the filename when the browser sends octet-stream", async () => {
    const res = await post({
      name: "script.docx",
      type: "application/octet-stream",
      bytes: docx(["FADE IN:"])
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().text).toBe("FADE IN:");
  });

  it("refuses a PDF it cannot parse", async () => {
    const res = await post({
      name: "broken.pdf",
      type: "application/pdf",
      bytes: Buffer.from("not a pdf at all", "utf8")
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().detail).toBe(
      "This PDF could not be read. Upload a PDF or a DOCX."
    );
  });

  it("refuses a request with no file part", async () => {
    const res = await post(null);

    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toBe("No file provided under the 'file' field.");
  });

  it("imports nothing that could write: no storage, models, or fs", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/routes/documents.ts", import.meta.url)),
      "utf8"
    );
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier).not.toMatch(
        /^(node:fs|@nodetool-ai\/(storage|models|vectorstore))/
      );
    }
  });
});
