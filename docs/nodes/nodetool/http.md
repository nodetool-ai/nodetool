# nodetool.nodes.nodetool.http

## HTTPBaseNode

- **url**: The URL to make the request to. (`str`)
- **headers**: Optional headers to include in the request. (`dict[str, str]`)
- **allow_redirects**: Whether to follow redirects. (`bool`)
- **auth**: Authentication credentials. (`str | None`)

#### `get_request_kwargs`

**Parameters:**


## HTTPDelete

Remove a resource from a server using an HTTP DELETE request.

Use cases:
- Delete user accounts
- Remove API resources
- Cancel subscriptions
- Clear cache entries

**Tags:** http, delete, request, url

- **url**: The URL to make the request to. (`str`)
- **headers**: Optional headers to include in the request. (`dict[str, str]`)
- **allow_redirects**: Whether to follow redirects. (`bool`)
- **auth**: Authentication credentials. (`str | None`)

## HTTPGet

Perform an HTTP GET request to retrieve data from a specified URL.

Use cases:
- Fetch web page content
- Retrieve API data
- Download files
- Check website availability

**Tags:** http, get, request, url

- **url**: The URL to make the request to. (`str`)
- **headers**: Optional headers to include in the request. (`dict[str, str]`)
- **allow_redirects**: Whether to follow redirects. (`bool`)
- **auth**: Authentication credentials. (`str | None`)

## HTTPHead

Retrieve headers from a resource using an HTTP HEAD request.

Use cases:
- Check resource existence
- Get metadata without downloading content
- Verify authentication or permissions

**Tags:** http, head, request, url

- **url**: The URL to make the request to. (`str`)
- **headers**: Optional headers to include in the request. (`dict[str, str]`)
- **allow_redirects**: Whether to follow redirects. (`bool`)
- **auth**: Authentication credentials. (`str | None`)

## HTTPPost

Send data to a server using an HTTP POST request.

Use cases:
- Submit form data
- Create new resources on an API
- Upload files
- Authenticate users

**Tags:** http, post, request, url, data

- **url**: The URL to make the request to. (`str`)
- **headers**: Optional headers to include in the request. (`dict[str, str]`)
- **allow_redirects**: Whether to follow redirects. (`bool`)
- **auth**: Authentication credentials. (`str | None`)
- **data**: The data to send in the POST request. (`str`)

## HTTPPut

Update existing resources on a server using an HTTP PUT request.

Use cases:
- Update user profiles
- Modify existing API resources
- Replace file contents
- Set configuration values

**Tags:** http, put, request, url, data

- **url**: The URL to make the request to. (`str`)
- **headers**: Optional headers to include in the request. (`dict[str, str]`)
- **allow_redirects**: Whether to follow redirects. (`bool`)
- **auth**: Authentication credentials. (`str | None`)
- **data**: The data to send in the PUT request. (`str`)

