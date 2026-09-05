/**
 * The constant/input node types the pane context menu can drop on the canvas.
 *
 * Every id here must be one the backend declares — a typo makes the menu item
 * vanish with no error, which is how `nodetool.input.DataFrameInput` (the
 * backend spells it `DataframeInput`) hid the Data Frame item. Pinned by
 * `src/constants/__tests__/nodeTypeRegistry.test.ts`.
 */
export interface PaneNodeOption {
  label: string;
  nodeType: string;
}

const byLabel = (a: PaneNodeOption, b: PaneNodeOption) =>
  a.label.localeCompare(b.label);

export const CONSTANT_NODE_OPTIONS: readonly PaneNodeOption[] = [
  { label: "Audio", nodeType: "nodetool.constant.Audio" },
  { label: "Bool", nodeType: "nodetool.constant.Bool" },
  { label: "Data Frame", nodeType: "nodetool.constant.DataFrame" },
  { label: "Date", nodeType: "nodetool.constant.Date" },
  { label: "Date Time", nodeType: "nodetool.constant.DateTime" },
  { label: "Dict", nodeType: "nodetool.constant.Dict" },
  { label: "Document", nodeType: "nodetool.constant.Document" },
  { label: "Float", nodeType: "nodetool.constant.Float" },
  { label: "Image", nodeType: "nodetool.constant.Image" },
  { label: "Integer", nodeType: "nodetool.constant.Integer" },
  { label: "JSON", nodeType: "nodetool.constant.JSON" },
  { label: "List", nodeType: "nodetool.constant.List" },
  { label: "Model 3D", nodeType: "nodetool.constant.Model3D" },
  { label: "Select", nodeType: "nodetool.constant.Select" },
  { label: "String", nodeType: "nodetool.constant.String" },
  { label: "Video", nodeType: "nodetool.constant.Video" }
].sort(byLabel);

export const INPUT_NODE_OPTIONS: readonly PaneNodeOption[] = [
  { label: "Audio", nodeType: "nodetool.input.AudioInput" },
  { label: "Boolean", nodeType: "nodetool.input.BooleanInput" },
  { label: "Data Frame", nodeType: "nodetool.input.DataframeInput" },
  { label: "Document", nodeType: "nodetool.input.DocumentInput" },
  { label: "Float", nodeType: "nodetool.input.FloatInput" },
  { label: "Image", nodeType: "nodetool.input.ImageInput" },
  { label: "Integer", nodeType: "nodetool.input.IntegerInput" },
  { label: "Select", nodeType: "nodetool.input.SelectInput" },
  { label: "String", nodeType: "nodetool.input.StringInput" },
  { label: "Video", nodeType: "nodetool.input.VideoInput" }
].sort(byLabel);
