/**
 * `POST /api/documents/extract-text` when the parsers are not installed.
 *
 * liteparse and mammoth are optional packages the desktop app installs on
 * first use. Without them the route must name the package to install rather
 * than call the file unreadable, so the editor can offer the install.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

import documentsRoutes from "../src/routes/documents.js";
import { docx, multipartBody, textPdf } from "./document-fixtures.js";

vi.mock("@nodetool-ai/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/config")>()),
  importOptionalModule: vi.fn(async (specifier: string) => {
    throw new Error(`Cannot find package '${specifier}'`);
  })
}));

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  await app.register(documentsRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function post(file: { name: string; type: string; bytes: Buffer }) {
  const { body, contentType } = multipartBody(file);
  return app.inject({
    method: "POST",
    url: "/api/documents/extract-text",
    headers: { "content-type": contentType },
    payload: body
  });
}

describe("POST /api/documents/extract-text without the optional parsers", () => {
  it("names the PDF package to install", async () => {
    const res = await post({
      name: "script.pdf",
      type: "application/pdf",
      bytes: textPdf(["INT. KITCHEN - DAY"])
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      code: "MISSING_RUNTIME_PACKAGE",
      runtime_package: "pdf-js"
    });
  });

  it("names the DOCX package to install", async () => {
    const res = await post({
      name: "script.docx",
      type: DOCX_TYPE,
      bytes: docx(["EXT. ROOFTOP - NIGHT"])
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      code: "MISSING_RUNTIME_PACKAGE",
      runtime_package: "office-documents"
    });
  });
});
