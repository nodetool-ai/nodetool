/**
 * Sketch Format Converter
 * 
 * Converts between our internal LayoutCanvas format and Sketch file format.
 */

import FileFormat from "@sketch-hq/sketch-file-format-ts";
import type {
  LayoutCanvasData,
  LayoutElement,
  TextProps,
  RectProps,
  ImageProps,
  GroupProps
} from "../types";
import {
  generateSketchUUID,
  hexToSketchColor,
  sketchColorToHex
} from "./types";

// Type aliases for cleaner code
type SketchPage = FileFormat.Page;
type SketchArtboard = FileFormat.Artboard;
type SketchRectangle = FileFormat.Rectangle;
type SketchOval = FileFormat.Oval;
type SketchText = FileFormat.Text;
type SketchGroup = FileFormat.Group;
type SketchBitmap = FileFormat.Bitmap;
type Style = FileFormat.Style;
type Fill = FileFormat.Fill;
type Border = FileFormat.Border;
type Rect = FileFormat.Rect;
type CurvePoint = FileFormat.CurvePoint;
type GraphicsContextSettings = FileFormat.GraphicsContextSettings;
type ColorControls = FileFormat.ColorControls;
type BorderOptions = FileFormat.BorderOptions;
type ExportOptions = FileFormat.ExportOptions;
type RulerData = FileFormat.RulerData;
type SketchColor = FileFormat.Color;

// Enums need to be used as values, so we import them from the namespace
const BooleanOperation = FileFormat.BooleanOperation;
const LayerListExpanded = FileFormat.LayerListExpanded;
const ResizeType = FileFormat.ResizeType;
const FillType = FileFormat.FillType;
const BlendMode = FileFormat.BlendMode;
const BorderPosition = FileFormat.BorderPosition;
const PointsRadiusBehaviour = FileFormat.PointsRadiusBehaviour;
const CurveMode = FileFormat.CurveMode;
const CornerStyle = FileFormat.CornerStyle;
const LineCapStyle = FileFormat.LineCapStyle;
const LineJoinStyle = FileFormat.LineJoinStyle;
const MarkerType = FileFormat.MarkerType;
const WindingRule = FileFormat.WindingRule;
const TextBehaviour = FileFormat.TextBehaviour;
const LineSpacingBehaviour = FileFormat.LineSpacingBehaviour;
const TextHorizontalAlignment = FileFormat.TextHorizontalAlignment;
const TextVerticalAlignment = FileFormat.TextVerticalAlignment;

// ============================================================================
// Convert FROM Sketch to LayoutCanvas
// ============================================================================

/**
 * Convert a Sketch page to our LayoutCanvas format
 */
export function convertFromSketch(
  page: SketchPage,
  artboardIndex: number = 0
): LayoutCanvasData {
  // Find the artboard to use (or use the page itself)
  const artboard = page.layers.find(
    (layer): layer is SketchArtboard => layer._class === "artboard"
  );
  
  const targetLayers = artboard ? artboard.layers : page.layers;
  const canvasWidth = artboard ? artboard.frame.width : page.frame.width || 800;
  const canvasHeight = artboard ? artboard.frame.height : page.frame.height || 600;
  const backgroundColor = artboard?.hasBackgroundColor 
    ? sketchColorToHex(artboard.backgroundColor)
    : "#ffffff";
  
  const elements: LayoutElement[] = [];
  
  for (let i = 0; i < targetLayers.length; i++) {
    const layer = targetLayers[i];
    const element = convertSketchLayerToElement(layer, i);
    if (element) {
      elements.push(element);
    }
  }
  
  return {
    type: "layout_canvas",
    width: canvasWidth,
    height: canvasHeight,
    backgroundColor,
    elements,
    exposedInputs: []
  };
}

/**
 * Convert a single Sketch layer to a LayoutElement
 */
function convertSketchLayerToElement(
  layer: SketchPage["layers"][number],
  index: number
): LayoutElement | null {
  const baseElement = {
    id: layer.do_objectID,
    name: layer.name,
    x: layer.frame.x,
    y: layer.frame.y,
    width: layer.frame.width,
    height: layer.frame.height,
    rotation: layer.rotation,
    zIndex: index,
    visible: layer.isVisible,
    locked: layer.isLocked
  };
  
  switch (layer._class) {
    case "rectangle":
      return convertSketchRectangle(layer, baseElement);
    case "oval":
      return convertSketchOval(layer, baseElement);
    case "text":
      return convertSketchText(layer, baseElement);
    case "group":
      return convertSketchGroup(layer, baseElement);
    case "bitmap":
      return convertSketchBitmap(layer, baseElement);
    default:
      // Skip unsupported layer types
      return null;
  }
}

function convertSketchRectangle(
  layer: SketchRectangle,
  base: Omit<LayoutElement, "type" | "properties">
): LayoutElement {
  const style = layer.style;
  const fill = style?.fills?.find((f: Fill) => f.isEnabled);
  const border = style?.borders?.find((b: Border) => b.isEnabled);
  
  return {
    ...base,
    type: "rectangle",
    properties: {
      fillColor: fill ? sketchColorToHex(fill.color) : "#cccccc",
      borderColor: border ? sketchColorToHex(border.color) : "#000000",
      borderWidth: border ? border.thickness : 0,
      borderRadius: layer.fixedRadius || 0,
      opacity: style?.contextSettings?.opacity ?? 1
    } as RectProps
  };
}

function convertSketchOval(
  layer: SketchOval,
  base: Omit<LayoutElement, "type" | "properties">
): LayoutElement {
  // Convert oval to rectangle with max border radius (ellipse effect)
  const style = layer.style;
  const fill = style?.fills?.find((f: Fill) => f.isEnabled);
  const border = style?.borders?.find((b: Border) => b.isEnabled);
  
  return {
    ...base,
    type: "rectangle",
    properties: {
      fillColor: fill ? sketchColorToHex(fill.color) : "#cccccc",
      borderColor: border ? sketchColorToHex(border.color) : "#000000",
      borderWidth: border ? border.thickness : 0,
      borderRadius: Math.min(base.width, base.height) / 2, // Make it circular/elliptical
      opacity: style?.contextSettings?.opacity ?? 1
    } as RectProps
  };
}

function convertSketchText(
  layer: SketchText,
  base: Omit<LayoutElement, "type" | "properties">
): LayoutElement {
  const attrString = layer.attributedString;
  const firstAttr = attrString.attributes[0]?.attributes;
  const fontAttr = firstAttr?.MSAttributedStringFontAttribute?.attributes;
  const colorAttr = firstAttr?.MSAttributedStringColorAttribute;
  const paragraphStyle = firstAttr?.paragraphStyle;
  
  // Map Sketch text alignment to our format
  const alignmentMap: Record<number, "left" | "center" | "right"> = {
    [TextHorizontalAlignment.Left]: "left",
    [TextHorizontalAlignment.Centered]: "center",
    [TextHorizontalAlignment.Right]: "right",
    [TextHorizontalAlignment.Justified]: "left",
    [TextHorizontalAlignment.Natural]: "left"
  };
  
  return {
    ...base,
    type: "text",
    properties: {
      content: attrString.string,
      fontFamily: fontAttr?.name?.split("-")[0] || "Inter",
      fontSize: fontAttr?.size || 16,
      fontWeight: "normal",
      color: colorAttr ? sketchColorToHex(colorAttr) : "#000000",
      alignment: alignmentMap[paragraphStyle?.alignment ?? TextHorizontalAlignment.Left] || "left",
      lineHeight: 1.2
    } as TextProps
  };
}

function convertSketchGroup(
  layer: SketchGroup,
  base: Omit<LayoutElement, "type" | "properties">
): LayoutElement {
  return {
    ...base,
    type: "group",
    properties: {
      name: layer.name
    } as GroupProps
  };
}

function convertSketchBitmap(
  layer: SketchBitmap,
  base: Omit<LayoutElement, "type" | "properties">
): LayoutElement {
  // Extract image source from the bitmap layer
  let source = "";
  if (layer.image && "_ref" in layer.image) {
    source = `images/${layer.image._ref}`;
  }
  
  return {
    ...base,
    type: "image",
    properties: {
      source,
      fit: "contain",
      opacity: layer.style?.contextSettings?.opacity ?? 1
    } as ImageProps
  };
}

// ============================================================================
// Convert TO Sketch from LayoutCanvas
// ============================================================================

/**
 * Convert our LayoutCanvas data to a Sketch page
 */
export function convertToSketch(
  canvasData: LayoutCanvasData,
  pageName: string = "Page 1"
): SketchPage {
  const pageId = generateSketchUUID();
  
  // Create an artboard that contains all our elements
  const artboardId = generateSketchUUID();
  // Cast layers to the correct type as our converter produces compatible layers
  const artboardLayers = canvasData.elements.map((element) => convertElementToSketch(element)) as SketchArtboard["layers"];
  
  const artboard: SketchArtboard = {
    _class: "artboard",
    do_objectID: artboardId,
    booleanOperation: BooleanOperation.None,
    exportOptions: createDefaultExportOptions(),
    frame: createRect(0, 0, canvasData.width, canvasData.height),
    isFixedToViewport: false,
    isFlippedHorizontal: false,
    isFlippedVertical: false,
    isLocked: false,
    isTemplate: false,
    isVisible: true,
    layerListExpandedType: LayerListExpanded.Expanded,
    name: "Artboard",
    nameIsFixed: false,
    resizingConstraint: 63,
    resizingType: ResizeType.Stretch,
    rotation: 0,
    shouldBreakMaskChain: false,
    hasClickThrough: false,
    horizontalRulerData: createDefaultRulerData(),
    verticalRulerData: createDefaultRulerData(),
    backgroundColor: hexToSketchColorObject(canvasData.backgroundColor),
    hasBackgroundColor: true,
    includeBackgroundColorInExport: true,
    isFlowHome: false,
    resizesContent: false,
    layers: artboardLayers
  };
  
  // Create the page
  const page: SketchPage = {
    _class: "page",
    do_objectID: pageId,
    booleanOperation: BooleanOperation.None,
    exportOptions: createDefaultExportOptions(),
    frame: createRect(-1, -1, canvasData.width + 2, canvasData.height + 2),
    isFixedToViewport: false,
    isFlippedHorizontal: false,
    isFlippedVertical: false,
    isLocked: false,
    isTemplate: false,
    isVisible: true,
    layerListExpandedType: LayerListExpanded.Expanded,
    name: pageName,
    nameIsFixed: false,
    resizingConstraint: 63,
    resizingType: ResizeType.Stretch,
    rotation: 0,
    shouldBreakMaskChain: false,
    hasClickThrough: false,
    horizontalRulerData: createDefaultRulerData(),
    verticalRulerData: createDefaultRulerData(),
    layers: [artboard]
  };
  
  return page;
}

/**
 * Convert a LayoutElement to a Sketch layer
 */
function convertElementToSketch(
  element: LayoutElement
): SketchPage["layers"][number] {
  switch (element.type) {
    case "rectangle":
      return convertRectangleToSketch(element);
    case "text":
      return convertTextToSketch(element);
    case "image":
      return convertImageToSketch(element);
    case "group":
      return convertGroupToSketch(element);
    default:
      // Default to rectangle for unknown types
      return convertRectangleToSketch(element);
  }
}

function convertRectangleToSketch(element: LayoutElement): SketchRectangle {
  const props = element.properties as RectProps;
  
  return {
    _class: "rectangle",
    do_objectID: generateSketchUUID(),
    booleanOperation: BooleanOperation.None,
    exportOptions: createDefaultExportOptions(),
    frame: createRect(element.x, element.y, element.width, element.height),
    isFixedToViewport: false,
    isFlippedHorizontal: false,
    isFlippedVertical: false,
    isLocked: element.locked,
    isTemplate: false,
    isVisible: element.visible,
    layerListExpandedType: LayerListExpanded.Undecided,
    name: element.name,
    nameIsFixed: false,
    resizingConstraint: 63,
    resizingType: ResizeType.Stretch,
    rotation: element.rotation,
    shouldBreakMaskChain: false,
    style: createStyle({
      fillColor: props.fillColor,
      borderColor: props.borderColor,
      borderWidth: props.borderWidth,
      opacity: props.opacity
    }),
    edited: false,
    isClosed: true,
    pointRadiusBehaviour: PointsRadiusBehaviour.Rounded,
    points: createRectanglePoints(),
    fixedRadius: props.borderRadius,
    hasConvertedToNewRoundCorners: true,
    needsConvertionToNewRoundCorners: false
  };
}

function convertTextToSketch(element: LayoutElement): SketchText {
  const props = element.properties as TextProps;
  
  // Map our alignment to Sketch's
  const alignmentMap: Record<string, FileFormat.TextHorizontalAlignment> = {
    "left": TextHorizontalAlignment.Left,
    "center": TextHorizontalAlignment.Centered,
    "right": TextHorizontalAlignment.Right
  };
  
  return {
    _class: "text",
    do_objectID: generateSketchUUID(),
    booleanOperation: BooleanOperation.None,
    exportOptions: createDefaultExportOptions(),
    frame: createRect(element.x, element.y, element.width, element.height),
    isFixedToViewport: false,
    isFlippedHorizontal: false,
    isFlippedVertical: false,
    isLocked: element.locked,
    isTemplate: false,
    isVisible: element.visible,
    layerListExpandedType: LayerListExpanded.Undecided,
    name: element.name,
    nameIsFixed: false,
    resizingConstraint: 63,
    resizingType: ResizeType.Stretch,
    rotation: element.rotation,
    shouldBreakMaskChain: false,
    style: createTextStyle(props),
    attributedString: {
      _class: "attributedString",
      string: props.content,
      attributes: [{
        _class: "stringAttribute",
        location: 0,
        length: props.content.length,
        attributes: {
          MSAttributedStringFontAttribute: {
            _class: "fontDescriptor",
            attributes: {
              name: props.fontFamily,
              size: props.fontSize
            }
          },
          MSAttributedStringColorAttribute: hexToSketchColorObject(props.color),
          paragraphStyle: {
            _class: "paragraphStyle",
            alignment: alignmentMap[props.alignment] ?? TextHorizontalAlignment.Left
          }
        }
      }]
    },
    automaticallyDrawOnUnderlyingPath: false,
    dontSynchroniseWithSymbol: false,
    lineSpacingBehaviour: LineSpacingBehaviour.ConsistentBaseline,
    textBehaviour: TextBehaviour.Fixed,
    glyphBounds: "{{0, 0}, {0, 0}}"
  };
}

function convertImageToSketch(element: LayoutElement): SketchBitmap {
  const props = element.properties as ImageProps;
  
  return {
    _class: "bitmap",
    do_objectID: generateSketchUUID(),
    booleanOperation: BooleanOperation.None,
    exportOptions: createDefaultExportOptions(),
    frame: createRect(element.x, element.y, element.width, element.height),
    isFixedToViewport: false,
    isFlippedHorizontal: false,
    isFlippedVertical: false,
    isLocked: element.locked,
    isTemplate: false,
    isVisible: element.visible,
    layerListExpandedType: LayerListExpanded.Undecided,
    name: element.name,
    nameIsFixed: false,
    resizingConstraint: 63,
    resizingType: ResizeType.Stretch,
    rotation: element.rotation,
    shouldBreakMaskChain: false,
    style: createStyle({ opacity: props.opacity }),
    clippingMask: "",
    clippingMaskMode: 0,
    fillReplacesImage: false,
    intendedDPI: 72,
    image: {
      _class: "MSJSONFileReference",
      _ref_class: "MSImageData",
      _ref: props.source || "placeholder.png"
    }
  };
}

function convertGroupToSketch(element: LayoutElement): SketchGroup {
  return {
    _class: "group",
    do_objectID: generateSketchUUID(),
    booleanOperation: BooleanOperation.None,
    exportOptions: createDefaultExportOptions(),
    frame: createRect(element.x, element.y, element.width, element.height),
    isFixedToViewport: false,
    isFlippedHorizontal: false,
    isFlippedVertical: false,
    isLocked: element.locked,
    isTemplate: false,
    isVisible: element.visible,
    layerListExpandedType: LayerListExpanded.Expanded,
    name: element.name,
    nameIsFixed: false,
    resizingConstraint: 63,
    resizingType: ResizeType.Stretch,
    rotation: element.rotation,
    shouldBreakMaskChain: false,
    hasClickThrough: false,
    layers: [] // Child elements would be added here
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function createRect(x: number, y: number, width: number, height: number): Rect {
  return {
    _class: "rect",
    constrainProportions: false,
    x,
    y,
    width,
    height
  };
}

function createDefaultExportOptions(): ExportOptions {
  return {
    _class: "exportOptions",
    exportFormats: [],
    includedLayerIds: [],
    layerOptions: 0,
    shouldTrim: false
  };
}

function createDefaultRulerData(): RulerData {
  return {
    _class: "rulerData",
    base: 0,
    guides: []
  };
}

function hexToSketchColorObject(hex: string): SketchColor {
  const rgba = hexToSketchColor(hex);
  return {
    _class: "color",
    red: rgba.red,
    green: rgba.green,
    blue: rgba.blue,
    alpha: rgba.alpha
  };
}

function createGraphicsContextSettings(opacity: number = 1): GraphicsContextSettings {
  return {
    _class: "graphicsContextSettings",
    blendMode: BlendMode.Normal,
    opacity
  };
}

function createColorControls(): ColorControls {
  return {
    _class: "colorControls",
    isEnabled: false,
    brightness: 0,
    contrast: 1,
    hue: 0,
    saturation: 1
  };
}

function createBorderOptions(): BorderOptions {
  return {
    _class: "borderOptions",
    isEnabled: true,
    dashPattern: [],
    lineCapStyle: LineCapStyle.Butt,
    lineJoinStyle: LineJoinStyle.Miter
  };
}

function createFill(color: string, opacity: number = 1): Fill {
  return {
    _class: "fill",
    isEnabled: true,
    color: hexToSketchColorObject(color),
    fillType: FillType.Color,
    noiseIndex: 0,
    noiseIntensity: 0,
    patternFillType: 0,
    patternTileScale: 1,
    contextSettings: createGraphicsContextSettings(opacity),
    gradient: {
      _class: "gradient",
      gradientType: 0,
      elipseLength: 0,
      from: "{0.5, 0}",
      to: "{0.5, 1}",
      stops: []
    }
  };
}

function createBorder(color: string, thickness: number): Border {
  return {
    _class: "border",
    isEnabled: thickness > 0,
    color: hexToSketchColorObject(color),
    fillType: FillType.Color,
    position: BorderPosition.Center,
    thickness,
    contextSettings: createGraphicsContextSettings(1),
    gradient: {
      _class: "gradient",
      gradientType: 0,
      elipseLength: 0,
      from: "{0.5, 0}",
      to: "{0.5, 1}",
      stops: []
    }
  };
}

interface StyleOptions {
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
}

function createStyle(options: StyleOptions = {}): Style {
  const fills: Fill[] = [];
  const borders: Border[] = [];
  
  if (options.fillColor) {
    fills.push(createFill(options.fillColor, options.opacity ?? 1));
  }
  
  if (options.borderColor && (options.borderWidth ?? 0) > 0) {
    borders.push(createBorder(options.borderColor, options.borderWidth!));
  }
  
  return {
    _class: "style",
    do_objectID: generateSketchUUID(),
    fills,
    borders,
    borderOptions: createBorderOptions(),
    startMarkerType: MarkerType.OpenArrow,
    endMarkerType: MarkerType.OpenArrow,
    miterLimit: 10,
    windingRule: WindingRule.NonZero,
    shadows: [],
    innerShadows: [],
    contextSettings: createGraphicsContextSettings(options.opacity ?? 1),
    colorControls: createColorControls()
  };
}

function createTextStyle(props: TextProps): Style {
  return {
    _class: "style",
    do_objectID: generateSketchUUID(),
    fills: [createFill(props.color)],
    borders: [],
    borderOptions: createBorderOptions(),
    startMarkerType: MarkerType.OpenArrow,
    endMarkerType: MarkerType.OpenArrow,
    miterLimit: 10,
    windingRule: WindingRule.NonZero,
    textStyle: {
      _class: "textStyle",
      verticalAlignment: TextVerticalAlignment.Top,
      encodedAttributes: {
        MSAttributedStringFontAttribute: {
          _class: "fontDescriptor",
          attributes: {
            name: props.fontFamily,
            size: props.fontSize
          }
        },
        MSAttributedStringColorAttribute: hexToSketchColorObject(props.color)
      }
    },
    shadows: [],
    innerShadows: [],
    contextSettings: createGraphicsContextSettings(1),
    colorControls: createColorControls()
  };
}

function createCurvePoint(
  point: string,
  curveFrom?: string,
  curveTo?: string
): CurvePoint {
  return {
    _class: "curvePoint",
    cornerRadius: 0,
    cornerStyle: CornerStyle.Rounded,
    curveFrom: curveFrom || point,
    curveTo: curveTo || point,
    hasCurveFrom: false,
    hasCurveTo: false,
    curveMode: CurveMode.Straight,
    point
  };
}

function createRectanglePoints(): CurvePoint[] {
  return [
    createCurvePoint("{0, 0}"),
    createCurvePoint("{1, 0}"),
    createCurvePoint("{1, 1}"),
    createCurvePoint("{0, 1}")
  ];
}
