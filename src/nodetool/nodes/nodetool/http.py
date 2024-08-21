from pydantic import Field
from nodetool.metadata.types import ColumnDef, DataframeRef, ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from crawl4ai.models import CrawlResult


class HTTPBaseNode(BaseNode):
    url: str = Field(
        default="",
        description="The URL to make the request to.",
    )
    headers: dict[str, str] = Field(
        default_factory=dict,
        description="Optional headers to include in the request.",
    )
    auth: str | None = Field(default=None, description="Authentication credentials.")

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not HTTPBaseNode

    def get_request_kwargs(self):
        return {
            "headers": self.headers,
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

    async def process(self, context: ProcessingContext) -> str:
        res = await context.http_get(self.url, **self.get_request_kwargs())
        return res.content.decode(res.encoding or "utf-8")


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

    async def process(self, context: ProcessingContext) -> str:
        res = await context.http_post(
            self.url, data=self.data, **self.get_request_kwargs()
        )
        return res.content.decode(res.encoding or "utf-8")


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

    async def process(self, context: ProcessingContext) -> str:
        res = await context.http_put(
            self.url, data=self.data, **self.get_request_kwargs()
        )
        return res.content.decode(res.encoding or "utf-8")


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

    async def process(self, context: ProcessingContext) -> str:
        res = await context.http_delete(self.url, **self.get_request_kwargs())
        return res.content.decode(res.encoding or "utf-8")


class HTTPHead(HTTPBaseNode):
    """
    Retrieve headers from a resource using an HTTP HEAD request.
    http, head, request, url

    Use cases:
    - Check resource existence
    - Get metadata without downloading content
    - Verify authentication or permissions
    """

    async def process(self, context: ProcessingContext) -> dict[str, str]:
        res = await context.http_head(self.url, **self.get_request_kwargs())
        return dict(res.headers.items())


class WebCrawler(BaseNode):
    """
    Run a web crawler to extract data from a website.
    http, crawler, scrape, extract, data

    Use cases:
    - Collect product information
    - Monitor news articles
    - Scrape job listings
    - Gather contact details
    """

    url: str = Field(
        default="",
        description="The URL to start the crawl from.",
    )

    @classmethod
    def return_type(cls):
        return {
            "html": str,
            "success": bool,
            "error_message": str | None,
            "cleaned_html": str | None,
            "metadata": dict | None,
            "media": DataframeRef,
            "links": DataframeRef,
            "screenshot": ImageRef | None,
        }

    async def process(self, context: ProcessingContext):
        crawler = context.get_web_crawler()
        result = crawler.run(self.url)

        media_columns = [
            ColumnDef(name="src", data_type="string"),
            ColumnDef(name="alt", data_type="string"),
            ColumnDef(name="type", data_type="string"),
        ]

        links_columns = [
            ColumnDef(name="href", data_type="string"),
            ColumnDef(name="text", data_type="string"),
            ColumnDef(name="type", data_type="string"),
        ]

        if result.success:
            return {
                "html": result.html,
                "success": True,
                "error_message": None,
                "cleaned_html": result.cleaned_html,
                "metadata": result.metadata,
                "media": DataframeRef(
                    columns=media_columns,
                    data=[
                        [str(m["src"]), str(m["alt"]), "image"]
                        for m in result.media["images"]
                    ]
                    + [
                        [str(m["src"]), str(m["alt"]), "video"]
                        for m in result.media["videos"]
                    ]
                    + [
                        [str(m["src"]), str(m["alt"]), "audio"]
                        for m in result.media["audios"]
                    ],
                ),
                "links": DataframeRef(
                    columns=links_columns,
                    data=[
                        [str(l["href"]), str(l["text"]), "internal"]
                        for l in result.links["internal"]
                    ]
                    + [
                        [str(l["href"]), str(l["text"]), "external"]
                        for l in result.links["external"]
                    ],
                ),
                "screenshot": result.screenshot,
            }
        else:
            raise Exception(result.error_message)
