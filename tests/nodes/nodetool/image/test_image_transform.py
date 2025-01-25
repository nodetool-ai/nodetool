import pytest
from io import BytesIO
from PIL import Image
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, NPArray
from nodetool.nodes.lib.image.pillow.filter import (
    Invert,
    Solarize,
    Posterize,
    Fit,
    Expand,
    Blur,
    Contour,
    Emboss,
    FindEdges,
    Smooth,
    Canny,
    Scale,
    Resize,
    Crop,
    ConvertToGrayscale,
    GetChannel,
)

# Create a dummy ImageRef for testing
buffer = BytesIO()
Image.new("RGB", (100, 100), color="red").save(buffer, format="PNG")
dummy_image = ImageRef(data=buffer.getvalue())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (Invert(image=dummy_image), ImageRef),
        (Solarize(image=dummy_image, threshold=128), ImageRef),
        (Posterize(image=dummy_image, bits=4), ImageRef),
        (Fit(image=dummy_image, width=200, height=200), ImageRef),
        (Expand(image=dummy_image, border=10, fill=0), ImageRef),
        (Blur(image=dummy_image, radius=2), ImageRef),
        (Contour(image=dummy_image), ImageRef),
        (Emboss(image=dummy_image), ImageRef),
        (FindEdges(image=dummy_image), ImageRef),
        (Smooth(image=dummy_image), ImageRef),
        (Canny(image=dummy_image, low_threshold=100, high_threshold=200), ImageRef),
        (Scale(image=dummy_image, scale=1.5), ImageRef),
        (Resize(image=dummy_image, width=200, height=200), ImageRef),
        (Crop(image=dummy_image, left=10, top=10, right=90, bottom=90), ImageRef),
        (ConvertToGrayscale(image=dummy_image), ImageRef),
        (GetChannel(image=dummy_image, channel=GetChannel.ChannelEnum.RED), ImageRef),
    ],
)
async def test_image_transform_nodes(context: ProcessingContext, node, expected_type):
    try:
        result = await node.process(context)
        assert isinstance(result, expected_type)

        if isinstance(result, ImageRef):
            assert result.data is not None
            assert len(result.data) > 0

    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
