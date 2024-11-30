from io import BytesIO
import pytest
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, Tensor
from nodetool.nodes.nodetool.image.source import Background, RenderText, GaussianNoise
import PIL.Image

# Create a dummy ImageRef for testing
buffer = BytesIO()
PIL.Image.new("RGB", (100, 100), color="red").save(buffer, format="PNG")
dummy_image = ImageRef(data=buffer.getvalue())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (Background(width=512, height=512), ImageRef),
        (
            RenderText(
                text="Test",
                font=RenderText.TextFont.DejaVuSans,
                x=0.5,
                y=0.5,
                size=24,
                align=RenderText.TextAlignment.CENTER,
                image=dummy_image,
            ),
            ImageRef,
        ),
        (GaussianNoise(mean=0.0, stddev=1.0, width=512, height=512), ImageRef),
    ],
)
async def test_image_source_nodes(context: ProcessingContext, node, expected_type):
    try:
        result = await node.process(context)
        assert isinstance(result, expected_type)

        if isinstance(result, ImageRef):
            assert result.data is not None
            assert len(result.data) > 0

        # Additional assertions could be added here to check specific properties
        # of the generated images if needed

    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
