import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { GAME_TEMPLATE_NODES } from "./nodes/game.js";

export {
  LoadGameTemplateNode,
  SlotPromptNode,
  StageGameAssetsNode,
  GAME_TEMPLATE_NODES,
  LEGACY_GAME_NODE_DIAGNOSTIC
} from "./nodes/game.js";
export { resolveFills, type ResolvedFills } from "./fills.js";
export { getNativeTemplate, listNativeTemplates, type NativeGameTemplate } from "./templates.js";
export { prepareGameImage, imagePreparationSettings, imagePreparationMetadata, type ImagePreparationSettings, type PreparedImage } from "./image-preparation.js";
export { gameFontFormat } from "./font-preparation.js";
export {
  derivedStagedBinding2D,
  listStagedGameCandidates,
  recordStagedGameCandidate,
  type StagedGameCandidate,
  type StagedGameCandidateKind
} from "./staged-candidates.js";
export { gameTemplateSlot } from "./templates.js";

export const ALL_GAME_NODES: readonly NodeClass[] = [
  ...GAME_TEMPLATE_NODES,
];

export function registerGameNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_GAME_NODES) {
    registry.register(nodeClass);
  }
}
