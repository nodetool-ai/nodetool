import type { ModuleConfig } from "../types.js";

export const imageFaceConfig: ModuleConfig = {
  configs: {
    "fofr/face-to-many": {
      className: "FaceToMany",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "fofr/become-image": {
      className: "BecomeImage",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        image_to_become: { propType: "image" }
      }
    },
    "tencentarc/photomaker": {
      className: "PhotoMaker",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "tencentarc/photomaker-style": {
      className: "PhotoMakerStyle",
      returnType: "image",
      fieldOverrides: {
        input_image: { propType: "image" },
        input_image2: { propType: "image" },
        input_image3: { propType: "image" },
        input_image4: { propType: "image" }
      }
    },
    "fofr/face-to-sticker": {
      className: "FaceToSticker",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "zsxkib/instant-id": {
      className: "InstantId",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" },
        pose_image: { propType: "image" }
      }
    },
    "grandlineai/instant-id-photorealistic": {
      className: "Instant_ID_Photorealistic",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    },
    "grandlineai/instant-id-artistic": {
      className: "Instant_ID_Artistic",
      returnType: "image",
      fieldOverrides: {
        image: { propType: "image" }
      }
    }
  }
};
