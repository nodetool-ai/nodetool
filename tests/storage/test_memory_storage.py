import pytest
import io
from datetime import datetime, timedelta
from nodetool.storage.memory_storage import MemoryStorage


@pytest.fixture
def memory_storage():
    return MemoryStorage(base_url="http://localhost:8000")


@pytest.mark.asyncio
async def test_file_exists(memory_storage):
    assert not await memory_storage.file_exists("test.txt")
    await memory_storage.upload("test.txt", io.BytesIO(b"hello"))
    assert await memory_storage.file_exists("test.txt")


@pytest.mark.asyncio
async def test_get_mtime(memory_storage):
    await memory_storage.upload("test.txt", io.BytesIO(b"hello"))
    mtime = await memory_storage.get_mtime("test.txt")
    assert isinstance(mtime, datetime)
    assert mtime <= datetime.now()


@pytest.mark.asyncio
async def test_download(memory_storage):
    content = b"hello, world"
    await memory_storage.upload("test.txt", io.BytesIO(content))
    stream = io.BytesIO()
    await memory_storage.download("test.txt", stream)
    stream.seek(0)
    assert stream.read() == content


@pytest.mark.asyncio
async def test_download_stream(memory_storage):
    content = b"hello, world"
    await memory_storage.upload("test.txt", io.BytesIO(content))
    output = b""
    async for chunk in memory_storage.download_stream("test.txt"):
        output += chunk
    assert output == content


@pytest.mark.asyncio
async def test_upload(memory_storage):
    content = b"hello, world"
    url = await memory_storage.upload("test.txt", io.BytesIO(content))
    assert url == "http://localhost:8000/test.txt"
    assert await memory_storage.file_exists("test.txt")
    stream = io.BytesIO()
    await memory_storage.download("test.txt", stream)
    stream.seek(0)
    assert stream.read() == content


@pytest.mark.asyncio
async def test_upload_stream(memory_storage):
    content = b"hello, world"
    url = memory_storage.upload_stream("test.txt", [content])
    assert url == "http://localhost:8000/test.txt"
    assert memory_storage.file_exists("test.txt")
    stream = io.BytesIO()
    await memory_storage.download("test.txt", stream)
    stream.seek(0)
    assert stream.read() == content


@pytest.mark.asyncio
async def test_download_async(memory_storage):
    content = b"hello, world"
    await memory_storage.upload("test.txt", io.BytesIO(content))
    stream = io.BytesIO()
    await memory_storage.download("test.txt", stream)
    stream.seek(0)
    assert stream.read() == content


@pytest.mark.asyncio
async def test_upload_async(memory_storage):
    content = b"hello, world"
    url = await memory_storage.upload("test.txt", io.BytesIO(content))
    assert url == "http://localhost:8000/test.txt"
    assert memory_storage.file_exists("test.txt")
    stream = io.BytesIO()
    await memory_storage.download("test.txt", stream)
    stream.seek(0)
    assert stream.read() == content


@pytest.mark.asyncio
async def test_delete(memory_storage):
    content = b"hello, world"
    await memory_storage.upload("test.txt", io.BytesIO(content))
    assert await memory_storage.file_exists("test.txt")
    await memory_storage.delete("test.txt")
    assert not await memory_storage.file_exists("test.txt")
