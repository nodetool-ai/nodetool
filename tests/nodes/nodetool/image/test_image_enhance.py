import pytest
from io import BytesIO
from PIL import Image
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.nodes.lib.image.pillow.enhance import (
    AutoContrast,
    Sharpness,
    Equalize,
    Contrast,
    EdgeEnhance,
    Sharpen,
    RankFilter,
    UnsharpMask,
    Brightness,
    Color,
    Detail,
    AdaptiveContrast,
)

# Create a dummy ImageRef for testing
buffer = BytesIO()
Image.new("RGB", (100, 100), color="red").save(buffer, format="PNG")
dummy_image = ImageRef(data=buffer.getvalue())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node",
    [
        AutoContrast(image=dummy_image, cutoff=0),
        Sharpness(image=dummy_image, factor=1.5),
        Equalize(image=dummy_image),
        Contrast(image=dummy_image, factor=1.5),
        EdgeEnhance(image=dummy_image),
        Sharpen(image=dummy_image),
        RankFilter(image=dummy_image, size=3, rank=1),
        UnsharpMask(image=dummy_image, radius=2, percent=150, threshold=3),
        Brightness(image=dummy_image, factor=1.2),
        Color(image=dummy_image, factor=1.2),
        Detail(image=dummy_image),
        AdaptiveContrast(image=dummy_image, clip_limit=2.0, grid_size=8),
    ],
)
async def test_image_enhance_nodes(context: ProcessingContext, node):
    try:
        result = await node.process(context)
        assert isinstance(result, ImageRef)
    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
