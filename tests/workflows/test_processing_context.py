import io
import os
import pytest
from unittest.mock import AsyncMock, patch
from nodetool.metadata.types import AssetRef
from nodetool.models.asset import Asset
from nodetool.models.prediction import Prediction
from nodetool.workflows.processing_context import ProcessingContext

mp3_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test.mp3")


@pytest.mark.asyncio
async def test_download_asset(
    context: ProcessingContext,
    text_asset: Asset,
):
    file = await context.download_asset(text_asset.id)
    assert file.read() == b"test content"


@pytest.mark.asyncio
async def test_create_asset(context: ProcessingContext, user):
    content = b"test content"

    asset = await context.create_asset(
        name="test.txt",
        content_type="text/plain",
        content=io.BytesIO(content),
    )
    assert asset.id
    assert asset.user_id == user.id
    assert asset.content_type == "text/plain"
    assert asset.file_name.endswith(".txt")

    downloaded_content = await context.download_asset(asset.id)
    assert downloaded_content.read() == content


@pytest.mark.asyncio
async def test_asset_to_io(context: ProcessingContext, text_asset: Asset):
    asset_ref = AssetRef(asset_id=text_asset.id)
    io_obj = await context.asset_to_io(asset_ref)
    assert io_obj.read() == b"test content"


@pytest.mark.asyncio
async def test_audio_from_io(context: ProcessingContext, http_client):
    audio_bytes = open(mp3_file, "rb").read()
    audio_ref = await context.audio_from_io(io.BytesIO(audio_bytes), name="test.mp3")
    assert audio_ref.asset_id
    assert audio_ref.uri

    mock_response = AsyncMock()
    mock_response.raise_for_status = AsyncMock()
    mock_response.content = open(mp3_file, "rb").read()

    http_client.get.return_value = mock_response

    downloaded_content = await context.download_asset(audio_ref.asset_id)
    assert downloaded_content.read() == audio_bytes
