/**
 * Document text extraction — `POST /api/documents/extract-text`.
 *
 * Script and screenplay imports send the file here instead of reading it in
 * the browser: pdfium and mammoth are Node-only and would add megabytes to the
 * web bundle for an action a user takes once (PRD § 7.6, D16). FDX is XML and
 * is parsed in the browser, so this route does not accept it.
 *
 * The route stores nothing. It reads the upload, returns the text, and drops
 * the bytes — including on every error path.
 */

import type { FastifyError, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import { extractPdfText } from "@nodetool-ai/document-nodes/lib/pdf-text";
import { extractRawText } from "@nodetool-ai/agents/host-modules/mammoth";
import {
  ApiErrorCode,
  apiError,
  type ApiErrorResponse
} from "../error-codes.js";

const log = createLogger("nodetool.websocket.documents");

/**
 * The whole file is buffered and parsed in memory, so this caps what one
 * request may hold rather than what a disk could take. A feature-length
 * screenplay exported to PDF or DOCX is a few hundred kilobytes; 25 MB clears
 * even a page-scan PDF while keeping the parse bounded.
 */
export const EXTRACT_TEXT_MAX_BYTES = 25 * 1024 * 1024;

const PDF_CONTENT_TYPE = "application/pdf";
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Wording fixed by PRD § 7.6 — the client renders it verbatim. */
const NO_TEXT_IN_PDF =
  "No text found in this PDF. Paste the script, or upload a DOCX or FDX.";
const ACCEPTED_TYPES = "Upload a PDF or a DOCX.";

/** `{ text, pages? }` — `pages` is the PDF page count, absent for DOCX. */
export interface ExtractTextResponse {
  text: string;
  pages?: number;
}

interface Outcome {
  status: number;
  body: ExtractTextResponse | ApiErrorResponse;
}

/** One file under the `file` field. Nothing else in the form is read. */
const uploadSchema = z.object({
  file: z.instanceof(File)
});

type DocumentKind = "pdf" | "docx";

/**
 * Browsers send `application/octet-stream` for a type they do not recognise
 * (DOCX out of some file pickers, PDF dragged out of an archive), so the
 * filename extension decides when the content type says nothing.
 */
function documentKind(
  contentType: string,
  filename: string
): DocumentKind | null {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === PDF_CONTENT_TYPE) return "pdf";
  if (type === DOCX_CONTENT_TYPE) return "docx";
  if (type !== "" && type !== "application/octet-stream") return null;

  const name = filename.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

function failure(status: number, detail: string): Outcome {
  return { status, body: apiError(ApiErrorCode.INVALID_INPUT, detail) };
}

/** Run the extractor for `kind` and map its outcome onto § 7.6's contract. */
async function extract(kind: DocumentKind, bytes: Buffer): Promise<Outcome> {
  if (kind === "pdf") {
    let result: Awaited<ReturnType<typeof extractPdfText>>;
    try {
      result = await extractPdfText(bytes);
    } catch (err: unknown) {
      log.warn("PDF extraction failed", {
        error: err instanceof Error ? err.message : String(err)
      });
      return failure(422, `This PDF could not be read. ${ACCEPTED_TYPES}`);
    }
    // Zero pages is a file the parser could not open at all. Pages that hold
    // no text is a scan, which § 7.6 answers with its own message.
    if (result.pages === 0) {
      return failure(422, `This PDF could not be read. ${ACCEPTED_TYPES}`);
    }
    if (result.text === "") {
      return failure(422, NO_TEXT_IN_PDF);
    }
    return { status: 200, body: { text: result.text, pages: result.pages } };
  }

  let text: string;
  try {
    text = (await extractRawText(bytes)).trim();
  } catch (err: unknown) {
    log.warn("DOCX extraction failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    return failure(422, `This DOCX could not be read. ${ACCEPTED_TYPES}`);
  }
  if (text === "") {
    return failure(422, `No text found in this DOCX. ${ACCEPTED_TYPES}`);
  }
  return { status: 200, body: { text } };
}

const documentsRoutes: FastifyPluginAsync = async (app) => {
  // Fastify refuses an oversize body while it is still arriving, so nothing
  // past the cap is ever buffered. Its own 413 says only "Request body is too
  // large"; this restates it with the cap the client has to respect.
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      reply
        .status(413)
        .send(
          apiError(
            ApiErrorCode.INVALID_INPUT,
            `File is too large. The limit is ${EXTRACT_TEXT_MAX_BYTES} bytes.`
          )
        );
      return;
    }
    log.error("extract-text failed", { error: err.message });
    reply
      .status(err.statusCode ?? 500)
      .send(apiError(ApiErrorCode.INTERNAL_ERROR, "Text extraction failed"));
  });

  app.post(
    "/api/documents/extract-text",
    { bodyLimit: EXTRACT_TEXT_MAX_BYTES },
    async (req, reply) => {
      reply.header("cache-control", "no-store");

      const contentType = req.headers["content-type"] ?? "";
      if (!contentType.toLowerCase().includes("multipart/form-data")) {
        return reply
          .status(400)
          .send(
            apiError(
              ApiErrorCode.INVALID_INPUT,
              "Expected multipart/form-data with one file field."
            )
          );
      }

      // The app-level content-type parser hands every body over as a Buffer.
      // Re-wrapping it in a Request is how the other upload routes reach the
      // platform's multipart parser.
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      let form: FormData;
      try {
        form = await new Request(
          "http://localhost/api/documents/extract-text",
          {
            method: "POST",
            headers: { "content-type": contentType },
            body: new Uint8Array(body)
          }
        ).formData();
      } catch {
        // An unparseable multipart body is client error, not ours.
        return reply
          .status(400)
          .send(
            apiError(ApiErrorCode.INVALID_INPUT, "Invalid multipart form data.")
          );
      }

      const parsed = uploadSchema.safeParse({ file: form.get("file") });
      if (!parsed.success) {
        return reply
          .status(400)
          .send(
            apiError(
              ApiErrorCode.MISSING_REQUIRED_FIELD,
              "No file provided under the 'file' field."
            )
          );
      }

      const { file } = parsed.data;
      const kind = documentKind(file.type, file.name);
      if (kind === null) {
        return reply
          .status(415)
          .send(
            apiError(
              ApiErrorCode.INVALID_INPUT,
              `Unsupported file type. ${ACCEPTED_TYPES}`
            )
          );
      }

      const outcome = await extract(
        kind,
        Buffer.from(await file.arrayBuffer())
      );
      return reply.status(outcome.status).send(outcome.body);
    }
  );
};

export default documentsRoutes;
