import re
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
from bs4 import BeautifulSoup


class BaseUrl(BaseNode):
    """
    Extract the base URL from a given URL.
    url parsing, domain extraction, web utilities

    Use cases:
    - Get domain name from full URLs
    - Clean up URLs for comparison
    - Extract root website addresses
    - Standardize URL formats
    """

    url: str = Field(
        title="URL", description="The URL to extract the base from", default=""
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["url"]

    async def process(self, context: ProcessingContext) -> str:
        from urllib.parse import urlparse

        if not self.url:
            raise ValueError("URL must not be empty")

        parsed = urlparse(self.url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        return base_url


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
    scrape, web scraping, content extraction, text analysis

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


def convert_html_to_text(html: str, preserve_linebreaks: bool = True) -> str:
    """
    Converts HTML to plain text while preserving structure and handling whitespace.

    Args:
        html: HTML string to convert
        preserve_linebreaks: Whether to preserve line breaks from block elements

    Returns:
        Cleaned plain text string
    """
    # Parse HTML with BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    # Handle line breaks if preserve_linebreaks is True
    if preserve_linebreaks:
        # Replace <br> tags with newlines
        for br in soup.find_all("br"):
            br.replace_with("\n")

        # Add newlines after block-level elements
        for tag in soup.find_all(
            ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li"]
        ):
            tag.append("\n")

    # Get text content
    text = soup.get_text()

    # Clean up whitespace
    text = re.sub(
        r"\n\s*\n", "\n\n", text
    )  # Convert multiple blank lines to double line breaks
    text = re.sub(r" +", " ", text)  # Remove multiple spaces
    return text.strip()


class HTMLToText(BaseNode):
    """
    Converts HTML to plain text by removing tags and decoding entities using BeautifulSoup.
    html, text, convert

    Use cases:
    - Cleaning HTML content for text analysis
    - Extracting readable content from web pages
    - Preparing HTML data for natural language processing
    """

    text: str = Field(title="HTML", default="")
    preserve_linebreaks: bool = Field(
        title="Preserve Line Breaks",
        default=True,
        description="Convert block-level elements to newlines",
    )

    @classmethod
    def get_title(cls):
        return "Convert HTML to Text"

    async def process(self, context: ProcessingContext) -> str:
        return convert_html_to_text(self.text, self.preserve_linebreaks)
