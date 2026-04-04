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
    }
  }
};
