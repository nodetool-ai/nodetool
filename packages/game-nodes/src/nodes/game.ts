import { createHash } from "node:crypto";
import { BaseNode, isString, prop } from "@nodetool-ai/node-sdk";
import { checkSlotFill, gameSlotSpec, LEGACY_GAME_EXPORT_DIAGNOSTIC, slotPrompt, type Entity, type GameAssetBinding, type GameAssetManifest, type GameSlotSpec, type InputMode, type OutputCorrelation } from "@nodetool-ai/protocol";
import { loadMediaRefBytes, resolveEntities, type ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { resolveFills } from "../fills.js";
import { getNativeTemplate, listNativeTemplates } from "../templates.js";
import { imagePreparationMetadata, imagePreparationSettings, prepareGameImage } from "../image-preparation.js";
import { gameFontFormat } from "../font-preparation.js";

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

type SlotPromptOutputs = { prompt: string; width: number; height: number; kind: string; checker: Record<string, unknown>; seconds: number;
  reference_images: NonNullable<Entity["reference_images"]>; reference_asset_id: string };

export class SlotPromptNode extends BaseNode {
  static readonly nodeType = "nodetool.game.SlotPrompt";
  static readonly title = "Slot Prompt";
  static readonly description = "Turn a native game asset slot into a generation prompt and checker properties.";
  static readonly metadataOutputTypes = { prompt: "str", width: "int", height: "int", kind: "str", checker: "dict", seconds: "float",
    reference_images: "list[image]", reference_asset_id: "str" };
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
    return { prompt: result.prompt, width: result.width, height: result.height, kind: slot.kind, checker: result.checker,
      seconds: slot.kind === "sfx" || slot.kind === "music" ? slot.seconds : 0,
      reference_images: result.referenceImages, reference_asset_id: result.referenceAssetId };
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
  static readonly inputFields = ["fills", "game_id", "preparation", "reference_asset_id", "fonts"];

  @prop({ type: "str", default: "topdown", title: "Template", values: TEMPLATE_IDS })
  declare template: string;
  @prop({ type: "str", default: "", title: "Game ID" })
  declare game_id: string;
  @prop({ type: "list[union[image,audio]]", default: [], title: "Checked assets" })
  declare fills: unknown[];
  @prop({ type: "dict", default: {}, title: "Preparation by slot" })
  declare preparation: Record<string, unknown>;
  @prop({ type: "str", default: "", title: "Shared style image asset ID" })
  declare reference_asset_id: string;
  @prop({ type: "dict", default: {}, title: "Font asset URIs by logical ID" })
  declare fonts: Record<string, string>;

  async process(context?: ProcessingContext): Promise<StageGameAssetsOutputs> {
    if (!context?.workspace) throw new Error("Stage Game Assets requires a project workspace");
    const gameId = trimmed(this.game_id);
    if (!/^[a-f0-9]{32}$/.test(gameId)) throw new Error("Stage Game Assets requires a full 32-character game ID");
    const manifest = getNativeTemplate(trimmed(this.template)).manifest;
    const resolved = resolveFills(manifest.template, Array.isArray(this.fills) ? this.fills : []);
    const specs = new Map(manifest.slots.map((slot) => [slot.id, slot]));
    for (const slotId of Object.keys(this.preparation ?? {})) {
      if (!specs.has(slotId)) throw new Error(`Unknown preparation slot ${slotId}`);
    }
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
      const sourceBytes = await loadMediaRefBytes(ref, context);
      if (!sourceBytes || sourceBytes.length === 0) throw new Error(`Cannot read media bytes for ${slot.slot_id}`);
      const extension = slot.fill.kind === "sfx" || slot.fill.kind === "music" ? "wav" : "png";
      const requested = this.preparation?.[slot.slot_id];
      if (extension === "wav" && requested !== undefined) throw new Error(`Preparation is only supported for images: ${slot.slot_id}`);
      const parsed = extension === "png" ? imagePreparationSettings.safeParse(requested ?? {}) : null;
      if (parsed && !parsed.success) throw new Error(`Invalid preparation for ${slot.slot_id}: ${parsed.error.message}`);
      const settings = parsed?.success ? parsed.data : null;
      if (settings && slot.fill.kind !== "image" &&
        (settings.trimAlpha || settings.targetWidth !== undefined || settings.mirrorX || settings.mirrorY || settings.tileset || settings.lut)) {
        throw new Error(`Only single-image slots support trimming, resizing, mirror tiling, tileset creation and LUT creation: ${slot.slot_id}`);
      }
      if (settings?.sheet && (slot.fill.kind !== "spritesheet" || settings.sheet.cols !== slot.fill.columns || settings.sheet.rows !== slot.fill.rows)) {
        throw new Error(`Sheet preparation must match the checked spritesheet grid: ${slot.slot_id}`);
      }
      const expectedWidth = slot.fill.kind === "spritesheet" || slot.fill.kind === "tileset" ? slot.fill.columns * slot.fill.cell[0] : slot.fill.kind === "image" ? slot.fill.size[0] : 1;
      const expectedHeight = slot.fill.kind === "spritesheet" || slot.fill.kind === "tileset" ? slot.fill.rows * slot.fill.cell[1] : slot.fill.kind === "image" ? slot.fill.size[1] : 1;
      const prepared = settings ? await prepareGameImage(sourceBytes, settings) : null;
      if (prepared && (prepared.originalWidth !== expectedWidth || prepared.originalHeight !== expectedHeight)) {
        throw new Error(`Image dimensions for ${slot.slot_id} are ${prepared.originalWidth}x${prepared.originalHeight}, expected ${expectedWidth}x${expectedHeight}`);
      }
      const bytes = prepared?.bytes ?? sourceBytes;
      const digest = createHash("sha256").update(bytes).digest("hex");
      const path = `games/${gameId}/assets/${digest}.${extension}`;
      await context.workspace.write(path, bytes);
      paths.push(path);
      const referenceAssetId = trimmed(this.reference_asset_id);
      const binding: GameAssetBinding = { assetId: slot.asset.asset_id, digest, mediaKind: extension === "wav" ? "audio" : "image",
        width: prepared?.width ?? expectedWidth, height: prepared?.height ?? expectedHeight,
        pivot: settings?.pivot ?? { x: 0.5, y: 0.5 }, sampling: settings?.sampling ?? "nearest",
        provenance: `template:${manifest.template}:${slot.slot_id}${referenceAssetId ? `:style:${referenceAssetId}` : ""}` };
      if (prepared?.baseline !== undefined && prepared.frames?.[0]) {
        binding.pivot = { x: 0.5, y: (prepared.baseline + 1) / prepared.frames[0].height };
      }
      if (settings && requested !== undefined) {
        binding.preparation = imagePreparationMetadata(settings);
      }
      if (prepared?.trim) binding.trim = prepared.trim;
      if (prepared && requested !== undefined) binding.originalDimensions = { width: prepared.originalWidth, height: prepared.originalHeight };
      if (referenceAssetId) binding.referenceAssetId = referenceAssetId;
      bindings[slot.slot_id] = binding;
    }
    for (const [fontId, uri] of Object.entries(this.fonts ?? {})) {
      if (!/^[a-z][a-z0-9_.-]*$/.test(fontId) || typeof uri !== "string" || !uri.trim()) {
        throw new Error(`Invalid font source for ${fontId}`);
      }
      if (bindings[fontId]) throw new Error(`Font ID conflicts with a template slot: ${fontId}`);
      const bytes = await loadMediaRefBytes({ type: "image", uri }, context);
      if (!bytes || bytes.length < 4) throw new Error(`Cannot read font bytes for ${fontId}`);
      const fontFormat = gameFontFormat(bytes);
      if (!fontFormat) throw new Error(`Font ${fontId} must be a TrueType or OpenType font`);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const path = `games/${gameId}/assets/${digest}.${fontFormat}`;
      await context.workspace.write(path, bytes);
      paths.push(path);
      bindings[fontId] = { assetId: uri, digest, mediaKind: "font", fontFormat, width: 1, height: 1,
        pivot: { x: 0.5, y: 0.5 }, sampling: "nearest", required: true,
        provenance: `font:${fontId}` };
    }
    return { output: { gameId, bindings }, bindings, paths };
  }
}

export const LEGACY_GAME_NODE_DIAGNOSTIC = LEGACY_GAME_EXPORT_DIAGNOSTIC;

export const GAME_TEMPLATE_NODES = tagAsServer([LoadGameTemplateNode, SlotPromptNode, StageGameAssetsNode]);
