# nodetool.nodes.lib.network.http

## DeleteRequest

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


## DownloadFiles

Download files from a list of URLs into a local folder.

Use cases:
- Batch download files from multiple URLs
- Create local copies of remote resources
- Archive web content
- Download datasets

**Tags:** download, files, urls, batch

**Fields:**
- **urls**: List of URLs to download. (list[str])
- **output_folder**: Local folder path where files will be saved. (FilePath)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)
- **max_concurrent_downloads**: Maximum number of concurrent downloads. (int)

### download_file

**Args:**
- **session (ClientSession)**
- **url (str)**

**Returns:** str

### get_request_kwargs

**Args:**


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


## FilterValidURLs

Filter a list of URLs by checking their validity using HEAD requests.

Use cases:
- Clean URL lists by removing broken links
- Verify resource availability
- Validate website URLs before processing

**Tags:** url validation, http, head request

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)
- **urls**: List of URLs to validate. (list[str])
- **max_concurrent_requests**: Maximum number of concurrent HEAD requests. (int)

### check_url

**Args:**
- **session (ClientSession)**
- **url (str)**

**Returns:** tuple[str, bool]


## GetRequest

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


## GetRequestBinary

Perform an HTTP GET request and return raw binary data.

Use cases:
- Download binary files
- Fetch images or media
- Retrieve PDF documents
- Download any non-text content

**Tags:** http, get, request, url, binary, download

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)


## GetRequestDocument

Perform an HTTP GET request and return a document

Use cases:
- Download PDF documents
- Retrieve Word documents
- Fetch Excel files
- Download any document format

**Tags:** http, get, request, url, document

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)


## HTTPBaseNode

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)

### get_request_kwargs

**Args:**


## HeadRequest

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


## ImageDownloader

Download images from URLs in a dataframe and return a list of ImageRefs.

Use cases:
- Prepare image datasets for machine learning tasks
- Archive images from web pages
- Process and analyze images extracted from websites

**Tags:** image download, web scraping, data processing

**Fields:**
- **images**: Dataframe containing image URLs and alt text. (DataframeRef)
- **base_url**: Base URL to prepend to relative image URLs. (str)
- **max_concurrent_downloads**: Maximum number of concurrent image downloads. (int)

### download_image

**Args:**
- **session (ClientSession)**
- **url (str)**
- **context (ProcessingContext)**

**Returns:** nodetool.metadata.types.ImageRef | None


## JSONGetRequest

Perform an HTTP GET request and parse the response as JSON.

Use cases:
- Fetch data from REST APIs
- Retrieve JSON-formatted responses
- Interface with JSON web services

**Tags:** http, get, request, url, json, api

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)


## JSONPatchRequest

Partially update resources with JSON data using an HTTP PATCH request.

Use cases:
- Partial updates to API resources
- Modify specific fields without full replacement
- Efficient updates for large objects

**Tags:** http, patch, request, url, json, api

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)
- **data**: The JSON data to send in the PATCH request. (dict)


## JSONPostRequest

Send JSON data to a server using an HTTP POST request.

Use cases:
- Send structured data to REST APIs
- Create resources with JSON payloads
- Interface with modern web services

**Tags:** http, post, request, url, json, api

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)
- **data**: The JSON data to send in the POST request. (dict)


## JSONPutRequest

Update resources with JSON data using an HTTP PUT request.

Use cases:
- Update existing API resources
- Replace complete objects in REST APIs
- Set configuration with JSON data

**Tags:** http, put, request, url, json, api

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)
- **data**: The JSON data to send in the PUT request. (dict)


## PostRequest

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


## PostRequestBinary

Send data using an HTTP POST request and return raw binary data.

Use cases:
- Upload and receive binary files
- Interact with binary APIs
- Process image or media uploads
- Handle binary file transformations

**Tags:** http, post, request, url, data, binary

**Fields:**
- **url**: The URL to make the request to. (str)
- **headers**: Optional headers to include in the request. (dict[str, str])
- **auth**: Authentication credentials. (str | None)
- **data**: The data to send in the POST request. Can be string or binary. (str | bytes)


## PutRequest

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


