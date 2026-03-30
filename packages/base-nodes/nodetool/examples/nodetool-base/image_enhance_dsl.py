"""
Image Enhance DSL Example

Improve image quality with basic enhancement tools like sharpening, contrast and color adjustment.

Workflow:
1. **Image Input** - Load the source image
2. **Sharpen** - Apply sharpening filter to enhance edges and details
3. **Auto Contrast** - Automatically adjust contrast for optimal visibility
4. **Image Output** - Save the enhanced result
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.workflows.processing_context import AssetOutputMode
from nodetool.dsl.nodetool.input import ImageInput
from nodetool.dsl.lib.pillow.enhance import Sharpen, AutoContrast
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import ImageRef


# Load image from URL
image_input = ImageInput(
    name="image",
    description="",
    value=ImageRef(
        uri="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Blurry_photo.jpg/1600px-Blurry_photo.jpg?20220511161035",
        type="image",
    ),
)

# Apply enhancements in sequence: Sharpen → AutoContrast
sharpened = Sharpen(image=image_input.output)
enhanced = AutoContrast(
    image=sharpened.output,
    cutoff=108,
)

# Output the enhanced image
output = Output(
    name="enhanced",
    description="",
    value=enhanced.output,
)

# Create the graph
graph = create_graph(output)


if __name__ == "__main__":
    result = run_graph(graph, asset_output_mode=AssetOutputMode.WORKSPACE)
    print(f"Enhanced image saved: {result}")
