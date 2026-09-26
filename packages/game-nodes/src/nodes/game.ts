import { createHash } from "node:crypto";
import { BaseNode, isString, prop } from "@nodetool-ai/node-sdk";
import { checkSlotFill, gameSlotSpec, LEGACY_GAME_EXPORT_DIAGNOSTIC, slotPrompt, type Entity, type GameAssetBinding, type GameAssetManifest, type GameSlotSpec, type InputMode, type OutputCorrelation } from "@nodetool-ai/protocol";
import { loadMediaRefBytes, resolveEntities, type ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { resolveFills } from "../fills.js";
import { getNativeTemplate, listNativeTemplates } from "../templates.js";

const TEMPLATE_IDS = listNativeTemplates().map((template) => template.id);
const trimmed = (value: unknown): string => isString(value) ? value.trim() : "";

type LoadGameTemplateOutputs = { manifest: GameAssetManifest; slots: GameSlotSpec[]; slot: GameSlotSpec };

export class LoadGameTemplateNode extends BaseNode {
  static readonly nodeType = "nodetool.game.LoadGameTemplate";
  static readonly title = "Load Game Template";
  static readonly description = "Read a native game template's asset slots for generation.";
  static readonly metadataOutputTypes = { manifest: "dict", slots: "list[game_slot]", slot: "game_slot" };
  static readonly inlineFields = ["template"];
  static readonly inputFields: string[] = [];
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    slot: { kind: "iteration", source: "__execution__", group: "slots" },
    slots: { kind: "single", source: "__execution__" },
    manifest: { kind: "single", source: "__execution__" }
  } satisfies Record<string, OutputCorrelation>;

  @prop({ type: "str", default: "topdown", title: "Template", values: TEMPLATE_IDS })
  declare template: string;

  async process(): Promise<LoadGameTemplateOutputs> {
    const manifest = getNativeTemplate(trimmed(this.template)).manifest;
    return { manifest, slots: manifest.slots, slot: manifest.slots[0] };
  }

  async *genProcess(): AsyncGenerator<Partial<LoadGameTemplateOutputs>> {
    const manifest = getNativeTemplate(trimmed(this.template)).manifest;
    for (const slot of manifest.slots) yield { slot };
    yield { manifest, slots: manifest.slots };
  }
}

type SlotPromptOutputs = { prompt: string; width: number; height: number; kind: string; checker: Record<string, unknown>; seconds: number };

export class SlotPromptNode extends BaseNode {
  static readonly nodeType = "nodetool.game.SlotPrompt";
  static readonly title = "Slot Prompt";
  static readonly description = "Turn a native game asset slot into a generation prompt and checker properties.";
  static readonly metadataOutputTypes = { prompt: "str", width: "int", height: "int", kind: "str", checker: "dict", seconds: "float" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["slot", "style", "cast"];

  @prop({ type: "game_slot", default: null, title: "Slot" })
  declare slot: unknown;
  @prop({ type: "entity", default: null, title: "Style" })
  declare style: Entity | null;
  @prop({ type: "list[entity]", default: [], title: "Cast" })
  declare cast: Entity[];

  async process(context?: ProcessingContext): Promise<SlotPromptOutputs> {
    const parsed = gameSlotSpec.safeParse(this.slot);
    if (!parsed.success) throw new Error(`Slot Prompt: invalid game slot: ${parsed.error.message}`);
    const slot = parsed.data;
    const [style] = await resolveEntities(this.style ? [this.style] : [], context);
    const cast = await resolveEntities(Array.isArray(this.cast) ? this.cast : [], context);
    const result = slotPrompt(slot, style ?? null, cast);
    return { prompt: result.prompt, width: result.width, height: result.height, kind: slot.kind, checker: result.checker, seconds: slot.kind === "sfx" || slot.kind === "music" ? slot.seconds : 0 };
  }
}

type StageGameAssetsOutputs = { output: { gameId: string; bindings: Record<string, GameAssetBinding> }; bindings: Record<string, GameAssetBinding>; paths: string[] };

/** Stage validated media; a separate revision operation installs selected bindings. */
export class StageGameAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.game.StageGameAssets";
  static readonly title = "Stage Game Assets";
  static readonly description = "Validate generated media and stage candidate bindings for a native game.";
  static readonly metadataOutputTypes = { output: "dict", bindings: "dict", paths: "list[str]" };
  static readonly inlineFields = ["template", "game_id"];
  static readonly inputFields = ["fills", "game_id"];

  @prop({ type: "str", default: "topdown", title: "Template", values: TEMPLATE_IDS })
  declare template: string;
  @prop({ type: "str", default: "", title: "Game ID" })
  declare game_id: string;
  @prop({ type: "list[union[image,audio]]", default: [], title: "Checked assets" })
  declare fills: unknown[];

  async process(context?: ProcessingContext): Promise<StageGameAssetsOutputs> {
    if (!context?.workspace) throw new Error("Stage Game Assets requires a project workspace");
    const gameId = trimmed(this.game_id);
    if (!/^[a-f0-9]{32}$/.test(gameId)) throw new Error("Stage Game Assets requires a full 32-character game ID");
    const manifest = getNativeTemplate(trimmed(this.template)).manifest;
    const resolved = resolveFills(manifest.template, Array.isArray(this.fills) ? this.fills : []);
    const specs = new Map(manifest.slots.map((slot) => [slot.id, slot]));
    const bindings: Record<string, GameAssetBinding> = {};
    const paths: string[] = [];
    for (const slot of resolved.manifest.slots) {
      const spec = specs.get(slot.slot_id);
      if (!spec) throw new Error(`Unknown template slot ${slot.slot_id}`);
      const problems = checkSlotFill(spec, slot.fill);
      if (problems.length > 0) throw new Error(`Invalid fill for ${slot.slot_id}: ${problems.join("; ")}`);
      if (bindings[slot.slot_id]) throw new Error(`Slot ${slot.slot_id} is filled twice`);
      const ref = resolved.refs.get(slot.asset.asset_id);
      if (!ref) throw new Error(`Missing media reference for ${slot.slot_id}`);
      const bytes = await loadMediaRefBytes(ref, context);
      if (!bytes || bytes.length === 0) throw new Error(`Cannot read media bytes for ${slot.slot_id}`);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const extension = slot.fill.kind === "sfx" || slot.fill.kind === "music" ? "wav" : "png";
      const path = `games/${gameId}/assets/${digest}.${extension}`;
      await context.workspace.write(path, bytes);
      paths.push(path);
      const width = slot.fill.kind === "spritesheet" || slot.fill.kind === "tileset" ? slot.fill.columns * slot.fill.cell[0] : slot.fill.kind === "image" ? slot.fill.size[0] : 1;
      const height = slot.fill.kind === "spritesheet" || slot.fill.kind === "tileset" ? slot.fill.rows * slot.fill.cell[1] : slot.fill.kind === "image" ? slot.fill.size[1] : 1;
      bindings[slot.slot_id] = { assetId: slot.asset.asset_id, digest, mediaKind: extension === "wav" ? "audio" : "image", width, height, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest", provenance: `template:${manifest.template}:${slot.slot_id}` };
    }
    return { output: { gameId, bindings }, bindings, paths };
  }
}

export const LEGACY_GAME_NODE_DIAGNOSTIC = LEGACY_GAME_EXPORT_DIAGNOSTIC;

export const GAME_TEMPLATE_NODES = tagAsServer([LoadGameTemplateNode, SlotPromptNode, StageGameAssetsNode]);
