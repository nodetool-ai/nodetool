import io
import numpy as np
import pandas as pd
import pytest
import pydub
import os
from nodetool.metadata.types import AudioRef, DataframeRef, Tensor
from nodetool.metadata.types import FolderRef
from nodetool.common.environment import Environment

from nodetool.nodes.nodetool.audio import SaveAudio
from nodetool.nodes.nodetool.tensor import SaveTensor
from nodetool.workflows.graph import Graph
from nodetool.metadata.types import ImageRef
from nodetool.workflows.processing_context import ProcessingContext
import PIL.Image
from nodetool.models.asset import (
    Asset,
)

from nodetool.models.user import User
from nodetool.nodes.nodetool.constant import Image
from nodetool.nodes.nodetool.dataframe import SaveDataframe
from nodetool.nodes.nodetool.image import Blend, Composite, SaveImg
from nodetool.nodes.nodetool.image.source import Background
from nodetool.nodes.nodetool.image.transform import (
    AutoContrast,
    Blur,
    Brightness,
    Color,
    Contour,
    Contrast,
    Detail,
    EdgeEnhance,
    Emboss,
    Equalize,
    Expand,
    FindEdges,
    Fit,
    GetChannel,
    Invert,
    Posterize,
    RankFilter,
    Resize,
    Scale,
    Sharpen,
    Sharpness,
    Smooth,
    Solarize,
    UnsharpMask,
)
from nodetool.nodes.nodetool.text import SaveText


current_dir = os.path.dirname(os.path.realpath(__file__))
parent_dir = os.path.dirname(current_dir)
test_file = os.path.join(parent_dir, "test.jpg")


@pytest.fixture(scope="session")
def pil_image():
    return PIL.Image.open(test_file).convert("RGB")


@pytest.fixture(scope="function")
def image(pil_image: PIL.Image.Image, user: User):
    buffer = io.BytesIO()
    pil_image.save(buffer, format="PNG")
    buffer.seek(0)
    uri = Environment.get_temp_storage().upload("test.jpg", buffer)
    return ImageRef(uri=uri)


@pytest.fixture(scope="function")
def graph():
    return Graph()


@pytest.fixture(scope="function")
def input_image(image: ImageRef):
    return Image(value=image)


@pytest.mark.asyncio
async def test_background_node(context: ProcessingContext):
    res = await Background().process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_get_channel_node(image: ImageRef, context: ProcessingContext):
    res = await GetChannel(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_contrast_node(image: ImageRef, context: ProcessingContext):
    res = await Contrast(image=image, factor=1.0).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_brightness_node(image: ImageRef, context: ProcessingContext):
    res = await Brightness(image=image, factor=1.0).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_color_node(image: ImageRef, context: ProcessingContext):
    res = await Color(image=image, factor=1.0).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_sharpness_node(image: ImageRef, context: ProcessingContext):
    res = await Sharpness(image=image, factor=1.0).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_autocontrast_node(image: ImageRef, context: ProcessingContext):
    res = await AutoContrast(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_invert_node(image: ImageRef, context: ProcessingContext):
    res = await Invert(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_solarize_node(image: ImageRef, context: ProcessingContext):
    res = await Solarize(image=image, threshold=128).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_posterize_node(image: ImageRef, context: ProcessingContext):
    res = await Posterize(image=image, bits=4).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_equalize_node(image: ImageRef, context: ProcessingContext):
    res = await Equalize(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_fit_node(image: ImageRef, context: ProcessingContext):
    res = await Fit(image=image, width=100, height=100).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_expand_node(
    pil_image: PIL.Image.Image, image: ImageRef, context: ProcessingContext
):
    res = await Expand(image=image, border=10).process(context)
    res_img = await context.image_to_pil(res)
    assert res_img.width == pil_image.width + 20, "Should have border"
    assert res_img.height == pil_image.height + 20, "Should have border"


@pytest.mark.asyncio
async def test_blur_node(image: ImageRef, context: ProcessingContext):
    res = await Blur(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_contour_node(image: ImageRef, context: ProcessingContext):
    res = await Contour(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_detail_node(image: ImageRef, context: ProcessingContext):
    res = await Detail(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_edge_enhance_node(image: ImageRef, context: ProcessingContext):
    res = await EdgeEnhance(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_emboss_node(image: ImageRef, context: ProcessingContext):
    res = await Emboss(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_find_edges_node(image: ImageRef, context: ProcessingContext):
    res = await FindEdges(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_smooth_node(image: ImageRef, context: ProcessingContext):
    res = await Smooth(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_sharpen_node(image: ImageRef, context: ProcessingContext):
    res = await Sharpen(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_rank_filter_node(image: ImageRef, context: ProcessingContext):
    res = await RankFilter(image=image, size=3, rank=3).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_unsharp_mask_node(image: ImageRef, context: ProcessingContext):
    res = await UnsharpMask(image=image, radius=3, percent=150, threshold=3).process(
        context
    )
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_blend(image: ImageRef, context: ProcessingContext):
    res = await Blend(
        image1=image,
        image2=image,
        alpha=0.5,
    ).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_resize(image: ImageRef, context: ProcessingContext):
    res = await Resize(
        image=image,
        width=100,
        height=100,
    ).process(context)
    res_img = await context.image_to_pil(res)
    assert res_img.size == (100, 100), "Should be the same size"


@pytest.mark.asyncio
async def test_composite(
    pil_image: PIL.Image.Image, image: ImageRef, context: ProcessingContext
):
    mask_image = await context.image_from_pil(PIL.Image.new("L", pil_image.size, 255))
    res = await Composite(image1=image, image2=image, mask=mask_image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_composite_different_size(image: ImageRef, context: ProcessingContext):
    mask_image = await context.image_from_pil(PIL.Image.new("L", (100, 100), 255))
    res = await Composite(image1=image, image2=image, mask=mask_image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_scale(
    pil_image: PIL.Image.Image, image: ImageRef, context: ProcessingContext
):
    res = await Scale(image=image, scale=2.0).process(context)
    res_img = await context.image_to_pil(res)
    assert res_img.size == (
        pil_image.size[0] * 2,
        pil_image.size[1] * 2,
    ), "Should be the same size"


@pytest.mark.asyncio
async def test_save_text_node(context: ProcessingContext, user: User):
    text_ref = await context.text_from_str("Sample Text")
    node = SaveText(name="TestText", value=text_ref)
    res = await node.process(context)
    assert res.asset_id, "TextRef should have an asset_id"
    asset = Asset.find(user.id, res.asset_id)
    assert asset, "Asset should exist"
    assert asset.content_type == "text/plain", "Asset should be text"
    file = await context.download_asset(res.asset_id)
    assert file.read() == b"Sample Text", "Asset should have the right content"


@pytest.mark.asyncio
async def test_save_image_node(context: ProcessingContext, user: User):
    folder = Asset.create(user.id, "test", "folder", user.id)
    image_ref = await context.image_from_pil(PIL.Image.open(test_file))
    node = SaveImg(
        name="TestImage",
        image=image_ref,
        folder=FolderRef(asset_id=folder.id),
    )
    image_ref = await node.process(context)
    assert image_ref.asset_id, "ImageRef should have an asset_id"
    asset = Asset.find(user.id, image_ref.asset_id)
    assert asset, "Asset should exist"
    file = await context.download_asset(image_ref.asset_id)
    assert PIL.Image.open(file), "Asset should be an image"


@pytest.mark.asyncio
async def test_save_tensor_node(context: ProcessingContext, user: User):
    folder = Asset.create(user.id, "test", "folder")
    node = SaveTensor(
        name="TestTensor",
        value=Tensor.from_numpy(np.array([1, 2, 3], dtype=np.float32)),
        folder=FolderRef(asset_id=folder.id),
    )
    result = await node.process(context)
    assert result.to_numpy().tolist() == [1, 2, 3], "Tensor should be the same"


@pytest.mark.asyncio
async def test_save_audio_node(context: ProcessingContext, user: User):
    folder = Asset.create(user.id, "test", "folder", user.id)
    audio_segment = pydub.AudioSegment.silent(duration=1000)
    audio_ref = await context.audio_from_segment(audio_segment)
    node = SaveAudio(
        name="TestAudio",
        value=audio_ref,
        folder=FolderRef(asset_id=folder.id),
    )
    result = await node.process(context)
    assert isinstance(result, AudioRef)
    assert result.asset_id, "AudioRef should have an asset_id"
    segment = await context.audio_to_audio_segment(result)
    assert segment.duration_seconds == 1.0, "AudioSegment should be the same"
    asset = Asset.find(context.user_id, result.asset_id)
    assert asset, "Asset should exist"
    assert asset.content_type.startswith("audio/"), "Asset should be audio"


@pytest.mark.asyncio
async def test_save_dataframe_node(context: ProcessingContext, user: User):
    folder = Asset.create(user.id, "test", "folder", user.id)
    df = await context.dataframe_from_pandas(pd.DataFrame({"a": [1, 2, 3]}))
    node = SaveDataframe(
        name="TestDataFrame",
        df=df,
        folder=FolderRef(asset_id=folder.id),
    )
    result = await node.process(context)
    assert isinstance(result, DataframeRef), "Should be a df"
    assert result.asset_id, "DataFrame should have an asset_id"
    asset = Asset.find(context.user_id, result.asset_id)
    assert asset, "Asset should exist"
    assert asset.content_type == "application/octet-stream"
