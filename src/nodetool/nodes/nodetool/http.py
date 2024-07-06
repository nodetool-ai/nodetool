from pydantic import Field
from nodetool.workflows.base_node import BaseNode


class HTTPBaseNode(BaseNode):
    url: str = Field(
        default="",
        description="The URL to make the request to.",
    )
    headers: dict[str, str] = Field(
        default_factory=dict,
        description="Optional headers to include in the request.",
    )
    allow_redirects: bool = Field(
        default=True,
        description="Whether to follow redirects.",
    )
    auth: str | None = Field(default=None, description="Authentication credentials.")

    def get_request_kwargs(self):
        return {
            "headers": self.headers,
            "allow_redirects": self.allow_redirects,
            "auth": self.auth,
        }


class HTTPGet(HTTPBaseNode):
    """
    Perform an HTTP GET request to retrieve data from a specified URL.
    http, get, request, url

    Use cases:
    - Fetch web page content
    - Retrieve API data
    - Download files
    - Check website availability
    """

    async def process(self, context) -> str:
        async with context.http_session.get(
            self.url, **self.get_request_kwargs()
        ) as response:
            return await response.text()


class HTTPPost(HTTPBaseNode):
    """
    Send data to a server using an HTTP POST request.
    http, post, request, url, data

    Use cases:
    - Submit form data
    - Create new resources on an API
    - Upload files
    - Authenticate users
    """

    data: str = Field(
        default="",
        description="The data to send in the POST request.",
    )

    async def process(self, context) -> str:
        async with context.http_session.post(
            self.url, data=self.data, **self.get_request_kwargs()
        ) as response:
            return await response.text()


class HTTPPut(HTTPBaseNode):
    """
    Update existing resources on a server using an HTTP PUT request.
    http, put, request, url, data

    Use cases:
    - Update user profiles
    - Modify existing API resources
    - Replace file contents
    - Set configuration values
    """

    data: str = Field(
        default="",
        description="The data to send in the PUT request.",
    )

    async def process(self, context) -> str:
        async with context.http_session.put(
            self.url, data=self.data, **self.get_request_kwargs()
        ) as response:
            return await response.text()


class HTTPDelete(HTTPBaseNode):
    """
    Remove a resource from a server using an HTTP DELETE request.
    http, delete, request, url

    Use cases:
    - Delete user accounts
    - Remove API resources
    - Cancel subscriptions
    - Clear cache entries
    """

    async def process(self, context) -> str:
        async with context.http_session.delete(
            self.url, **self.get_request_kwargs()
        ) as response:
            return await response.text()


class HTTPHead(HTTPBaseNode):
    """
    Retrieve headers from a resource using an HTTP HEAD request.
    http, head, request, url

    Use cases:
    - Check resource existence
    - Get metadata without downloading content
    - Verify authentication or permissions
    """

    async def process(self, context) -> dict[str, str]:
        async with context.http_session.head(
            self.url, **self.get_request_kwargs()
        ) as response:
            return dict(response.headers)
