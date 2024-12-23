import pytest
import io
import boto3
from moto import mock_aws
from nodetool.storage.s3_storage import S3Storage

file_name = "test_asset.jpg"
data = b"0" * 1024 * 1024  # 1 MB of data for testing


@pytest.fixture(scope="function")
def s3_client():
    with mock_aws():
        yield boto3.client("s3", region_name="us-east-1")


@pytest.fixture(scope="function")
def storage(s3_client):
    bucket_name = "test-bucket"
    s3_client.create_bucket(Bucket=bucket_name)
    return S3Storage(
        bucket_name=bucket_name,
        domain="nodetool.test",
        endpoint_url="http://localhost:5000",  # This is ignored by moto
        client=s3_client,
    )


@pytest.mark.asyncio
async def test_file_exists(storage):
    # Test non-existent file
    assert not await storage.file_exists(file_name)

    # Upload a file
    await storage.upload(file_name, io.BytesIO(data))

    # Test existing file
    assert await storage.file_exists(file_name)


@pytest.mark.asyncio
async def test_get_mtime(storage):
    # Upload a file
    await storage.upload(file_name, io.BytesIO(data))

    # Get the mtime
    mtime = await storage.get_mtime(file_name)
    assert mtime is not None


@pytest.mark.asyncio
async def test_download(storage):
    # Upload a file
    await storage.upload(file_name, io.BytesIO(data))

    # Download the file
    output = io.BytesIO()
    await storage.download(file_name, output)
    assert output.getvalue() == data


@pytest.mark.asyncio
async def test_upload(storage):
    # Upload a file
    url = await storage.upload(file_name, io.BytesIO(data))
    assert url.startswith(f"https://nodetool.test")

    # Verify the file was uploaded
    assert await storage.file_exists(file_name)


@pytest.mark.asyncio
async def test_download_stream(storage):
    # Upload a file
    await storage.upload(file_name, io.BytesIO(data))

    # Download the file as a stream
    downloaded_data = b""
    async for chunk in storage.download_stream(file_name):
        downloaded_data += chunk
    assert downloaded_data == data


@pytest.mark.asyncio
async def test_delete(storage):
    # Upload a file
    await storage.upload(file_name, io.BytesIO(data))

    # Verify the file exists
    assert await storage.file_exists(file_name)

    # Delete the file
    await storage.delete(file_name)

    # Verify the file no longer exists
    assert not await storage.file_exists(file_name)


@pytest.mark.asyncio
async def test_get_url(storage):
    assert storage.get_url(file_name) == f"https://nodetool.test/{file_name}"
