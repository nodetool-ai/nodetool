import pytest
import numpy as np
from io import BytesIO
from PIL import Image
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, Tensor, FolderRef
from nodetool.nodes.nodetool.image import (
    SaveImage,
    GetMetadata,
    BatchToList,
    ConvertToTensor,
    Paste,
    Blend,
    Composite,
)

# Create a dummy ImageRef for testing
buffer = BytesIO()
Image.new("RGB", (100, 100), color="red").save(buffer, format="PNG")
dummy_image = ImageRef(data=buffer.getvalue())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (
            SaveImage(
                image=dummy_image,
                folder=FolderRef(asset_id="dummy_folder"),
                name="test.png",
            ),
            ImageRef,
        ),
        (GetMetadata(image=dummy_image), dict),
        (
            BatchToList(
                batch=ImageRef(data=[bytes(dummy_image.data), bytes(dummy_image.data)])  # type: ignore
            ),
            list,
        ),
        (ConvertToTensor(image=dummy_image), Tensor),
        (Paste(image=dummy_image, paste=dummy_image, left=0, top=0), ImageRef),
        (Blend(image1=dummy_image, image2=dummy_image, alpha=0.5), ImageRef),
        (Composite(image1=dummy_image, image2=dummy_image, mask=dummy_image), ImageRef),
    ],
)
async def test_image_nodes(context: ProcessingContext, node, expected_type):
    try:
        result = await node.process(context)
        assert isinstance(result, expected_type)
    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
