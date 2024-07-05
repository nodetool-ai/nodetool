# nodetool.common.async_iterators

## AsyncByteStream

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

**Tags:** 

