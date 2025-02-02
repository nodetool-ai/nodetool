# nodetool.nodes.lib.network.rss

## ExtractFeedMetadata

Extracts metadata from an RSS feed.

Use cases:
- Get feed information
- Validate feed details
- Extract feed metadata

**Tags:** rss, metadata, feed

**Fields:**
- **url**: URL of the RSS feed (str)


## FetchRSSFeed

Fetches and parses an RSS feed from a URL.

Use cases:
- Monitor news feeds
- Aggregate content from multiple sources
- Process blog updates

**Tags:** rss, feed, network

**Fields:**
- **url**: URL of the RSS feed to fetch (str)


## RSSEntryFields

Extracts fields from an RSS entry.

**Tags:** rss, entry, fields

**Fields:**
- **entry**: The RSS entry to extract fields from. (RSSEntry)


