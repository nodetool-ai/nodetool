const makeDefault = <T extends string>(
  type: T,
  extra: Record<string, unknown> = {}
) => ({
  type,
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  ...extra
});

export const DEFAULT_MODEL_3D = makeDefault("model_3d", {
  format: null,
  material_file: null,
  texture_files: []
});

export const DEFAULT_FOLDER = makeDefault("folder");

export const DEFAULT_IMAGE = makeDefault("image");

export const DEFAULT_TEXT_TO_3D_MODEL = {
  type: "model_3d_model",
  provider: "meshy",
  id: "meshy-4",
  name: "Meshy-4 Text-to-3D"
};

export const DEFAULT_IMAGE_TO_3D_MODEL = {
  type: "model_3d_model",
  provider: "meshy",
  id: "meshy-4-image",
  name: "Meshy-4 Image-to-3D"
};
