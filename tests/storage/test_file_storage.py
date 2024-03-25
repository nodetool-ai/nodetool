#!/usr/bin/env python
import os
import pytest
import io
from nodetool.storage.file_storage import FileStorage
from nodetool.storage.s3_storage import S3Storage
from PIL import Image


@pytest.fixture(scope="module")
def storage():
    return FileStorage(base_path="/tmp", base_url="http://localhost:8000")


data = b"0" * 1024 * 1024 * 10
file_name = "test_asset.jpg"
file_path = "/tmp/test_asset.jpg"


def test_upload(storage: FileStorage):
    storage.upload(file_name, io.BytesIO(data))
    assert os.path.isfile(file_path)
    assert os.path.getsize(file_path) == 1024 * 1024 * 10


def test_download(storage: FileStorage):
    with open(file_path, "wb") as f:
        f.write(data)

    bytes_io = io.BytesIO()
    storage.download(file_name, bytes_io)
    bytes_io.seek(0)
    assert bytes_io.read() == data


def test_download_stream(storage: FileStorage):
    if os.path.isfile(file_path):
        os.remove(file_path)

    def iterator():
        for i in range(3):
            yield b"0" * 1024 * 1024 * 10

    storage.upload_stream(file_name, iterator())

    assert os.path.isfile(file_path)
    assert os.path.getsize(file_path) == 1024 * 1024 * 10 * 3


@pytest.mark.asyncio
async def test_upload_async(storage: FileStorage):
    await storage.upload_async(file_name, io.BytesIO(data))
    assert os.path.isfile(file_path)
    assert os.path.getsize(file_path) == 1024 * 1024 * 10


@pytest.mark.asyncio
async def test_download_async(storage: FileStorage):
    with open(file_path, "wb") as f:
        f.write(data)

    bytes_io = io.BytesIO()
    await storage.download_async(file_name, bytes_io)
    bytes_io.seek(0)
    assert bytes_io.read() == data


def test_delete(storage: FileStorage):
    with open(file_path, "wb") as f:
        f.write(data)
    storage.delete(file_name)
    assert not os.path.isfile(file_path)
