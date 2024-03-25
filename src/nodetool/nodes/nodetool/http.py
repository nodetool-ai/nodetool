from pydantic import Field
from nodetool.workflows.base_node import BaseNode


class HTTPGet(BaseNode):
    """
    Make a HTTP GET request to a URL.
    http, get, request, url
    """

    url: str = Field(
        default="",
        description="The URL to make the GET request to.",
    )

    async def process(self, context) -> str:
        async with context.http_session.get(self.url) as response:
            return await response.text()


class HTTPPost(BaseNode):
    """
    Make a HTTP POST request to a URL.
    http, post, request, url
    """

    url: str = Field(
        default="",
        description="The URL to make the POST request to.",
    )
    data: str = Field(
        default="",
        description="The data to send in the POST request.",
    )

    async def process(self, context) -> str:
        async with context.http_session.post(self.url, data=self.data) as response:
            return await response.text()


class HTTPPut(BaseNode):
    """
    Make a HTTP PUT request to a URL.
    http, put, request, url
    """

    url: str = Field(
        default="",
        description="The URL to make the PUT request to.",
    )
    data: str = Field(
        default="",
        description="The data to send in the PUT request.",
    )

    async def process(self, context) -> str:
        async with context.http_session.put(self.url, data=self.data) as response:
            return await response.text()


class HTTPDelete(BaseNode):
    """
    Make a HTTP DELETE request to a URL.
    http, delete, request, url
    """

    url: str = Field(
        default="",
        description="The URL to make the DELETE request to.",
    )

    async def process(self, context) -> str:
        async with context.http_session.delete(self.url) as response:
            return await response.text()
