from pydantic import Field
from genflow.workflows.genflow_node import GenflowNode


class HTTPGet(GenflowNode):
    url: str = Field(
        default="",
        description="The URL to make the GET request to.",
    )

    async def process(self, context) -> str:
        async with context.http_session.get(self.url) as response:
            return await response.text()


class HTTPPost(GenflowNode):
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


class HTTPPut(GenflowNode):
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
        

class HTTPDelete(GenflowNode):
    url: str = Field(
        default="",
        description="The URL to make the DELETE request to.",
    )

    async def process(self, context) -> str:
        async with context.http_session.delete(self.url) as response:
            return await response.text()