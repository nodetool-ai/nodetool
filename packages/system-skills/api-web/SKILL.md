---
name: api-web
description: "Call nodetool.web or nodetool.email from a code action: search the web, news or images, read a page's text, make an HTTP request, download a file into the workspace, screenshot a page, or search, archive and label Gmail messages. Load before the first call into these namespaces."
---

# nodetool.web and nodetool.email

## nodetool.web

| Call | Does | Answers |
| :--- | :--- | :--- |
| `search(query, opts)` | Web search. | Pages with a title, URL and snippet |
| `news(query, opts)` | News search. | Articles with dates and sources |
| `images(query, opts)` | Image search. `num_results` defaults to 20. | Title, page link, original image URL and thumbnail URL for each result |
| `browse(url)` | Fetches a page and strips the HTML. | The readable text |
| `fetch(url, {method, headers, body})` | One raw HTTP request. `method` defaults to GET. | The response body as text |
| `download(url, outputFile)` | Saves the bytes of a URL into the workspace. `url` may also be an `asset://` URI, a `/api/storage/` key or a `data:` URI. | The workspace path, an `asset_url`, and for media a `display_markdown` snippet |
| `screenshot(url, outputFile)` | Renders the page in headless Chrome and saves a PNG. `outputFile` defaults to `screenshot.png`. | The workspace path |

Options for `search`, `news` and `images`:

- `provider` pins one backend: `"serpapi"`, `"dataforseo"`, `"brave"`,
  `"apify"`, `"openai"` or `"google"` (Gemini grounded search, or SerpAPI for
  `news`). Without it the call uses the first configured backend.
- `images` cannot use `"openai"` or `"google"`, because they answer with prose
  instead of results.
- `allowed_domains` and `blocked_domains` scope the results.
- `num_results` sets how many come back (10 by default for web and news).

Rules:

- Search result pages are blocked in `browse`. Use `search` to search, and
  `browse` to read a page it found.
- `download` is how an asset reaches the workspace, for ffmpeg or a document
  conversion. To keep a downloaded file in the library, pass its `asset_url`
  to `nodetool.assets.save(name, {source})`.
- When you show a downloaded image to the user, paste `display_markdown` as it
  is. Do not build a link from the workspace path.
- Fan out independent lookups with `Promise.all`. Ten searches take one round
  trip:

```js
const hits = await Promise.all(topics.map((t) => nodetool.web.search(t)));
```

## nodetool.email

Gmail, when the account is connected.

| Call | Does |
| :--- | :--- |
| `search({subject, text, since_hours_ago, max_results})` | Finds messages. `since_hours_ago` defaults to 6 and `max_results` to 50. Each result has `message_id`, `subject`, `sender` and `body`. |
| `archive(messageIds)` | Archives one id or an array of ids. |
| `label(messageId, label)` | Adds a label to one message. |

Archiving and labelling change the user's mailbox. Declare the action as
high risk unless the user asked for exactly that change.
