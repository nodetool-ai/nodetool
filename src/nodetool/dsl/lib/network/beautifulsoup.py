from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class BaseUrl(GraphNode):
    """
    Extract the base URL from a given URL.
    url parsing, domain extraction, web utilities

    Use cases:
    - Get domain name from full URLs
    - Clean up URLs for comparison
    - Extract root website addresses
    - Standardize URL formats
    """

    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The URL to extract the base from')

    @classmethod
    def get_node_type(cls): return "lib.network.beautifulsoup.BaseUrl"



class ExtractAudio(GraphNode):
    """
    Extract audio elements from HTML content.
    extract, audio, src

    Use cases:
    - Collect audio sources from web pages
    - Analyze audio usage on websites
    - Create audio playlists
    """

    html: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The HTML content to extract audio from.')
    base_url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The base URL of the page, used to resolve relative audio URLs.')

    @classmethod
    def get_node_type(cls): return "lib.network.beautifulsoup.ExtractAudio"



class ExtractImages(GraphNode):
    """
    Extract images from HTML content.
    extract, images, src

    Use cases:
    - Collect images from web pages
    - Analyze image usage on websites
    - Create image galleries
    """

    html: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The HTML content to extract images from.')
    base_url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The base URL of the page, used to resolve relative image URLs.')

    @classmethod
    def get_node_type(cls): return "lib.network.beautifulsoup.ExtractImages"



class ExtractLinks(GraphNode):
    """
    Extract links from HTML content.
    extract, links, urls

    Use cases:
    - Analyze website structure
    - Discover related content
    - Build sitemaps
    """

    html: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The HTML content to extract links from.')
    base_url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The base URL of the page, used to determine internal/external links.')

    @classmethod
    def get_node_type(cls): return "lib.network.beautifulsoup.ExtractLinks"



class ExtractMetadata(GraphNode):
    """
    Extract metadata from HTML content.
    extract, metadata, seo

    Use cases:
    - Analyze SEO elements
    - Gather page information
    - Extract structured data
    """

    html: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The HTML content to extract metadata from.')

    @classmethod
    def get_node_type(cls): return "lib.network.beautifulsoup.ExtractMetadata"



class ExtractVideos(GraphNode):
    """
    Extract videos from HTML content.
    extract, videos, src

    Use cases:
    - Collect video sources from web pages
    - Analyze video usage on websites
    - Create video playlists
    """

    html: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The HTML content to extract videos from.')
    base_url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The base URL of the page, used to resolve relative video URLs.')

    @classmethod
    def get_node_type(cls): return "lib.network.beautifulsoup.ExtractVideos"



class HTMLToText(GraphNode):
    """
    Converts HTML to plain text by removing tags and decoding entities using BeautifulSoup.
    html, text, convert

    Use cases:
    - Cleaning HTML content for text analysis
    - Extracting readable content from web pages
    - Preparing HTML data for natural language processing
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    preserve_linebreaks: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Convert block-level elements to newlines')

    @classmethod
    def get_node_type(cls): return "lib.network.beautifulsoup.HTMLToText"



class WebsiteContentExtractor(GraphNode):
    """
    Extract main content from a website, removing navigation, ads, and other non-essential elements.
    scrape, web scraping, content extraction, text analysis

    Use cases:
    - Clean web content for further analysis
    - Extract article text from news websites
    - Prepare web content for summarization
    """

    html_content: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The raw HTML content of the website.')

    @classmethod
    def get_node_type(cls): return "lib.network.beautifulsoup.WebsiteContentExtractor"


