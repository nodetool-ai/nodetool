/**
 * CanvasElement - Renders individual elements on the canvas
 * Uses Konva.js for high-performance canvas rendering
 */

import React, { useRef, useEffect, useCallback, memo } from "react";
import {
  Rect,
  Text,
  Image as KonvaImage,
  Group,
  Transformer,
  Ellipse,
  Line
} from "react-konva";
import Konva from "konva";
import {
  LayoutElement,
  TextProps,
  ImageProps,
  RectProps,
  EllipseProps,
  LineProps,
  GroupProps,
  ShadowEffect,
  Fill
} from "./types";

interface CanvasElementProps {
  element: LayoutElement;
  isSelected: boolean;
  effectiveVisible?: boolean;
  effectiveLocked?: boolean;
  contentOpacity?: number;
  onSelect: (id: string, event: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragStart?: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (
    id: string,
    attrs: { x: number; y: number; width: number; height: number; rotation: number }
  ) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onDragMove?: (id: string, x: number, y: number, width: number, height: number) => { x: number; y: number };
  snapToGrid: (value: number) => number;
}

/**
 * Convert shadow effect to Konva shadow props
 */
function getShadowProps(shadow?: ShadowEffect) {
  if (!shadow?.enabled) {
    return {};
  }
  return {
    shadowColor: shadow.color,
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.offsetX,
    shadowOffsetY: shadow.offsetY,
    shadowEnabled: true
  };
}

/**
 * Get fill color or gradient from Fill type
 */
function getFillFromFill(fill?: Fill, fallbackColor?: string): string | CanvasGradient | undefined {
  if (!fill) {
    return fallbackColor;
  }
  
  if (fill.type === "solid") {
    return fill.color;
  }
  
  // For gradients, return the first color as fallback
  // Full gradient support would require Konva's fillLinearGradientColorStops
  if (fill.stops.length > 0) {
    return fill.stops[0].color;
  }
  
  return fallbackColor;
}

// Text Element Component
const TextElement: React.FC<{
  element: LayoutElement;
  props: TextProps;
}> = memo(({ element, props }) => {
  // Transform text based on textTransform setting
  let displayText = props.content;
  if (props.textTransform === "uppercase") {
    displayText = displayText.toUpperCase();
  } else if (props.textTransform === "lowercase") {
    displayText = displayText.toLowerCase();
  } else if (props.textTransform === "capitalize") {
    displayText = displayText.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  // Calculate vertical offset based on verticalAlignment
  // Note: Konva's Text component handles wrapping and vertical alignment, but we 
  // provide an estimated y-offset for middle/bottom alignment. This is a simplified 
  // approach since Konva doesn't expose computed text metrics directly.
  let yOffset = 0;
  if (props.verticalAlignment === "middle" || props.verticalAlignment === "bottom") {
    // Estimate text height using average character width (~0.5 of fontSize for most fonts)
    // This approximation works reasonably well for proportional fonts
    const estimatedLineHeight = props.fontSize * (props.lineHeight || 1.2);
    const avgCharWidth = props.fontSize * 0.5;
    const estimatedLines = Math.ceil(displayText.length * avgCharWidth / element.width) || 1;
    const textHeight = estimatedLineHeight * estimatedLines;
    
    if (props.verticalAlignment === "middle") {
      yOffset = (element.height - textHeight) / 2;
    } else if (props.verticalAlignment === "bottom") {
      yOffset = element.height - textHeight;
    }
    
    // Ensure offset doesn't push text outside the element bounds
    yOffset = Math.max(0, yOffset);
  }

  // Get text decoration style
  const textDecoration = props.textDecoration === "underline" ? "underline" :
                         props.textDecoration === "strikethrough" ? "line-through" : undefined;

  return (
    <Text
      x={0}
      y={yOffset}
      width={element.width}
      height={element.height}
      text={displayText}
      fontFamily={props.fontFamily}
      fontSize={props.fontSize}
      fontStyle={props.fontWeight === "bold" ? "bold" : "normal"}
      fill={props.color}
      align={props.alignment}
      lineHeight={props.lineHeight}
      letterSpacing={props.letterSpacing || 0}
      textDecoration={textDecoration}
      wrap="word"
      {...getShadowProps(props.shadow)}
    />
  );
});
TextElement.displayName = "TextElement";

// Rectangle Element Component
const RectElement: React.FC<{
  element: LayoutElement;
  props: RectProps;
}> = memo(({ element, props }) => {
  const fillColor = getFillFromFill(props.fill, props.fillColor);
  
  return (
    <Rect
      x={0}
      y={0}
      width={element.width}
      height={element.height}
      fill={fillColor as string}
      stroke={props.borderWidth > 0 ? props.borderColor : undefined}
      strokeWidth={props.borderWidth}
      cornerRadius={props.borderRadius}
      opacity={props.opacity}
      {...getShadowProps(props.shadow)}
    />
  );
});
RectElement.displayName = "RectElement";

// Ellipse Element Component (new)
const EllipseElement: React.FC<{
  element: LayoutElement;
  props: EllipseProps;
}> = memo(({ element, props }) => {
  const fillColor = getFillFromFill(props.fill, props.fillColor);
  
  return (
    <Ellipse
      x={element.width / 2}
      y={element.height / 2}
      radiusX={element.width / 2}
      radiusY={element.height / 2}
      fill={fillColor as string}
      stroke={props.borderWidth > 0 ? props.borderColor : undefined}
      strokeWidth={props.borderWidth}
      opacity={props.opacity}
      {...getShadowProps(props.shadow)}
    />
  );
});
EllipseElement.displayName = "EllipseElement";

// Line Element Component (new)
const LineElement: React.FC<{
  element: LayoutElement;
  props: LineProps;
}> = memo(({ element, props }) => {
  // Draw a horizontal line from left to right of the bounding box
  const points = [0, element.height / 2, element.width, element.height / 2];
  
  // Calculate arrow points if enabled
  const arrowSize = Math.min(props.strokeWidth * 4, 12);
  
  return (
    <>
      <Line
        points={points}
        stroke={props.strokeColor}
        strokeWidth={props.strokeWidth}
        opacity={props.opacity}
        lineCap="round"
        lineJoin="round"
      />
      {props.startArrow && (
        <Line
          points={[
            arrowSize, element.height / 2 - arrowSize / 2,
            0, element.height / 2,
            arrowSize, element.height / 2 + arrowSize / 2
          ]}
          stroke={props.strokeColor}
          strokeWidth={props.strokeWidth}
          opacity={props.opacity}
          lineCap="round"
          lineJoin="round"
        />
      )}
      {props.endArrow && (
        <Line
          points={[
            element.width - arrowSize, element.height / 2 - arrowSize / 2,
            element.width, element.height / 2,
            element.width - arrowSize, element.height / 2 + arrowSize / 2
          ]}
          stroke={props.strokeColor}
          strokeWidth={props.strokeWidth}
          opacity={props.opacity}
          lineCap="round"
          lineJoin="round"
        />
      )}
    </>
  );
});
LineElement.displayName = "LineElement";

// Image Element Component
const ImageElement: React.FC<{
  element: LayoutElement;
  props: ImageProps;
}> = memo(({ element, props }) => {
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!props.source) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = props.source;
    img.onload = () => {
      setImage(img);
    };
    img.onerror = () => {
      setImage(null);
    };
  }, [props.source]);

  if (!image) {
    // Placeholder when no image
    return (
      <Rect
        x={0}
        y={0}
        width={element.width}
        height={element.height}
        fill="#f0f0f0"
        stroke="#ccc"
        strokeWidth={1}
        dash={[5, 5]}
      />
    );
  }

  // Calculate dimensions based on fit mode
  let cropX = 0;
  let cropY = 0;
  let cropWidth = image.width;
  let cropHeight = image.height;
  let drawWidth = element.width;
  let drawHeight = element.height;

  if (props.fit === "contain") {
    const scale = Math.min(
      element.width / image.width,
      element.height / image.height
    );
    drawWidth = image.width * scale;
    drawHeight = image.height * scale;
  } else if (props.fit === "cover") {
    const scale = Math.max(
      element.width / image.width,
      element.height / image.height
    );
    cropWidth = element.width / scale;
    cropHeight = element.height / scale;
    cropX = (image.width - cropWidth) / 2;
    cropY = (image.height - cropHeight) / 2;
  }

  return (
    <KonvaImage
      x={props.fit === "contain" ? (element.width - drawWidth) / 2 : 0}
      y={props.fit === "contain" ? (element.height - drawHeight) / 2 : 0}
      width={drawWidth}
      height={drawHeight}
      image={image}
      opacity={props.opacity}
      crop={
        props.fit === "cover"
          ? { x: cropX, y: cropY, width: cropWidth, height: cropHeight }
          : undefined
      }
    />
  );
});
ImageElement.displayName = "ImageElement";

// Group Element Component
const GroupElement: React.FC<{
  element: LayoutElement;
  props: GroupProps;
  children?: React.ReactNode;
}> = memo(({ element, children }) => {
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={element.width}
        height={element.height}
        fill="transparent"
        stroke="#999"
        strokeWidth={1}
        dash={[4, 4]}
      />
      {children}
    </>
  );
});
GroupElement.displayName = "GroupElement";

// Main CanvasElement Component
const CanvasElement: React.FC<CanvasElementProps> = ({
  element,
  isSelected,
  effectiveVisible,
  effectiveLocked,
  contentOpacity = 1,
  onSelect,
  onDragStart,
  onTransformEnd,
  onDragEnd,
  onDragMove,
  snapToGrid
}) => {
  const shapeRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const isVisible = effectiveVisible ?? element.visible;
  const isLocked = effectiveLocked ?? element.locked;

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isLocked) {
        onSelect(element.id, e);
      }
    },
    [element.id, isLocked, onSelect]
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (onDragMove) {
        const node = e.target;
        const snapped = onDragMove(element.id, node.x(), node.y(), element.width, element.height);
        // Apply snap position during drag
        node.x(snapped.x);
        node.y(snapped.y);
      }
    },
    [element.id, element.width, element.height, onDragMove]
  );

  const handleDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (onDragStart) {
        onDragStart(element.id, e);
      }
    },
    [element.id, onDragStart]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const x = snapToGrid(node.x());
      const y = snapToGrid(node.y());
      node.x(x);
      node.y(y);
      onDragEnd(element.id, x, y);
    },
    [element.id, onDragEnd, snapToGrid]
  );

  const handleTransformEnd = useCallback(() => {
    const node = shapeRef.current;
    if (!node) {
      return;
    }

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale to 1 and adjust dimensions
    node.scaleX(1);
    node.scaleY(1);

    const attrs = {
      x: snapToGrid(node.x()),
      y: snapToGrid(node.y()),
      width: Math.max(10, snapToGrid(node.width() * scaleX)),
      height: Math.max(10, snapToGrid(node.height() * scaleY)),
      rotation: node.rotation()
    };

    node.x(attrs.x);
    node.y(attrs.y);

    onTransformEnd(element.id, attrs);
  }, [element.id, onTransformEnd, snapToGrid]);

  if (!isVisible) {
    return null;
  }

  // Render the appropriate element type
  const renderContent = () => {
    switch (element.type) {
      case "text":
        return (
          <TextElement
            element={element}
            props={element.properties as TextProps}
          />
        );
      case "rectangle":
        return (
          <RectElement
            element={element}
            props={element.properties as RectProps}
          />
        );
      case "ellipse":
        return (
          <EllipseElement
            element={element}
            props={element.properties as EllipseProps}
          />
        );
      case "line":
        return (
          <LineElement
            element={element}
            props={element.properties as LineProps}
          />
        );
      case "image":
        return (
          <ImageElement
            element={element}
            props={element.properties as ImageProps}
          />
        );
      case "group":
        return (
          <GroupElement
            element={element}
            props={element.properties as GroupProps}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Group
        ref={shapeRef}
        id={element.id}
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rotation={element.rotation}
        opacity={contentOpacity}
        draggable={!isLocked}
        onClick={handleClick}
        onTap={handleClick}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        {renderContent()}
      </Group>
      {isSelected && !isLocked && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            // Limit minimum size
            if (newBox.width < 10 || newBox.height < 10) {
              return oldBox;
            }
            return newBox;
          }}
          rotateEnabled={true}
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
            "middle-left",
            "middle-right",
            "top-center",
            "bottom-center"
          ]}
        />
      )}
    </>
  );
};

export default memo(CanvasElement);
