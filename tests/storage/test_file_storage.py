#!/usr/bin/env python
import os
import pytest
import io
from nodetool.storage.file_storage import FileStorage


@pytest.fixture(scope="module")
def storage():
    return FileStorage(base_path="/tmp", base_url="http://localhost:8000")


data = b"0" * 1024 * 1024 * 10
file_name = "test_asset.jpg"
file_path = "/tmp/test_asset.jpg"


@pytest.mark.asyncio
async def test_upload_async(storage: FileStorage):
    await storage.upload(file_name, io.BytesIO(data))
    assert os.path.isfile(file_path)
    assert os.path.getsize(file_path) == 1024 * 1024 * 10


@pytest.mark.asyncio
async def test_download_async(storage: FileStorage):
    with open(file_path, "wb") as f:
        f.write(data)

    bytes_io = io.BytesIO()
    await storage.download(file_name, bytes_io)
    bytes_io.seek(0)
    assert bytes_io.read() == data


@pytest.mark.asyncio
async def test_delete(storage: FileStorage):
    with open(file_path, "wb") as f:
        f.write(data)
    await storage.delete(file_name)
    assert not os.path.isfile(file_path)
