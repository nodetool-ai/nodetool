---
name: api-assets
description: "Call nodetool.assets or nodetool.documents from a code action: find, read and save files in the user's asset library, keep a file another tool downloaded, and convert documents or extract text and tables from a PDF. Load before the first call into these namespaces."
---

# nodetool.assets and nodetool.documents

An asset is a stored file in the user's library: an image, a video, audio, a
document, JSON. Its locator is `asset://<id>` (an extension is allowed:
`asset://<id>.png`). Reuse an asset id instead of making the same file again.
The workspace is a different store: it holds the files of this run, by
workspace-relative path.

## nodetool.assets

| Call | Does | Answers |
| :--- | :--- | :--- |
| `list({source, query, content_type, limit})` | Lists assets. `source` is `"user"` (default) or `"package"`. `content_type` is `image`, `video`, `audio`, `text` or `folder`. | Asset rows |
| `search(query, {content_type, limit})` | Finds assets by a name substring across every media type. `content_type` is a MIME prefix (`"image/"`). An empty query lists the newest. `limit` defaults to 25. | Handles with `asset://` uris |
| `images({query, limit})` | Lists image assets as handles: id, name, size, dimensions. No pixels are loaded. | Handles. Pass an id to `view_image` to see one. |
| `get(assetId)` | Reads one asset row. No bytes. | The row |
| `read(nameOrUri)` | Reads the content. Takes an `asset://` URI, an id, a `/api/storage/` key or a stored file name. | `{content}` for text, `{content_base64}` for binary |
| `save(name, {content \| content_base64 \| source, content_type})` | Saves a file to the library. | `{asset_id, asset_uri, url}` |

### save

Pass exactly one of these:

- `content` — text, markdown or JSON.
- `content_base64` — binary bytes you made yourself.
- `source` — bytes that already exist: the `asset_url` or `/api/storage/` key
  that another tool returned (`nodetool.web.download`, `run_apify_actor`, a
  generation), an `asset://` URI to copy, or an http(s) URL. The host copies
  them, so the bytes never pass through the guest.

Never `read()` a stored file to base64 to save it again. Pass it as `source`.
Without `content_type`, the extension of `name` decides it: name an SVG
`logo.svg` and it is stored as `image/svg+xml`. Show a saved image, video or
audio file in the reply as `![label](asset_uri)`.

### Editing a stored image

Pass the asset to `image.*` (a guest global), then save the handle:

```js
const handle = await image.resize("asset://<id>.png", { width: 1024 });
const saved = await nodetool.media.toImage(handle);
return saved.asset_uri;
```

## nodetool.documents

File-to-file conversion with Pandoc and PDF tools. Every path is
workspace-relative. Stage an asset into the workspace first with
`nodetool.web.download("asset://<id>", "in.pdf")`.

| Call | Does |
| :--- | :--- |
| `convert(inputFile, outputFile, {from_format, to_format, extra_args})` | Pandoc conversion. `from_format` defaults to `markdown`, `to_format` to `pdf`. It reads markdown, docx, rst, html and more. |
| `extractText(pdfPath, {start_page, end_page})` | Plain text from a PDF, as `{text}`. Pages are 0-based, and `end_page: -1` is the last page. |
| `extractTables(pdfPath, outputJsonFile, {start_page, end_page})` | Tables from a PDF into a JSON file |
| `markdownToPdf(inputFile, outputFile)` | Markdown to PDF |
| `pdfToMarkdown(inputFile, outputFile, {start_page, end_page})` | PDF to Markdown |

The output of a conversion is a workspace file. Save it to the library with
`nodetool.assets.save(name, {source: …})` when the user should keep it.
