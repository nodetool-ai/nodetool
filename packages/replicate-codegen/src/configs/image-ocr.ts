import type { ModuleConfig } from "../types.js";

export const imageOcrConfig: ModuleConfig = {
  configs: {
    "abiruyt/text-extract-ocr": {
      className: "TextExtractOCR",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
    "mickeybeurskens/latex-ocr": {
      className: "LatexOCR",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
      },
    },
  },
};
