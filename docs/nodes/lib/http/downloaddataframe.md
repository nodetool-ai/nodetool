---
layout: page
title: "Download Dataframe"
node_type: "lib.http.DownloadDataframe"
namespace: "lib.http"
---

**Type:** `lib.http.DownloadDataframe`

**Namespace:** `lib.http`

## Description

Download data from a URL and return as a dataframe.
    http, get, request, url, dataframe, csv, json, data

    Use cases:
    - Download CSV data and convert to dataframe
    - Fetch JSON data and convert to dataframe
    - Retrieve tabular data from APIs
    - Process data files from URLs

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| url | `any` | The URL to make the request to. | `` |
| file_format | `any` | The format of the data file (csv, json, tsv). | `csv` |
| columns | `any` | The columns of the dataframe. | `{'type': 'record_type', 'columns': []}` |
| encoding | `any` | The encoding of the text file. | `utf-8` |
| delimiter | `any` | The delimiter for CSV/TSV files. | `,` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

