import {
  BESPOKE_BODY_REGISTRY,
  getBespokeBody
} from "./bespokeRegistry";
import BlurBody from "./BlurBody";
import ChannelsBody from "./ChannelsBody";
import CompositorBody from "./CompositorBody";
import ImageCompareBody from "./ImageCompareBody";
import CropBody from "./CropBody";
import CurvesBody from "./CurvesBody";
import AdjustmentBody from "./AdjustmentBody";
import FitBody from "./FitBody";
import HSLAdjustBody from "./HSLAdjustBody";
import LevelsBody from "./LevelsBody";
import MaskBody from "./MaskBody";
import MasksExtractorBody from "./MasksExtractorBody";
import PainterBody from "./PainterBody";
import PasteBody from "./PasteBody";
import ResizeBody from "./ResizeBody";
import RotateAndFlipBody from "./RotateAndFlipBody";
import ScaleBody from "./ScaleBody";
import SimpleFilterBody from "./SimpleFilterBody";
import SynthModuleBody from "../synth/SynthModuleBody";
import { SYNTH_NODE_TYPES } from "../synth/synthModules";
import type { NodeMetadata } from "../../../stores/ApiTypes";

const meta = (node_type: string): NodeMetadata =>
  ({ node_type, outputs: [] }) as unknown as NodeMetadata;

describe("bespokeRegistry", () => {
  it("returns undefined for undefined metadata", () => {
    expect(getBespokeBody(undefined)).toBeUndefined();
  });

  it("does not match utility / generic nodes", () => {
    expect(getBespokeBody(meta("nodetool.input.StringInput"))).toBeUndefined();
  });

  it("maps nodetool.image.Blur → BlurBody", () => {
    const m = meta("nodetool.image.Blur");
    expect(getBespokeBody(m)).toBe(BlurBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Blur"]).toBe(BlurBody);
  });

  it("maps nodetool.image.Compare → ImageCompareBody", () => {
    const m = meta("nodetool.image.Compare");
    expect(getBespokeBody(m)).toBe(ImageCompareBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Compare"]).toBe(
      ImageCompareBody
    );
  });

  it("maps nodetool.image.Channels → ChannelsBody", () => {
    const m = meta("nodetool.image.Channels");
    expect(getBespokeBody(m)).toBe(ChannelsBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Channels"]).toBe(ChannelsBody);
  });

  it("maps mask-extractor node types → MasksExtractorBody", () => {
    const types = [
      "replicate.image.background.Bria_RemoveBackground",
      "replicate.image.background.BackgroundRemover_851",
      "replicate.image.background.BackgroundRemover_Codeplug",
      "replicate.image.process.RemoveBackground"
    ];
    for (const t of types) {
      const m = meta(t);
      expect(getBespokeBody(m)).toBe(MasksExtractorBody);
      expect(BESPOKE_BODY_REGISTRY[t]).toBe(MasksExtractorBody);
    }
  });

  it("maps nodetool.image.Levels → LevelsBody", () => {
    const m = meta("nodetool.image.Levels");
    expect(getBespokeBody(m)).toBe(LevelsBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Levels"]).toBe(LevelsBody);
  });

  it("maps nodetool.image.Compositor → CompositorBody", () => {
    const m = meta("nodetool.image.Compositor");
    expect(getBespokeBody(m)).toBe(CompositorBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Compositor"]).toBe(
      CompositorBody
    );
  });

  it("maps nodetool.image.Painter → PainterBody", () => {
    const m = meta("nodetool.image.Painter");
    expect(getBespokeBody(m)).toBe(PainterBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Painter"]).toBe(PainterBody);
  });

  it("maps nodetool.image.Crop → CropBody", () => {
    const m = meta("nodetool.image.Crop");
    expect(getBespokeBody(m)).toBe(CropBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Crop"]).toBe(CropBody);
  });

  it("maps nodetool.image.Resize → ResizeBody", () => {
    const m = meta("nodetool.image.Resize");
    expect(getBespokeBody(m)).toBe(ResizeBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Resize"]).toBe(ResizeBody);
  });

  it("maps nodetool.image.RotateAndFlip → RotateAndFlipBody", () => {
    const m = meta("nodetool.image.RotateAndFlip");
    expect(getBespokeBody(m)).toBe(RotateAndFlipBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.RotateAndFlip"]).toBe(
      RotateAndFlipBody
    );
  });

  it("maps nodetool.image.Scale → ScaleBody", () => {
    const m = meta("nodetool.image.Scale");
    expect(getBespokeBody(m)).toBe(ScaleBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Scale"]).toBe(ScaleBody);
  });

  it("maps lib.image.color_grading.Exposure → AdjustmentBody", () => {
    const m = meta("lib.image.color_grading.Exposure");
    expect(getBespokeBody(m)).toBe(AdjustmentBody);
    expect(BESPOKE_BODY_REGISTRY["lib.image.color_grading.Exposure"]).toBe(
      AdjustmentBody
    );
  });

  it("maps lib.image.color_grading.HSLAdjust → HSLAdjustBody", () => {
    const m = meta("lib.image.color_grading.HSLAdjust");
    expect(getBespokeBody(m)).toBe(HSLAdjustBody);
    expect(BESPOKE_BODY_REGISTRY["lib.image.color_grading.HSLAdjust"]).toBe(
      HSLAdjustBody
    );
  });

  it("maps lib.image.color_grading.Curves → CurvesBody", () => {
    const m = meta("lib.image.color_grading.Curves");
    expect(getBespokeBody(m)).toBe(CurvesBody);
    expect(BESPOKE_BODY_REGISTRY["lib.image.color_grading.Curves"]).toBe(
      CurvesBody
    );
  });

  it("maps nodetool.image.Fit → FitBody", () => {
    const m = meta("nodetool.image.Fit");
    expect(getBespokeBody(m)).toBe(FitBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Fit"]).toBe(FitBody);
  });

  it("maps nodetool.image.Paste → PasteBody", () => {
    const m = meta("nodetool.image.Paste");
    expect(getBespokeBody(m)).toBe(PasteBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Paste"]).toBe(PasteBody);
  });

  it("maps lib.image.Mask → MaskBody", () => {
    const m = meta("lib.image.Mask");
    expect(getBespokeBody(m)).toBe(MaskBody);
    expect(BESPOKE_BODY_REGISTRY["lib.image.Mask"]).toBe(MaskBody);
  });

  it("maps simple-filter node types → SimpleFilterBody", () => {
    const types = [
      "lib.image.filter.Invert",
      "lib.image.filter.ConvertToGrayscale"
    ];
    for (const t of types) {
      const m = meta(t);
      expect(getBespokeBody(m)).toBe(SimpleFilterBody);
      expect(BESPOKE_BODY_REGISTRY[t]).toBe(SimpleFilterBody);
    }
  });

  it("maps every synth module node type → SynthModuleBody", () => {
    for (const t of SYNTH_NODE_TYPES) {
      const m = meta(t);
      expect(getBespokeBody(m)).toBe(SynthModuleBody);
    }
  });
});
