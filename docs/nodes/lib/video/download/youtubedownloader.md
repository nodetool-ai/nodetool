---
layout: page
title: "YouTube Downloader"
node_type: "lib.video.download.YtDlpDownload"
namespace: "lib.video.download"
---

**Type:** `lib.video.download.YtDlpDownload`

**Namespace:** `lib.video.download`

## Description

Download media from URLs using yt-dlp.
    download, video, audio, youtube, media, yt-dlp, metadata, subtitles

    Use cases:
    - Download videos from YouTube and other platforms
    - Extract audio from video URLs
    - Retrieve video/audio metadata without downloading
    - Download subtitles and thumbnails

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| url | `str` | URL of the media to download | `` |
| mode | `enum` | Download mode: video, audio, or metadata only | `video` |
| format_selector | `str` | yt-dlp format selector (e.g., 'best', 'bestvideo+bestaudio'). Each side of a top-level '+' downloads on its own and the two are muxed without re-encoding. 'best' means 'bv*+ba/b'. | `best` |
| container | `str` | Container for a muxed video and audio download: auto, mp4, mov, webm or mkv. Auto picks webm or mp4 when it holds both codecs, else mkv. A selector with no '+' keeps the downloaded file's own container. | `auto` |
| subtitles | `bool` | Download subtitles if available | `false` |
| sub_langs | `str` | Comma-separated subtitle language codes in yt-dlp syntax (e.g., 'en,en-US,en-GB', 'de.*', 'all'). Only used when Subtitles is enabled. | - |
| thumbnail | `bool` | Download thumbnail if available | `false` |
| overwrite | `bool` | Overwrite existing files | `false` |
| rate_limit_kbps | `int` | Rate limit in KB/s (0 = unlimited) | `0` |
| timeout | `int` | Timeout in seconds | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| video | `video` |  |
| audio | `audio` |  |
| metadata | `dict` |  |
| subtitles | `str` |  |
| thumbnail | `image` |  |

## Related Nodes

Browse other nodes in the [lib.video.download](./) namespace.
