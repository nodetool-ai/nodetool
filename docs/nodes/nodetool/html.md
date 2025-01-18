# nodetool.nodes.nodetool.html

## BaseUrl

Extract the base URL from a given URL.

Use cases:
- Get domain name from full URLs
- Clean up URLs for comparison
- Extract root website addresses
- Standardize URL formats

**Tags:** url parsing, domain extraction, web utilities

**Fields:**
- **url**: The URL to extract the base from (str)


## ExtractAudio

Extract audio elements from HTML content.

Use cases:
- Collect audio sources from web pages
- Analyze audio usage on websites
- Create audio playlists

**Tags:** extract, audio, src

**Fields:**
- **html**: The HTML content to extract audio from. (str)
- **base_url**: The base URL of the page, used to resolve relative audio URLs. (str)


## ExtractImages

Extract images from HTML content.

Use cases:
- Collect images from web pages
- Analyze image usage on websites
- Create image galleries

**Tags:** extract, images, src

**Fields:**
- **html**: The HTML content to extract images from. (str)
- **base_url**: The base URL of the page, used to resolve relative image URLs. (str)


## ExtractLinks

Extract links from HTML content.

Use cases:
- Analyze website structure
- Discover related content
- Build sitemaps

**Tags:** extract, links, urls

**Fields:**
- **html**: The HTML content to extract links from. (str)
- **base_url**: The base URL of the page, used to determine internal/external links. (str)


## ExtractMetadata

Extract metadata from HTML content.

Use cases:
- Analyze SEO elements
- Gather page information
- Extract structured data

**Tags:** extract, metadata, seo

**Fields:**
- **html**: The HTML content to extract metadata from. (str)


## ExtractVideos

Extract videos from HTML content.

Use cases:
- Collect video sources from web pages
- Analyze video usage on websites
- Create video playlists

**Tags:** extract, videos, src

**Fields:**
- **html**: The HTML content to extract videos from. (str)
- **base_url**: The base URL of the page, used to resolve relative video URLs. (str)


## WebsiteContentExtractor

Extract main content from a website, removing navigation, ads, and other non-essential elements.

Use cases:
- Clean web content for further analysis
- Extract article text from news websites
- Prepare web content for summarization

**Tags:** scrape, web scraping, content extraction, text analysis

**Fields:**
- **html_content**: The raw HTML content of the website. (str)


### extract_content

**Args:**
- **html_content (str)**

**Returns:** str

