/**
 * PDF tools for extracting text, tables, and converting documents.
 *
 * @deprecated Ported to the `documents` capability module
 * (`../capabilities/documents.ts`). These survive as thin subclasses so
 * existing constructors keep working; there is one implementation behind both.
 */

import { CapabilityTool, ungatedCapabilityRun } from "../capabilities/index.js";
import {
  convertDocument,
  convertMarkdownToPdf,
  convertPdfToMarkdown,
  extractPdfTables,
  extractPdfText
} from "../capabilities/documents.js";

/**
 * @deprecated Ported to the `documents` capability module. Kept as a thin
 * subclass so existing constructors keep working.
 */
export class ExtractPDFTextTool extends CapabilityTool {
  constructor() {
    super(extractPdfText.spec, extractPdfText.impl, ungatedCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `documents` capability module. Kept as a thin
 * subclass so existing constructors keep working.
 */
export class ExtractPDFTablesTool extends CapabilityTool {
  constructor() {
    super(extractPdfTables.spec, extractPdfTables.impl, ungatedCapabilityRun);
  }
}

/**
 * @deprecated Ported to the `documents` capability module. Kept as a thin
 * subclass so existing constructors keep working.
 */
export class ConvertPDFToMarkdownTool extends CapabilityTool {
  constructor() {
    super(
      convertPdfToMarkdown.spec,
      convertPdfToMarkdown.impl,
      ungatedCapabilityRun
    );
  }
}

/**
 * @deprecated Ported to the `documents` capability module. Kept as a thin
 * subclass so existing constructors keep working.
 */
export class ConvertMarkdownToPDFTool extends CapabilityTool {
  constructor() {
    super(
      convertMarkdownToPdf.spec,
      convertMarkdownToPdf.impl,
      ungatedCapabilityRun
    );
  }
}

/**
 * @deprecated Ported to the `documents` capability module. Kept as a thin
 * subclass so existing constructors keep working.
 */
export class ConvertDocumentTool extends CapabilityTool {
  constructor() {
    super(convertDocument.spec, convertDocument.impl, ungatedCapabilityRun);
  }
}
