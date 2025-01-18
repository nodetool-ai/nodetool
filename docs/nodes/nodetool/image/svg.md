# nodetool.nodes.nodetool.image.svg

## CircleNode

Generate SVG circle element.

**Tags:** svg, shape, vector, circle

**Fields:**
- **cx**: Center X coordinate (int)
- **cy**: Center Y coordinate (int)
- **radius**: Radius (int)
- **fill**: Fill color (ColorRef)
- **stroke**: Stroke color (ColorRef)
- **stroke_width**: Stroke width (int)


## ClipPath

Create clipping paths for SVG elements.

Use cases:
- Mask parts of elements
- Create complex shapes through clipping
- Apply visual effects using masks

**Tags:** svg, clip, mask

**Fields:**
- **clip_content**: SVG element to use as clip path (SVGElement)
- **content**: SVG element to clip (SVGElement)


## Combine

Combine multiple SVG elements into a list.

Use cases:
- Merge multiple SVG elements into a single list
- Prepare elements for SVGDocument
- Group related SVG elements together

**Tags:** svg, combine, list

**Fields:**
- **element1**: First SVG element to combine (typing.Optional[nodetool.metadata.types.SVGElement])
- **element2**: Second SVG element to combine (typing.Optional[nodetool.metadata.types.SVGElement])
- **element3**: Third SVG element to combine (typing.Optional[nodetool.metadata.types.SVGElement])
- **element4**: Fourth SVG element to combine (typing.Optional[nodetool.metadata.types.SVGElement])
- **element5**: Fifth SVG element to combine (typing.Optional[nodetool.metadata.types.SVGElement])


## Document

Combine SVG elements into a complete SVG document.

Use cases:
- Combine multiple SVG elements into a single document
- Set document-level properties like viewBox and dimensions
- Export complete SVG documents

**Tags:** svg, document, combine

**Fields:**
- **content**: SVG content (str | nodetool.metadata.types.SVGElement | list[nodetool.metadata.types.SVGElement])
- **width**: Document width (int)
- **height**: Document height (int)
- **viewBox**: SVG viewBox attribute (str)


## DropShadow

Apply drop shadow filter to SVG elements.

**Tags:** svg, filter, shadow, effects

**Fields:**
- **std_deviation**: Standard deviation for blur (float)
- **dx**: X offset for shadow (int)
- **dy**: Y offset for shadow (int)
- **color**: Color for shadow (ColorRef)


## EllipseNode

Generate SVG ellipse element.

**Tags:** svg, shape, vector, ellipse

**Fields:**
- **cx**: Center X coordinate (int)
- **cy**: Center Y coordinate (int)
- **rx**: X radius (int)
- **ry**: Y radius (int)
- **fill**: Fill color (ColorRef)
- **stroke**: Stroke color (ColorRef)
- **stroke_width**: Stroke width (int)


## GaussianBlur

Apply Gaussian blur filter to SVG elements.

**Tags:** svg, filter, blur, effects

**Fields:**
- **std_deviation**: Standard deviation for blur (float)


## Gradient

Create linear or radial gradients for SVG elements.

Use cases:
- Add smooth color transitions
- Create complex color effects
- Define reusable gradient definitions

**Tags:** svg, gradient, color

**Fields:**
- **gradient_type**: Type of gradient (GradientType)
- **x1**: Start X position (linear) or center X (radial) (float)
- **y1**: Start Y position (linear) or center Y (radial) (float)
- **x2**: End X position (linear) or radius X (radial) (float)
- **y2**: End Y position (linear) or radius Y (radial) (float)
- **color1**: Start color of gradient (ColorRef)
- **color2**: End color of gradient (ColorRef)


## LineNode

Generate SVG line element.

**Tags:** svg, shape, vector, line

**Fields:**
- **x1**: Start X coordinate (int)
- **y1**: Start Y coordinate (int)
- **x2**: End X coordinate (int)
- **y2**: End Y coordinate (int)
- **stroke**: Stroke color (ColorRef)
- **stroke_width**: Stroke width (int)


## PathNode

Generate SVG path element.

**Tags:** svg, shape, vector, path

**Fields:**
- **path_data**: SVG path data (d attribute) (str)
- **fill**: Fill color (ColorRef)
- **stroke**: Stroke color (ColorRef)
- **stroke_width**: Stroke width (int)


## PolygonNode

Generate SVG polygon element.

**Tags:** svg, shape, vector, polygon

**Fields:**
- **points**: Points in format 'x1,y1 x2,y2 x3,y3...' (str)
- **fill**: Fill color (ColorRef)
- **stroke**: Stroke color (ColorRef)
- **stroke_width**: Stroke width (int)


## RectNode

Generate SVG rectangle element.

**Tags:** svg, shape, vector, rectangle

**Fields:**
- **x**: X coordinate (int)
- **y**: Y coordinate (int)
- **width**: Width (int)
- **height**: Height (int)
- **fill**: Fill color (ColorRef)
- **stroke**: Stroke color (ColorRef)
- **stroke_width**: Stroke width (int)


## SVGTextAnchor

An enumeration.

## SVGToImage

Create an SVG document and convert it to a raster image in one step.

Use cases:
- Create and rasterize SVG documents in a single operation
- Generate image files from SVG elements
- Convert vector graphics to bitmap format with custom dimensions

**Tags:** svg, document, raster, convert

**Fields:**
- **content**: SVG content (str | nodetool.metadata.types.SVGElement | list[nodetool.metadata.types.SVGElement])
- **width**: Document width (int)
- **height**: Document height (int)
- **viewBox**: SVG viewBox attribute (str)
- **scale**: Scale factor for rasterization (int)


## Text

Add text elements to SVG.

Use cases:
- Add labels to vector graphics
- Create text-based logos
- Generate dynamic text content in SVGs

**Tags:** svg, text, typography

**Fields:**
- **text**: Text content (str)
- **x**: X coordinate (int)
- **y**: Y coordinate (int)
- **font_family**: Font family (str)
- **font_size**: Font size (int)
- **fill**: Text color (ColorRef)
- **text_anchor**: Text anchor position (SVGTextAnchor)


## Transform

Apply transformations to SVG elements.

Use cases:
- Rotate, scale, or translate elements
- Create complex transformations
- Prepare elements for animation

**Tags:** svg, transform, animation

**Fields:**
- **content**: SVG element to transform (SVGElement)
- **translate_x**: X translation (float)
- **translate_y**: Y translation (float)
- **rotate**: Rotation angle in degrees (float)
- **scale_x**: X scale factor (float)
- **scale_y**: Y scale factor (float)


