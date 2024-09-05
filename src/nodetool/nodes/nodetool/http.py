from urllib.parse import urljoin
from pydantic import Field
from nodetool.metadata.types import (
    AudioRef,
    ColumnDef,
    DataframeRef,
    ImageRef,
    VideoRef,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext

from pydantic import Field
from nodetool.metadata.types import ColumnDef, DataframeRef, ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup


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


class FetchPage(BaseNode):
    """
    Fetch a web page using Selenium and return its content.
    selenium, fetch, webpage, http

    Use cases:
    - Retrieve content from dynamic websites
    - Capture JavaScript-rendered content
    - Interact with web applications
    """

    url: str = Field(
        default="",
        description="The URL to fetch the page from.",
    )
    wait_time: int = Field(
        default=10,
        description="Maximum time to wait for page load (in seconds).",
    )

    @classmethod
    def return_type(cls):
        return {
            "html": str,
            "success": bool,
            "error_message": str | None,
        }

    async def process(self, context: ProcessingContext):
        options = Options()
        options.add_argument("--headless")
        driver = webdriver.Chrome(options=options)

        try:
            driver.get(self.url)
            WebDriverWait(driver, self.wait_time).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )

            html = driver.page_source

            return {
                "html": html,
                "success": True,
                "error_message": None,
            }
        except Exception as e:
            return {
                "html": html,
                "success": False,
                "error_message": str(e),
            }
        finally:
            driver.quit()


class ExtractLinks(BaseNode):
    """
    Extract links from HTML content.
    extract, links, urls

    Use cases:
    - Analyze website structure
    - Discover related content
    - Build sitemaps
    """

    html: str = Field(
        default="",
        description="The HTML content to extract links from.",
    )
    base_url: str = Field(
        default="",
        description="The base URL of the page, used to determine internal/external links.",
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        soup = BeautifulSoup(self.html, "html.parser")

        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            text = a.text.strip()
            link_type = (
                "internal"
                if href.startswith(self.base_url) or href.startswith("/")
                else "external"
            )
            links.append({"href": href, "text": text, "type": link_type})

        return DataframeRef(
            columns=[
                ColumnDef(name="href", data_type="string"),
                ColumnDef(name="text", data_type="string"),
                ColumnDef(name="type", data_type="string"),
            ],
            data=[[l["href"], l["text"], l["type"]] for l in links],
        )


class ExtractMetadata(BaseNode):
    """
    Extract metadata from HTML content.
    extract, metadata, seo

    Use cases:
    - Analyze SEO elements
    - Gather page information
    - Extract structured data
    """

    html: str = Field(
        default="",
        description="The HTML content to extract metadata from.",
    )

    @classmethod
    def return_type(cls):
        return {
            "metadata": dict,
        }

    async def process(self, context: ProcessingContext):
        soup = BeautifulSoup(self.html, "html.parser")

        return {
            "title": soup.title.string if soup.title else None,
            "description": (
                soup.find("meta", attrs={"name": "description"})["content"]
                if soup.find("meta", attrs={"name": "description"})
                else None
            ),
            "keywords": (
                soup.find("meta", attrs={"name": "keywords"})["content"]
                if soup.find("meta", attrs={"name": "keywords"})
                else None
            ),
        }


class ExtractImages(BaseNode):
    """
    Extract images from HTML content.
    extract, images, src

    Use cases:
    - Collect images from web pages
    - Analyze image usage on websites
    - Create image galleries
    """

    html: str = Field(
        default="",
        description="The HTML content to extract images from.",
    )
    base_url: str = Field(
        default="",
        description="The base URL of the page, used to resolve relative image URLs.",
    )

    @classmethod
    def return_type(cls):
        return list[ImageRef]

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        soup = BeautifulSoup(self.html, "html.parser")

        images = []
        for img in soup.find_all("img"):
            src = img.get("src")
            if src:
                full_url = urljoin(self.base_url, src)
                images.append(ImageRef(uri=full_url))

        return images


class ExtractVideos(BaseNode):
    """
    Extract videos from HTML content.
    extract, videos, src

    Use cases:
    - Collect video sources from web pages
    - Analyze video usage on websites
    - Create video playlists
    """

    html: str = Field(
        default="",
        description="The HTML content to extract videos from.",
    )
    base_url: str = Field(
        default="",
        description="The base URL of the page, used to resolve relative video URLs.",
    )

    async def process(self, context: ProcessingContext) -> list[VideoRef]:
        soup = BeautifulSoup(self.html, "html.parser")

        videos = []
        for video in soup.find_all(["video", "iframe"]):
            if video.name == "video":
                src = video.get("src") or (video.source and video.source.get("src"))
            else:  # iframe
                src = video.get("src")

            if src:
                full_url = urljoin(self.base_url, src)
                videos.append(VideoRef(uri=full_url))

        return videos


class ExtractAudio(BaseNode):
    """
    Extract audio elements from HTML content.
    extract, audio, src

    Use cases:
    - Collect audio sources from web pages
    - Analyze audio usage on websites
    - Create audio playlists
    """

    html: str = Field(
        default="",
        description="The HTML content to extract audio from.",
    )
    base_url: str = Field(
        default="",
        description="The base URL of the page, used to resolve relative audio URLs.",
    )

    async def process(self, context: ProcessingContext) -> list[AudioRef]:
        soup = BeautifulSoup(self.html, "html.parser")

        audio_elements = []
        for audio in soup.find_all(["audio", "source"]):
            src = audio.get("src")
            if src:
                full_url = urljoin(self.base_url, src)
                audio_elements.append(AudioRef(uri=full_url))

        return audio_elements
