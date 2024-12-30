import asyncio
import os
import re
from urllib.parse import urljoin
import aiohttp
from pydantic import Field
from nodetool.metadata.types import (
    AudioRef,
    ColumnDef,
    DataframeRef,
    FilePath,
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

from nodetool.workflows.types import NodeProgress


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


class GetRequest(HTTPBaseNode):
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


class PostRequest(HTTPBaseNode):
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


class PutRequest(HTTPBaseNode):
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


class DeleteRequest(HTTPBaseNode):
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


class HeadRequest(HTTPBaseNode):
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
        html = ""

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
                soup.find("meta", attrs={"name": "description"})["content"]  # type: ignore
                if soup.find("meta", attrs={"name": "description"})
                else None
            ),
            "keywords": (
                soup.find("meta", attrs={"name": "keywords"})["content"]  # type: ignore
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


def extract_content(html_content: str) -> str:
    soup = BeautifulSoup(html_content, "html.parser")

    def clean_text(text: str) -> str:
        # Remove extra whitespace and newlines
        text = re.sub(r"\s+", " ", text).strip()
        return text

    # Remove script and style elements
    for script in soup(["script", "style"]):
        script.decompose()

    # Try to find the main content
    main_content = None
    potential_content_tags = [
        "article",
        "main",
        'div[id*="content"]',
        'div[class*="content"]',
    ]

    for tag in potential_content_tags:
        content = soup.select_one(tag)
        if content:
            main_content = content
            break

    # If we couldn't find a clear main content, use the body
    if not main_content:
        main_content = soup.body

    # Extract the text from the main content
    if main_content:
        # Remove common non-content elements
        for elem in main_content(["nav", "sidebar", "footer", "header"]):
            elem.decompose()

        return clean_text(main_content.get_text())
    else:
        return "No main content found"


class WebsiteContentExtractor(BaseNode):
    """
    Extract main content from a website, removing navigation, ads, and other non-essential elements.
    web scraping, content extraction, text analysis

    Use cases:
    - Clean web content for further analysis
    - Extract article text from news websites
    - Prepare web content for summarization
    """

    html_content: str = Field(
        default="",
        description="The raw HTML content of the website.",
    )

    async def process(self, context: ProcessingContext) -> str:
        return extract_content(self.html_content)


class ImageDownloader(BaseNode):
    """
    Download images from URLs in a dataframe and return a list of ImageRefs.
    image download, web scraping, data processing

    Use cases:
    - Prepare image datasets for machine learning tasks
    - Archive images from web pages
    - Process and analyze images extracted from websites
    """

    images: DataframeRef = Field(
        default=DataframeRef(),
        description="Dataframe containing image URLs and alt text.",
    )
    base_url: str = Field(
        default="",
        description="Base URL to prepend to relative image URLs.",
    )
    max_concurrent_downloads: int = Field(
        default=10,
        description="Maximum number of concurrent image downloads.",
    )

    async def download_image(
        self,
        session: aiohttp.ClientSession,
        url: str,
        context: ProcessingContext,
    ) -> ImageRef | None:
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    content = await response.read()
                    image_ref = await context.image_from_bytes(content)
                    return image_ref
                else:
                    print(
                        f"Failed to download image from {url}. Status code: {response.status}"
                    )
                    return None
        except Exception as e:
            print(f"Error downloading image from {url}: {str(e)}")
            return None

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        images = []

        async with aiohttp.ClientSession() as session:
            tasks = []
            assert self.images.data, "No data in the images dataframe"
            for row in self.images.data:
                src, alt, type = row
                url = urljoin(self.base_url, src)
                task = self.download_image(session, url, context)
                tasks.append(task)

                if len(tasks) >= self.max_concurrent_downloads:
                    completed = await asyncio.gather(*tasks)
                    images.extend([img for img in completed if img is not None])
                    tasks = []

            if tasks:
                completed = await asyncio.gather(*tasks)
                images.extend([img for img in completed if img is not None])

        return images


class GetRequestBinary(HTTPBaseNode):
    """
    Perform an HTTP GET request and return raw binary data.
    http, get, request, url, binary, download

    Use cases:
    - Download binary files
    - Fetch images or media
    - Retrieve PDF documents
    - Download any non-text content
    """

    async def process(self, context: ProcessingContext) -> bytes:
        res = await context.http_get(self.url, **self.get_request_kwargs())
        return res.content


class PostRequestBinary(HTTPBaseNode):
    """
    Send data using an HTTP POST request and return raw binary data.
    http, post, request, url, data, binary

    Use cases:
    - Upload and receive binary files
    - Interact with binary APIs
    - Process image or media uploads
    - Handle binary file transformations
    """

    data: str | bytes = Field(
        default="",
        description="The data to send in the POST request. Can be string or binary.",
    )

    async def process(self, context: ProcessingContext) -> bytes:
        res = await context.http_post(
            self.url, data=self.data, **self.get_request_kwargs()
        )
        return res.content


class FilterValidURLs(HTTPBaseNode):
    """
    Filter a list of URLs by checking their validity using HEAD requests.
    url validation, http, head request

    Use cases:
    - Clean URL lists by removing broken links
    - Verify resource availability
    - Validate website URLs before processing
    """

    urls: list[str] = Field(
        default_factory=list,
        description="List of URLs to validate.",
    )
    max_concurrent_requests: int = Field(
        default=10,
        description="Maximum number of concurrent HEAD requests.",
    )

    async def check_url(
        self,
        session: aiohttp.ClientSession,
        url: str,
    ) -> tuple[str, bool]:
        try:
            async with session.head(
                url,
                allow_redirects=True,
                **self.get_request_kwargs(),
            ) as response:
                is_valid = 200 <= response.status < 400
                return url, is_valid
        except Exception:
            return url, False

    async def process(self, context: ProcessingContext) -> list[str]:
        results = []

        async with aiohttp.ClientSession() as session:
            tasks = []
            for url in self.urls:
                task = self.check_url(session, url)
                tasks.append(task)

                if len(tasks) >= self.max_concurrent_requests:
                    completed = await asyncio.gather(*tasks)
                    results.extend(completed)
                    tasks = []

            if tasks:
                completed = await asyncio.gather(*tasks)
                results.extend(completed)

        valid_urls = [url for url, is_valid in results if is_valid]

        return valid_urls


class DownloadFiles(BaseNode):
    """
    Download files from a list of URLs into a local folder.
    download, files, urls, batch

    Use cases:
    - Batch download files from multiple URLs
    - Create local copies of remote resources
    - Archive web content
    - Download datasets
    """

    urls: list[str] = Field(
        default_factory=list,
        description="List of URLs to download.",
    )
    output_folder: FilePath = Field(
        default="downloads",
        description="Local folder path where files will be saved.",
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

    max_concurrent_downloads: int = Field(
        default=5,
        description="Maximum number of concurrent downloads.",
    )

    async def download_file(
        self,
        session: aiohttp.ClientSession,
        url: str,
    ) -> str:
        try:
            async with session.get(url, **self.get_request_kwargs()) as response:
                if response.status == 200:
                    # Extract filename from URL or Content-Disposition header
                    filename = response.headers.get("Content-Disposition")
                    if filename and "filename=" in filename:
                        filename = filename.split("filename=")[-1].strip("\"'")
                    else:
                        filename = url.split("/")[-1]
                        if not filename:
                            filename = "unnamed_file"

                    expanded_path = os.path.expanduser(self.output_folder.path)
                    os.makedirs(os.path.dirname(expanded_path), exist_ok=True)

                    filepath = os.path.join(expanded_path, filename)
                    content = await response.read()

                    with open(filepath, "wb") as f:
                        f.write(content)

                    return filepath
                else:
                    return ""
        except Exception as e:
            return ""

    @classmethod
    def return_type(cls):
        return {
            "success": list[str],
            "failed": list[str],
        }

    async def process(self, context: ProcessingContext):
        successful = []
        failed = []

        async with aiohttp.ClientSession() as session:
            tasks = []
            num_completed = 0
            for url in self.urls:
                task = self.download_file(session, url)
                tasks.append(task)

                if len(tasks) >= self.max_concurrent_downloads:
                    completed = await asyncio.gather(*tasks)
                    num_completed += len(completed)
                    context.post_message(
                        NodeProgress(
                            node_id=self.id,
                            progress=num_completed,
                            total=len(self.urls),
                        )
                    )
                    for filepath in completed:
                        if filepath:
                            successful.append(filepath)
                        else:
                            failed.append(url)
                    tasks = []

            if tasks:
                completed = await asyncio.gather(*tasks)
                num_completed += len(completed)
                context.post_message(
                    NodeProgress(
                        node_id=self.id,
                        progress=num_completed,
                        total=len(self.urls),
                    )
                )
                for filepath in completed:
                    if filepath:
                        successful.append(filepath)
                    else:
                        failed.append(url)

        return {
            "successful": successful,
            "failed": failed,
        }
