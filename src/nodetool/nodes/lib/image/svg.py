import os
from enum import Enum
import PIL.Image
import io
from typing import Literal, Optional
from pydantic import BaseModel, Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ColorRef, ImageRef, SVGRef, SVGElement


class RectNode(BaseNode):
    """
    Generate SVG rectangle element.
    svg, shape, vector, rectangle
    """

    x: int = Field(default=0, description="X coordinate")
    y: int = Field(default=0, description="Y coordinate")
    width: int = Field(default=100, description="Width")
    height: int = Field(default=100, description="Height")
    fill: ColorRef = Field(default=ColorRef(value="#000000"), description="Fill color")
    stroke: ColorRef = Field(default=ColorRef(value="none"), description="Stroke color")
    stroke_width: int = Field(default=1, description="Stroke width")

    @classmethod
    def get_title(cls) -> str:
        return "Rectangle"

    async def process(self, context: ProcessingContext) -> SVGElement:
        attributes = {
            "x": str(self.x),
            "y": str(self.y),
            "width": str(self.width),
            "height": str(self.height),
            "fill": str(self.fill),
            "stroke": str(self.stroke),
            "stroke-width": str(self.stroke_width),
        }
        return SVGElement(name="rect", attributes=attributes)


class CircleNode(BaseNode):
    """
    Generate SVG circle element.
    svg, shape, vector, circle
    """

    cx: int = Field(default=0, description="Center X coordinate")
    cy: int = Field(default=0, description="Center Y coordinate")
    radius: int = Field(default=50, description="Radius")
    fill: ColorRef = Field(default=ColorRef(value="#000000"), description="Fill color")
    stroke: ColorRef = Field(default=ColorRef(value="none"), description="Stroke color")
    stroke_width: int = Field(default=1, description="Stroke width")

    @classmethod
    def get_title(cls) -> str:
        return "Circle"

    async def process(self, context: ProcessingContext) -> SVGElement:
        attributes = {
            "cx": str(self.cx),
            "cy": str(self.cy),
            "r": str(self.radius),
            "fill": str(self.fill),
            "stroke": str(self.stroke),
            "stroke-width": str(self.stroke_width),
        }
        return SVGElement(name="circle", attributes=attributes)


class EllipseNode(BaseNode):
    """
    Generate SVG ellipse element.
    svg, shape, vector, ellipse
    """

    cx: int = Field(default=0, description="Center X coordinate")
    cy: int = Field(default=0, description="Center Y coordinate")
    rx: int = Field(default=100, description="X radius")
    ry: int = Field(default=50, description="Y radius")
    fill: ColorRef = Field(default=ColorRef(value="#000000"), description="Fill color")
    stroke: ColorRef = Field(default=ColorRef(value="none"), description="Stroke color")
    stroke_width: int = Field(default=1, description="Stroke width")

    @classmethod
    def get_title(cls) -> str:
        return "Ellipse"

    async def process(self, context: ProcessingContext) -> SVGElement:
        attributes = {
            "cx": str(self.cx),
            "cy": str(self.cy),
            "rx": str(self.rx),
            "ry": str(self.ry),
            "fill": str(self.fill),
            "stroke": str(self.stroke),
            "stroke-width": str(self.stroke_width),
        }
        return SVGElement(name="ellipse", attributes=attributes)


class LineNode(BaseNode):
    """
    Generate SVG line element.
    svg, shape, vector, line
    """

    x1: int = Field(default=0, description="Start X coordinate")
    y1: int = Field(default=0, description="Start Y coordinate")
    x2: int = Field(default=100, description="End X coordinate")
    y2: int = Field(default=100, description="End Y coordinate")
    stroke: ColorRef = Field(
        default=ColorRef(value="#000000"), description="Stroke color"
    )
    stroke_width: int = Field(default=1, description="Stroke width")

    @classmethod
    def get_title(cls) -> str:
        return "Line"

    async def process(self, context: ProcessingContext) -> SVGElement:
        attributes = {
            "x1": str(self.x1),
            "y1": str(self.y1),
            "x2": str(self.x2),
            "y2": str(self.y2),
            "stroke": str(self.stroke),
            "stroke-width": str(self.stroke_width),
        }
        return SVGElement(name="line", attributes=attributes)


class PolygonNode(BaseNode):
    """
    Generate SVG polygon element.
    svg, shape, vector, polygon
    """

    points: str = Field(description="Points in format 'x1,y1 x2,y2 x3,y3...'")
    fill: ColorRef = Field(default=ColorRef(value="#000000"), description="Fill color")
    stroke: ColorRef = Field(default=ColorRef(value="none"), description="Stroke color")
    stroke_width: int = Field(default=1, description="Stroke width")

    @classmethod
    def get_title(cls) -> str:
        return "Polygon"

    async def process(self, context: ProcessingContext) -> SVGElement:
        attributes = {
            "points": self.points,
            "fill": str(self.fill),
            "stroke": str(self.stroke),
            "stroke-width": str(self.stroke_width),
        }
        return SVGElement(name="polygon", attributes=attributes)


class PathNode(BaseNode):
    """
    Generate SVG path element.
    svg, shape, vector, path
    """

    path_data: str = Field(description="SVG path data (d attribute)")
    fill: ColorRef = Field(default=ColorRef(value="#000000"), description="Fill color")
    stroke: ColorRef = Field(default=ColorRef(value="none"), description="Stroke color")
    stroke_width: int = Field(default=1, description="Stroke width")

    async def process(self, context: ProcessingContext) -> SVGElement:
        attributes = {
            "d": self.path_data,
            "fill": str(self.fill),
            "stroke": str(self.stroke),
            "stroke-width": str(self.stroke_width),
        }
        return SVGElement(name="path", attributes=attributes)


class SVGTextAnchor(str, Enum):
    START = "start"
    MIDDLE = "middle"
    END = "end"


class Text(BaseNode):
    """
    Add text elements to SVG.
    svg, text, typography

    Use cases:
    - Add labels to vector graphics
    - Create text-based logos
    - Generate dynamic text content in SVGs
    """

    text: str = Field(default="", description="Text content")
    x: int = Field(default=0, description="X coordinate")
    y: int = Field(default=0, description="Y coordinate")
    font_family: str = Field(default="Arial", description="Font family")
    font_size: int = Field(default=16, description="Font size")
    fill: ColorRef = Field(default=ColorRef(value="#000000"), description="Text color")
    text_anchor: SVGTextAnchor = Field(
        default=SVGTextAnchor.START, description="Text anchor position"
    )

    async def process(self, context: ProcessingContext) -> SVGElement:
        print(self)
        attributes = {
            "x": str(self.x),
            "y": str(self.y),
            "font-family": self.font_family,
            "font-size": str(self.font_size),
            "fill": self.fill.value,
            "text-anchor": self.text_anchor.value,
        }
        return SVGElement(name="text", attributes=attributes, content=self.text)


class GaussianBlur(BaseNode):
    """
    Apply Gaussian blur filter to SVG elements.
    svg, filter, blur, effects
    """

    std_deviation: float = Field(default=3.0, description="Standard deviation for blur")

    async def process(self, context: ProcessingContext) -> SVGElement:
        filter_id = "filter_gaussian_blur"
        return SVGElement(
            name="filter",
            attributes={"id": filter_id},
            children=[
                SVGElement(
                    name="feGaussianBlur",
                    attributes={"stdDeviation": str(self.std_deviation)},
                )
            ],
        )


class DropShadow(BaseNode):
    """
    Apply drop shadow filter to SVG elements.
    svg, filter, shadow, effects
    """

    std_deviation: float = Field(default=3.0, description="Standard deviation for blur")
    dx: int = Field(default=2, description="X offset for shadow")
    dy: int = Field(default=2, description="Y offset for shadow")
    color: ColorRef = Field(
        default=ColorRef(value="#000000"), description="Color for shadow"
    )

    async def process(self, context: ProcessingContext) -> SVGElement:
        filter_id = "filter_drop_shadow"
        return SVGElement(
            name="filter",
            attributes={"id": filter_id},
            children=[
                SVGElement(
                    name="feGaussianBlur",
                    attributes={
                        "in": "SourceAlpha",
                        "stdDeviation": str(self.std_deviation),
                    },
                ),
                SVGElement(
                    name="feOffset",
                    attributes={"dx": str(self.dx), "dy": str(self.dy)},
                ),
                SVGElement(
                    name="feFlood",
                    attributes={"flood-color": self.color.value or ""},
                ),
                SVGElement(
                    name="feComposite",
                    attributes={"operator": "in", "in2": "SourceAlpha"},
                ),
                SVGElement(
                    name="feMerge",
                    children=[
                        SVGElement(name="feMergeNode"),
                        SVGElement(
                            name="feMergeNode", attributes={"in": "SourceGraphic"}
                        ),
                    ],
                ),
            ],
        )


class Document(BaseNode):
    """
    Combine SVG elements into a complete SVG document.
    svg, document, combine

    Use cases:
    - Combine multiple SVG elements into a single document
    - Set document-level properties like viewBox and dimensions
    - Export complete SVG documents
    """

    @classmethod
    def get_title(cls) -> str:
        return "SVG Document"

    content: str | SVGElement | list[SVGElement] = Field(
        default=[], description="SVG content"
    )
    width: int = Field(default=800, ge=1, le=4096, description="Document width")
    height: int = Field(default=600, ge=1, le=4096, description="Document height")
    viewBox: str = Field(default="0 0 800 600", description="SVG viewBox attribute")

    async def process(self, context: ProcessingContext) -> SVGRef:
        if isinstance(self.content, list):
            content_str = "\n".join(str(element) for element in self.content)
        else:
            content_str = str(self.content)

        svg_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="{self.width}" 
     height="{self.height}" 
     viewBox="{self.viewBox}">
    {content_str}
</svg>"""

        return SVGRef(data=svg_content.encode("utf-8"))


class Combine(BaseNode):
    """
    Combine multiple SVG elements into a list.
    svg, combine, list

    Use cases:
    - Merge multiple SVG elements into a single list
    - Prepare elements for SVGDocument
    - Group related SVG elements together
    """

    element1: Optional[SVGElement] = Field(
        default=None, description="First SVG element to combine"
    )
    element2: Optional[SVGElement] = Field(
        default=None, description="Second SVG element to combine"
    )
    element3: Optional[SVGElement] = Field(
        default=None, description="Third SVG element to combine"
    )
    element4: Optional[SVGElement] = Field(
        default=None, description="Fourth SVG element to combine"
    )
    element5: Optional[SVGElement] = Field(
        default=None, description="Fifth SVG element to combine"
    )

    async def process(self, context: ProcessingContext) -> list[SVGElement]:
        elements = []
        for element in [
            self.element1,
            self.element2,
            self.element3,
            self.element4,
            self.element5,
        ]:
            if element is not None:
                elements.append(element)
        return elements


class SVGToImage(BaseNode):
    """
    Create an SVG document and convert it to a raster image in one step.
    svg, document, raster, convert

    Use cases:
    - Create and rasterize SVG documents in a single operation
    - Generate image files from SVG elements
    - Convert vector graphics to bitmap format with custom dimensions
    """

    @classmethod
    def get_title(cls) -> str:
        return "SVG to Image"

    content: str | SVGElement | list[SVGElement] = Field(
        default=[], description="SVG content"
    )
    width: int = Field(default=800, ge=1, le=4096, description="Document width")
    height: int = Field(default=600, ge=1, le=4096, description="Document height")
    viewBox: str = Field(default="0 0 800 600", description="SVG viewBox attribute")
    scale: int = Field(
        default=1, ge=1, le=10, description="Scale factor for rasterization"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        # Create SVG document
        if isinstance(self.content, list):
            content_str = "\n".join(str(element) for element in self.content)
        else:
            content_str = str(self.content)

        svg_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="{self.width}" 
     height="{self.height}" 
     viewBox="{self.viewBox}">
    {content_str}
</svg>"""

        import cairosvg

        # Convert to PNG using cairosvg
        png_data = cairosvg.svg2png(
            bytestring=svg_content.encode("utf-8"),
            output_width=self.width,
            output_height=self.height,
            scale=self.scale,
        )

        assert isinstance(png_data, bytes)

        image = PIL.Image.open(io.BytesIO(png_data))
        return await context.image_from_pil(image)


class Gradient(BaseNode):
    """
    Create linear or radial gradients for SVG elements.
    svg, gradient, color

    Use cases:
    - Add smooth color transitions
    - Create complex color effects
    - Define reusable gradient definitions
    """

    class GradientType(str, Enum):
        LINEAR = "linearGradient"
        RADIAL = "radialGradient"

    gradient_type: GradientType = Field(
        default=GradientType.LINEAR, description="Type of gradient"
    )
    x1: float = Field(
        default=0, description="Start X position (linear) or center X (radial)"
    )
    y1: float = Field(
        default=0, description="Start Y position (linear) or center Y (radial)"
    )
    x2: float = Field(
        default=100, description="End X position (linear) or radius X (radial)"
    )
    y2: float = Field(
        default=100, description="End Y position (linear) or radius Y (radial)"
    )
    color1: ColorRef = Field(
        default=ColorRef(value="#000000"), description="Start color of gradient"
    )
    color2: ColorRef = Field(
        default=ColorRef(value="#FFFFFF"), description="End color of gradient"
    )

    async def process(self, context: ProcessingContext) -> SVGElement:
        gradient_id = f"gradient_{self.gradient_type.value}"

        attributes = {
            "id": gradient_id,
        }

        if self.gradient_type == self.GradientType.LINEAR:
            attributes.update(
                {
                    "x1": f"{self.x1}%",
                    "y1": f"{self.y1}%",
                    "x2": f"{self.x2}%",
                    "y2": f"{self.y2}%",
                }
            )
        else:
            attributes.update(
                {"cx": f"{self.x1}%", "cy": f"{self.y1}%", "r": f"{self.x2}%"}
            )

        stops = [
            SVGElement(
                name="stop",
                attributes={
                    "offset": "0%",
                    "style": f"stop-color:{self.color1};stop-opacity:1",
                },
            ),
            SVGElement(
                name="stop",
                attributes={
                    "offset": "100%",
                    "style": f"stop-color:{self.color2};stop-opacity:1",
                },
            ),
        ]

        return SVGElement(
            name=self.gradient_type.value, attributes=attributes, children=stops
        )


class Transform(BaseNode):
    """
    Apply transformations to SVG elements.
    svg, transform, animation

    Use cases:
    - Rotate, scale, or translate elements
    - Create complex transformations
    - Prepare elements for animation
    """

    content: SVGElement = Field(default=None, description="SVG element to transform")
    translate_x: float = Field(default=0, description="X translation")
    translate_y: float = Field(default=0, description="Y translation")
    rotate: float = Field(default=0, description="Rotation angle in degrees")
    scale_x: float = Field(default=1, description="X scale factor")
    scale_y: float = Field(default=1, description="Y scale factor")

    async def process(self, context: ProcessingContext) -> SVGElement:
        if not self.content:
            return SVGElement()

        transforms = []

        if self.translate_x != 0 or self.translate_y != 0:
            transforms.append(f"translate({self.translate_x},{self.translate_y})")

        if self.rotate != 0:
            transforms.append(f"rotate({self.rotate})")

        if self.scale_x != 1 or self.scale_y != 1:
            transforms.append(f"scale({self.scale_x},{self.scale_y})")

        if transforms:
            self.content.attributes["transform"] = " ".join(transforms)

        return self.content


class ClipPath(BaseNode):
    """
    Create clipping paths for SVG elements.
    svg, clip, mask

    Use cases:
    - Mask parts of elements
    - Create complex shapes through clipping
    - Apply visual effects using masks
    """

    clip_content: SVGElement = Field(
        default=None, description="SVG element to use as clip path"
    )
    content: SVGElement = Field(default=None, description="SVG element to clip")

    async def process(self, context: ProcessingContext) -> SVGElement:
        if not self.clip_content or not self.content:
            return SVGElement()

        clip_id = "clip_path_" + str(id(self))

        clip_path = SVGElement(
            name="clipPath", attributes={"id": clip_id}, children=[self.clip_content]
        )

        self.content.attributes["clip-path"] = f"url(#{clip_id})"

        return SVGElement(name="g", children=[clip_path, self.content])
