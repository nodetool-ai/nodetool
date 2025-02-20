import asyncio
import os
from urllib.parse import urljoin
import aiohttp
from pydantic import Field
from nodetool.metadata.types import (
    DataframeRef,
    DocumentRef,
    FilePath,
    ImageRef,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext

from pydantic import Field
from nodetool.metadata.types import DataframeRef, ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from nodetool.workflows.types import NodeProgress


class HTTPBaseNode(BaseNode):
    url: str = Field(
        default="",
        description="The URL to make the request to.",
    )
    headers: dict[str, str] = Field(
        default={},
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

    @classmethod
    def get_title(cls):
        return "GET Request"

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

    @classmethod
    def get_title(cls):
        return "POST Request"

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

    @classmethod
    def get_title(cls):
        return "PUT Request"

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

    @classmethod
    def get_title(cls):
        return "DELETE Request"

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

    @classmethod
    def get_title(cls):
        return "HEAD Request"

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

    @classmethod
    def get_title(cls):
        return "GET Binary"

    async def process(self, context: ProcessingContext) -> bytes:
        res = await context.http_get(self.url, **self.get_request_kwargs())
        return res.content


class GetRequestDocument(HTTPBaseNode):
    """
    Perform an HTTP GET request and return a document
    http, get, request, url, document

    Use cases:
    - Download PDF documents
    - Retrieve Word documents
    - Fetch Excel files
    - Download any document format
    """

    @classmethod
    def get_title(cls):
        return "GET Document"

    async def process(self, context: ProcessingContext) -> DocumentRef:
        res = await context.http_get(self.url, **self.get_request_kwargs())
        return DocumentRef(data=res.content)


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

    @classmethod
    def get_title(cls):
        return "POST Binary"

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

    @classmethod
    def get_title(cls):
        return "Filter Valid URLs"

    urls: list[str] = Field(
        default=[],
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
        default=[],
        description="List of URLs to download.",
    )
    output_folder: FilePath = Field(
        default="downloads",
        description="Local folder path where files will be saved.",
    )
    headers: dict[str, str] = Field(
        default={},
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


class JSONPostRequest(HTTPBaseNode):
    """
    Send JSON data to a server using an HTTP POST request.
    http, post, request, url, json, api

    Use cases:
    - Send structured data to REST APIs
    - Create resources with JSON payloads
    - Interface with modern web services
    """

    @classmethod
    def get_title(cls):
        return "POST JSON"

    data: dict = Field(
        default={},
        description="The JSON data to send in the POST request.",
    )

    async def process(self, context: ProcessingContext) -> dict:
        headers = self.headers.copy()
        headers["Content-Type"] = "application/json"
        res = await context.http_post(
            self.url,
            json=self.data,
            headers=headers,
            auth=self.auth,
        )
        return res.json()


class JSONPutRequest(HTTPBaseNode):
    """
    Update resources with JSON data using an HTTP PUT request.
    http, put, request, url, json, api

    Use cases:
    - Update existing API resources
    - Replace complete objects in REST APIs
    - Set configuration with JSON data
    """

    @classmethod
    def get_title(cls):
        return "PUT JSON"

    data: dict = Field(
        default={},
        description="The JSON data to send in the PUT request.",
    )

    async def process(self, context: ProcessingContext) -> dict:
        headers = self.headers.copy()
        headers["Content-Type"] = "application/json"
        res = await context.http_put(
            self.url,
            json=self.data,
            headers=headers,
            auth=self.auth,
        )
        return res.json()


class JSONPatchRequest(HTTPBaseNode):
    """
    Partially update resources with JSON data using an HTTP PATCH request.
    http, patch, request, url, json, api

    Use cases:
    - Partial updates to API resources
    - Modify specific fields without full replacement
    - Efficient updates for large objects
    """

    @classmethod
    def get_title(cls):
        return "PATCH JSON"

    data: dict = Field(
        default={},
        description="The JSON data to send in the PATCH request.",
    )

    async def process(self, context: ProcessingContext) -> dict:
        headers = self.headers.copy()
        headers["Content-Type"] = "application/json"
        res = await context.http_patch(
            self.url,
            json=self.data,
            headers=headers,
            auth=self.auth,
        )
        return res.json()


class JSONGetRequest(HTTPBaseNode):
    """
    Perform an HTTP GET request and parse the response as JSON.
    http, get, request, url, json, api

    Use cases:
    - Fetch data from REST APIs
    - Retrieve JSON-formatted responses
    - Interface with JSON web services
    """

    @classmethod
    def get_title(cls):
        return "GET JSON"

    async def process(self, context: ProcessingContext) -> dict:
        headers = self.headers.copy()
        headers["Accept"] = "application/json"
        res = await context.http_get(
            self.url,
            headers=headers,
            auth=self.auth,
        )
        return res.json()
