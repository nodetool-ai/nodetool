from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ExtractFeedMetadata(GraphNode):
    """
    Extracts metadata from an RSS feed.
    rss, metadata, feed
    
    Use cases:
    - Get feed information
    - Validate feed details
    - Extract feed metadata
    """

    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='URL of the RSS feed')

    @classmethod
    def get_node_type(cls): return "lib.network.rss.ExtractFeedMetadata"



class FetchRSSFeed(GraphNode):
    """
    Fetches and parses an RSS feed from a URL.
    rss, feed, network
    
    Use cases:
    - Monitor news feeds
    - Aggregate content from multiple sources
    - Process blog updates
    """

    url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='URL of the RSS feed to fetch')

    @classmethod
    def get_node_type(cls): return "lib.network.rss.FetchRSSFeed"



class RSSEntryFields(GraphNode):
    """
    Extracts fields from an RSS entry.
    rss, entry, fields
    """

    entry: RSSEntry | GraphNode | tuple[GraphNode, str] = Field(default=RSSEntry(type='rss_entry', title='', link='', published=Datetime(type='datetime', year=0, month=0, day=0, hour=0, minute=0, second=0, microsecond=0, tzinfo='UTC', utc_offset=0), summary='', author=''), description='The RSS entry to extract fields from.')

    @classmethod
    def get_node_type(cls): return "lib.network.rss.RSSEntryFields"


