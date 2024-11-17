import os
from enum import Enum
import PIL.Image
import io
import cairosvg
from typing import Literal, Optional
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, SVGRef, SVGElement


class SVGToImage(BaseNode):
    """
    Convert an SVG to a raster image.
    svg, raster, convert

    Use cases:
    - Convert vector graphics to bitmap format
    - Generate thumbnails from SVG files
    - Prepare SVGs for platforms that don't support vector graphics
    """

    svg: SVGRef = Field(default=SVGRef(), description="The SVG to convert")
    width: Optional[int] = Field(
        default=None, ge=1, le=4096, description="Output width"
    )
    height: Optional[int] = Field(
        default=None, ge=1, le=4096, description="Output height"
    )
    scale: int = Field(default=1, ge=1, le=10, description="Scale factor")

    @classmethod
    def get_title(cls) -> str:
        return "SVG to Image"

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.svg.data is None:
            raise ValueError("SVG data is empty")

        # Convert SVG to PNG using cairosvg
        png_data = cairosvg.svg2png(
            bytestring=self.svg.data,
            output_width=self.width,
            output_height=self.height,
            scale=self.scale,
        )

        assert isinstance(png_data, bytes)

        image = PIL.Image.open(io.BytesIO(png_data))
        return await context.image_from_pil(image)


class SVGShape(BaseNode):
    """
    Generate SVG shape elements.
    svg, shape, vector

    Use cases:
    - Create basic geometric shapes
    - Build complex vector graphics from primitives
    - Generate pattern elements
    """

    class ShapeType(str, Enum):
        RECT = "rect"
        CIRCLE = "circle"
        ELLIPSE = "ellipse"
        LINE = "line"
        POLYGON = "polygon"
        PATH = "path"

    shape_type: ShapeType = Field(default=ShapeType.RECT, description="Type of shape")
    x: int = Field(default=0, description="X coordinate")
    y: int = Field(default=0, description="Y coordinate")
    width: Optional[int] = Field(default=None, description="Width (for rect)")
    height: Optional[int] = Field(default=None, description="Height (for rect)")
    radius: Optional[int] = Field(default=None, description="Radius (for circle)")
    fill: str = Field(default="black", description="Fill color")
    stroke: str = Field(default="none", description="Stroke color")
    stroke_width: int = Field(default=1, description="Stroke width")
    path_data: Optional[str] = Field(default=None, description="Path data (for path)")
    points: Optional[str] = Field(default=None, description="Points (for polygon)")

    @classmethod
    def get_title(cls) -> str:
        return "SVG Shape"

    async def process(self, context: ProcessingContext) -> SVGElement:
        attributes = f'fill="{self.fill}" stroke="{self.stroke}" stroke-width="{self.stroke_width}"'

        if self.shape_type == self.ShapeType.RECT:
            content = f'<rect x="{self.x}" y="{self.y}" width="{self.width}" height="{self.height}" {attributes}/>'
        elif self.shape_type == self.ShapeType.CIRCLE:
            content = (
                f'<circle cx="{self.x}" cy="{self.y}" r="{self.radius}" {attributes}/>'
            )
        elif self.shape_type == self.ShapeType.ELLIPSE:
            content = f'<ellipse cx="{self.x}" cy="{self.y}" rx="{self.width}" ry="{self.height}" {attributes}/>'
        elif self.shape_type == self.ShapeType.LINE:
            content = f'<line x1="{self.x}" y1="{self.y}" x2="{self.width}" y2="{self.height}" {attributes}/>'
        elif self.shape_type == self.ShapeType.POLYGON:
            content = f'<polygon points="{self.points}" {attributes}/>'
        elif self.shape_type == self.ShapeType.PATH:
            content = f'<path d="{self.path_data}" {attributes}/>'

        return SVGElement(content=content)


class SVGTextAnchor(str, Enum):
    START = "start"
    MIDDLE = "middle"
    END = "end"


class SVGText(BaseNode):
    """
    Add text elements to SVG.
    svg, text, typography

    Use cases:
    - Add labels to vector graphics
    - Create text-based logos
    - Generate dynamic text content in SVGs
    """

    @classmethod
    def get_title(cls) -> str:
        return "SVG Text"

    text: str = Field(default="", description="Text content")
    x: int = Field(default=0, description="X coordinate")
    y: int = Field(default=0, description="Y coordinate")
    font_family: str = Field(default="Arial", description="Font family")
    font_size: int = Field(default=16, description="Font size")
    fill: str = Field(default="black", description="Text color")
    text_anchor: SVGTextAnchor = Field(
        default=SVGTextAnchor.START, description="Text anchor position"
    )

    async def process(self, context: ProcessingContext) -> SVGElement:
        attributes = {
            "x": str(self.x),
            "y": str(self.y),
            "font-family": self.font_family,
            "font-size": str(self.font_size),
            "fill": self.fill,
            "text-anchor": self.text_anchor.value,
        }
        return SVGElement(name="text", attributes=attributes, content=self.text)


class SVGFilter(BaseNode):
    """
    Apply SVG filters to elements.
    svg, filter, effects

    Use cases:
    - Add shadows and glows
    - Create blur effects
    - Apply color transformations
    """

    @classmethod
    def get_title(cls) -> str:
        return "SVG Filter"

    class FilterType(str, Enum):
        GAUSSIAN_BLUR = "gaussian-blur"
        DROP_SHADOW = "drop-shadow"
        COLOR_MATRIX = "color-matrix"

    filter_type: FilterType = Field(
        default=FilterType.GAUSSIAN_BLUR, description="Type of filter"
    )
    std_deviation: float = Field(default=3.0, description="Standard deviation for blur")
    dx: int = Field(default=2, description="X offset for shadow")
    dy: int = Field(default=2, description="Y offset for shadow")
    color: str = Field(default="black", description="Color for shadow")
    matrix: str = Field(default="", description="Color matrix values")

    async def process(self, context: ProcessingContext) -> SVGElement:
        filter_id = f"filter_{self.filter_type.value}"
        children = []

        if self.filter_type == self.FilterType.GAUSSIAN_BLUR:
            children.append(
                SVGElement(
                    name="feGaussianBlur",
                    attributes={"stdDeviation": str(self.std_deviation)},
                )
            )
        elif self.filter_type == self.FilterType.DROP_SHADOW:
            children.extend(
                [
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
                    SVGElement(name="feFlood", attributes={"flood-color": self.color}),
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
                ]
            )
        elif self.filter_type == self.FilterType.COLOR_MATRIX:
            children.append(
                SVGElement(
                    name="feColorMatrix",
                    attributes={"type": "matrix", "values": self.matrix},
                )
            )

        return SVGElement(
            name="filter", attributes={"id": filter_id}, children=children
        )


class SVGDocument(BaseNode):
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
        default_factory=list, description="SVG content"
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


class SVGCombine(BaseNode):
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
        return "SVG Document to Image"

    content: str | SVGElement | list[SVGElement] = Field(
        default_factory=list, description="SVG content"
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
