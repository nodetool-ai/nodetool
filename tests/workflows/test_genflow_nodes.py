import io
import pandas as pd
import pytest
import os
from genflow.metadata.types import DataFrame
from genflow.metadata.types import FolderRef
from genflow.common.environment import Environment

from genflow.workflows.graph import Graph
from genflow.metadata.types import ImageRef
from genflow.workflows.processing_context import ProcessingContext
import PIL.Image
from genflow.models.asset import (
    Asset,
)

from genflow.models.user import User
from genflow.nodes.genflow.constant import ImageNode
from genflow.nodes.genflow.dataframe import SaveDataFrameNode
from genflow.nodes.genflow.image import BlendNode, CompositeNode
from genflow.nodes.genflow.image.source import BackgroundNode, RenderTextNode
from genflow.nodes.genflow.image.transform import (
    AdaptiveContrastNode,
    AutoContrastNode,
    BlurNode,
    BrightnessNode,
    ColorNode,
    ContourNode,
    ContrastNode,
    DetailNode,
    EdgeEnhanceNode,
    EmbossNode,
    EqualizeNode,
    ExpandNode,
    FindEdgesNode,
    FitNode,
    GetChannelNode,
    InvertNode,
    PosterizeNode,
    RankFilterNode,
    ResizeNode,
    ScaleNode,
    SharpenNode,
    SharpnessNode,
    SmoothNode,
    SolarizeNode,
    UnsharpMaskNode,
)
from genflow.nodes.genflow.text import SaveTextNode


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
    return ImageNode(value=image)


@pytest.mark.asyncio
async def test_background_node(context: ProcessingContext):
    res = await BackgroundNode().process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_get_channel_node(image: ImageRef, context: ProcessingContext):
    res = await GetChannelNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_contrast_node(image: ImageRef, context: ProcessingContext):
    res = await ContrastNode(image=image, factor=1.0).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_brightness_node(image: ImageRef, context: ProcessingContext):
    res = await BrightnessNode(image=image, factor=1.0).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_color_node(image: ImageRef, context: ProcessingContext):
    res = await ColorNode(image=image, factor=1.0).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_sharpness_node(image: ImageRef, context: ProcessingContext):
    res = await SharpnessNode(image=image, factor=1.0).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_autocontrast_node(image: ImageRef, context: ProcessingContext):
    res = await AutoContrastNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_invert_node(image: ImageRef, context: ProcessingContext):
    res = await InvertNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_solarize_node(image: ImageRef, context: ProcessingContext):
    res = await SolarizeNode(image=image, threshold=128).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_posterize_node(image: ImageRef, context: ProcessingContext):
    res = await PosterizeNode(image=image, bits=4).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_equalize_node(image: ImageRef, context: ProcessingContext):
    res = await EqualizeNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_fit_node(image: ImageRef, context: ProcessingContext):
    res = await FitNode(image=image, width=100, height=100).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_expand_node(
    pil_image: PIL.Image.Image, image: ImageRef, context: ProcessingContext
):
    res = await ExpandNode(image=image, border=10).process(context)
    res_img = await context.to_pil(res)
    assert res_img.width == pil_image.width + 20, "Should have border"
    assert res_img.height == pil_image.height + 20, "Should have border"


@pytest.mark.asyncio
async def test_blur_node(image: ImageRef, context: ProcessingContext):
    res = await BlurNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_contour_node(image: ImageRef, context: ProcessingContext):
    res = await ContourNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_detail_node(image: ImageRef, context: ProcessingContext):
    res = await DetailNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_edge_enhance_node(image: ImageRef, context: ProcessingContext):
    res = await EdgeEnhanceNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_emboss_node(image: ImageRef, context: ProcessingContext):
    res = await EmbossNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_find_edges_node(image: ImageRef, context: ProcessingContext):
    res = await FindEdgesNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_smooth_node(image: ImageRef, context: ProcessingContext):
    res = await SmoothNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_sharpen_node(image: ImageRef, context: ProcessingContext):
    res = await SharpenNode(image=image).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_rank_filter_node(image: ImageRef, context: ProcessingContext):
    res = await RankFilterNode(image=image, size=3, rank=3).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_unsharp_mask_node(image: ImageRef, context: ProcessingContext):
    res = await UnsharpMaskNode(
        image=image, radius=3, percent=150, threshold=3
    ).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_blend(image: ImageRef, context: ProcessingContext):
    res = await BlendNode(
        image1=image,
        image2=image,
        alpha=0.5,
    ).process(context)
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_resize(image: ImageRef, context: ProcessingContext):
    res = await ResizeNode(
        image=image,
        width=100,
        height=100,
    ).process(context)
    res_img = await context.to_pil(res)
    assert res_img.size == (100, 100), "Should be the same size"


@pytest.mark.asyncio
async def test_composite(
    pil_image: PIL.Image.Image, image: ImageRef, context: ProcessingContext
):
    mask_image = await context.image_from_pil(PIL.Image.new("L", pil_image.size, 255))
    res = await CompositeNode(image1=image, image2=image, mask=mask_image).process(
        context
    )
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_composite_different_size(image: ImageRef, context: ProcessingContext):
    mask_image = await context.image_from_pil(PIL.Image.new("L", (100, 100), 255))
    res = await CompositeNode(image1=image, image2=image, mask=mask_image).process(
        context
    )
    assert isinstance(res, ImageRef), "Should be an ImageRef"


@pytest.mark.asyncio
async def test_scale(
    pil_image: PIL.Image.Image, image: ImageRef, context: ProcessingContext
):
    res = await ScaleNode(image=image, scale=2.0).process(context)
    res_img = await context.to_pil(res)
    assert res_img.size == (
        pil_image.size[0] * 2,
        pil_image.size[1] * 2,
    ), "Should be the same size"


@pytest.mark.asyncio
async def test_save_text_node(context: ProcessingContext, user: User):
    text_ref = await context.text_from_str("Sample Text")
    node = SaveTextNode(name="TestTextNode", value=text_ref)
    res = await node.process(context)
    assert res.asset_id, "TextRef should have an asset_id"
    asset = Asset.find(user.id, res.asset_id)
    assert asset, "Asset should exist"
    assert asset.content_type == "text/plain", "Asset should be text"
    file = await context.download_asset(res.asset_id)
    assert file.read() == b"Sample Text", "Asset should have the right content"


# these tests should be resurrected at some point
# @pytest.mark.asyncio
# async def test_save_image_node(context: ProcessingContext, user: User):
#     folder = Asset.create(user.id, "test", "folder", user.id)
#     image_ref = await context.image_from_pil(PIL.Image.open(test_file))
#     node = SaveImageNode(
#         name="TestImageNode",
#         image=image_ref,
#         folder=FolderRef(asset_id=folder.id),
#     )
#     image_ref = await node.process(context)
#     assert image_ref.asset_id, "ImageRef should have an asset_id"
#     asset = Asset.find(user.id, image_ref.asset_id)
#     assert asset, "Asset should exist"
#     assert context.get_s3_asset_service().asset_exists(
#         asset
#     ), "Asset should exist on S3"


# @pytest.mark.asyncio
# async def test_save_tensor_node(context: ProcessingContext, user: User):
#     folder = Asset.create(user.id, "test", "folder")
#     node = SaveTensorNode(
#         name="TestTensorNode",
#         value=Tensor.from_numpy(np.array([1, 2, 3], dtype=np.float32)),
#         folder=FolderRef(asset_id=folder.id),
#     )
#     result = await node.process(context)
#     assert result.to_numpy().tolist() == [1, 2, 3], "Tensor should be the same"


# @pytest.mark.asyncio
# async def test_save_audio_node(context: ProcessingContext):
#     user = User.get(context.user_id)
#     assert user
#     folder = Asset.create(user.id, "test", "folder", user.id)
#     audio_segment = pydub.AudioSegment.silent(duration=1000)
#     audio_ref = await context.audio_from_segment(audio_segment)
#     node = SaveAudioNode(
#         name="TestAudioNode",
#         value=audio_ref,
#         folder=FolderRef(asset_id=folder.id),
#     )
#     result = await node.process(context)
#     assert isinstance(result, AudioRef)
#     assert result.asset_id, "AudioRef should have an asset_id"
#     segment = await context.to_audio_segment(result)
#     assert segment.duration_seconds == 1.0, "AudioSegment should be the same"
#     asset = Asset.find(context.user_id, result.asset_id)
#     assert asset, "Asset should exist"
#     assert asset.content_type.startswith("audio/"), "Asset should be audio"


@pytest.mark.asyncio
async def test_save_dataframe_node(context: ProcessingContext, user: User):
    folder = Asset.create(user.id, "test", "folder", user.id)
    df = await context.from_pandas(pd.DataFrame({"a": [1, 2, 3]}))
    node = SaveDataFrameNode(
        name="TestDataFrameNode",
        df=df,
        folder=FolderRef(asset_id=folder.id),
    )
    result = await node.process(context)
    assert isinstance(result, DataFrame), "Should be a df"
    assert result.asset_id, "DataFrame should have an asset_id"
    asset = Asset.find(context.user_id, result.asset_id)
    assert asset, "Asset should exist"
    assert asset.content_type == "text/csv", "Asset should be csv"
