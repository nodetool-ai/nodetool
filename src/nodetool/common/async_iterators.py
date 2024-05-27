from typing import AsyncIterator


class AsyncByteStream:
    """
    An asynchronous iterator that iterates over a byte sequence in chunks.

    Args:
        data (bytes): The byte sequence to iterate over.
        chunk_size (int, optional): The size of each chunk. Defaults to 1024.

    Attributes:
        data (bytes): The byte sequence to iterate over.
        chunk_size (int): The size of each chunk.
        index (int): The current index in the byte sequence.

    Yields:
        bytes: The next chunk of bytes from the byte sequence.

    """

    def __init__(self, data: bytes, chunk_size: int = 1024):
        self.data = data
        self.chunk_size = chunk_size
        self.index = 0

    def __aiter__(self) -> "AsyncByteStream":
        return self

    async def __anext__(self) -> bytes:
        if self.index >= len(self.data):
            raise StopAsyncIteration
        chunk = self.data[self.index : self.index + self.chunk_size]
        self.index += self.chunk_size
        return chunk
