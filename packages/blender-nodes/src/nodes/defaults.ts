/**
 * Default prop values for the Blender nodes.
 *
 * Local copy of the `model_3d` default shape (see `DEFAULT_MODEL_3D` in
 * `video-nodes`): this package must not depend on `video-nodes` for one
 * constant.
 */

export const DEFAULT_MODEL_3D = {
  type: "model_3d",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  format: null,
  material_file: null,
  texture_files: []
};
