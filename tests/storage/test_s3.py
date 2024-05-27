#!/usr/bin/env python
import pytest
import httpx
import io
import respx
from moto import mock_aws
from nodetool.common.environment import Environment
from nodetool.storage.s3_storage import S3Storage

file_name = "test_asset.jpg"
data = b"0" * 1024 * 1024 * 10


@pytest.fixture(scope="module")
def storage():
    mock = mock_aws()
    mock.start()
    s3_temp = Environment.get_asset_storage(use_s3=True)
    yield s3_temp
    mock.stop()


@pytest.fixture(scope="module")
def url(storage: S3Storage):
    return f"https://{storage.bucket_name}.s3.amazonaws.com/{file_name}"


@pytest.mark.asyncio
async def test_download_stream(storage: S3Storage, url: str):
    with respx.mock as mock:
        mock.get(url).mock(return_value=httpx.Response(200, content=data))
        size = 0
        async for chunk in storage.download_stream(file_name):
            size += len(chunk)
        assert size == 1024 * 1024 * 10


@pytest.mark.asyncio
async def test_delete(storage: S3Storage, url: str):
    with respx.mock as mock:
        mock.delete(url).mock(return_value=httpx.Response(200))
        await storage.delete(file_name)
