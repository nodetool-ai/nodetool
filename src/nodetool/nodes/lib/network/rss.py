from datetime import datetime
import feedparser
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Datetime, RSSEntry

class FetchRSSFeed(BaseNode):
    """
    Fetches and parses an RSS feed from a URL.
    rss, feed, network
    
    Use cases:
    - Monitor news feeds
    - Aggregate content from multiple sources
    - Process blog updates
    """

    url: str = Field(
        default="",
        description="URL of the RSS feed to fetch"
    )

    @classmethod
    def get_title(cls):
        return "Fetch RSS Feed"

    async def process(self, context: ProcessingContext) -> list[RSSEntry]:
        feed = feedparser.parse(self.url)
        
        data = []
        for entry in feed.entries:
            # Use published_parsed instead of manual parsing
            published = datetime.now()  # fallback
            if entry.get('published_parsed'):
                published = datetime(*entry.published_parsed[:6])

            data.append(RSSEntry(
                title=entry.get('title', ''),
                link=entry.get('link', ''),
                published=Datetime.from_datetime(published),
                summary=entry.get('summary', ''),
                author=entry.get('author', ''),
            ))
        return data
    

class RSSEntryFields(BaseNode):
    """
    Extracts fields from an RSS entry.
    rss, entry, fields
    """

    @classmethod
    def get_title(cls):
        return "Extract RSS Entry Fields"

    entry: RSSEntry = Field(
        default=RSSEntry(), description="The RSS entry to extract fields from."
    )

    @classmethod
    def return_type(cls):
        return {
            "title": str,
            "link": str,
            "published": Datetime,
            "summary": str,
            "author": str,
        }

    
    async def process(self, context: ProcessingContext):
        return {
            "title": self.entry.title,
            "link": self.entry.link,
            "published": self.entry.published,
            "summary": self.entry.summary,
            "author": self.entry.author,
        }


class ExtractFeedMetadata(BaseNode):
    """
    Extracts metadata from an RSS feed.
    rss, metadata, feed
    
    Use cases:
    - Get feed information
    - Validate feed details
    - Extract feed metadata
    """

    @classmethod
    def get_title(cls):
        return "Extract Feed Metadata"

    url: str = Field(
        default="",
        description="URL of the RSS feed"
    )

    async def process(self, context: ProcessingContext) -> dict:
        feed = feedparser.parse(self.url)
        
        return {
            "title": feed.feed.get('title', ''),
            "description": feed.feed.get('description', ''),
            "link": feed.feed.get('link', ''),
            "language": feed.feed.get('language', ''),
            "updated": feed.feed.get('updated', ''),
            "generator": feed.feed.get('generator', ''),
            "entry_count": len(feed.entries)
        }