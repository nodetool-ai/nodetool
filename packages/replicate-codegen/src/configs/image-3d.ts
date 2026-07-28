import type { ModuleConfig } from "../types.js";

export const image3dConfig: ModuleConfig = {
  configs: {
    "firtoz/trellis": { className: "Trellis", returnType: "str" },
    "cjwbw/shap-e": { className: "ShapE", returnType: "str" },
    "lucataco/deep3d": { className: "Deep3D", returnType: "str" },
    "prunaai/hunyuan3d-2": {
      className: "Hunyuan3D_2",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "tencent/hunyuan3d-2": {
      className: "Tencent_Hunyuan3D_2",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "tencent/hunyuan3d-2mv": {
      className: "Hunyuan3D_2MV",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "zsxkib/seedvr2": {
      className: "SeedVR2",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "tencent/hunyuan-3d-3.1": {
      className: "Hunyuan_3d_3_1",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "uthana/create-character-v1": {
      className: "Create_Character_V1",
      returnType: "str",
      fieldOverrides: { character_file: { propType: "image" } }
    },
    "uthana/text-to-motion-diffusion-v2": {
      className: "Text_To_Motion_Diffusion_V2",
      returnType: "str"
    },
    "uthana/text-to-motion-vqvae-v1": {
      className: "Text_To_Motion_Vqvae_V1",
      returnType: "str"
    }
  }
};
