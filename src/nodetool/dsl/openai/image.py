from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.openai.image
import nodetool.nodes.openai.image
import nodetool.nodes.openai.image

class Dall_E(GraphNode):
    """
    Generates images from textual descriptions using DALL-E 3.
    image, t2i, tti, text-to-image, create, generate, dall-e, picture, photo, art, drawing, illustration

    Use cases:
    1. Create custom illustrations for articles or presentations
    2. Generate concept art for creative projects
    3. Produce visual aids for educational content
    4. Design unique marketing visuals or product mockups
    5. Explore artistic ideas and styles programmatically
    """

    Size: typing.ClassVar[type] = nodetool.nodes.openai.image.Dall_E.Size
    Quality: typing.ClassVar[type] = nodetool.nodes.openai.image.Dall_E.Quality
    Style: typing.ClassVar[type] = nodetool.nodes.openai.image.Dall_E.Style
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    size: nodetool.nodes.openai.image.Dall_E.Size = Field(default=Size._1024x1024, description='The size of the image to generate.')
    quality: nodetool.nodes.openai.image.Dall_E.Quality = Field(default=Quality.standard, description='The quality of the image to generate.')
    style: nodetool.nodes.openai.image.Dall_E.Style = Field(default=Style.natural, description='The style to use.')

    @classmethod
    def get_node_type(cls): return "openai.image.Dall_E"


