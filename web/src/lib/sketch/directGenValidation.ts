import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";

interface DirectGenBlocker {
  kind: "no-model" | "no-prompt" | "no-source";
  message: string;
  labelKey: string;
}

export function getDirectGenBlocker(binding: LayerWorkflowBinding): DirectGenBlocker | null {
  if (!binding.provider || !binding.model) {
    return {
      kind: "no-model",
      message: "No image model is set on this layer. Pick one, then try again.",
      labelKey: "screens4_25.sketch.directGen.pickModel"
    };
  }
  if (!binding.prompt?.trim()) {
    return {
      kind: "no-prompt",
      message: "This layer has no prompt to render.",
      labelKey: "screens4_25.sketch.directGen.writePrompt"
    };
  }
  if (binding.kind === "image-to-image" && !binding.sourceAssetId && !binding.sourceLayerId) {
    return {
      kind: "no-source",
      message: "This layer has no source image to work from.",
      labelKey: "screens4_25.sketch.directGen.pickSourceLayer"
    };
  }
  if (binding.kind === "inpaint" && (!binding.sourceAssetId || !binding.maskAssetId)) {
    return {
      kind: "no-source",
      message: "The selection this was going to repaint is gone. Make a new one and try again.",
      labelKey: "i18n-next52.sketch.selection.makeSelection"
    };
  }
  return null;
}
