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
| format_selector | `str` | yt-dlp format selector (e.g., 'best', 'bestvideo+bestaudio') | `best` |
| container | `str` | Output container format (e.g., 'mp4', 'webm', 'auto') | `auto` |
| subtitles | `bool` | Download subtitles if available | `false` |
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

Browse other nodes in the [lib.video.download](../) namespace.
