---
layout: page
title: "Extract Tables"
node_type: "lib.pdfplumber.ExtractTables"
namespace: "lib.pdfplumber"
---

**Type:** `lib.pdfplumber.ExtractTables`

**Namespace:** `lib.pdfplumber`

## Description

Extract tables from a PDF file into dataframes.
    pdf, tables, dataframe, extract

    Use cases:
    - Extract tabular data from PDF documents
    - Convert PDF tables to structured data formats
    - Process PDF tables for analysis
    - Import PDF reports into data analysis pipelines

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| pdf | `any` | The PDF document to extract tables from | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| start_page | `any` | First page to extract tables from (0-based, None for first page) | `0` |
| end_page | `any` | Last page to extract tables from (0-based, None for last page) | `4` |
| table_settings | `any` | Settings for table extraction algorithm | `{'vertical_strategy': 'text', 'horizontal_strategy': 'text', 'snap_tolerance': 3, 'join_tolerance': 3, 'edge_min_length': 3, 'min_words_vertical': 3, 'min_words_horizontal': 1, 'keep_blank_chars': False, 'text_tolerance': 3, 'text_x_tolerance': 3, 'text_y_tolerance': 3}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pdfplumber](../) namespace.

