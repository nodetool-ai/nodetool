import type { ModuleConfig } from "../types.js";

export const imageOcrConfig: ModuleConfig = {
  configs: {
    "abiruyt/text-extract-ocr": {
      className: "TextExtractOCR",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "mickeybeurskens/latex-ocr": {
      className: "LatexOCR",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "cudanexus/ocr-surya": {
      className: "OCR_Surya",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "lucataco/deepseek-ocr": {
      className: "Deepseek_OCR",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "datalab-to/ocr": {
      className: "Datalab_OCR",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "datalab-to/marker": {
      className: "Marker",
      returnType: "str"
    }
  }
};
