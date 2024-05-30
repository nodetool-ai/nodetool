#!/usr/bin/env python
import pytest
import httpx
import io
import respx
from moto import mock_aws
from nodetool.common.aws_client import AWSClient
from nodetool.common.environment import Environment
from nodetool.storage.s3_storage import S3Storage

file_name = "test_asset.jpg"
data = b"0" * 1024 * 1024 * 10


@pytest.fixture(scope="module")
def storage():
    mock = mock_aws()
    mock.start()
    s3_temp = AWSClient("region").get_s3_storage(bucket="temp", domain="temp.test")
    yield s3_temp
    mock.stop()


@pytest.fixture()
def get_url(storage: S3Storage):
    return


@pytest.mark.asyncio
async def test_download_stream(storage: S3Storage):
    get_url = f"https://temp.test/{file_name}"
    with respx.mock as mock:
        mock.get(get_url).mock(return_value=httpx.Response(200, content=data))
        size = 0
        async for chunk in storage.download_stream(file_name):
            size += len(chunk)
        assert size == 1024 * 1024 * 10


@pytest.mark.asyncio
async def test_delete(storage: S3Storage):
    delete_url = storage.generate_presigned_url("delete_object", file_name)
    with respx.mock as mock:
        mock.delete(delete_url).mock(return_value=httpx.Response(200))
        await storage.delete(file_name)
