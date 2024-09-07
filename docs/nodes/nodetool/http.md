# nodetool.nodes.nodetool.http

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


## FetchPage

Fetch a web page using Selenium and return its content.

Use cases:
- Retrieve content from dynamic websites
- Capture JavaScript-rendered content
- Interact with web applications

**Tags:** selenium, fetch, webpage, http

**Fields:**
- **url**: The URL to fetch the page from. (str)
- **wait_time**: Maximum time to wait for page load (in seconds). (int)


## HTTPBaseNode

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)

### get_request_kwargs

**Args:**


## HTTPDelete

Remove a resource from a server using an HTTP DELETE request.

Use cases:
- Delete user accounts
- Remove API resources
- Cancel subscriptions
- Clear cache entries

**Tags:** http, delete, request, url

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)


## HTTPGet

Perform an HTTP GET request to retrieve data from a specified URL.

Use cases:
- Fetch web page content
- Retrieve API data
- Download files
- Check website availability

**Tags:** http, get, request, url

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)


## HTTPHead

Retrieve headers from a resource using an HTTP HEAD request.

Use cases:
- Check resource existence
- Get metadata without downloading content
- Verify authentication or permissions

**Tags:** http, head, request, url

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)


## HTTPPost

Send data to a server using an HTTP POST request.

Use cases:
- Submit form data
- Create new resources on an API
- Upload files
- Authenticate users

**Tags:** http, post, request, url, data

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)
- **data**: The data to send in the POST request. (str)


## HTTPPut

Update existing resources on a server using an HTTP PUT request.

Use cases:
- Update user profiles
- Modify existing API resources
- Replace file contents
- Set configuration values

**Tags:** http, put, request, url, data

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)
- **data**: The data to send in the PUT request. (str)


