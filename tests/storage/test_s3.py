#!/usr/bin/env python
import pytest
import httpx
import io
import respx
from moto import mock_aws
from genflow.common.environment import Environment
from genflow.storage.s3_storage import S3Storage
from PIL import Image

file_name = "test_asset.jpg"
data = b"0" * 1024 * 1024 * 10


@pytest.fixture(scope="module")
def storage():
    Environment.set_test_mode()
    mock = mock_aws()
    mock.start()
    s3_temp = Environment.get_asset_storage(use_s3=True)
    yield s3_temp
    mock.stop()


@pytest.fixture(scope="module")
def url(storage: S3Storage):
    return f"https://{storage.bucket_name}.s3.amazonaws.com/{file_name}"


def test_upload(storage: S3Storage, url: str):
    with respx.mock as mock:
        mock.put(url).mock(return_value=httpx.Response(200))
        storage.upload(file_name, io.BytesIO(data))


def test_download(storage: S3Storage, url: str):
    with respx.mock as mock:
        mock.get(url).mock(return_value=httpx.Response(200))
        storage.download(file_name, io.BytesIO(data))


def test_download_stream(storage: S3Storage, url: str):
    with respx.mock as mock:
        mock.get(url).mock(return_value=httpx.Response(200, content=data))
        size = 0
        for chunk in storage.download_stream(file_name):
            size += len(chunk)
        assert size == 1024 * 1024 * 10


def test_upload_stream(storage: S3Storage, url: str):
    def iterator():
        for i in range(3):
            yield b"0" * 1024 * 1024 * 10

    with respx.mock as mock:
        mock.put(url).mock(return_value=httpx.Response(200))
        storage.upload_stream(file_name, iterator())


def test_delete(storage: S3Storage, url: str):
    with respx.mock as mock:
        mock.delete(url).mock(return_value=httpx.Response(200))
        storage.delete(file_name)
