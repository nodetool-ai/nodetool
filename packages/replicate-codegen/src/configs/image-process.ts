import type { ModuleConfig } from "../types.js";

export const imageProcessConfig: ModuleConfig = {
  configs: {
    "cjwbw/rembg": {
      className: "RemoveBackground",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "pollinations/modnet": {
      className: "ModNet",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "piddnad/ddcolor": {
      className: "DD_Color",
      returnType: "image"
    },
    "fermatresearch/magic-style-transfer": {
      className: "Magic_Style_Transfer",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        ip_image: { propType: "image" }
      }
    },
    "codeplugtech/object_remover": {
      className: "ObjectRemover",
      returnType: "image",
      fieldOverrides: {
        org_image: { propType: "image" },
        mask_image: { propType: "image" }
      }
    },
    "google/nano-banana": {
      className: "Nano_Banana",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        mask: { propType: "image" }
      }
    },
    "bria/expand-image": {
      className: "Expand_Image",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    }
  }
};
